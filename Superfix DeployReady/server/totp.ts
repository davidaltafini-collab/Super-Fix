import crypto from 'node:crypto';
import type { Express } from 'express';
import bcrypt from 'bcrypt';
import type { AuthRequest, AuthService } from './auth.js';
import { AUDIT, clientIp, writeAudit } from './audit.js';
import { decryptSensitive, encryptSensitive } from './security-utils.js';

/**
 * Al doilea factor pentru admini (CONT-FANTOMA.md §10, pasul 9 din §15).
 *
 * De ce tocmai aici: ecranul de investigație vede telefoane, IP-uri, dispozitive
 * și conversații. E cea mai bogată țintă din sistem, și până acum o apăra o
 * singură parolă. TOTP e RFC 6238 — aceleași cifre pe care le arată Google
 * Authenticator sau 1Password.
 *
 * Scris cu `node:crypto`, fără dependență nouă: e un HMAC-SHA1 peste un contor
 * de 30 de secunde, atât. O bibliotecă în plus pentru douăzeci de rânduri ar fi
 * o suprafață de actualizat, nu un ajutor.
 */

// ─────────────────────────────────────────────────────────────────────────────
// RFC 4648 base32 — alfabetul pe care îl citesc aplicațiile de autentificare
// ─────────────────────────────────────────────────────────────────────────────

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  // Spațiile și „=" se ignoră: oamenii copiază secretul din ecran în grupuri de
  // patru, iar un secret respins pentru un spațiu ar părea o defecțiune.
  const clean = String(input || '').toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('secret base32 invalid');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// RFC 6238
// ─────────────────────────────────────────────────────────────────────────────

const STEP_SECONDS = 30;
/** O fereastră în față și una în spate: ceasul telefonului nu e niciodată exact. */
const DRIFT_STEPS = 1;

export const counterNow = (at = Date.now()) => Math.floor(at / 1000 / STEP_SECONDS);

export function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * Întoarce contorul cu care s-a potrivit codul, sau `null`.
 *
 * Contorul iese afară dinadins: apelantul îl ține minte și refuză un cod deja
 * folosit. Fără asta, un cod prins din spatele omului rămâne valabil 90 de
 * secunde pentru oricine l-a văzut.
 */
export function verifyTotp(secret: Buffer, code: string, at = Date.now()): number | null {
  if (!/^\d{6}$/.test(String(code || '').trim())) return null;
  const given = Buffer.from(String(code).trim());
  const now = counterNow(at);
  for (let d = -DRIFT_STEPS; d <= DRIFT_STEPS; d++) {
    const candidate = Buffer.from(hotp(secret, now + d));
    // Comparație în timp constant: lungimea e fixă (6 cifre), deci nu scurge
    // câte cifre au fost ghicite corect.
    if (crypto.timingSafeEqual(given, candidate)) return now + d;
  }
  return null;
}

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export const otpauthUrl = (username: string, secret: string, issuer = 'Superfix') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`
  + `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

// ─────────────────────────────────────────────────────────────────────────────
// Verificarea la login, folosită din `/api/auth/login`
// ─────────────────────────────────────────────────────────────────────────────

export type TotpGate =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Poarta de la login. Se cheamă DUPĂ parolă, niciodată înainte: altfel ruta ar
 * spune cine are al doilea factor, adică cine e administrator.
 */
export async function checkAdminTotp(prisma: any, admin: any, code: unknown): Promise<TotpGate> {
  if (!admin?.totpEnabledAt || !admin.totpSecret) return { ok: true };
  const raw = String(code || '').trim();
  if (!raw) {
    // 401 cu un cod propriu: interfața știe să ceară cifrele, fără să creadă că
    // parola a fost greșită.
    return { ok: false, status: 401, body: { error: 'TOTP_REQUIRED', message: 'Scrie codul din aplicația de autentificare.' } };
  }
  let secret: Buffer;
  try {
    secret = base32Decode(decryptSensitive(admin.totpSecret));
  } catch (error) {
    console.error('totp secret invalid:', error);
    return { ok: false, status: 500, body: { error: 'TOTP_ERROR', message: 'Conectarea nu a mers. Sună la suport.' } };
  }
  const matched = verifyTotp(secret, raw);
  const wrong = { error: 'TOTP_INVALID', message: 'Codul nu e bun. Încearcă cu cel care se arată acum.' };
  if (matched === null) return { ok: false, status: 401, body: wrong };
  // Reluare: același cod, a doua oară, nu mai intră. Contorul e monoton, deci
  // acceptăm doar coduri strict mai noi decât ultimul folosit.
  if (admin.totpLastCounter !== null && admin.totpLastCounter !== undefined && matched <= admin.totpLastCounter) {
    return { ok: false, status: 401, body: wrong };
  }
  const claimed = await prisma.admin.updateMany({
    where: {
      id: admin.id,
      ...(admin.totpLastCounter === null || admin.totpLastCounter === undefined
        ? {}
        : { totpLastCounter: admin.totpLastCounter }),
    },
    data: { totpLastCounter: matched },
  });
  // Două conectări simultane cu același cod: una singură scrie contorul.
  if (claimed.count !== 1) return { ok: false, status: 401, body: wrong };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rutele de înrolare
// ─────────────────────────────────────────────────────────────────────────────

export function registerTotpRoutes(app: Express, prisma: any, auth: AuthService) {
  const guard = [auth.authenticateToken, auth.requireRole('ADMIN')];

  /** Starea, ca interfața să știe dacă are ce cere la login. */
  app.get('/api/admin/totp', ...guard, async (req: AuthRequest, res) => {
    try {
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id }, select: { totpEnabledAt: true, totpSecret: true } });
      return res.json({ enabled: !!admin?.totpEnabledAt, pending: !!admin?.totpSecret && !admin?.totpEnabledAt });
    } catch (error) {
      console.error('totp status error:', error);
      return res.status(500).json({ error: 'TOTP_ERROR', message: 'Nu am putut citi starea. Încearcă din nou.' });
    }
  });

  /**
   * `POST /api/admin/totp/setup` — pregătește un secret nou.
   *
   * Cere parola din nou: cine găsește un laptop deschis nu are voie să-și mute
   * al doilea factor pe telefonul lui. Secretul se întoarce O SINGURĂ DATĂ, aici,
   * fiindcă de aici se scanează; după activare nu se mai poate citi.
   */
  app.post('/api/admin/totp/setup', ...guard, async (req: AuthRequest, res) => {
    try {
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!admin) return res.status(404).json({ error: 'NOT_FOUND' });
      const password = String(req.body?.password || '');
      if (!password || !(await bcrypt.compare(password, admin.passwordHash))) {
        return res.status(401).json({ error: 'PASSWORD_INVALID', message: 'Parola nu e bună.' });
      }
      if (admin.totpEnabledAt) {
        // Înlocuirea unui factor activ se face prin `disable`, explicit. Altfel
        // un „setup" tăcut ar lăsa contul cu un factor pe care omul nu-l are.
        return res.status(409).json({ error: 'TOTP_ALREADY_ENABLED', message: 'Ai deja un cod activ. Scoate-l întâi dacă vrei să-l muți pe alt telefon.' });
      }
      const secret = generateTotpSecret();
      await prisma.admin.update({
        where: { id: admin.id },
        // Secretul se ține CRIPTAT: cine ajunge la o copie a bazei capătă altfel
        // și al doilea factor, iar tot rostul lui era să nu stea lângă parolă.
        data: { totpSecret: encryptSensitive(secret), totpEnabledAt: null, totpLastCounter: null },
      });
      return res.json({ secret, otpauthUrl: otpauthUrl(admin.username, secret) });
    } catch (error) {
      console.error('totp setup error:', error);
      return res.status(500).json({ error: 'TOTP_ERROR', message: 'Nu am putut porni codul. Încearcă din nou.' });
    }
  });

  /** `POST /api/admin/totp/enable` — dovada că telefonul chiar are secretul. */
  app.post('/api/admin/totp/enable', ...guard, async (req: AuthRequest, res) => {
    try {
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!admin?.totpSecret) return res.status(409).json({ error: 'TOTP_NOT_STARTED', message: 'Începe cu pasul de configurare.' });
      if (admin.totpEnabledAt) return res.status(409).json({ error: 'TOTP_ALREADY_ENABLED', message: 'Codul e deja activ.' });
      const matched = verifyTotp(base32Decode(decryptSensitive(admin.totpSecret)), String(req.body?.code || ''));
      if (matched === null) {
        return res.status(401).json({ error: 'TOTP_INVALID', message: 'Codul nu e bun. Încearcă cu cel care se arată acum.' });
      }
      await prisma.admin.update({ where: { id: admin.id }, data: { totpEnabledAt: new Date(), totpLastCounter: matched } });
      writeAudit(prisma, {
        actorType: 'ADMIN', actorId: admin.id, action: AUDIT.ADMIN_TOTP_ENABLED,
        entityType: 'Admin', entityId: admin.id, metadata: { ip: clientIp(req) },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('totp enable error:', error);
      return res.status(500).json({ error: 'TOTP_ERROR', message: 'Nu am putut activa codul. Încearcă din nou.' });
    }
  });

  /**
   * `POST /api/admin/totp/disable` — parolă ȘI cod valid.
   *
   * Amândouă, fiindcă scoaterea factorului e exact ce ar face un atacator care
   * a luat parola. Cine și-a pierdut telefonul nu se descurcă singur — și e bine
   * așa: se rezolvă cu un om, nu cu o rută.
   */
  app.post('/api/admin/totp/disable', ...guard, async (req: AuthRequest, res) => {
    try {
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!admin) return res.status(404).json({ error: 'NOT_FOUND' });
      const password = String(req.body?.password || '');
      if (!password || !(await bcrypt.compare(password, admin.passwordHash))) {
        return res.status(401).json({ error: 'PASSWORD_INVALID', message: 'Parola nu e bună.' });
      }
      if (!admin.totpEnabledAt || !admin.totpSecret) {
        // Și „nu era activat" se termină curat: rezultatul cerut e deja adevărat.
        await prisma.admin.update({ where: { id: admin.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastCounter: null } });
        return res.json({ success: true });
      }
      if (verifyTotp(base32Decode(decryptSensitive(admin.totpSecret)), String(req.body?.code || '')) === null) {
        return res.status(401).json({ error: 'TOTP_INVALID', message: 'Codul nu e bun. Încearcă cu cel care se arată acum.' });
      }
      await prisma.admin.update({ where: { id: admin.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastCounter: null } });
      writeAudit(prisma, {
        actorType: 'ADMIN', actorId: admin.id, action: AUDIT.ADMIN_TOTP_DISABLED,
        entityType: 'Admin', entityId: admin.id, metadata: { ip: clientIp(req) },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('totp disable error:', error);
      return res.status(500).json({ error: 'TOTP_ERROR', message: 'Nu am putut scoate codul. Încearcă din nou.' });
    }
  });
}
