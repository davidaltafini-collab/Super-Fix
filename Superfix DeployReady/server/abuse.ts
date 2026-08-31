import type { Express, RequestHandler } from 'express';
import type { AuthRequest, AuthService } from './auth.js';
import { AUDIT, clientIp, writeAudit, writeAuditSync } from './audit.js';
import { normalizePhone } from './security-utils.js';

/**
 * Abuz (CONT-FANTOMA.md §9).
 *
 * Premisa, scrisă ca să nu se piardă: **tokenul de dispozitiv nu e zid.** Cine
 * vrea îl schimbă în două minute — reinstalează, resetează, sau intră de pe alt
 * telefon. E bun ca fir de continuitate, inutil ca blocare. Deci blocarea se
 * face pe TELEFON, care se poate tasta al altuia, dar care e singura cheie pe
 * care se poate trage cineva la răspundere.
 *
 * Niciunul dintre identificatori nu e dovadă singur. O investigație se face cu
 * patru identificatori slabi care se potrivesc între ei — telefon, token, cont,
 * IP — pe o linie de timp. De-aia faptele merg în `AuditLog` cu `entityId`, nu
 * doar în `ApiLog`, care ține ruta-șablon și nu poate răspunde „CARE erou".
 */

/**
 * Trepte, nu un prag.
 *
 * Varianta „trei raportări și ești blocat 30 de zile" cade la o obiecție simplă
 * și corectă: **doi prieteni te blochează.** Un număr se poate tasta al altuia,
 * deci raportările nu dovedesc cine e omul — dovedesc doar că trei eroi s-au
 * supărat pe cererile venite cu numărul ăla.
 *
 * Așa că blocarea nu mai vine niciodată din senin:
 *
 *   1. Două raportări → **avertisment pe ecran** la următoarea cerere, plus
 *      email dacă avem adresă. Nimic blocat, cererea pleacă normal.
 *   2. Trei raportări, dar **cel puțin una după ce avertismentul a fost citit**
 *      → suspendare 7 zile. Fără avertisment livrat nu se blochează niciodată:
 *      cine n-a fost anunțat n-avea cum să se oprească.
 *   3. Recidivă (a mai fost blocat o dată) → 30 de zile.
 *
 * Treapta 2 e cea care sparge atacul cu prietenii: ca să te blocheze, trebuie să
 * te mai raporteze o dată DUPĂ ce tu ai văzut avertismentul și ai continuat.
 * Nu-l face imposibil — îl face vizibil, cu dată și oră în jurnal, exact ce-i
 * trebuie unui om ca să te deblocheze când vede că a fost o răfuială.
 */
export const REPORTS_TO_WARN = 2;
export const REPORTS_TO_BLOCK = 3;
/** Prima suspendare e scurtă. Scopul e să oprească, nu să pedepsească. */
export const FIRST_BLOCK_DAYS = 7;
export const REPEAT_BLOCK_DAYS = 30;

/**
 * Câte numere DIFERITE trebuie să fi folosit o instalare ca să spunem că omul de
 * la tastatură pune numerele altora.
 *
 * Patru, nu două: într-o casă, un telefon trimite cereri cu numărul soțului,
 * al soției și al bunicii, și n-are nimeni nimic de împărțit. Pragul se
 * verifică oricum doar în clipa în care o blocare fusese deja câștigată, deci
 * nu se aplică nimănui care n-a ajuns până acolo.
 */
const DEVICE_PHONE_SPREAD = 4;
/** Fereastra pe care se uită corelarea. Mai departe de-atât nu mai zice nimic. */
const CORRELATION_DAYS = 30;

/**
 * Cereri pe oră de pe ACELAȘI număr. Azi limita e 20/oră per IP, ceea ce e
 * greșit în ambele direcții: un singur număr poate bombarda toți eroii din oraș
 * fără să atingă pragul, iar un birou întreg împarte un contor și se blochează
 * degeaba. 10 e peste orice folosire reală — omul cere ajutor la doi-trei eroi.
 */
export const PHONE_REQUESTS_PER_HOUR = 10;

/* Formă plată, nu uniune discriminată: proiectul rulează cu `strictNullChecks`
   oprit, unde TS nu restrânge fiabil `ok:true`/`ok:false` la două forme
   diferite (vezi `LoginResult` din dataService.ts). */
export type PhoneGate = { ok: boolean; status?: number; body?: Record<string, unknown>; warning?: PhoneWarning };

/**
 * Avertismentul care se întoarce ODATĂ cu cererea reușită. Nu e o eroare:
 * cererea a plecat, iar textul e ce trebuie să vadă omul înainte să existe
 * vreo blocare.
 */
export interface PhoneWarning {
  reports: number;
  title: string;
  message: string;
}

const WARNING_TEXT = (reports: number): PhoneWarning => ({
  reports,
  title: 'Am primit sesizări despre cererile de la numărul tău',
  // Ce poate face omul, nu ce s-a întâmplat în baza noastră de date: dacă tot îl
  // avertizăm, avertismentul trebuie să conțină ieșirea, nu doar vestea proastă.
  message: 'Meseriașii ne-au scris că unele cereri de la numărul ăsta nu erau reale. '
    + 'Trimite cereri doar când chiar ai nevoie de cineva și răspunde la telefon când te sună. '
    + 'Dacă mai vin sesizări, cererile de la numărul ăsta se opresc pentru o vreme. '
    + 'Dacă e o greșeală, scrie-ne acum.',
});

/**
 * Poate numărul ăsta să trimită o cerere?
 *
 * Două verificări, în ordinea costului: lista de blocare (o citire pe cheia
 * primară) și apoi rata pe oră (o numărare pe index). Ambele eșuează „deschis":
 * dacă baza nu răspunde, cererea omului trece. Un sistem antiabuz care oprește
 * cereri legitime când are el o problemă face mai mult rău decât abuzul.
 */
export async function checkPhoneAllowed(prisma: any, phone: string): Promise<PhoneGate> {
  try {
    const blocked = await prisma.blockedPhone.findUnique({ where: { phone } });
    if (blocked && (!blocked.expiresAt || new Date(blocked.expiresAt) > new Date())) {
      // §9, împărțirea pe tip: comportament automat (scraper, rafală) → tăcere,
      // fiindcă un bot căruia îi spui că l-ai prins își schimbă tiparul până
      // diseară. Om → avertisment explicit, o dată, fiindcă majoritatea se
      // opresc când înțeleg că sunt identificați.
      return blocked.silent
        ? { ok: false, status: 503, body: { error: 'REQUEST_UNAVAILABLE', message: 'Nu am putut trimite cererea. Încearcă din nou mai târziu.' } }
        : {
            ok: false,
            status: 403,
            body: {
                error: 'PHONE_BLOCKED',
                message: 'Cererile de la acest număr sunt suspendate. Sună-ne dacă e o greșeală.',
            },
          };
    }

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await prisma.serviceRequest.count({
      where: { clientPhone: phone, date: { gte: since } },
    });
    if (recent >= PHONE_REQUESTS_PER_HOUR) {
      return {
        ok: false,
        status: 429,
        body: { error: 'PHONE_RATE_LIMIT', message: 'Ai trimis multe cereri într-un timp scurt. Mai încearcă peste o oră.' },
      };
    }

    // Treapta 1: avertismentul. Se calculează doar dacă numărul a fost raportat,
    // deci pentru cererea unui om obișnuit e o numărătoare pe index și atât.
    const reports = await countReports(prisma, phone);
    if (reports >= REPORTS_TO_WARN && !(await lastWarnedAt(prisma, phone))) {
      return { ok: true, warning: WARNING_TEXT(reports) };
    }
    return { ok: true };
  } catch (error) {
    console.error('checkPhoneAllowed error:', error);
    return { ok: true };
  }
}

/** Câți eroi diferiți au raportat numărul. Un erou = o raportare (vezi ruta). */
const countReports = (prisma: any, phone: string) =>
  prisma.auditLog.count({ where: { action: AUDIT.REPORT_FILED, entityType: 'Phone', entityId: phone } });

/** Când i s-a arătat ultima oară avertismentul pe ecran. `null` = niciodată. */
async function lastWarnedAt(prisma: any, phone: string): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    where: { action: AUDIT.PHONE_WARNED, entityType: 'Phone', entityId: phone },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return row ? new Date(row.createdAt) : null;
}

/**
 * Instalarea asta are voie să trimită cereri?
 *
 * Tăcere, nu explicație: oprirea unei instalări se pune doar când tiparul spune
 * că omul folosește numerele altora, iar unuia care face asta cu bună știință
 * nu-i spui ce ai văzut — își schimbă tiparul până diseară.
 */
export async function checkDeviceAllowed(prisma: any, deviceId: string | null | undefined): Promise<PhoneGate> {
  if (!deviceId) return { ok: true };
  try {
    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { blockedAt: true } });
    if (!device?.blockedAt) return { ok: true };
    return {
      ok: false,
      status: 503,
      body: { error: 'REQUEST_UNAVAILABLE', message: 'Nu am putut trimite cererea. Încearcă din nou mai târziu.' },
    };
  } catch (error) {
    // Ca peste tot în poarta asta: dacă baza tace, cererea omului trece.
    console.error('checkDeviceAllowed error:', error);
    return { ok: true };
  }
}

/**
 * Cine ar trebui de fapt oprit: numărul sau instalarea?
 *
 * Întrebarea vine din singura obiecție serioasă la blocarea pe număr: numărul se
 * poate tasta al altuia. Dacă toate cererile venite cu numărul ăsta au plecat de
 * pe o singură instalare, iar instalarea aia a mai folosit încă vreo câteva
 * numere, atunci numărul e victima, nu vinovatul.
 *
 * Ce vede efectiv serverul: `Device.token`, un șir emis de noi și ținut în
 * Keychain/Keystore. Identifică o INSTALARE, nu un telefon fizic — se
 * dezinstalează aplicația și tokenul e altul. Nu e dovadă, e un indiciu. De-aia
 * rezultatul nu pedepsește pe nimeni definitiv: oprește instalarea, lasă numărul
 * în pace și scrie totul în jurnal, ca să poată un om să se uite.
 */
export async function blameDevice(prisma: any, phone: string): Promise<string | null> {
  try {
    const since = new Date(Date.now() - CORRELATION_DAYS * 86400_000);
    const rows = await prisma.serviceRequest.findMany({
      where: { clientPhone: phone, date: { gte: since } },
      select: { deviceId: true },
      take: 500,
    });
    const devices = new Set<string>(rows.map((r: any) => r.deviceId).filter(Boolean));
    // Zero instalări (cereri de pe site) sau mai multe: nu se poate arăta cu
    // degetul spre una anume, deci rămâne blocarea pe număr.
    if (devices.size !== 1) return null;
    const deviceId = [...devices][0];

    const used = await prisma.serviceRequest.findMany({
      where: { deviceId, date: { gte: since } },
      select: { clientPhone: true },
      take: 500,
    });
    const phones = new Set<string>(used.map((r: any) => r.clientPhone).filter(Boolean));
    return phones.size >= DEVICE_PHONE_SPREAD ? deviceId : null;
  } catch (error) {
    console.error('blameDevice error:', error);
    return null;
  }
}

/** Oprește o instalare. Tăcut pentru cel oprit, scris pentru noi. */
export async function blockDevice(prisma: any, deviceId: string, reason: string, actorId?: string) {
  await prisma.device.update({ where: { id: deviceId }, data: { blockedAt: new Date(), blockedReason: reason.slice(0, 300) } });
  writeAudit(prisma, {
    actorType: actorId ? 'ADMIN' : 'SYSTEM',
    actorId: actorId || 'sistem',
    action: AUDIT.DEVICE_BLOCKED,
    entityType: 'Device',
    entityId: deviceId,
    metadata: { reason },
  });
}

/**
 * Ce se întâmplă după o raportare nouă. Aici e toată scara, într-un singur loc.
 *
 * Întoarce ce s-a decis, ca ruta să răspundă eroului adevărul: „am notat",
 * „urmează avertismentul", „am suspendat". Eroul care raportează merită să știe
 * că apăsarea lui a contat — altfel a doua oară nu mai apasă.
 */
async function escalate(
  prisma: any,
  phone: string,
  reports: number,
  queueEmail?: QueueEmail,
): Promise<{ blocked: boolean; stage: 'NOTED' | 'WARNING_PENDING' | 'BLOCKED' }> {
  if (reports < REPORTS_TO_WARN) return { blocked: false, stage: 'NOTED' };

  const warnedAt = await lastWarnedAt(prisma, phone);
  // Avertismentul nu i-a fost încă arătat: nu se blochează. Se va livra la
  // următoarea cerere (`checkPhoneAllowed`), iar dacă omul nu mai trimite
  // niciuna, n-a mai rămas nimic de oprit.
  if (!warnedAt || reports < REPORTS_TO_BLOCK) return { blocked: false, stage: 'WARNING_PENDING' };

  // Regula care sparge atacul „doi prieteni te blochează": trebuie să existe o
  // raportare DUPĂ avertismentul citit. Fără ea, tot ce s-a strâns e din
  // perioada în care omul nu știa nimic.
  const afterWarning = await prisma.auditLog.count({
    where: { action: AUDIT.REPORT_FILED, entityType: 'Phone', entityId: phone, createdAt: { gt: warnedAt } },
  });
  if (afterWarning < 1) return { blocked: false, stage: 'WARNING_PENDING' };

  // Numărul e al altuia? Atunci blocarea lui ar lovi exact victima.
  const culpritDevice = await blameDevice(prisma, phone);
  if (culpritDevice) {
    await blockDevice(prisma, culpritDevice, `Cereri cu numere diferite; ultima sesizare pe ${phone}`);
    return { blocked: false, stage: 'BLOCKED' };
  }

  // Recidivă = a mai fost blocat vreodată. Rândul vechi poate fi expirat sau
  // șters de un admin, deci sursa e jurnalul, nu lista de blocări.
  const previous = await prisma.auditLog.count({
    where: { action: AUDIT.PHONE_BLOCKED, entityType: 'Phone', entityId: phone },
  });
  const days = previous > 0 ? REPEAT_BLOCK_DAYS : FIRST_BLOCK_DAYS;
  await blockPhone(prisma, phone, {
    reason: `Raportat de ${reports} eroi, inclusiv după avertisment`,
    source: 'AUTO',
    expiresAt: new Date(Date.now() + days * 86400_000),
  });
  if (queueEmail) await notifyBlocked(prisma, phone, days, queueEmail);
  return { blocked: true, stage: 'BLOCKED' };
}

export type QueueEmail = (prisma: any, dedupeKey: string, payload: {
  to: string; subject: string; title: string; message: string;
  dataFields?: Record<string, unknown>; ctaLink?: string; ctaText?: string;
}) => Promise<unknown>;

/**
 * Emailul de la treapta 3. Se trimite doar dacă avem o adresă — un cont fantomă
 * poate să n-aibă niciuna, și e în regulă: avertismentul de pe ecran a fost
 * treapta care conta.
 */
async function notifyBlocked(prisma: any, phone: string, days: number, queueEmail: QueueEmail) {
  try {
    const client = await prisma.client.findUnique({ where: { phone }, select: { email: true } });
    let to: string | null = client?.email ?? null;
    if (!to) {
      const request = await prisma.serviceRequest.findFirst({
        where: { clientPhone: phone, clientEmail: { not: null } },
        orderBy: { date: 'desc' },
        select: { clientEmail: true },
      });
      to = request?.clientEmail ?? null;
    }
    if (!to) return;
    // Cheia de dedublare include ziua: o a doua blocare peste luni nu tace din
    // cauza primului email, dar două scrieri în aceeași zi nu trimit de două ori.
    const day = new Date().toISOString().slice(0, 10);
    await queueEmail(prisma, `phone-blocked:${phone}:${day}`, {
      to,
      subject: 'Cererile de la numărul tău sunt oprite temporar',
      title: 'CERERI OPRITE',
      message: `Am primit sesizări de la mai mulți meseriași despre cererile trimise cu numărul ${phone}, `
        + `inclusiv după avertismentul pe care ți l-am arătat în aplicație. `
        + `Cererile de la numărul ăsta sunt oprite ${days} zile. `
        + `Dacă e o greșeală — de exemplu altcineva a folosit numărul tău — răspunde la mesajul ăsta și ne uităm.`,
      dataFields: { Număr: phone, Durată: `${days} zile` },
    });
  } catch (error) {
    // Emailul nu are voie să doboare blocarea: blocarea e decizia, emailul e curtoazia.
    console.error('notifyBlocked error:', error);
  }
}

/**
 * Blochează un număr și scrie faptul. Idempotentă: o a doua blocare pe același
 * număr actualizează motivul și termenul, nu creează un al doilea rând.
 */
export async function blockPhone(
  prisma: any,
  phone: string,
  opts: { reason: string; source: 'ADMIN' | 'AUTO'; actorId?: string | null; silent?: boolean; expiresAt?: Date | null },
) {
  const data = {
    reason: opts.reason.slice(0, 500),
    source: opts.source,
    silent: !!opts.silent,
    actorId: opts.actorId ?? null,
    expiresAt: opts.expiresAt ?? null,
  };
  const row = await prisma.blockedPhone.upsert({ where: { phone }, update: data, create: { phone, ...data } });
  writeAudit(prisma, {
    actorType: opts.source === 'AUTO' ? 'SYSTEM' : 'ADMIN',
    actorId: opts.actorId || 'sistem',
    action: AUDIT.PHONE_BLOCKED,
    entityType: 'Phone',
    entityId: phone,
    metadata: { reason: data.reason, source: data.source, expiresAt: data.expiresAt },
  });
  return row;
}

export function registerAbuseRoutes(
  app: Express,
  prisma: any,
  auth: AuthService,
  deps: { identify: RequestHandler[]; queueEmail?: QueueEmail },
) {
  const admin = [auth.authenticateToken, auth.requireRole('ADMIN')];

  /**
   * `POST /api/missions/:id/report` — eroul raportează clientul unei misiuni.
   * O apăsare, din ecranul pe care eroul îl are oricum deschis (§9).
   *
   * Ținta e TELEFONUL, nu contul: contul se poate să nici nu existe (fantomă
   * ștearsă, cerere de pe site), dar numărul e cel cu care vine plângerea.
   */
  app.post('/api/missions/:id/report', auth.authenticateToken, auth.requireRole('HERO'), async (req: AuthRequest, res) => {
    try {
      const reason = String(req.body?.reason || '').trim().slice(0, 500);
      if (reason.length < 3) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Spune în câteva cuvinte ce s-a întâmplat.' });
      }
      const mission = await prisma.serviceRequest.findUnique({
        where: { id: String(req.params.id || '') },
        select: { id: true, heroId: true, clientPhone: true, clientId: true },
      });
      // 404 și când misiunea e a altui erou: un 403 ar confirma că id-ul există.
      if (!mission || mission.heroId !== req.user!.id) {
        return res.status(404).json({ error: 'MISSION_NOT_FOUND', message: 'Misiunea nu există.' });
      }
      const phone = normalizePhone(mission.clientPhone);
      if (!phone) return res.status(400).json({ error: 'PHONE_MISSING', message: 'Misiunea nu are un număr de contact.' });

      const key = { action: AUDIT.REPORT_FILED, entityType: 'Phone', entityId: phone };
      const mine = await prisma.auditLog.findFirst({
        where: { ...key, actorType: 'HERO', actorId: req.user!.id },
        select: { id: true },
      });
      // Un erou = o raportare per număr. Fără regula asta, „de la eroi diferiți"
      // n-ar însemna nimic: unul singur ar putea apăsa de trei ori.
      if (mine) return res.json({ success: true, alreadyReported: true });

      await writeAuditSync(prisma, {
        actorType: 'HERO',
        actorId: req.user!.id,
        action: AUDIT.REPORT_FILED,
        entityType: 'Phone',
        entityId: phone,
        metadata: { missionId: mission.id, reason, ip: clientIp(req) },
      });

      const reports = await prisma.auditLog.count({ where: key });
      const outcome = await escalate(prisma, phone, reports, deps.queueEmail);
      return res.json({ success: true, reports, ...outcome });
    } catch (error) {
      console.error('mission report error:', error);
      return res.status(500).json({ error: 'REPORT_ERROR', message: 'Nu am putut trimite raportarea. Încearcă din nou.' });
    }
  });

  /**
   * `POST /api/reports` — clientul raportează un erou, din zona lui de cont.
   *
   * Merge și pentru contul fantomă: raportarea e supapa de siguranță, iar dacă
   * i-am cere întâi cont, exact omul căruia i s-a întâmplat ceva ar renunța.
   *
   * NU blochează automat, oricâte raportări ar fi. Asimetria e reală și decisă
   * în §9: numărul eroului ajunge la mii de oameni, al clientului la unul.
   * Suspendarea unui erou care plătește abonament e o decizie de om, luată din
   * admin — aici doar se strânge dosarul.
   */
  app.post('/api/reports', ...deps.identify, async (req: AuthRequest, res) => {
    try {
      const heroId = String(req.body?.heroId || '').trim();
      const reason = String(req.body?.reason || '').trim().slice(0, 500);
      if (!heroId || reason.length < 3) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Alege eroul și spune în câteva cuvinte ce s-a întâmplat.' });
      }
      const hero = await prisma.hero.findUnique({ where: { id: heroId }, select: { id: true } });
      if (!hero) return res.status(404).json({ error: 'HERO_NOT_FOUND', message: 'Eroul nu există.' });

      const where = {
        action: AUDIT.REPORT_FILED,
        entityType: 'Hero',
        entityId: heroId,
        actorType: 'CLIENT' as const,
        actorId: req.user!.id,
      };
      const mine = await prisma.auditLog.findFirst({ where, select: { id: true } });
      if (mine) return res.json({ success: true, alreadyReported: true });

      await writeAuditSync(prisma, {
        actorType: 'CLIENT',
        actorId: req.user!.id,
        action: AUDIT.REPORT_FILED,
        entityType: 'Hero',
        entityId: heroId,
        metadata: { reason, ip: clientIp(req), viaDevice: !!req.user!.viaDevice },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('client report error:', error);
      return res.status(500).json({ error: 'REPORT_ERROR', message: 'Nu am putut trimite raportarea. Încearcă din nou.' });
    }
  });

  /**
   * `GET /api/admin/blocked-phones` — lista, cu numărul de raportări și cu
   * momentul în care i s-a arătat avertismentul.
   *
   * `warnedAt` e coloana de care are nevoie omul care judecă o contestație:
   * blocarea automată nu se pune fără el, deci dacă lipsește, ceva e greșit;
   * iar dacă e acolo, se vede exact că avertismentul a venit înaintea blocării.
   */
  app.get('/api/admin/blocked-phones', ...admin, async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
      const rows = await prisma.blockedPhone.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
      const withCounts = await Promise.all(rows.map(async (row: any) => ({
        ...row,
        active: !row.expiresAt || new Date(row.expiresAt) > new Date(),
        reports: await prisma.auditLog.count({
          where: { action: AUDIT.REPORT_FILED, entityType: 'Phone', entityId: row.phone },
        }),
        warnedAt: await lastWarnedAt(prisma, row.phone),
      })));
      return res.json(withCounts);
    } catch (error) {
      console.error('blocked phones list error:', error);
      return res.status(500).json({ error: 'BLOCKLIST_ERROR' });
    }
  });

  /** `GET /api/admin/blocked-devices` — instalările oprite, cu numerele folosite. */
  app.get('/api/admin/blocked-devices', ...admin, async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
      const rows = await prisma.device.findMany({
        where: { blockedAt: { not: null } },
        orderBy: { blockedAt: 'desc' },
        take: limit,
        select: { id: true, platform: true, clientId: true, blockedAt: true, blockedReason: true, createdAt: true, lastSeenAt: true },
      });
      const withPhones = await Promise.all(rows.map(async (row: any) => {
        const used = await prisma.serviceRequest.findMany({
          where: { deviceId: row.id }, select: { clientPhone: true }, take: 200,
        });
        // Tokenul NU iese niciodată din server: e credențialul instalării. Cine
        // l-ar citi din panou ar putea intra pe contul fantomă al omului.
        return { ...row, phones: [...new Set(used.map((r: any) => r.clientPhone).filter(Boolean))] };
      }));
      return res.json(withPhones);
    } catch (error) {
      console.error('blocked devices list error:', error);
      return res.status(500).json({ error: 'BLOCKLIST_ERROR' });
    }
  });

  /** `DELETE /api/admin/blocked-devices/:id` — repunerea în drepturi a unei instalări. */
  app.delete('/api/admin/blocked-devices/:id', ...admin, async (req: AuthRequest, res) => {
    try {
      const id = String(req.params.id || '');
      const removed = await prisma.device.updateMany({
        where: { id, blockedAt: { not: null } },
        data: { blockedAt: null, blockedReason: null },
      });
      if (!removed.count) return res.status(404).json({ error: 'NOT_BLOCKED' });
      writeAudit(prisma, {
        actorType: 'ADMIN', actorId: req.user!.id, action: AUDIT.DEVICE_UNBLOCKED,
        entityType: 'Device', entityId: id,
        metadata: { reason: String(req.body?.reason || '').slice(0, 500) || null },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('unblock device error:', error);
      return res.status(500).json({ error: 'BLOCKLIST_ERROR' });
    }
  });

  /** `POST /api/admin/blocked-phones` — blocare manuală. */
  app.post('/api/admin/blocked-phones', ...admin, async (req: AuthRequest, res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      const reason = String(req.body?.reason || '').trim().slice(0, 500);
      if (!/^07\d{8}$/.test(phone) || reason.length < 3) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Dă un număr valid și un motiv.' });
      }
      const days = Number(req.body?.days);
      const expiresAt = Number.isFinite(days) && days > 0
        ? new Date(Date.now() + Math.min(3650, days) * 24 * 60 * 60 * 1000)
        : null;
      const row = await blockPhone(prisma, phone, {
        reason, source: 'ADMIN', actorId: req.user!.id, silent: !!req.body?.silent, expiresAt,
      });
      return res.status(201).json(row);
    } catch (error) {
      console.error('block phone error:', error);
      return res.status(500).json({ error: 'BLOCKLIST_ERROR' });
    }
  });

  /** `DELETE /api/admin/blocked-phones/:phone` — deblocare. Se scrie și ea. */
  app.delete('/api/admin/blocked-phones/:phone', ...admin, async (req: AuthRequest, res) => {
    try {
      const phone = normalizePhone(req.params.phone);
      const removed = await prisma.blockedPhone.deleteMany({ where: { phone } });
      if (!removed.count) return res.status(404).json({ error: 'NOT_BLOCKED' });
      writeAudit(prisma, {
        actorType: 'ADMIN',
        actorId: req.user!.id,
        action: AUDIT.PHONE_UNBLOCKED,
        entityType: 'Phone',
        entityId: phone,
        metadata: { reason: String(req.body?.reason || '').slice(0, 500) || null },
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('unblock phone error:', error);
      return res.status(500).json({ error: 'BLOCKLIST_ERROR' });
    }
  });
}
