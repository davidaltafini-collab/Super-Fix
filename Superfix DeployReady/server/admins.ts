import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import type { Express, NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest, AuthService } from './auth.js';
import { AUDIT, clientIp, writeAudit } from './audit.js';

/**
 * Trepte de acces în panoul de admin.
 *
 * Azi orice cont de admin poate orice: să vadă datele oamenilor, să șteargă, să
 * aprobe, să scoată bani. Un singur cont spart înseamnă tot sistemul. Treptele
 * nu opresc un atacator care ia contul potrivit, dar fac ca **majoritatea**
 * conturilor să nu mai fie contul potrivit.
 *
 * Trei trepte, nu zece: o listă lungă de drepturi bifabile arată bine în
 * interfață și se termină cu toată lumea pe „tot", fiindcă nimeni nu vrea să
 * ghicească ce bifă lipsește.
 */
export const ADMIN_ROLES = ['SUPER', 'ADMIN', 'SUPPORT'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Treapta SUPER e legată de UN nume, nu de o bifă.
 *
 * Decizie de proprietar: există un singur administrator principal, iar el se
 * numește `admin`. Regula stă în cod, nu în disciplina cuiva — altfel, peste un
 * an, jumătate din conturi sunt SUPER „că așa a fost mai simplu atunci", și
 * treptele nu mai apără nimic.
 *
 * Nu e configurabil din mediu dinadins: o variabilă de mediu care alege cine
 * poate deveni administrator principal e exact fișierul pe care l-ar schimba
 * cineva care a ajuns pe server, și ar face-o fără să lase urmă în cod.
 */
export const SUPER_USERNAME = 'admin';

/**
 * Ce poate fiecare treaptă, în cuvintele pe care le vede omul în panou.
 * Se trimite la interfață ca să nu fie nevoită să le rescrie și să le nimerească
 * altfel decât le aplică serverul.
 */
export const ADMIN_ROLE_INFO: Record<AdminRole, { label: string; description: string }> = {
  SUPER: {
    label: 'Administrator principal',
    description: 'Tot, plus conturile de administrator, plățile și rotirea accesului eroilor.',
  },
  ADMIN: {
    label: 'Administrator',
    description: 'Munca de zi cu zi: eroi, cereri, recenzii, portofoliu, blocări, facturare. Fără conturi de administrator și fără plăți.',
  },
  SUPPORT: {
    label: 'Suport',
    description: 'Poate să se uite peste tot, nu poate schimba nimic.',
  },
};

/**
 * Căi rezervate treptei SUPER, verificate pe calea RELATIVĂ la `/api/admin`.
 *
 * Criteriul de intrare în listă e unul singur: acțiunea e ireversibilă sau dă
 * putere. Restul muncii de panou rămâne la `ADMIN` — o listă prea lungă aici
 * înseamnă că toți vor fi făcuți SUPER ca să-și poată face treaba, adică exact
 * situația de azi, cu pași în plus.
 */
const SUPER_ONLY: RegExp[] = [
  /^\/admins(\/|$)/, // conturile de admin
  /^\/security(\/|$)/, // rotirea accesului eroilor
  /^\/retention\/run$/, // ștergere în masă
  /^\/payouts(\/|$)/, // bani care ies
];

/**
 * Căi la care ajunge ORICE admin conectat, indiferent de treaptă și chiar dacă
 * încă n-are al doilea factor pus. Sunt lucruri despre propriul cont: dacă
 * poarta le-ar închide, un om nou n-ar mai avea cum să se înroleze, iar unul de
 * pe treapta SUPPORT n-ar putea să-și schimbe parola.
 */
const SELF_SERVICE: RegExp[] = [/^\/totp(\/|$)/, /^\/me(\/|$)/];

const matches = (list: RegExp[], path: string) => list.some((re) => re.test(path));

/**
 * Al doilea factor e obligatoriu? Implicit DA.
 *
 * Comutatorul există pentru o singură situație reală: panoul încă nu are ecranul
 * de înrolare, iar înrolarea prin linia de comandă nu se poate face pe loc. Pus
 * pe `false`, sistemul se poartă ca înainte. Pus înapoi pe `true`, poarta se
 * închide fără redeploy.
 */
const totpRequired = () => String(process.env.ADMIN_TOTP_REQUIRED ?? 'true').toLowerCase() !== 'false';

/**
 * Poarta de pe tot ce începe cu `/api/admin`.
 *
 * De ce aici și nu pe fiecare rută: rutele de admin sunt vreo cincizeci, scrise
 * în șase fișiere, iar fiecare își verifică rolul singură, inline. O treaptă de
 * acces pusă rută cu rută s-ar aplica greșit undeva din prima zi și, mai rău,
 * ar lipsi cu totul de pe ruta scrisă săptămâna viitoare. Aici e un singur loc
 * pe care nu-l poate uita nimeni.
 *
 * Poarta autentifică o singură dată; `authenticateToken` de pe rută vede
 * `req.user` deja pus și trece mai departe fără a doua citire de sesiune.
 */
export function makeAdminAccessGuard(prisma: any, auth: AuthService) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Fără antet de autorizare: lăsăm ruta să răspundă 401 ca până acum.
      // Poarta nu are ce decide despre cineva care nu s-a prezentat deloc.
      if (!req.headers.authorization) return next();
      await new Promise<void>((resolve, reject) => {
        auth.authenticateToken(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
      });
      // `authenticateToken` a răspuns deja (401) și n-a chemat `next`.
      if (res.headersSent) return;
      if (!req.user || req.user.role !== 'ADMIN') return next(); // rutele își cer singure rolul

      const admin = await prisma.admin.findUnique({
        where: { id: req.user.id },
        select: { role: true, disabledAt: true, totpEnabledAt: true },
      });
      // Contul nu mai există: sesiunea rămasă în mână nu mai are pe cine acoperi.
      if (!admin) {
        return res.status(401).json({ error: 'SESSION_INVALID', message: 'Sesiunea a expirat.' });
      }
      if (admin.disabledAt) {
        // Oprirea trebuie să prindă și sesiunile deja emise. Altfel un cont
        // suspendat ar mai lucra 12 ore, exact intervalul în care contează.
        return res.status(403).json({ error: 'ADMIN_DISABLED', message: 'Contul tău a fost suspendat. Vorbește cu administratorul principal.' });
      }

      const path = req.path || '/';
      const role: AdminRole = (ADMIN_ROLES as readonly string[]).includes(admin.role) ? (admin.role as AdminRole) : 'ADMIN';
      req.adminRole = role;

      if (matches(SELF_SERVICE, path)) return next();

      if (totpRequired() && !admin.totpEnabledAt) {
        return res.status(403).json({
          error: 'TOTP_SETUP_REQUIRED',
          message: 'Pune-ți codul de autentificare ca să intri în panou.',
        });
      }
      if (role === 'SUPPORT' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return res.status(403).json({ error: 'ADMIN_READ_ONLY', message: 'Contul tău poate doar să se uite, nu să schimbe.' });
      }
      if (role !== 'SUPER' && matches(SUPER_ONLY, path)) {
        return res.status(403).json({ error: 'ADMIN_SUPER_ONLY', message: 'Doar administratorul principal poate face asta.' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const passwordSchema = z
  .string()
  .min(12, 'Parola de administrator trebuie să aibă cel puțin 12 caractere.')
  .max(128)
  .regex(/[a-z]/, 'Parola trebuie să conțină o literă mică.')
  .regex(/[A-Z]/, 'Parola trebuie să conțină o literă mare.')
  .regex(/\d/, 'Parola trebuie să conțină o cifră.');

const createSchema = z.object({
  username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/, 'Numele de utilizator acceptă litere, cifre, punct, minus și underscore.'),
  password: passwordSchema,
  role: z.enum(['ADMIN', 'SUPPORT']), // un SUPER nou se face din panou, prin schimbarea treptei
  // Parola celui care apasă. Crearea unui cont de admin e o creștere de putere:
  // cine găsește un laptop deschis nu are voie să-și facă un cont al lui.
  password_confirm: z.string().min(1),
});

const publicAdmin = (row: any) => ({
  id: row.id,
  username: row.username,
  role: row.role,
  totpEnabled: !!row.totpEnabledAt,
  disabled: !!row.disabledAt,
  createdAt: row.createdAt,
  lastLoginAt: row.lastLoginAt,
});

export function registerAdminAccountRoutes(app: Express, prisma: any, auth: AuthService) {
  const guard = [auth.authenticateToken, auth.requireRole('ADMIN')];

  /** Cine sunt și ce am voie. Prima cerere pe care o face panoul după conectare. */
  app.get('/api/admin/me', ...guard, async (req: AuthRequest, res) => {
    try {
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!admin) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.json({
        ...publicAdmin(admin),
        totpRequired: totpRequired(),
        roles: ADMIN_ROLE_INFO,
      });
    } catch (error) {
      console.error('admin me error:', error);
      return res.status(500).json({ error: 'ADMIN_ERROR', message: 'Nu am putut citi contul. Încearcă din nou.' });
    }
  });

  /** Schimbarea propriei parole. Cere parola veche, ca orice schimbare de parolă. */
  app.post('/api/admin/me/password', ...guard, async (req: AuthRequest, res) => {
    try {
      const parsed = passwordSchema.safeParse(String(req.body?.newPassword || ''));
      if (!parsed.success) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Parolă invalidă.' });
      }
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!admin) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!(await bcrypt.compare(String(req.body?.currentPassword || ''), admin.passwordHash))) {
        return res.status(401).json({ error: 'PASSWORD_INVALID', message: 'Parola veche nu e bună.' });
      }
      await prisma.admin.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(parsed.data, 12) } });
      // Toate celelalte sesiuni cad. Dacă schimbi parola fiindcă bănuiești că
      // ți-a luat-o cineva, sesiunea lui trebuie să moară odată cu ea.
      await auth.revokeActorSessions('ADMIN', admin.id, req.user!.sid);
      writeAudit(prisma, {
        actorType: 'ADMIN', actorId: admin.id, action: AUDIT.ADMIN_PASSWORD_RESET,
        entityType: 'Admin', entityId: admin.id, metadata: { ip: clientIp(req), self: true },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('admin password error:', error);
      return res.status(500).json({ error: 'ADMIN_ERROR', message: 'Nu am putut schimba parola. Încearcă din nou.' });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // De aici în jos: numai SUPER. Poarta de pe `/api/admin` oprește deja restul,
  // dar verificarea se repetă în fiecare rută — o listă de căi e ușor de scris
  // greșit, iar aici greșeala înseamnă că oricine își face cont de admin.
  // ───────────────────────────────────────────────────────────────────────────

  const requireSuper = (req: AuthRequest, res: Response): boolean => {
    if (req.adminRole !== 'SUPER') {
      res.status(403).json({ error: 'ADMIN_SUPER_ONLY', message: 'Doar administratorul principal poate face asta.' });
      return false;
    }
    return true;
  };

  app.get('/api/admin/admins', ...guard, async (req: AuthRequest, res) => {
    if (!requireSuper(req, res)) return;
    try {
      const rows = await prisma.admin.findMany({ orderBy: { createdAt: 'asc' }, take: 200 });
      return res.json({ admins: rows.map(publicAdmin), roles: ADMIN_ROLE_INFO });
    } catch (error) {
      console.error('admin list error:', error);
      return res.status(500).json({ error: 'ADMIN_ERROR', message: 'Nu am putut citi lista. Încearcă din nou.' });
    }
  });

  app.post('/api/admin/admins', ...guard, async (req: AuthRequest, res) => {
    if (!requireSuper(req, res)) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Date invalide.',
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const me = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!me || !(await bcrypt.compare(parsed.data.password_confirm, me.passwordHash))) {
        return res.status(401).json({ error: 'PASSWORD_INVALID', message: 'Scrie parola ta ca să confirmi.' });
      }
      const created = await prisma.admin.create({
        data: {
          username: parsed.data.username,
          passwordHash: await bcrypt.hash(parsed.data.password, 12),
          role: parsed.data.role,
          createdById: me.id,
        },
      });
      // Contul nou nu are al doilea factor. Poarta îl va ține pe „pune-ți codul"
      // de la prima conectare, deci obligația e reală, nu o rugăminte.
      writeAudit(prisma, {
        actorType: 'ADMIN', actorId: me.id, action: AUDIT.ADMIN_CREATED,
        entityType: 'Admin', entityId: created.id,
        metadata: { ip: clientIp(req), username: created.username, role: created.role },
      });
      return res.status(201).json(publicAdmin(created));
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'Există deja un cont cu numele ăsta.' });
      }
      console.error('admin create error:', error);
      return res.status(500).json({ error: 'ADMIN_ERROR', message: 'Nu am putut face contul. Încearcă din nou.' });
    }
  });

  /**
   * Treaptă și suspendare. Amândouă pe aceeași rută fiindcă amândouă răspund la
   * aceeași întrebare: cât poate contul ăsta.
   */
  app.patch('/api/admin/admins/:id', ...guard, async (req: AuthRequest, res) => {
    if (!requireSuper(req, res)) return;
    try {
      const id = String(req.params.id || '');
      const target = await prisma.admin.findUnique({ where: { id } });
      if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Contul nu există.' });

      const wantsRole = req.body?.role !== undefined ? String(req.body.role) : null;
      const wantsDisabled = req.body?.disabled !== undefined ? !!req.body.disabled : null;
      if (wantsRole !== null && !(ADMIN_ROLES as readonly string[]).includes(wantsRole)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Treaptă necunoscută.' });
      }
      // Administrator principal e unul singur, și e contul `admin`. Ridicarea
      // altcuiva pe treapta asta se oprește aici, nu în interfață: ecranul se
      // poate rescrie, ruta nu.
      if (wantsRole === 'SUPER' && target.username !== SUPER_USERNAME) {
        return res.status(403).json({
          error: 'SUPER_RESERVED',
          message: `Administrator principal poate fi doar contul „${SUPER_USERNAME}".`,
        });
      }
      // Pe tine însuți nu-ți schimbi treapta și nu te suspenzi. Nu e paternalism:
      // e singura variantă în care o apăsare greșită nu lasă panoul fără stăpân.
      if (target.id === req.user!.id) {
        return res.status(400).json({ error: 'ADMIN_SELF_CHANGE', message: 'Nu-ți poți schimba propriul cont de aici. Roagă alt administrator principal.' });
      }
      // Ultimul SUPER ACTIV nu se poate coborî sau opri. Fără regula asta,
      // sistemul poate ajunge într-o stare din care nu mai iese nimeni.
      //
      // `!target.disabledAt` contează: un SUPER deja suspendat nu e la socoteală,
      // deci coborârea lui nu ia nimic nimănui. Fără condiția asta, un cont
      // suspendat ar rămâne blocat pe treapta SUPER, ceea ce e exact pe dos.
      //
      // Onest: azi regula nu se poate atinge, fiindcă `ADMIN_SELF_CHANGE` de mai
      // sus garantează că cel care apasă rămâne el însuși un SUPER activ. Rămâne
      // ca a doua încuietoare, pentru ziua în care cineva slăbește prima.
      const losesSuper = target.role === 'SUPER' && !target.disabledAt
        && ((wantsRole !== null && wantsRole !== 'SUPER') || wantsDisabled === true);
      if (losesSuper) {
        const supers = await prisma.admin.count({ where: { role: 'SUPER', disabledAt: null } });
        if (supers <= 1) {
          return res.status(409).json({ error: 'LAST_SUPER_ADMIN', message: 'E ultimul administrator principal. Fă întâi altul.' });
        }
      }

      const data: Record<string, unknown> = {};
      if (wantsRole !== null) data.role = wantsRole;
      if (wantsDisabled !== null) data.disabledAt = wantsDisabled ? new Date() : null;
      if (!Object.keys(data).length) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nu ai cerut nicio schimbare.' });

      const updated = await prisma.admin.update({ where: { id }, data });
      if (wantsDisabled === true) {
        // Suspendarea trebuie să însemne „acum", nu „când îi expiră sesiunea".
        await auth.revokeActorSessions('ADMIN', id);
      }
      if (wantsRole !== null && wantsRole !== target.role) {
        writeAudit(prisma, {
          actorType: 'ADMIN', actorId: req.user!.id, action: AUDIT.ADMIN_ROLE_CHANGED,
          entityType: 'Admin', entityId: id, metadata: { ip: clientIp(req), from: target.role, to: wantsRole },
        });
      }
      if (wantsDisabled !== null && wantsDisabled !== !!target.disabledAt) {
        writeAudit(prisma, {
          actorType: 'ADMIN', actorId: req.user!.id,
          action: wantsDisabled ? AUDIT.ADMIN_DISABLED : AUDIT.ADMIN_ENABLED,
          entityType: 'Admin', entityId: id, metadata: { ip: clientIp(req) },
        });
      }
      return res.json(publicAdmin(updated));
    } catch (error) {
      console.error('admin patch error:', error);
      return res.status(500).json({ error: 'ADMIN_ERROR', message: 'Nu am putut schimba contul. Încearcă din nou.' });
    }
  });

  /**
   * `DELETE /api/admin/admins/:id` — contul dispare pentru cine se uită în listă,
   * dar rândul rămâne: exact ca la ștergerea unui cont de client (`DELETE
   * /api/client/me`), fiindcă `AuditLog.actorId` ar rămâne fără nume dacă rândul
   * ar dispărea de tot. Se anonimizează: username eliberat, parolă și TOTP
   * scoase din uz, sesiunile cad. Ireversibil — spre deosebire de suspendare.
   */
  app.delete('/api/admin/admins/:id', ...guard, async (req: AuthRequest, res) => {
    if (!requireSuper(req, res)) return;
    try {
      const id = String(req.params.id || '');
      const me = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!me || !(await bcrypt.compare(String(req.body?.password || ''), me.passwordHash))) {
        return res.status(401).json({ error: 'PASSWORD_INVALID', message: 'Scrie parola ta ca să confirmi.' });
      }
      const target = await prisma.admin.findUnique({ where: { id } });
      if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Contul nu există.' });
      if (target.id === req.user!.id) {
        return res.status(400).json({ error: 'ADMIN_SELF_CHANGE', message: 'Nu-ți poți șterge propriul cont de aici. Roagă alt administrator principal.' });
      }
      if (target.role === 'SUPER') {
        return res.status(403).json({ error: 'SUPER_RESERVED', message: 'Administratorul principal nu poate fi șters.' });
      }
      const randomPassword = crypto.randomBytes(32).toString('hex');
      await prisma.admin.update({
        where: { id },
        data: {
          username: `sters:${id}`,
          passwordHash: await bcrypt.hash(randomPassword, 12),
          disabledAt: new Date(),
          totpSecret: null,
          totpEnabledAt: null,
          totpLastCounter: null,
        },
      });
      await auth.revokeActorSessions('ADMIN', id);
      writeAudit(prisma, {
        actorType: 'ADMIN', actorId: me.id, action: AUDIT.ADMIN_DELETED,
        entityType: 'Admin', entityId: id, metadata: { ip: clientIp(req), username: target.username, role: target.role },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('admin delete error:', error);
      return res.status(500).json({ error: 'ADMIN_ERROR', message: 'Nu am putut șterge contul. Încearcă din nou.' });
    }
  });

  /**
   * `POST /api/admin/admins/:id/reset-totp` — cineva și-a pierdut telefonul.
   *
   * E cea mai periculoasă rută din panou: după ea, contul intră cu parola
   * singură. De-aia cere parola CELUI CARE APASĂ și lasă urmă cu numele lui.
   * Contul rămâne obligat să-și pună alt cod la prima conectare.
   */
  app.post('/api/admin/admins/:id/reset-totp', ...guard, async (req: AuthRequest, res) => {
    if (!requireSuper(req, res)) return;
    try {
      const id = String(req.params.id || '');
      const me = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!me || !(await bcrypt.compare(String(req.body?.password || ''), me.passwordHash))) {
        return res.status(401).json({ error: 'PASSWORD_INVALID', message: 'Scrie parola ta ca să confirmi.' });
      }
      const target = await prisma.admin.findUnique({ where: { id } });
      if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Contul nu există.' });
      await prisma.admin.update({ where: { id }, data: { totpSecret: null, totpEnabledAt: null, totpLastCounter: null } });
      // Sesiunile lui cad: dacă telefonul a fost furat, nu pierdut, sesiunea de
      // pe el n-are voie să treacă peste resetare.
      await auth.revokeActorSessions('ADMIN', id);
      writeAudit(prisma, {
        actorType: 'ADMIN', actorId: me.id, action: AUDIT.ADMIN_TOTP_RESET,
        entityType: 'Admin', entityId: id, metadata: { ip: clientIp(req), username: target.username },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('admin totp reset error:', error);
      return res.status(500).json({ error: 'ADMIN_ERROR', message: 'Nu am putut reseta codul. Încearcă din nou.' });
    }
  });

  /**
   * `POST /api/admin/admins/:id/password` — parolă nouă pusă de SUPER.
   * Pentru cazul „a uitat parola". Sesiunile lui cad, ca să nu rămână deschis
   * un panou pe care tocmai i l-am scos din mână.
   */
  app.post('/api/admin/admins/:id/password', ...guard, async (req: AuthRequest, res) => {
    if (!requireSuper(req, res)) return;
    try {
      const id = String(req.params.id || '');
      const parsed = passwordSchema.safeParse(String(req.body?.newPassword || ''));
      if (!parsed.success) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Parolă invalidă.' });
      }
      const me = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!me || !(await bcrypt.compare(String(req.body?.password || ''), me.passwordHash))) {
        return res.status(401).json({ error: 'PASSWORD_INVALID', message: 'Scrie parola ta ca să confirmi.' });
      }
      const target = await prisma.admin.findUnique({ where: { id } });
      if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Contul nu există.' });
      await prisma.admin.update({ where: { id }, data: { passwordHash: await bcrypt.hash(parsed.data, 12) } });
      await auth.revokeActorSessions('ADMIN', id);
      writeAudit(prisma, {
        actorType: 'ADMIN', actorId: me.id, action: AUDIT.ADMIN_PASSWORD_RESET,
        entityType: 'Admin', entityId: id, metadata: { ip: clientIp(req), self: false },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('admin password reset error:', error);
      return res.status(500).json({ error: 'ADMIN_ERROR', message: 'Nu am putut schimba parola. Încearcă din nou.' });
    }
  });
}
