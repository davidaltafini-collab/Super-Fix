import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest, AuthService } from './auth.js';
import { AUDIT, clientIp, writeAudit } from './audit.js';
import type { DeviceRequest } from './device.js';
import { linkDeviceToClient } from './device.js';
import { hashOpaqueToken, normalizeEmail, normalizePhone, randomOpaqueToken } from './security-utils.js';

/**
 * Google, Apple și cod pe email (CONT-FANTOMA.md §6), plus revendicarea prin
 * deep link (§12).
 *
 * Regula care le ține pe toate trei împreună: **duc în ACELAȘI loc.** Nu creează
 * un cont nou lângă cel existent — completează identitatea pe rândul `Client`
 * pe care omul îl are deja, găsit după tokenul de dispozitiv sau după telefon.
 * Altfel omul se loghează și își pierde istoricul, ceea ce e mai rău decât să
 * nu se fi logat deloc.
 *
 * Ce NU sunt: poartă înainte de trimiterea cererii. §14 e categoric, și are
 * dreptate — Google garantează un *email*, dar paguba din sistemul ăsta e pe
 * *telefon*. Se oferă ca schimb, în locurile din §8, niciodată ca blocaj.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Verificarea tokenului de la furnizor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `[string, ...string[]]` și nu `string[]`: `jwt.verify` cere o listă despre care
 * se știe la compilare că nu e goală. Tipul e chiar garanția de securitate de mai
 * jos — o listă goală de `audience` înseamnă „acceptă orice `aud`".
 */
type NonEmpty = [string, ...string[]];

interface ProviderConfig {
  name: 'GOOGLE' | 'APPLE';
  jwksUrl: string;
  issuers: NonEmpty;
  audiences: NonEmpty;
}

const splitIds = (raw: string | undefined): NonEmpty | null => {
  const ids = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length ? (ids as NonEmpty) : null;
};

/**
 * `aud` = id-ul aplicației noastre la furnizor. Se citește din mediu fiindcă
 * sunt mai multe (iOS, Android, web au fiecare al lor la Google; la Apple sunt
 * bundle id-ul și service id-ul).
 *
 * **Fără ele ruta nu pornește.** Un token semnat corect de Google, dar emis
 * pentru ALTĂ aplicație, e perfect valid criptografic — dacă n-am verifica
 * `aud`, oricine cu o aplicație Google ar putea intra pe conturile noastre.
 * Deci lipsa configurării nu se ignoră: ruta răspunde că nu e disponibilă.
 */
export const providerConfig = (name: 'GOOGLE' | 'APPLE'): ProviderConfig | null => {
  if (name === 'GOOGLE') {
    const audiences = splitIds(process.env.GOOGLE_CLIENT_IDS);
    if (!audiences) return null;
    return {
      name,
      jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      issuers: ['https://accounts.google.com', 'accounts.google.com'],
      audiences,
    };
  }
  const audiences = splitIds(process.env.APPLE_CLIENT_IDS);
  if (!audiences) return null;
  return {
    name,
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audiences,
  };
};

const JWKS_TTL_MS = 60 * 60 * 1000;
const jwksCache = new Map<string, { keys: any[]; fetchedAt: number }>();

async function fetchJwks(url: string): Promise<any[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`jwks ${url} -> ${res.status}`);
  const body = (await res.json()) as { keys?: any[] };
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  jwksCache.set(url, { keys, fetchedAt: Date.now() });
  return keys;
}

/**
 * Cheia publică pentru `kid`-ul din antetul tokenului.
 *
 * Se ține în memorie o oră, dar dacă `kid`-ul nu e în cache se recitește o
 * singură dată: furnizorii își rotesc cheile fără preaviz, iar un cache expirat
 * ar da erori de login exact în ziua rotației. Recitirea e o dată per kid nou,
 * nu per cerere — altfel un token stricat ar deveni o unealtă de DoS pe JWKS.
 */
async function publicKeyFor(url: string, kid: string): Promise<crypto.KeyObject> {
  let entry = jwksCache.get(url);
  if (!entry || Date.now() - entry.fetchedAt > JWKS_TTL_MS) {
    await fetchJwks(url);
    entry = jwksCache.get(url);
  }
  let jwk = entry?.keys.find((k: any) => k.kid === kid);
  if (!jwk) {
    await fetchJwks(url);
    jwk = jwksCache.get(url)?.keys.find((k: any) => k.kid === kid);
  }
  if (!jwk) throw new Error(`kid ${kid} necunoscut la ${url}`);
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

export interface ProviderClaims {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export async function verifyProviderToken(cfg: ProviderConfig, token: string): Promise<ProviderClaims> {
  const decoded = jwt.decode(token, { complete: true }) as any;
  // `alg` se impune, nu se citește: un token cu `alg: none` sau `HS256` semnat
  // cu cheia publică (care e publică!) ar trece dacă am lăsa antetul să decidă.
  if (!decoded?.header?.kid || decoded.header.alg !== 'RS256') {
    throw new Error('antet de token invalid');
  }
  const key = await publicKeyFor(cfg.jwksUrl, decoded.header.kid);
  const payload = jwt.verify(token, key, {
    algorithms: ['RS256'],
    issuer: cfg.issuers,
    audience: cfg.audiences,
  }) as any;

  const rawVerified = payload.email_verified;
  return {
    subject: String(payload.sub || ''),
    email: payload.email ? normalizeEmail(payload.email) : null,
    // Apple trimite uneori string ("true"), Google boolean. Ambele înseamnă la fel.
    emailVerified: rawVerified === true || rawVerified === 'true',
    name: payload.name ? String(payload.name).slice(0, 100) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unde ajunge identitatea: pe rândul care există deja
// ─────────────────────────────────────────────────────────────────────────────

const PHONE_RE = /^07\d{8}$/;

type LinkOutcome =
  | { ok: true; client: any; claimedGhost: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Găsește (sau, în ultimă instanță, creează) rândul `Client` pe care se pune
 * identitatea. Ordinea e de la cel mai sigur la cel mai slab, ca în §6:
 *
 *  1. identitatea externă deja legată — cel mai stabil, `sub` nu se schimbă;
 *  2. `Client` cu emailul ăsta — contul lui verificat, poate de pe alt telefon;
 *  3. contul fantomă de pe DISPOZITIVUL ăsta — omul a trimis o cerere și acum
 *     își revendică istoricul; ăsta e cazul pentru care s-a scris tot §6;
 *  4. telefonul dat explicit — fantomă pe alt dispozitiv, sau cont nou.
 *
 * Dacă niciuna nu se potrivește, NU inventează: `Client.phone` e obligatoriu și
 * unic, iar telefonul e cheia pe care merge tot produsul. Răspunde
 * `PHONE_REQUIRED` și aplicația cere numărul. Nu e o poartă înaintea cererii
 * (§14) — e ultimul pas al unei conectări pe care omul a ales-o.
 */
async function linkIdentity(
  prisma: any,
  opts: {
    provider: 'GOOGLE' | 'APPLE' | 'EMAIL';
    subject: string | null;
    email: string | null;
    name: string | null;
    phone: string | null;
    deviceClientId: string | null;
    ip: string;
  },
): Promise<LinkOutcome> {
  const { provider, subject, email, name, phone, deviceClientId } = opts;

  const live = async (id: string) => {
    const c = await prisma.client.findFirst({ where: { id, deletedAt: null } });
    return c || null;
  };

  // 1. Identitate externă cunoscută.
  if (subject && provider !== 'EMAIL') {
    const identity = await prisma.clientIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      select: { clientId: true },
    });
    const known = identity ? await live(identity.clientId) : null;
    if (known) return { ok: true, client: known, claimedGhost: false };
  }

  // 2. Contul cu emailul ăsta.
  if (email) {
    const byEmail = await prisma.client.findFirst({ where: { email, deletedAt: null } });
    if (byEmail) {
      if (subject && provider !== 'EMAIL') await upsertIdentity(prisma, provider, subject, byEmail.id, email);
      return { ok: true, client: byEmail, claimedGhost: false };
    }
  }

  // 3. Fantoma de pe dispozitivul ăsta.
  const ghost = deviceClientId ? await live(deviceClientId) : null;
  if (ghost && ghost.email === null) {
    const updated = await adoptGhost(prisma, ghost, { email, name, provider, subject });
    if (updated) return { ok: true, client: updated, claimedGhost: true };
    // Emailul a fost luat între timp de altcineva: cade pe contul aceluia.
    if (email) {
      const raced = await prisma.client.findFirst({ where: { email, deletedAt: null } });
      if (raced) return { ok: true, client: raced, claimedGhost: false };
    }
  }
  // Dispozitivul e deja legat de un cont cu email — e contul lui, îl folosim.
  if (ghost && ghost.email !== null && !email) {
    return { ok: true, client: ghost, claimedGhost: false };
  }

  // 4. Telefonul, dat explicit de om.
  if (!phone || !PHONE_RE.test(phone)) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'PHONE_REQUIRED',
        message: 'Mai avem nevoie de numărul tău de telefon ca să te poată suna eroul.',
      },
    };
  }

  const byPhone = await prisma.client.findFirst({ where: { phone } });
  if (byPhone) {
    const isGhost = byPhone.passwordHash === null && byPhone.email === null && !byPhone.deletedAt;
    if (!isGhost) {
      // Numărul e al unui cont care are deja identitate. Nu i-o luăm.
      return {
        ok: false,
        status: 409,
        body: { error: 'ACCOUNT_EXISTS', message: 'Există deja un cont cu acest telefon. Conectează-te cu el.' },
      };
    }
    const updated = await adoptGhost(prisma, byPhone, { email, name, provider, subject });
    if (updated) return { ok: true, client: updated, claimedGhost: true };
    return { ok: false, status: 409, body: { error: 'ACCOUNT_EXISTS', message: 'Emailul este deja folosit de alt cont.' } };
  }

  try {
    const created = await prisma.client.create({
      data: { name: name || 'Client', phone, email, passwordHash: null },
    });
    if (subject && provider !== 'EMAIL') await upsertIdentity(prisma, provider, subject, created.id, email);
    return { ok: true, client: created, claimedGhost: false };
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
    return { ok: false, status: 409, body: { error: 'ACCOUNT_EXISTS', message: 'Emailul sau telefonul este deja folosit.' } };
  }
}

/**
 * Pune emailul pe rândul fantomă. Guard-ul `email: null` e în UPDATE, nu doar
 * în citire: două conectări simultane pe același rând, una singură câștigă.
 * Întoarce null dacă n-a câștigat sau dacă emailul e deja al altcuiva.
 */
async function adoptGhost(
  prisma: any,
  ghost: any,
  opts: { email: string | null; name: string | null; provider: 'GOOGLE' | 'APPLE' | 'EMAIL'; subject: string | null },
) {
  try {
    const data: Record<string, unknown> = {};
    if (opts.email) data.email = opts.email;
    // Numele de la furnizor NU suprascrie ce a tastat omul în formular: acolo a
    // scris cum vrea să i se spună, aici e cum îl cheamă la Google.
    if (opts.name && (!ghost.name || ghost.name === 'Client')) data.name = opts.name;
    if (Object.keys(data).length) {
      const claimed = await prisma.client.updateMany({
        where: { id: ghost.id, email: null, deletedAt: null },
        data,
      });
      if (claimed.count !== 1) return null;
    }
    if (opts.subject && opts.provider !== 'EMAIL') {
      await upsertIdentity(prisma, opts.provider, opts.subject, ghost.id, opts.email);
    }
    return await prisma.client.findUnique({ where: { id: ghost.id } });
  } catch (error: any) {
    if (error?.code === 'P2002') return null;
    throw error;
  }
}

async function upsertIdentity(prisma: any, provider: string, subject: string, clientId: string, email: string | null) {
  await prisma.clientIdentity.upsert({
    where: { provider_subject: { provider, subject } },
    update: { clientId, email },
    create: { provider, subject, clientId, email },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rutele
// ─────────────────────────────────────────────────────────────────────────────

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
/** 7 zile, ca în §12: destul cât să instaleze aplicația, scurt cât să nu conteze dacă linkul se pierde. */
const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Emite tokenul de revendicare pentru deep link (§12). Doar el trece prin URL. */
export async function issueClaimToken(prisma: any, clientId: string): Promise<string | null> {
  try {
    const token = randomOpaqueToken();
    await prisma.claimToken.create({
      data: { tokenHash: hashOpaqueToken(token), clientId, expiresAt: new Date(Date.now() + CLAIM_TTL_MS) },
    });
    return token;
  } catch (error) {
    console.error('issueClaimToken error:', error);
    return null;
  }
}

export function registerIdentityRoutes(
  app: Express,
  prisma: any,
  auth: AuthService,
  deps: {
    deviceMiddleware: RequestHandler;
    oauthLimiter: RequestHandler;
    codeLimiter: RequestHandler;
    codeVerifyLimiter: RequestHandler;
    claimLimiter: RequestHandler;
    queueEmail: (prisma: any, dedupeKey: string, payload: any) => Promise<any>;
    frontendUrl: (path: string) => string;
  },
) {
  const finish = async (res: any, req: AuthRequest & DeviceRequest, outcome: LinkOutcome, via: string) => {
    if (!outcome.ok) return res.status(outcome.status).json(outcome.body);
    const { client, claimedGhost } = outcome;
    // Dispozitivul se leagă și el: de acum aplicația îl recunoaște și fără sesiune.
    if (req.device) await linkDeviceToClient(prisma, req.device.id, client.id);
    if (claimedGhost) {
      // Un rând care avea deja cereri, conversații și notificări tocmai și-a
      // căpătat stăpân. E fapt de securitate, nu statistică (§10).
      writeAudit(prisma, {
        actorType: 'CLIENT',
        actorId: client.id,
        action: AUDIT.ACCOUNT_CLAIMED,
        entityType: 'Client',
        entityId: client.id,
        metadata: { via, ip: clientIp(req), deviceId: req.device?.id ?? null },
      });
    }
    const session = await auth.issueSession({ id: client.id, role: 'CLIENT' });
    return res.json({
      ...session,
      role: 'CLIENT',
      client: { id: client.id, name: client.name, email: client.email, phone: client.phone },
    });
  };

  const oauthRoute = (provider: 'GOOGLE' | 'APPLE', path: string) => {
    app.post(path, deps.oauthLimiter, deps.deviceMiddleware, async (req: AuthRequest & DeviceRequest, res) => {
      const cfg = providerConfig(provider);
      if (!cfg) {
        // Configurarea lipsește. NU se trece peste verificarea `aud`: mai bine
        // ruta e închisă decât deschisă fără să știe pentru cine e tokenul.
        console.error(`${provider} auth: lipsesc ${provider === 'GOOGLE' ? 'GOOGLE_CLIENT_IDS' : 'APPLE_CLIENT_IDS'}`);
        return res.status(503).json({ error: 'PROVIDER_UNAVAILABLE', message: 'Metoda asta de conectare nu e disponibilă acum. Încearcă cu emailul.' });
      }
      const idToken = String(req.body?.idToken || '').trim();
      if (!idToken || idToken.length > 8000) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Conectarea n-a mers. Încearcă din nou.' });
      }
      let claims: ProviderClaims;
      try {
        claims = await verifyProviderToken(cfg, idToken);
      } catch (error) {
        console.error(`${provider} token invalid:`, (error as Error)?.message);
        return res.status(401).json({ error: 'PROVIDER_TOKEN_INVALID', message: 'Conectarea n-a mers. Încearcă din nou.' });
      }
      if (!claims.subject) {
        return res.status(401).json({ error: 'PROVIDER_TOKEN_INVALID', message: 'Conectarea n-a mers. Încearcă din nou.' });
      }
      try {
        const outcome = await linkIdentity(prisma, {
          provider,
          subject: claims.subject,
          // Un email neverificat nu e o identitate: cine își pune la furnizor
          // adresa altcuiva fără s-o confirme ar ajunge pe contul aceluia.
          email: claims.emailVerified ? claims.email : null,
          name: claims.name,
          phone: normalizePhone(req.body?.phone) || null,
          deviceClientId: req.device?.clientId ?? null,
          ip: clientIp(req),
        });
        return await finish(res, req, outcome, provider.toLowerCase());
      } catch (error) {
        console.error(`${provider} link error:`, error);
        return res.status(500).json({ error: 'AUTH_ERROR', message: 'Conectarea n-a mers. Încearcă din nou.' });
      }
    });
  };

  oauthRoute('GOOGLE', '/api/auth/oauth/google');
  oauthRoute('APPLE', '/api/auth/oauth/apple');

  /**
   * `POST /api/auth/email-code/request` — trimite un cod de 6 cifre.
   *
   * Răspunde 202 la fel indiferent dacă adresa există: altfel ruta devine un
   * detector de conturi, în care oricine află cine e client la noi.
   */
  app.post('/api/auth/email-code/request', deps.codeLimiter, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Scrie o adresă de email validă.' });
    }
    try {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      await prisma.$transaction(async (tx: any) => {
        // Codurile vechi mor la emiterea unuia nou: altfel o adresă ar avea la
        // un moment dat zece coduri valide, adică de zece ori mai ușor de ghicit.
        await tx.loginCode.updateMany({ where: { email, usedAt: null }, data: { usedAt: new Date() } });
        const row = await tx.loginCode.create({
          data: { email, codeHash: hashOpaqueToken(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
        });
        await deps.queueEmail(tx, `login-code:${row.id}`, {
          to: email,
          subject: 'COD DE CONECTARE',
          title: code,
          message: 'Codul e valabil 10 minute și poate fi folosit o singură dată. Dacă nu l-ai cerut tu, ignoră mesajul.',
        });
      });
      return res.status(202).json({ success: true });
    } catch (error) {
      console.error('email code request error:', error);
      return res.status(202).json({ success: true });
    }
  });

  /** `POST /api/auth/email-code/verify` — schimbă codul pe sesiune. */
  app.post('/api/auth/email-code/verify', deps.codeVerifyLimiter, deps.deviceMiddleware, async (req: AuthRequest & DeviceRequest, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Scrie codul din email, cele 6 cifre.' });
    }
    try {
      const row = await prisma.loginCode.findFirst({
        where: { email, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      // Același răspuns pentru „nu există cod" și „cod greșit": diferența ar
      // spune atacatorului dacă adresa a cerut vreodată un cod.
      const wrong = { error: 'CODE_INVALID', message: 'Codul nu e bun sau a expirat. Cere altul.' };
      if (!row) return res.status(401).json(wrong);

      if (row.attempts >= CODE_MAX_ATTEMPTS) {
        await prisma.loginCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
        return res.status(401).json(wrong);
      }
      // `timingSafeEqual` pe hash-uri: lungime fixă, deci comparația nu scurge
      // câte cifre au fost ghicite corect.
      const given = Buffer.from(hashOpaqueToken(code), 'hex');
      const stored = Buffer.from(row.codeHash, 'hex');
      const good = given.length === stored.length && crypto.timingSafeEqual(given, stored);
      if (!good) {
        await prisma.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        return res.status(401).json(wrong);
      }
      const outcome = await linkIdentity(prisma, {
        provider: 'EMAIL',
        subject: null,
        email,
        name: null,
        phone: normalizePhone(req.body?.phone) || null,
        deviceClientId: req.device?.clientId ?? null,
        ip: clientIp(req),
      });
      // PHONE_REQUIRED nu e sfârșitul conectării, e un pas intermediar — omul
      // revine cu același cod și telefonul. Dacă am consuma codul aici, a
      // doua cerere ar pica pe „codul nu e bun", deși l-a scris corect prima
      // dată (asta era bug-ul raportat 30 aug 2026).
      if (!outcome.ok && (outcome as any).body?.error === 'PHONE_REQUIRED') {
        const failed = outcome as any;
        return res.status(failed.status).json(failed.body);
      }
      // Consumat abia acum, la ieșirea din buclă (succes sau eșec definitiv),
      // și doar dacă nimeni nu l-a consumat între timp: două cereri finale cu
      // același cod, una singură intră.
      const used = await prisma.loginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) return res.status(401).json(wrong);
      return await finish(res, req, outcome, 'email-code');
    } catch (error) {
      console.error('email code verify error:', error);
      return res.status(500).json({ error: 'AUTH_ERROR', message: 'Conectarea n-a mers. Încearcă din nou.' });
    }
  });

  /**
   * `POST /api/device/claim` — pasul 3 din §12.
   *
   * Omul a trimis o cerere de pe site, a primit un link cu un token opac, a
   * instalat aplicația. Aici tokenul se schimbă pe identitate: dispozitivul se
   * leagă de contul fantomă care există deja, cu istoric cu tot.
   *
   * NU emite sesiune. Revendicarea dă exact cât dă tokenul de dispozitiv —
   * acces la propriile conversații de pe telefonul ăsta (§8). Contul devine
   * verificat abia prin Google / Apple / cod pe email.
   */
  app.post('/api/device/claim', deps.claimLimiter, deps.deviceMiddleware, async (req: DeviceRequest, res) => {
    const claimToken = String(req.body?.claimToken || '').trim();
    if (!claimToken || claimToken.length > 200) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Linkul nu e complet. Deschide-l din nou din mesaj.' });
    }
    if (!req.device) {
      return res.status(401).json({ error: 'DEVICE_REQUIRED', message: 'Redeschide aplicația și încearcă din nou.' });
    }
    try {
      const row = await prisma.claimToken.findUnique({ where: { tokenHash: hashOpaqueToken(claimToken) } });
      const expired = !row || row.usedAt || new Date(row.expiresAt) <= new Date();
      if (expired) {
        return res.status(410).json({ error: 'CLAIM_EXPIRED', message: 'Linkul a expirat. Trimite o cerere nouă din aplicație.' });
      }
      // Telefonul deja al altcuiva se refuză ÎNAINTE de consumare, nu după:
      // altfel un dispozitiv străin care deschide linkul o dată îl arde, iar
      // omul căruia i-a fost trimis rămâne pe dinafară. `linkDeviceToClient`
      // n-ar suprascrie oricum, dar spunem clar de ce nu s-a întâmplat nimic.
      if (req.device.clientId && req.device.clientId !== row.clientId) {
        return res.status(409).json({ error: 'DEVICE_TAKEN', message: 'Telefonul ăsta e deja legat de alt cont.' });
      }
      // O singură folosire, câștigată în UPDATE: două deschideri simultane ale
      // aceluiași link nu leagă două telefoane de același cont.
      const consumed = await prisma.claimToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) {
        return res.status(410).json({ error: 'CLAIM_EXPIRED', message: 'Linkul a fost deja folosit.' });
      }
      await linkDeviceToClient(prisma, req.device.id, row.clientId);
      writeAudit(prisma, {
        actorType: 'CLIENT',
        actorId: row.clientId,
        action: AUDIT.ACCOUNT_CLAIMED,
        entityType: 'Client',
        entityId: row.clientId,
        metadata: { via: 'deep-link', ip: clientIp(req), deviceId: req.device.id },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('device claim error:', error);
      return res.status(500).json({ error: 'CLAIM_ERROR', message: 'Nu am putut deschide contul. Încearcă din nou.' });
    }
  });

  /**
   * `POST /api/missions/:id/invite` — cealaltă jumătate din §12.
   *
   * Eroul vrea să scrie unui client venit de pe site, dar chatul e doar în
   * aplicație. În loc să-i apară eroului un buton mort, îi trimite omului
   * invitația: „eroul vrea să-ți scrie". Emailul e o alegere a clientului, nu o
   * obligație — de-aia convertește.
   *
   * Eroul NU vede și nu primește tokenul: pleacă direct în emailul clientului.
   */
  app.post('/api/missions/:id/invite', auth.authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    try {
      const mission = await prisma.serviceRequest.findFirst({
        where: { id: String(req.params.id), heroId: req.user.id },
        select: { id: true, clientId: true, clientEmail: true, clientName: true },
      });
      // 404, nu 403: un 403 ar confirma că misiunea există și e a altui erou.
      if (!mission) return res.status(404).json({ error: 'MISSION_NOT_FOUND', message: 'Misiunea nu există.' });
      if (!mission.clientId) {
        return res.status(409).json({ error: 'CLIENT_UNKNOWN', message: 'Cererea asta nu are un cont în spate. Sună clientul.' });
      }
      if (!mission.clientEmail) {
        // Emailul e opțional în formular. Nu e o eroare a eroului, deci i se
        // spune ce POATE face, nu ce lipsește din baza noastră.
        return res.status(409).json({ error: 'CLIENT_EMAIL_MISSING', message: 'Clientul n-a lăsat email. Sună-l și spune-i de aplicație.' });
      }

      // Cel mult o invitație pe zi per misiune. Fără plafon, butonul ăsta ar fi
      // o unealtă de trimis emailuri nedorite către adresa unui om care a cerut
      // o reparație, nu o corespondență.
      const day = new Date().toISOString().slice(0, 10);
      const dedupeKey = `mission-invite:${mission.id}:${day}`;
      const already = await prisma.emailOutbox.findUnique({ where: { dedupeKey } }).catch(() => null);
      if (already) return res.json({ success: true, alreadySent: true });

      // Tokenul se emite abia acum, după ce știm sigur că pleacă un email: un
      // token emis degeaba rămâne o cheie validă șapte zile.
      const token = await issueClaimToken(prisma, mission.clientId);
      if (!token) return res.status(500).json({ error: 'INVITE_ERROR', message: 'Invitația nu a plecat. Încearcă din nou.' });

      const hero = await prisma.hero.findUnique({ where: { id: req.user.id }, select: { alias: true } });
      await deps.queueEmail(prisma, dedupeKey, {
        to: mission.clientEmail,
        subject: 'EROUL VREA SĂ-ȚI SCRIE',
        title: hero?.alias || 'Eroul tău',
        message: 'Instalează aplicația Superfix ca să vorbiți direct, să vezi când ajunge la tine și să-i poți lăsa recenzie după lucrare.',
        ctaLink: deps.frontendUrl(`/app?c=${encodeURIComponent(token)}`),
        ctaText: 'DESCHIDE APLICAȚIA',
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('mission invite error:', error);
      return res.status(500).json({ error: 'INVITE_ERROR', message: 'Invitația nu a plecat. Încearcă din nou.' });
    }
  });
}
