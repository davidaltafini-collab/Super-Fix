import type { Request } from 'express';

/**
 * Faptele care contează, scrise în `AuditLog` (CONT-FANTOMA.md §10).
 *
 * Împărțirea, ca să nu se amestece: `ApiLog` e trafic — cine a lovit ce rută, cu
 * ce status, cât a durat; se scrie automat dintr-un middleware și se purjează.
 * `AuditLog` e **fapte** — are `entityId`, deci răspunde la „CARE erou", nu doar
 * „un erou". `ApiLog.path` e ruta-șablon (`/api/heroes/:id`), deci singur nu poate
 * susține o investigație.
 */
export const AUDIT = {
  DEVICE_CREATED: 'DEVICE_CREATED',
  REQUEST_CREATED: 'REQUEST_CREATED',
  PHONE_REVEAL: 'PHONE_REVEAL',
  REPORT_FILED: 'REPORT_FILED',
  ACCOUNT_CLAIMED: 'ACCOUNT_CLAIMED',
  PHONE_BLOCKED: 'PHONE_BLOCKED',
  /**
   * Nu e în lista din §10, dar deblocarea e la fel de mult un fapt ca blocarea:
   * dacă un număr a fost suspendat și apoi eliberat, întrebarea „cine l-a
   * eliberat și când" trebuie să aibă răspuns. Fără ea, jurnalul ar arăta un om
   * blocat pentru totdeauna, deși nu mai e.
   */
  PHONE_UNBLOCKED: 'PHONE_UNBLOCKED',
  /**
   * Ștergerea contului (§13). Rândul omului dispare, deci fără faptul ăsta n-ar
   * mai rămâne nicio urmă că a existat vreodată — și nici că a cerut el ștergerea.
   * `entityId` e id-ul contului șters; **nu se scrie nimic din datele lui aici**,
   * altfel jurnalul ar păstra exact ce tocmai am promis că ștergem.
   */
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  /**
   * Al doilea factor pus sau scos de un admin (§10). E o schimbare a apărării
   * celui mai puternic cont din sistem; dacă cineva îl scoate, trebuie să se vadă
   * cine și de unde.
   */
  ADMIN_TOTP_ENABLED: 'ADMIN_TOTP_ENABLED',
  ADMIN_TOTP_DISABLED: 'ADMIN_TOTP_DISABLED',
  /**
   * Un SUPER a scos al doilea factor al ALTUI admin (telefon pierdut). E cea mai
   * periculoasă acțiune din panou — dă unui cont puterea de a intra cu parola
   * singură — deci trebuie să lase urmă cu numele celui care a apăsat.
   */
  ADMIN_TOTP_RESET: 'ADMIN_TOTP_RESET',
  /** Conturile de admin: cine le-a făcut, cui i-a schimbat treapta, cine a fost oprit. */
  ADMIN_CREATED: 'ADMIN_CREATED',
  ADMIN_ROLE_CHANGED: 'ADMIN_ROLE_CHANGED',
  ADMIN_DISABLED: 'ADMIN_DISABLED',
  ADMIN_ENABLED: 'ADMIN_ENABLED',
  ADMIN_PASSWORD_RESET: 'ADMIN_PASSWORD_RESET',
  /** Ștergere = anonimizare, nu rând dispărut (vezi comentariul din schema Admin). */
  ADMIN_DELETED: 'ADMIN_DELETED',
  /**
   * Avertismentul arătat pe ecran înaintea oricărei blocări. E treapta care face
   * diferența între „te-au pârât doi și ai pățit-o" și „ai fost anunțat și ai
   * continuat": fără rândul ăsta scris, a doua propoziție nu se poate demonstra.
   */
  PHONE_WARNED: 'PHONE_WARNED',
  /**
   * Oprirea unei INSTALĂRI, nu a unui număr. Se folosește când tiparul arată că
   * numerele raportate erau ale altora, deci blocarea numărului ar lovi exact
   * victima.
   */
  DEVICE_BLOCKED: 'DEVICE_BLOCKED',
  DEVICE_UNBLOCKED: 'DEVICE_UNBLOCKED',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];

export interface AuditEntry {
  actorType: 'CLIENT' | 'HERO' | 'ADMIN' | 'RECRUITER' | 'ANON' | 'SYSTEM';
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Scrie un fapt. **Nu aruncă niciodată și nu se așteaptă după ea.**
 *
 * Motivul e o regulă, nu o comoditate: jurnalul e pentru noi, cererea e a omului.
 * Dacă baza refuză scrierea jurnalului, cererea lui trebuie să reușească oricum.
 * Invers ar însemna că o problemă de observabilitate devine o pană de producție.
 */
export function writeAudit(prisma: any, entry: AuditEntry): void {
  // `Promise.resolve().then(...)` și nu apel direct: prinde și o aruncare
  // sincronă (prisma nepornit), care altfel ar scăpa pe lângă `.catch`.
  Promise.resolve()
    .then(() => writeAuditSync(prisma, entry))
    .catch((error: unknown) => console.error(`audit ${entry.action} error:`, error));
}

/**
 * Aceeași scriere, dar **așteptată**. Se folosește doar acolo unde jurnalul nu
 * mai e doar jurnal, ci ține socoteala: cota de numere de telefon (§7) se numără
 * din `AuditLog`. Dacă rândul s-ar scrie „când apucă", două cereri una după alta
 * ar citi amândouă zero și cota n-ar exista.
 *
 * Aici o eroare de scriere trebuie să oprească răspunsul — altfel numărul iese
 * fără să fie contorizat, adică exact cota pe care o implementăm devine opțională.
 */
export function writeAuditSync(prisma: any, entry: AuditEntry): Promise<unknown> {
  return prisma.auditLog.create({
    data: {
      actorType: entry.actorType,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? undefined,
    },
  });
}

/**
 * IP-ul real al apelantului. `app.set('trust proxy', 1)` e deja setat, deci
 * `req.ip` are în spate `X-Forwarded-For` de la nginx, nu adresa lui nginx.
 * Se taie la 45 de caractere: exact cât intră un IPv6.
 */
export const clientIp = (req: Request): string => String(req.ip || '').slice(0, 45);
