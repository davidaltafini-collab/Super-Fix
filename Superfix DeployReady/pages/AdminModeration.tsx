/* ============================================================
   Raportări, sancțiuni, sugestii — moderarea din cartierul general.

   Stă în fișierul ei ca `Admin.tsx` să nu mai crească. Folosește aceleași clase
   (`adm-*`) și aceeași paletă de stări. Contractul rutelor e pe server, în
   `reports.ts`, `sanctions.ts` și `feedback.ts`; aici doar îl arătăm.

   Reguli care vin din protocol (RAPORTARI-PLAN.md, confirmat de David pe 16.09),
   nu din gust:
   - Conversația dintre doi oameni se deschide doar dintr-o raportare și se scrie
     în jurnal cu contul adminului. De aceea cere confirmare.
   - Motivul unei sancțiuni îl primește omul (DSA art. 17). Nota rămâne la echipă.
   - Pauza stă pe un cont; suspendarea și eliminarea pe toată persoana.
   - Semnele slabe („posibil același om”) doar se arată; nu leagă nimic.
   ============================================================ */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsClockwise, MagnifyingGlass, Warning, X } from '@phosphor-icons/react';
import { API_URL } from '../config/api';
import { useToast } from '../components/Toast';
import { full, thumb } from '../lib/img';

/* ---------------- contractul serverului ---------------- */

type TargetType = 'HERO' | 'PHONE' | 'CLIENT';
type Level = 'PAUSE' | 'SUSPEND' | 'BAN';
type ReviewStatus = 'OPEN' | 'REVIEWED' | 'DISMISSED';
type FeedbackStatus = 'NEW' | 'READ' | 'DONE';

interface Target { type: TargetType; id: string }

interface ReportGroup {
  targetType: 'HERO' | 'PHONE';
  targetId: string;
  name: string | null;
  total: number;
  people: number;
  categories: { category: string; label: string; total: number; people: number }[];
  lastAt: string;
  open: number;
  unverified: number;
  grave: boolean;
  quality: boolean;
  warning: { createdAt: string; seenAt: string | null } | null;
  legalAt: string | null;
  phoneBlocked: boolean;
  sanction: Level | null;
}

interface ReportItem {
  id: string;
  reporterType: 'CLIENT' | 'HERO';
  reporterId: string;
  reporterName: string;
  category: string;
  label: string;
  grave: boolean;
  details: string | null;
  missionId: string | null;
  hasConversation: boolean;
  verified: boolean;
  reviewStatus: ReviewStatus;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

interface Notice {
  id: string;
  stage: 'WARNING' | 'LEGAL';
  category: string;
  channel: 'POPUP' | 'EMAIL';
  people: number;
  sentBy: string | null;
  createdAt: string;
  seenAt: string | null;
  disputedAt: string | null;
}

interface TargetFile {
  target: {
    type: 'HERO' | 'PHONE';
    id: string;
    account: { id: string; alias?: string; realName?: string | null; name?: string | null; email?: string | null; phone?: string | null } | null;
    blocksAgainst: number;
    phoneBlock: { expiresAt: string | null } | null;
    /** O singură instalare a folosit numărul și a mai încercat altele (abuse.ts, `blameDevice`). */
    suspectDevice: string | null;
  };
  /** `warning`/`legal` = pragul e atins și anunțul încă n-a plecat (report-rules.ts, `evaluateTarget`). */
  decision: { people: number; topCategory: string | null; topPeople: number; warning: boolean; legal: boolean };
  reports: ReportItem[];
  notices: Notice[];
}

interface SanctionGroup {
  groupId: string;
  level: Level;
  category: string | null;
  automatic: boolean;
  reason: string;
  note: string | null;
  reportIds: string[];
  createdBy: string;
  createdAt: string;
  endsAt: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  liftNote: string | null;
  accounts: { type: TargetType; id: string; name: string | null }[];
}

interface PersonFile {
  person: {
    heroes: { id: string; alias: string; realName: string | null; phone: string | null; email: string | null; archived: boolean; deletedAt: string | null; sanction: Level | null }[];
    clients: { id: string; name: string | null; phone: string | null; email: string | null; deletedAt: string | null; sanction: Level | null }[];
    phones: string[];
    emails: string[];
    identities: string[];
    devices: number;
    cards: number;
    truncated: boolean;
  };
  weak: { kind: string; label: string; targetType: TargetType; targetId: string }[];
  reports: { targetType: 'HERO' | 'PHONE'; targetId: string; total: number }[];
  sanctions: SanctionGroup[];
}

interface FeedbackItem {
  id: string;
  authorType: 'CLIENT' | 'HERO' | 'DEVICE' | null;
  authorId: string | null;
  kind: 'PROBLEM' | 'IDEA';
  message: string;
  screenshotUrl: string | null;
  appVersion: string | null;
  platform: string | null;
  status: FeedbackStatus;
  createdAt: string;
}

interface ConversationFile {
  messages: { id: string; senderRole: string; kind: string; createdAt: string; text: string; url?: string; audioUrl?: string }[];
}

/* ---------------- cererile ---------------- */

export class AdminRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function adminRequest<T>(path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem('superfix_token');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new AdminRequestError(0, 'Serverul nu răspunde. Verifică internetul și încearcă din nou.');
  }
  if (response.ok) return response.json() as Promise<T>;
  let message = '';
  try {
    const data = await response.json();
    if (typeof data?.message === 'string') message = data.message;
  } catch {
    /* răspuns fără JSON */
  }
  if (response.status === 401) message = 'Sesiunea de administrator a expirat. Autentifică-te din nou.';
  if (response.status === 403 && !message) message = 'Treapta ta de administrator nu are voie să facă asta.';
  throw new AdminRequestError(response.status, message || 'Serverul n-a putut face asta. Încearcă din nou.');
}

/** Numerele din taburi. Le cere `Admin.tsx` la fiecare reîmprospătare. */
export async function fetchModerationCounts(): Promise<{ reports: number; feedback: number }> {
  const [reports, feedback] = await Promise.all([
    adminRequest<ReportGroup[]>('/admin/reports?filter=open'),
    adminRequest<FeedbackItem[]>('/admin/feedback?status=NEW'),
  ]);
  return { reports: reports.length, feedback: feedback.length };
}

/* Callback-urile de la părinte se schimbă la fiecare randare a lui `Admin.tsx`.
   Ținute într-un ref, nu mai repornesc încărcările la fiecare tastă apăsată acolo. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useFailure(onSessionExpired: () => void) {
  const expired = useLatest(onSessionExpired);
  return useCallback((error: unknown) => {
    if (error instanceof AdminRequestError && error.status === 401) expired.current();
    return error instanceof Error ? error.message : 'Ceva n-a mers. Încearcă din nou.';
  }, [expired]);
}

/* ---------------- cuvinte ---------------- */

type StateMap = Record<string, { word: string; tone: string }>;

const LEVEL_STATE: StateMap = {
  PAUSE: { word: 'Pauză', tone: 'wait' },
  SUSPEND: { word: 'Suspendat', tone: 'stop' },
  BAN: { word: 'Eliminat', tone: 'stop' },
};

const REVIEW_STATE: StateMap = {
  OPEN: { word: 'Necitită', tone: 'wait' },
  REVIEWED: { word: 'Revizuită', tone: 'live' },
  DISMISSED: { word: 'Respinsă', tone: 'off' },
};

const FEEDBACK_STATE: StateMap = {
  NEW: { word: 'Nou', tone: 'wait' },
  READ: { word: 'Citit', tone: 'info' },
  DONE: { word: 'Rezolvat', tone: 'live' },
};

/* Aceleași etichete ca `CATEGORY_RULES` din report-rules.ts. Aici doar pentru
   locurile unde serverul trimite cheia fără etichetă (sancțiuni, anunțuri). */
const CATEGORY_LABELS: Record<string, string> = {
  FAKE_REQUEST: 'Cerere falsă / farsă / nu răspunde',
  UNPAID: 'Nu a plătit lucrarea',
  PRICE_FRAUD: 'Preț schimbat, bani ceruți în plus, țeapă',
  THREATS: 'Amenințări',
  BLACKMAIL: 'Șantaj, presiuni ca să obțină ceva',
  HARASSMENT: 'Hărțuire (apeluri, mesaje repetate, urmărire)',
  SEXUAL: 'Hărțuire sau comportament sexual',
  VIOLENCE: 'Violență fizică',
  TRESPASS: 'A intrat fără voie / n-a plecat când i-am cerut',
  THEFT: 'Furt',
  DAMAGE: 'Bunuri distruse',
  NO_SHOW: 'Nu a venit / a anulat fără motiv',
  POOR_QUALITY: 'Lucrare de proastă calitate',
  OTHER: 'Altceva',
};
const categoryLabel = (key: string | null | undefined) => (key ? CATEGORY_LABELS[key] ?? key : '—');

/* Calitatea nu primește anunțuri: cu meseriașul se vorbește (Protocol, treapta A).
   „Altceva” n-are articole de lege, deci emailul de informare ar ieși gol. */
const QUALITY = new Set(['NO_SHOW', 'POOR_QUALITY']);
const canNotice = (category: string, stage: 'WARNING' | 'LEGAL') =>
  !QUALITY.has(category) && !(stage === 'LEGAL' && category === 'OTHER');

const LEVELS: { key: Level; title: string; hint: string }[] = [
  {
    key: 'PAUSE',
    title: 'Pauză',
    hint: 'Doar contul acesta. Nu mai apare și nu mai are cereri noi până ridici pauza. Pentru calitate repetată după discuție, sau cât verifici un caz grav.',
  },
  {
    key: 'SUSPEND',
    title: 'Suspendare 30 de zile',
    hint: 'Toată persoana (toate conturile legate sigur). Nu intră, nu cere, nu scrie. Revine singură după 30 de zile.',
  },
  {
    key: 'BAN',
    title: 'Eliminare',
    hint: 'Toată persoana. Conturile se închid, sesiunile se opresc, facturarea eroului se oprește, iar datele intră pe lista de eliminați 3 ani.',
  },
];

const PLATFORM: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Site' };
const AUTHOR: Record<string, string> = { CLIENT: 'Client', HERO: 'Erou', DEVICE: 'Fără cont' };
const SENDER: Record<string, string> = { CLIENT: 'Client', HERO: 'Erou', SYSTEM: 'Sistem' };

const formatDateTime = (value: string | Date) => {
  const date = new Date(value);
  return `${date.toLocaleDateString('ro-RO')} ${date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}`;
};
const formatDay = (value: string | Date) => new Date(value).toLocaleDateString('ro-RO');
const people = (count: number) => (count === 1 ? '1 om' : `${count} oameni`);

const isActive = (group: SanctionGroup, now = Date.now()) =>
  !group.liftedAt && (!group.endsAt || new Date(group.endsAt).getTime() > now);

const untilText = (group: SanctionGroup) => {
  if (group.liftedAt) return `Ridicată pe ${formatDateTime(group.liftedAt)}`;
  if (group.endsAt) return isActive(group) ? `Până pe ${formatDay(group.endsAt)}` : `S-a încheiat pe ${formatDay(group.endsAt)}`;
  return 'Până o ridică un om';
};

/** Unde duce „Dosar” de pe o sancțiune: primul cont al persoanei. */
const targetOfAccount = (account: { type: TargetType; id: string }): Target => ({ type: account.type, id: account.id });

/* ---------------- bucăți mici ---------------- */

const State: React.FC<{ map: StateMap; value?: string | null }> = ({ map, value }) => {
  const found = map[value || ''] ?? { word: value || '—', tone: 'off' };
  return <span className="adm-state" data-tone={found.tone}>{found.word}</span>;
};

const ErrorBar: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
  <div role="alert" className="flex items-start justify-between gap-4 rounded-2xl bg-super-red/8 p-4 text-sm font-semibold text-super-red-dark">
    <span>{message}</span>
    <button type="button" onClick={onClose} aria-label="Închide" className="shrink-0">
      <X size={16} weight="bold" />
    </button>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="adm-card p-8 text-center text-sm text-graphite-soft">{children}</p>
);

const PanelHead: React.FC<{ id: string; title: string; children: React.ReactNode; loading: boolean; onRefresh: () => void }> = ({
  id, title, children, loading, onRefresh,
}) => (
  <div className="adm-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h2 id={id} className="font-heading text-lg text-graphite">{title}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-graphite-soft">{children}</p>
    </div>
    <button type="button" onClick={onRefresh} disabled={loading} className="adm-btn adm-btn--quiet">
      <ArrowsClockwise size={15} weight="bold" aria-hidden="true" />
      {loading ? 'Se încarcă…' : 'Reîmprospătează'}
    </button>
  </div>
);

function Filter<K extends string>({ label, value, options, onChange }: {
  label: string;
  value: K;
  options: readonly { key: K; label: string }[];
  onChange: (key: K) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="adm-tabs w-max" role="tablist" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={value === option.key}
            onClick={() => onChange(option.key)}
            className="adm-tab"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const Block: React.FC<{ title: string; hint?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> = ({
  title, hint, children, action,
}) => (
  <section className="adm-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-heading text-base leading-tight text-graphite">{title}</h3>
        {hint && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-graphite-soft">{hint}</p>}
      </div>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className="rounded-xl bg-white/70 p-3">
    <p className="adm-label mb-1">{label}</p>
    <p className="adm-num font-heading text-xl leading-tight text-graphite">{value}</p>
    {hint && <p className="mt-1 text-xs leading-snug text-graphite-soft">{hint}</p>}
  </div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full bg-graphite/8 px-2.5 py-1 text-[0.7rem] font-bold tracking-wide text-graphite">{children}</span>
);

const Check: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-graphite">
    <input
      type="checkbox"
      className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(355_74%_55%)]"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>{children}</span>
  </label>
);

interface PanelProps {
  onSessionExpired: () => void;
  /** Ceva s-a schimbat pe server (numerele din taburi trebuie recitite). */
  onChanged?: () => void;
}

/* ============================================================
   RAPORTĂRI
   ============================================================ */

const REPORT_FILTERS = [
  { key: 'open', label: 'Necitite', hint: 'Au cel puțin o raportare pe care n-a citit-o încă un om.', empty: 'Nicio raportare necitită.' },
  { key: 'grave', label: 'Grave', hint: 'Violență, sexual, furt: se hotărăsc în 24 de ore. Cel vizat nu e anunțat automat.', empty: 'Nicio raportare gravă.' },
  { key: 'quality', label: 'Calitate', hint: 'Meseriași cu care vorbim: n-a venit, lucrare slabă. Nu e sancțiune.', empty: 'Niciun meseriaș pe lista de calitate.' },
  { key: 'all', label: 'Toate', hint: 'Tot ce s-a raportat în ultimul an.', empty: 'Nicio raportare în ultimul an.' },
] as const;
type ReportFilter = (typeof REPORT_FILTERS)[number]['key'];

export const ReportsPanel: React.FC<PanelProps> = ({ onSessionExpired, onChanged }) => {
  const [filter, setFilter] = useState<ReportFilter>('open');
  const [rows, setRows] = useState<ReportGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openTarget, setOpenTarget] = useState<Target | null>(null);
  const fail = useFailure(onSessionExpired);
  const changed = useLatest(onChanged);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await adminRequest<ReportGroup[]>(`/admin/reports?filter=${filter}`));
    } catch (err) {
      setError(fail(err));
    } finally {
      setLoading(false);
    }
  }, [filter, fail]);

  useEffect(() => { load(); }, [load]);

  const current = REPORT_FILTERS.find((item) => item.key === filter)!;

  return (
    <section className="mt-5 space-y-4" aria-labelledby="reports-title">
      <PanelHead id="reports-title" title="Raportări" loading={loading} onRefresh={load}>
        Grupate pe omul raportat. Ce a scris fiecare se vede doar în dosar. În praguri intră doar raportările
        verificate: cei doi au avut o lucrare sau o conversație.
      </PanelHead>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Filter<ReportFilter> label="Ce raportări arăt" value={filter} options={REPORT_FILTERS} onChange={setFilter} />
        <p className="text-xs leading-relaxed text-graphite-soft">{current.hint}</p>
      </div>

      {error && <ErrorBar message={error} onClose={() => setError('')} />}

      {loading && rows.length === 0 ? (
        <Empty>Se încarcă…</Empty>
      ) : rows.length === 0 ? (
        <Empty>{current.empty}</Empty>
      ) : (
        <div className="adm-card adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Raportat</th>
                <th>Despre ce</th>
                <th className="text-right">Oameni</th>
                <th className="text-right">Necitite</th>
                <th>Anunțat</th>
                <th>Ultima</th>
                <th className="text-right"><span className="sr-only">Dosar</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.targetType}:${row.targetId}`}>
                  <td>
                    <span className="font-semibold text-graphite">
                      {row.name || (row.targetType === 'PHONE' ? 'Fără cont' : 'Erou')}
                    </span>
                    <span className="adm-num mt-0.5 block text-xs text-graphite-soft">
                      {row.targetType === 'HERO' ? 'Erou' : `Client · ${row.targetId}`}
                    </span>
                    {(row.sanction || row.grave || row.phoneBlocked) && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {row.grave && <span className="adm-state" data-tone="stop">Grav</span>}
                        {row.sanction && <State map={LEVEL_STATE} value={row.sanction} />}
                        {row.phoneBlocked && <span className="adm-state" data-tone="off">Număr blocat</span>}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.categories.slice(0, 2).map((category) => (
                      <span key={category.category} className="block">
                        {category.label}
                        <span className="adm-num text-graphite-soft"> · {people(category.people)}</span>
                      </span>
                    ))}
                    {row.categories.length > 2 && (
                      <span className="text-xs text-graphite-soft">și încă {row.categories.length - 2}</span>
                    )}
                  </td>
                  <td className="adm-num text-right">{row.people}</td>
                  <td className="adm-num text-right">
                    {row.open}
                    {row.unverified > 0 && (
                      <span className="block text-xs text-graphite-soft">{row.unverified} neverificate</span>
                    )}
                  </td>
                  <td className="text-xs">
                    {!row.warning && !row.legalAt && <span className="text-graphite-soft">—</span>}
                    {row.warning && (
                      <span className="block">
                        {row.warning.seenAt ? `Popup văzut ${formatDay(row.warning.seenAt)}` : 'Popup trimis, nevăzut'}
                      </span>
                    )}
                    {row.legalAt && <span className="block">Email {formatDay(row.legalAt)}</span>}
                  </td>
                  <td className="adm-num whitespace-nowrap">{formatDateTime(row.lastAt)}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="adm-btn adm-btn--dark"
                      onClick={() => setOpenTarget({ type: row.targetType, id: row.targetId })}
                    >
                      Dosar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openTarget && (
        <Dossier
          target={openTarget}
          onClose={() => setOpenTarget(null)}
          onChanged={() => { load(); changed.current?.(); }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </section>
  );
};

/* ============================================================
   DOSARUL — o țintă (erou sau număr) și persoana din spatele ei
   ============================================================ */

const Dossier: React.FC<{
  target: Target;
  onClose: () => void;
  onChanged: () => void;
  onSessionExpired: () => void;
}> = ({ target: first, onClose, onChanged, onSessionExpired }) => {
  const toast = useToast();
  const fail = useFailure(onSessionExpired);
  const changed = useLatest(onChanged);
  // Din „posibil același om” se poate sări la alt dosar; „Înapoi” revine.
  const [trail, setTrail] = useState<Target[]>([first]);
  const target = trail[trail.length - 1];
  const [file, setFile] = useState<TargetFile | null>(null);
  const [person, setPerson] = useState<PersonFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const path = `${target.type}/${encodeURIComponent(target.id)}`;
      const [nextFile, nextPerson] = await Promise.all([
        target.type === 'CLIENT' ? Promise.resolve(null) : adminRequest<TargetFile>(`/admin/reports/target/${path}`),
        adminRequest<PersonFile>(`/admin/people/${path}`),
      ]);
      setFile(nextFile);
      setPerson(nextPerson);
    } catch (err) {
      setError(fail(err));
    } finally {
      setLoading(false);
    }
  }, [target.type, target.id, fail]);

  useEffect(() => {
    setFile(null);
    setPerson(null);
    setSelected(new Set());
    load();
  }, [load]);

  /** O acțiune pe server: o singură în lucru, apoi dosarul și lista se recitesc. */
  const act = async (key: string, request: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await request();
      toast.success(success);
      await load();
      changed.current();
      return true;
    } catch (err) {
      toast.error(fail(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const open = (next: Target) => {
    if (next.type === target.type && next.id === target.id) return;
    setTrail((current) => [...current, next]);
  };

  const hero = target.type === 'HERO' ? person?.person.heroes.find((item) => item.id === target.id) : undefined;
  const client = target.type === 'CLIENT'
    ? person?.person.clients.find((item) => item.id === target.id)
    : target.type === 'PHONE'
      ? person?.person.clients.find((item) => item.phone === target.id)
      : undefined;
  const title = hero
    ? `${hero.alias}${hero.realName ? ` (${hero.realName})` : ''}`
    : client?.name || file?.target.account?.alias || file?.target.account?.name || (target.type === 'PHONE' ? target.id : 'Dosar');
  const subtitle = target.type === 'HERO'
    ? 'Erou'
    : target.type === 'PHONE'
      ? (client ? `Client · ${target.id}` : `Număr fără cont · ${target.id}`)
      : `Client${client?.phone ? ` · ${client.phone}` : ''}`;

  return createPortal(
    <div className="adm adm-veil" role="dialog" aria-modal="true" aria-label={`Dosar: ${title}`}>
      <div className="adm-sheet">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-graphite/10 bg-[#f4f7fb]/95 px-5 py-3.5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            {trail.length > 1 && (
              <button type="button" className="adm-btn adm-btn--quiet shrink-0" onClick={() => setTrail((current) => current.slice(0, -1))}>
                Înapoi
              </button>
            )}
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg leading-tight text-graphite">{title}</h2>
              <p className="adm-num truncate text-xs text-graphite-soft">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={load} disabled={loading} className="adm-btn adm-btn--quiet" aria-label="Reîmprospătează dosarul">
              <ArrowsClockwise size={15} weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Închide"
              className="flex h-9 w-9 items-center justify-center rounded-full text-graphite-soft transition-colors hover:bg-graphite/8 hover:text-graphite"
            >
              <X size={17} weight="bold" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {error && <ErrorBar message={error} onClose={() => setError('')} />}
          {loading && !person && <Empty>Se încarcă dosarul…</Empty>}

          {file && <Summary file={file} />}
          {person && <PersonBlock target={target} data={person} onOpen={open} />}
          {file && (
            <ReportsBlock
              reports={file.reports}
              selected={selected}
              onSelect={setSelected}
              busy={busy}
              act={act}
              fail={fail}
            />
          )}
          {file && <NoticesBlock target={target} file={file} busy={busy} act={act} />}
          {person && <SanctionsBlock groups={person.sanctions} busy={busy} act={act} />}
          {(file || person) && (
            <NewSanction
              target={target}
              title={title}
              reports={file?.reports ?? []}
              selected={selected}
              fallbackCategory={file?.decision.topCategory ?? null}
              busy={busy}
              act={act}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

type Act = (key: string, request: () => Promise<unknown>, success: string) => Promise<boolean>;

const Summary: React.FC<{ file: TargetFile }> = ({ file }) => {
  const { decision, target } = file;
  const warning = file.notices.find((notice) => notice.stage === 'WARNING');
  const legal = file.notices.find((notice) => notice.stage === 'LEGAL');
  return (
    <>
      {target.suspectDevice && (
        <div role="alert" className="flex gap-3 rounded-2xl bg-[hsl(36_74%_38%/0.1)] p-4 text-sm leading-relaxed text-[hsl(36_74%_30%)]">
          <Warning size={18} weight="bold" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Numărul a fost folosit de pe o singură instalare, care a încercat și alte numere. Se poate ca cineva să
            folosească numărul altuia: o sancțiune pe număr ar lovi victima. Uită-te la „Posibil același om”.
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Oameni în praguri" value={decision.people} hint="verificate, ultimele 90 de zile" />
        <Stat
          label="Categoria de sus"
          value={decision.topCategory ? people(decision.topPeople) : '—'}
          hint={decision.topCategory ? categoryLabel(decision.topCategory) : 'nimic verificat'}
        />
        <Stat
          label="Anunțat"
          value={legal ? 'Email' : warning ? 'Popup' : 'Nu'}
          hint={legal
            ? `pe ${formatDay(legal.createdAt)}`
            : warning
              ? (warning.seenAt ? `văzut pe ${formatDay(warning.seenAt)}` : 'încă nevăzut')
              : decision.warning ? 'pragul pentru popup e atins' : 'sub prag'}
        />
        <Stat
          label="L-au blocat"
          value={target.blocksAgainst}
          hint={target.phoneBlock
            ? `numărul e blocat${target.phoneBlock.expiresAt ? ` până pe ${formatDay(target.phoneBlock.expiresAt)}` : ''}`
            : 'au apăsat „Blochează”'}
        />
      </div>
      {decision.legal && (
        <p className="rounded-2xl bg-[hsl(211_68%_42%/0.08)] p-3 text-sm text-[hsl(211_68%_34%)]">
          Pragul pentru emailul de informare e atins: omul a văzut popup-ul și au mai venit raportări după aceea.
        </p>
      )}
    </>
  );
};

const PersonBlock: React.FC<{ target: Target; data: PersonFile; onOpen: (target: Target) => void }> = ({ target, data, onOpen }) => {
  const { person, weak, reports } = data;
  const isCurrent = (type: TargetType, id: string) => type === target.type && id === target.id;
  const identities = person.identities.map((value) => (value === 'GOOGLE' ? 'Google' : value === 'APPLE' ? 'Apple' : value));
  const otherReports = reports.filter((row) => !isCurrent(row.targetType, row.targetId));

  return (
    <Block
      title="Persoana"
      hint="Tot ce e legat sigur de acest om: același telefon, email, cont Google/Apple, instalare sau card. Suspendarea și eliminarea se pun pe toate."
    >
      {person.truncated && (
        <p className="mb-3 text-xs font-semibold text-[hsl(36_74%_34%)]">
          Are foarte multe date legate, iar lista a fost tăiată. Verifică înainte de o sancțiune pe toată persoana.
        </p>
      )}

      <ul className="divide-y divide-graphite/8">
        {person.heroes.map((item) => (
          <li key={`h:${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-graphite">
                {item.alias}{item.realName ? ` (${item.realName})` : ''} <span className="font-normal text-graphite-soft">· erou</span>
              </p>
              <p className="adm-num break-all text-xs text-graphite-soft">{[item.phone, item.email].filter(Boolean).join(' · ') || '—'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {item.sanction && <State map={LEVEL_STATE} value={item.sanction} />}
              {item.deletedAt && <span className="adm-state" data-tone="off">Șters</span>}
              {item.archived && !item.deletedAt && <span className="adm-state" data-tone="off">Ascuns</span>}
              {!isCurrent('HERO', item.id) && (
                <button type="button" className="adm-btn adm-btn--quiet" onClick={() => onOpen({ type: 'HERO', id: item.id })}>Deschide</button>
              )}
            </div>
          </li>
        ))}
        {person.clients.map((item) => {
          const next: Target = item.phone ? { type: 'PHONE', id: item.phone } : { type: 'CLIENT', id: item.id };
          return (
            <li key={`c:${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-semibold text-graphite">
                  {item.name || 'Client fără nume'} <span className="font-normal text-graphite-soft">· client</span>
                </p>
                <p className="adm-num break-all text-xs text-graphite-soft">{[item.phone, item.email].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {item.sanction && <State map={LEVEL_STATE} value={item.sanction} />}
                {item.deletedAt && <span className="adm-state" data-tone="off">Șters</span>}
                {!isCurrent(next.type, next.id) && !isCurrent('CLIENT', item.id) && (
                  <button type="button" className="adm-btn adm-btn--quiet" onClick={() => onOpen(next)}>Deschide</button>
                )}
              </div>
            </li>
          );
        })}
        {!person.heroes.length && !person.clients.length && (
          <li className="py-2.5 text-sm text-graphite-soft">Niciun cont: a cerut doar de pe site, cu numărul.</li>
        )}
      </ul>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="adm-label">Telefoane</dt>
          <dd className="adm-num break-all text-graphite">{person.phones.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="adm-label">Emailuri</dt>
          <dd className="break-all text-graphite">{person.emails.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="adm-label">Cont Google / Apple</dt>
          <dd className="text-graphite">{identities.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="adm-label">Instalări · carduri</dt>
          <dd className="adm-num text-graphite">{person.devices} · {person.cards}</dd>
        </div>
      </dl>

      {otherReports.length > 0 && (
        <div className="mt-4">
          <p className="adm-label">Raportări pe celelalte conturi ale lui</p>
          <ul className="space-y-1.5">
            {otherReports.map((row) => (
              <li key={`${row.targetType}:${row.targetId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="adm-num">{row.targetType === 'HERO' ? 'Ca erou' : `Numărul ${row.targetId}`} · {row.total}</span>
                <button type="button" className="adm-btn adm-btn--quiet" onClick={() => onOpen({ type: row.targetType, id: row.targetId })}>Deschide</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {weak.length > 0 && (
        <div className="mt-5 rounded-xl bg-white/60 p-3">
          <p className="adm-label">Posibil același om</p>
          <p className="mb-2 text-xs leading-relaxed text-graphite-soft">
            Semne pe care le pot avea și alții (familie, bloc, același model de card). Nu leagă nimic și nu intră în sancțiune.
          </p>
          <ul className="space-y-1.5">
            {weak.map((link) => (
              <li key={`${link.kind}:${link.targetType}:${link.targetId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {link.label}
                  <span className="adm-num text-graphite-soft"> · {link.targetType === 'PHONE' ? link.targetId : link.targetType === 'HERO' ? 'erou' : 'client'}</span>
                </span>
                <button type="button" className="adm-btn adm-btn--quiet" onClick={() => onOpen({ type: link.targetType, id: link.targetId })}>Deschide</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Block>
  );
};

const ReportsBlock: React.FC<{
  reports: ReportItem[];
  selected: Set<string>;
  onSelect: (next: Set<string>) => void;
  busy: string | null;
  act: Act;
  fail: (error: unknown) => string;
}> = ({ reports, selected, onSelect, busy, act, fail }) => (
  <Block
    title={`Raportări (${reports.length})`}
    hint="Bifează raportările pe care se sprijină o sancțiune: cei care le-au trimis află că s-a luat o măsură, iar raportările trec la „revizuite”."
  >
    {reports.length === 0 ? (
      <p className="text-sm text-graphite-soft">Nicio raportare despre acest cont.</p>
    ) : (
      <ul className="space-y-3">
        {reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            checked={selected.has(report.id)}
            onCheck={(checked) => {
              const next = new Set(selected);
              if (checked) next.add(report.id); else next.delete(report.id);
              onSelect(next);
            }}
            busy={busy}
            act={act}
            fail={fail}
          />
        ))}
      </ul>
    )}
  </Block>
);

const ReportCard: React.FC<{
  report: ReportItem;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  busy: string | null;
  act: Act;
  fail: (error: unknown) => string;
}> = ({ report, checked, onCheck, busy, act, fail }) => {
  const toast = useToast();
  const [deciding, setDeciding] = useState(false);
  const [status, setStatus] = useState<ReviewStatus>(report.reviewStatus === 'OPEN' ? 'REVIEWED' : report.reviewStatus);
  const [note, setNote] = useState('');
  const [toReporter, setToReporter] = useState('');
  const [toTarget, setToTarget] = useState('');
  const [chat, setChat] = useState<ConversationFile | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const openChat = async () => {
    const ok = await toast.confirm(
      'Deschiderea conversației se scrie în jurnal, cu contul tău. O deschizi doar ca să verifici această raportare. Continui?',
      { confirmLabel: 'Deschid conversația' },
    );
    if (!ok) return;
    setChatLoading(true);
    try {
      setChat(await adminRequest<ConversationFile>(`/admin/reports/${encodeURIComponent(report.id)}/conversation`));
    } catch (err) {
      toast.error(fail(err));
    } finally {
      setChatLoading(false);
    }
  };

  const tooShort = (text: string) => text.trim().length > 0 && text.trim().length < 3;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (tooShort(toReporter) || tooShort(toTarget)) {
      toast.error('Un mesaj către om are cel puțin 3 caractere. Lasă-l gol dacă nu trimiți nimic.');
      return;
    }
    const done = await act(
      `review:${report.id}`,
      () => adminRequest(`/admin/reports/${encodeURIComponent(report.id)}/review`, {
        status,
        note: note.trim() || undefined,
        reporterMessage: toReporter.trim() || undefined,
        targetMessage: toTarget.trim() || undefined,
      }),
      toReporter.trim() || toTarget.trim() ? 'Decizia e salvată, iar mesajele au plecat.' : 'Decizia e salvată.',
    );
    if (done) {
      setDeciding(false);
      setNote('');
      setToReporter('');
      setToTarget('');
    }
  };

  return (
    <li className="rounded-xl border border-graphite/10 bg-white/70 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Check checked={checked} onChange={onCheck}>
          <span className="font-semibold">{report.label}</span>
          <span className="mt-0.5 block text-xs text-graphite-soft">
            de la {report.reporterName} ({report.reporterType === 'HERO' ? 'erou' : 'client'}) · {formatDateTime(report.createdAt)}
          </span>
        </Check>
        <div className="flex flex-wrap items-center gap-1.5">
          {report.grave && <span className="adm-state" data-tone="stop">Grav</span>}
          <span className="adm-state" data-tone={report.verified ? 'live' : 'wait'}>{report.verified ? 'Verificată' : 'Neverificată'}</span>
          <State map={REVIEW_STATE} value={report.reviewStatus} />
        </div>
      </div>

      {report.details ? (
        <blockquote className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-[#f4f7fb] p-3 text-sm leading-relaxed text-graphite">
          {report.details}
        </blockquote>
      ) : (
        <p className="mt-3 text-xs text-graphite-soft">N-a scris nimic în plus.</p>
      )}

      {!report.verified && (
        <p className="mt-2 text-xs text-graphite-soft">
          Neverificată: cei doi n-au avut o lucrare sau o conversație. Nu intră în praguri.
        </p>
      )}
      {report.reviewNote && (
        <p className="mt-2 text-xs text-graphite-soft">
          Notă internă{report.reviewedAt ? ` (${formatDay(report.reviewedAt)})` : ''}: {report.reviewNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="adm-btn adm-btn--quiet" onClick={() => setDeciding((value) => !value)}>
          {deciding ? 'Renunță' : 'Decizie'}
        </button>
        {report.hasConversation && !chat && (
          <button type="button" className="adm-btn adm-btn--quiet" onClick={openChat} disabled={chatLoading}>
            {chatLoading ? 'Se deschide…' : 'Vezi conversația'}
          </button>
        )}
      </div>

      {deciding && (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-[#f4f7fb] p-3">
          <div>
            <span className="adm-label">Decizia</span>
            <div className="flex flex-wrap gap-2">
              {(['REVIEWED', 'DISMISSED', 'OPEN'] as ReviewStatus[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={status === key}
                  onClick={() => setStatus(key)}
                  className={`adm-btn ${status === key ? 'adm-btn--dark' : 'adm-btn--quiet'}`}
                >
                  {key === 'REVIEWED' ? 'Revizuită' : key === 'DISMISSED' ? 'Respinsă (nu intră în praguri)' : 'Necitită'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="adm-label" htmlFor={`note-${report.id}`}>Notă internă</label>
            <textarea id={`note-${report.id}`} className="adm-input" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <label className="adm-label" htmlFor={`rep-${report.id}`}>Mesaj către cel care a raportat (opțional)</label>
            <textarea id={`rep-${report.id}`} className="adm-input" rows={2} maxLength={2000} value={toReporter} onChange={(e) => setToReporter(e.target.value)} placeholder="Ex.: Am verificat și am vorbit cu meseriașul." />
          </div>
          <div>
            <label className="adm-label" htmlFor={`tgt-${report.id}`}>Mesaj către cel raportat (opțional)</label>
            <textarea id={`tgt-${report.id}`} className="adm-input" rows={2} maxLength={2000} value={toTarget} onChange={(e) => setToTarget(e.target.value)} placeholder="Pleacă în aplicație și pe email, din partea echipei Superfix." />
          </div>
          <button type="submit" className="adm-btn adm-btn--main" disabled={busy === `review:${report.id}`}>
            {busy === `review:${report.id}` ? 'Se salvează…' : 'Salvează decizia'}
          </button>
        </form>
      )}

      {chat && (
        <div className="mt-3 rounded-xl bg-[#f4f7fb] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="adm-label mb-0">Conversația ({chat.messages.length} mesaje)</p>
            <button type="button" className="adm-btn adm-btn--quiet" onClick={() => setChat(null)}>Închide</button>
          </div>
          <ol className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {chat.messages.map((message) => {
              const fromHero = message.senderRole === 'HERO';
              const audio = message.audioUrl;
              return (
                <li key={message.id} className={`flex ${fromHero ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${fromHero ? 'bg-graphite text-white' : 'bg-white text-graphite'}`}>
                    <p className={`text-[0.65rem] font-bold uppercase tracking-wide ${fromHero ? 'text-white/70' : 'text-graphite-soft'}`}>
                      {SENDER[message.senderRole] ?? message.senderRole} · {formatDateTime(message.createdAt)}
                    </p>
                    {message.kind === 'VOICE' && audio ? (
                      <audio controls preload="none" src={audio} className="mt-1 max-w-full" />
                    ) : (
                      <p className="mt-0.5 whitespace-pre-wrap break-words">{message.text}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </li>
  );
};

const NoticesBlock: React.FC<{ target: Target; file: TargetFile; busy: string | null; act: Act }> = ({ target, file, busy, act }) => {
  const toast = useToast();
  const [stage, setStage] = useState<'WARNING' | 'LEGAL'>('WARNING');
  const categories = useMemo(
    () => [...new Set(file.reports.filter((report) => report.reviewStatus !== 'DISMISSED').map((report) => report.category))]
      .filter((category) => canNotice(category, stage)),
    [file.reports, stage],
  );
  const [category, setCategory] = useState('');
  const chosen = categories.includes(category) ? category : categories[0] ?? '';

  const send = async () => {
    if (!chosen) return;
    const label = categoryLabel(chosen);
    const ok = await toast.confirm(
      stage === 'WARNING'
        ? `Omul vede un popup la următoarea deschidere a aplicației: am primit sesizări despre „${label}”. Trimiți?`
        : `Pleacă emailul de informare legală despre „${label}”, cu articolele de lege. Nu se poate retrage. Trimiți?`,
      { confirmLabel: stage === 'WARNING' ? 'Trimit popup-ul' : 'Trimit emailul', danger: stage === 'LEGAL' },
    );
    if (!ok) return;
    await act(
      'notice',
      () => adminRequest('/admin/reports/notices', { targetType: target.type, targetId: target.id, stage, category: chosen }),
      stage === 'WARNING' ? 'Popup-ul e pregătit: îl vede la următoarea deschidere.' : 'Emailul de informare a plecat.',
    );
  };

  return (
    <Block
      title="Anunțuri"
      hint="Pentru conflicte (cereri false, neplată, amenințări…) popup-ul pleacă singur la 3 oameni, iar emailul la 5, după ce omul a văzut popup-ul. Grave și „Altceva” le trimiți doar tu, după ce citești dosarul."
    >
      {file.notices.length === 0 ? (
        <p className="text-sm text-graphite-soft">Nu i s-a trimis nimic încă.</p>
      ) : (
        <ul className="divide-y divide-graphite/8">
          {file.notices.map((notice) => (
            <li key={notice.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-semibold text-graphite">{notice.stage === 'WARNING' ? 'Popup' : 'Email de informare'}</span>
                {' · '}{categoryLabel(notice.category)} · {people(notice.people)} · {notice.sentBy ? 'trimis de un admin' : 'automat'}
              </span>
              <span className="adm-num text-xs text-graphite-soft">
                {formatDateTime(notice.createdAt)}
                {notice.seenAt && ` · văzut ${formatDay(notice.seenAt)}`}
                {notice.disputedAt && ` · a spus că e o greșeală (${formatDay(notice.disputedAt)})`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 rounded-xl bg-white/60 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div>
          <label className="adm-label" htmlFor="notice-stage">Trimite de mână</label>
          <select id="notice-stage" className="adm-input" value={stage} onChange={(e) => setStage(e.target.value as 'WARNING' | 'LEGAL')}>
            <option value="WARNING">Popup în aplicație</option>
            <option value="LEGAL">Email de informare legală</option>
          </select>
        </div>
        <div>
          <label className="adm-label" htmlFor="notice-category">Despre</label>
          <select id="notice-category" className="adm-input" value={chosen} onChange={(e) => setCategory(e.target.value)} disabled={!categories.length}>
            {categories.length === 0 && <option value="">Nicio categorie potrivită</option>}
            {categories.map((key) => <option key={key} value={key}>{categoryLabel(key)}</option>)}
          </select>
        </div>
        <button type="button" className="adm-btn adm-btn--dark" onClick={send} disabled={!chosen || busy === 'notice'}>
          {busy === 'notice' ? 'Se trimite…' : 'Trimite'}
        </button>
      </div>
    </Block>
  );
};

const LiftForm: React.FC<{ group: SanctionGroup; busy: string | null; act: Act; onDone: () => void }> = ({ group, busy, act, onDone }) => {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [notify, setNotify] = useState(true);
  const key = `lift:${group.groupId}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const who = group.accounts.map((account) => account.name || account.id).join(', ');
    const ok = await toast.confirm(
      `Ridici ${LEVEL_STATE[group.level]?.word.toLowerCase() ?? 'sancțiunea'} pentru ${who}? Conturile redevin active${notify ? ', iar omul e anunțat' : ''}.`,
      { confirmLabel: 'Ridic' },
    );
    if (!ok) return;
    const done = await act(
      key,
      () => adminRequest(`/admin/sanctions/${encodeURIComponent(group.groupId)}/lift`, {
        note: note.trim() || undefined,
        message: message.trim() || undefined,
        notify,
      }),
      'Sancțiunea a fost ridicată.',
    );
    if (done) onDone();
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-[#f4f7fb] p-3">
      <div>
        <label className="adm-label" htmlFor={`lift-note-${group.groupId}`}>De ce o ridici (notă internă)</label>
        <textarea id={`lift-note-${group.groupId}`} className="adm-input" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: contestație admisă, a fost o greșeală." />
      </div>
      <div>
        <label className="adm-label" htmlFor={`lift-msg-${group.groupId}`}>Mesaj pentru om (opțional)</label>
        <textarea id={`lift-msg-${group.groupId}`} className="adm-input" rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Se adaugă după „Contul tău e din nou activ”." />
      </div>
      <Check checked={notify} onChange={setNotify}>Anunță omul (în aplicație și pe email)</Check>
      <button type="submit" className="adm-btn adm-btn--dark" disabled={busy === key}>
        {busy === key ? 'Se ridică…' : 'Ridică sancțiunea'}
      </button>
    </form>
  );
};

const SanctionCard: React.FC<{
  group: SanctionGroup;
  busy: string | null;
  act: Act;
  onOpen?: (target: Target) => void;
  /** În lista din tab e un panou; în dosar, un rând într-un panou. */
  standalone?: boolean;
}> = ({ group, busy, act, onOpen, standalone }) => {
  const [lifting, setLifting] = useState(false);
  const active = isActive(group);
  return (
    <article className={standalone ? 'adm-card p-5' : 'rounded-xl border border-graphite/10 bg-white/70 p-3.5'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <State map={LEVEL_STATE} value={group.level} />
        <span className="adm-state" data-tone={active ? 'stop' : 'off'}>{active ? 'Activă' : group.liftedAt ? 'Ridicată' : 'Încheiată'}</span>
        {group.automatic && <span className="adm-state" data-tone="info">Automată · card de pe listă</span>}
        {group.category && <Chip>{categoryLabel(group.category)}</Chip>}
      </div>
      <p className="mt-2 text-sm font-semibold text-graphite">
        {group.accounts.map((account) => `${account.name || account.id}${account.type === 'HERO' ? ' (erou)' : account.type === 'CLIENT' ? ' (client)' : ' (număr)'}`).join(', ')}
      </p>
      <p className="adm-num mt-0.5 text-xs text-graphite-soft">
        Pusă pe {formatDateTime(group.createdAt)} · {untilText(group)}
        {group.reportIds.length > 0 && ` · ${group.reportIds.length} raportări legate`}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-graphite">
        <span className="adm-label mb-0.5">Motivul trimis omului</span>
        {group.reason}
      </p>
      {group.note && (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-graphite-soft">Notă internă: {group.note}</p>
      )}
      {group.liftNote && (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-graphite-soft">De ce a fost ridicată: {group.liftNote}</p>
      )}
      {(active || onOpen) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onOpen && group.accounts[0] && (
            <button type="button" className="adm-btn adm-btn--quiet" onClick={() => onOpen(targetOfAccount(group.accounts[0]))}>Dosar</button>
          )}
          {active && (
            <button type="button" className="adm-btn adm-btn--quiet" onClick={() => setLifting((value) => !value)}>
              {lifting ? 'Renunță' : 'Ridică'}
            </button>
          )}
        </div>
      )}
      {active && lifting && <LiftForm group={group} busy={busy} act={act} onDone={() => setLifting(false)} />}
    </article>
  );
};

const SanctionsBlock: React.FC<{ groups: SanctionGroup[]; busy: string | null; act: Act }> = ({ groups, busy, act }) => (
  <Block title={`Sancțiuni (${groups.length})`} hint="Tot ce s-a hotărât pe această persoană, cu motivul pe care l-a primit.">
    {groups.length === 0 ? (
      <p className="text-sm text-graphite-soft">Nicio sancțiune până acum.</p>
    ) : (
      <div className="space-y-3">
        {groups.map((group) => <SanctionCard key={group.groupId} group={group} busy={busy} act={act} />)}
      </div>
    )}
  </Block>
);

const NewSanction: React.FC<{
  target: Target;
  title: string;
  reports: ReportItem[];
  selected: Set<string>;
  fallbackCategory: string | null;
  busy: string | null;
  act: Act;
}> = ({ target, title, reports, selected, fallbackCategory, busy, act }) => {
  const toast = useToast();
  const [level, setLevel] = useState<Level | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);

  const linked = reports.filter((report) => selected.has(report.id));
  // Categoria sancțiunii: cea mai deasă dintre raportările bifate, altfel cea de sus din dosar.
  const category = useMemo(() => {
    const counts = new Map<string, number>();
    for (const report of linked) counts.set(report.category, (counts.get(report.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallbackCategory;
  }, [linked, fallbackCategory]);

  const reasonLength = reason.trim().length;
  const ready = !!level && reasonLength >= 10;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!level) { toast.error('Alege treapta.'); return; }
    if (reasonLength < 10) { toast.error('Scrie motivul (cel puțin 10 caractere): îl primește omul.'); return; }
    const what = level === 'PAUSE'
      ? `Pui pe pauză contul ${title}?`
      : level === 'SUSPEND'
        ? `Suspenzi 30 de zile toată persoana din spatele lui ${title}?`
        : `Elimini de pe platformă toată persoana din spatele lui ${title}? Conturile se închid, iar datele intră pe lista de eliminați 3 ani.`;
    const ok = await toast.confirm(
      `${what}${notify ? ' Omul primește acum motivul, în aplicație și pe email.' : ' Omul NU e anunțat.'}`,
      { confirmLabel: level === 'PAUSE' ? 'Pun pauza' : level === 'SUSPEND' ? 'Suspend' : 'Elimin', danger: level !== 'PAUSE' },
    );
    if (!ok) return;
    const done = await act(
      'sanction',
      () => adminRequest('/admin/sanctions', {
        targetType: target.type,
        targetId: target.id,
        level,
        reason: reason.trim(),
        note: note.trim() || undefined,
        category: category ?? undefined,
        reportIds: linked.length ? linked.map((report) => report.id) : undefined,
        notify,
      }),
      level === 'PAUSE' ? 'Contul e pe pauză.' : level === 'SUSPEND' ? 'Persoana e suspendată 30 de zile.' : 'Persoana a fost eliminată.',
    );
    if (done) {
      setLevel(null);
      setReason('');
      setNote('');
      setNotify(true);
    }
  };

  return (
    <Block
      title="Sancțiune nouă"
      hint="Adminul hotărăște, după dosar. Poți sări treptele când dovada e clară. Omul poate contesta la contact@super-fix.ro și îi răspunde un om."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Treapta">
          {LEVELS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={level === item.key}
              onClick={() => setLevel(item.key)}
              className={`rounded-xl border p-3 text-left transition ${level === item.key
                ? 'border-graphite bg-white shadow-[0_0_0_2px_#2e333b]'
                : 'border-graphite/12 bg-white/60 hover:bg-white'}`}
            >
              <span className="font-heading text-base text-graphite">{item.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-graphite-soft">{item.hint}</span>
            </button>
          ))}
        </div>

        <div>
          <label className="adm-label" htmlFor="sanction-reason">Motivul — îl primește omul</label>
          <textarea
            id="sanction-reason"
            className="adm-input"
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: Mai mulți clienți cu care ai lucrat au raportat că ai cerut bani în plus față de prețul stabilit."
          />
          <p className={`adm-num mt-1 text-xs ${reasonLength > 0 && reasonLength < 10 ? 'text-super-red-dark' : 'text-graphite-soft'}`}>
            {reasonLength < 10 ? `Încă ${10 - reasonLength} caractere, minimum.` : 'Scrie-l pe înțeles: fapta, nu legea.'}
          </p>
        </div>

        <div>
          <label className="adm-label" htmlFor="sanction-note">Notă internă (opțional)</label>
          <textarea id="sanction-note" className="adm-input" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dovezi, plângere la poliție, cu cine ai vorbit…" />
        </div>

        <p className="text-sm text-graphite-soft">
          {linked.length
            ? `Se sprijină pe ${linked.length} ${linked.length === 1 ? 'raportare bifată' : 'raportări bifate'}${category ? `, categoria „${categoryLabel(category)}”` : ''}.`
            : reports.length
              ? 'Nicio raportare bifată. Bifează mai sus raportările pe care se sprijină decizia.'
              : 'Fără raportări: decizie pe baza altor dovezi.'}
        </p>

        <Check checked={notify} onChange={setNotify}>Anunță omul (în aplicație și pe email), și pe cei care au raportat</Check>

        <button type="submit" className={`adm-btn ${level && level !== 'PAUSE' ? 'adm-btn--danger' : 'adm-btn--main'}`} disabled={!ready || busy === 'sanction'}>
          {busy === 'sanction' ? 'Se aplică…' : level ? `Aplică: ${LEVELS.find((item) => item.key === level)!.title.toLowerCase()}` : 'Alege treapta'}
        </button>
      </form>
    </Block>
  );
};

/* ============================================================
   SANCȚIUNI
   ============================================================ */

const SANCTION_FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'Toate' },
] as const;

export const SanctionsPanel: React.FC<PanelProps & { heroes: { id: string; alias: string }[] }> = ({ onSessionExpired, onChanged, heroes }) => {
  const toast = useToast();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [rows, setRows] = useState<SanctionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<Target | null>(null);
  const [lookupType, setLookupType] = useState<TargetType>('PHONE');
  const [lookupValue, setLookupValue] = useState('');
  const fail = useFailure(onSessionExpired);
  const changed = useLatest(onChanged);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await adminRequest<SanctionGroup[]>(`/admin/sanctions${filter === 'active' ? '?active=1' : ''}`));
    } catch (err) {
      setError(fail(err));
    } finally {
      setLoading(false);
    }
  }, [filter, fail]);

  useEffect(() => { load(); }, [load]);

  const act: Act = async (key, request, success) => {
    setBusy(key);
    try {
      await request();
      toast.success(success);
      await load();
      changed.current?.();
      return true;
    } catch (err) {
      toast.error(fail(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const lookup = (event: React.FormEvent) => {
    event.preventDefault();
    const value = lookupValue.trim();
    if (!value) return;
    setOpenTarget({ type: lookupType, id: value });
  };

  const sortedHeroes = useMemo(() => [...heroes].sort((a, b) => a.alias.localeCompare(b.alias, 'ro')), [heroes]);

  return (
    <section className="mt-5 space-y-4" aria-labelledby="sanctions-title">
      <PanelHead id="sanctions-title" title="Sancțiuni" loading={loading} onRefresh={load}>
        Pauza stă pe un cont. Suspendarea (30 de zile) și eliminarea stau pe toată persoana: toate conturile și datele
        legate sigur. Omul primește motivul și poate contesta la contact@super-fix.ro.
      </PanelHead>

      <form onSubmit={lookup} className="adm-card grid gap-3 p-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <div>
          <label className="adm-label" htmlFor="lookup-type">Deschide dosarul unui om</label>
          <select
            id="lookup-type"
            className="adm-input"
            value={lookupType}
            onChange={(e) => { setLookupType(e.target.value as TargetType); setLookupValue(''); }}
          >
            <option value="PHONE">După telefon</option>
            <option value="HERO">Erou</option>
            <option value="CLIENT">După ID de client</option>
          </select>
        </div>
        <div>
          <label className="adm-label" htmlFor="lookup-value">{lookupType === 'HERO' ? 'Eroul' : lookupType === 'PHONE' ? 'Telefonul' : 'ID-ul contului'}</label>
          {lookupType === 'HERO' ? (
            <select id="lookup-value" className="adm-input" value={lookupValue} onChange={(e) => setLookupValue(e.target.value)}>
              <option value="">— alege eroul —</option>
              {sortedHeroes.map((hero) => <option key={hero.id} value={hero.id}>{hero.alias}</option>)}
            </select>
          ) : (
            <input
              id="lookup-value"
              className="adm-input"
              inputMode={lookupType === 'PHONE' ? 'tel' : 'text'}
              value={lookupValue}
              onChange={(e) => setLookupValue(e.target.value)}
              placeholder={lookupType === 'PHONE' ? '07xxxxxxxx' : 'ID din bază (îl găsești în Căutare)'}
            />
          )}
        </div>
        <button type="submit" className="adm-btn adm-btn--dark" disabled={!lookupValue.trim()}>
          <MagnifyingGlass size={15} weight="bold" aria-hidden="true" />
          Dosar
        </button>
      </form>

      <Filter<'active' | 'all'> label="Ce sancțiuni arăt" value={filter} options={SANCTION_FILTERS} onChange={setFilter} />

      {error && <ErrorBar message={error} onClose={() => setError('')} />}

      {loading && rows.length === 0 ? (
        <Empty>Se încarcă…</Empty>
      ) : rows.length === 0 ? (
        <Empty>{filter === 'active' ? 'Nicio sancțiune activă.' : 'Nicio sancțiune până acum.'}</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((group) => (
            <SanctionCard key={group.groupId} group={group} busy={busy} act={act} onOpen={setOpenTarget} standalone />
          ))}
        </div>
      )}

      {openTarget && (
        <Dossier
          target={openTarget}
          onClose={() => setOpenTarget(null)}
          onChanged={() => { load(); changed.current?.(); }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </section>
  );
};

/* ============================================================
   SUGESTII ȘI PROBLEME (din „Ai o problemă sau o idee?”)
   ============================================================ */

const FEEDBACK_FILTERS = [
  { key: 'NEW', label: 'Noi' },
  { key: 'READ', label: 'Citite' },
  { key: 'DONE', label: 'Rezolvate' },
  { key: 'ALL', label: 'Toate' },
] as const;
type FeedbackFilter = (typeof FEEDBACK_FILTERS)[number]['key'];

export const FeedbackPanel: React.FC<PanelProps> = ({ onSessionExpired, onChanged }) => {
  const toast = useToast();
  const [filter, setFilter] = useState<FeedbackFilter>('NEW');
  const [rows, setRows] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<Target | null>(null);
  const fail = useFailure(onSessionExpired);
  const changed = useLatest(onChanged);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await adminRequest<FeedbackItem[]>(`/admin/feedback${filter === 'ALL' ? '' : `?status=${filter}`}`));
    } catch (err) {
      setError(fail(err));
    } finally {
      setLoading(false);
    }
  }, [filter, fail]);

  useEffect(() => { load(); }, [load]);

  const mark = async (item: FeedbackItem, status: FeedbackStatus) => {
    setBusy(item.id);
    try {
      await adminRequest(`/admin/feedback/${encodeURIComponent(item.id)}/status`, { status });
      await load();
      changed.current?.();
    } catch (err) {
      toast.error(fail(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-5 space-y-4" aria-labelledby="feedback-title">
      <PanelHead id="feedback-title" title="Sugestii și probleme" loading={loading} onRefresh={load}>
        Ce scriu oamenii din aplicație, la „Ai o problemă sau o idee?”. Merge și fără cont. Serverul nu are un drum de
        răspuns aici: dacă e nevoie, scrie-i omului de pe contact@super-fix.ro.
      </PanelHead>

      <Filter<FeedbackFilter> label="Ce mesaje arăt" value={filter} options={FEEDBACK_FILTERS} onChange={setFilter} />

      {error && <ErrorBar message={error} onClose={() => setError('')} />}

      {loading && rows.length === 0 ? (
        <Empty>Se încarcă…</Empty>
      ) : rows.length === 0 ? (
        <Empty>{filter === 'NEW' ? 'Niciun mesaj nou.' : 'Niciun mesaj aici.'}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((item) => (
            <article key={item.id} className="adm-card flex flex-col p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip>{item.kind === 'PROBLEM' ? 'Problemă' : 'Idee'}</Chip>
                  <State map={FEEDBACK_STATE} value={item.status} />
                </div>
                <span className="adm-num text-xs text-graphite-soft">{formatDateTime(item.createdAt)}</span>
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-graphite">{item.message}</p>

              {item.screenshotUrl && (
                <a href={full(item.screenshotUrl)} target="_blank" rel="noreferrer" className="mt-3 block w-fit">
                  <img
                    src={thumb(item.screenshotUrl, 480)}
                    alt="Captura trimisă"
                    loading="lazy"
                    className="max-h-64 rounded-xl border border-graphite/10 object-contain"
                  />
                </a>
              )}

              <p className="mt-3 text-xs text-graphite-soft">
                {[
                  item.authorType ? AUTHOR[item.authorType] ?? item.authorType : null,
                  item.platform ? PLATFORM[item.platform.toLowerCase()] ?? item.platform : null,
                  item.appVersion ? `versiunea ${item.appVersion}` : null,
                ].filter(Boolean).join(' · ') || '—'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.status !== 'DONE' && (
                  <button type="button" className="adm-btn adm-btn--dark" disabled={busy === item.id} onClick={() => mark(item, 'DONE')}>
                    Rezolvat
                  </button>
                )}
                {item.status === 'NEW' && (
                  <button type="button" className="adm-btn adm-btn--quiet" disabled={busy === item.id} onClick={() => mark(item, 'READ')}>
                    Am citit
                  </button>
                )}
                {item.status !== 'NEW' && (
                  <button type="button" className="adm-btn adm-btn--quiet" disabled={busy === item.id} onClick={() => mark(item, item.status === 'DONE' ? 'READ' : 'NEW')}>
                    {item.status === 'DONE' ? 'Redeschide' : 'Marchează nou'}
                  </button>
                )}
                {(item.authorType === 'CLIENT' || item.authorType === 'HERO') && item.authorId && (
                  <button
                    type="button"
                    className="adm-btn adm-btn--quiet"
                    onClick={() => setOpenTarget({ type: item.authorType as TargetType, id: item.authorId! })}
                  >
                    Cine a scris
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {openTarget && (
        <Dossier
          target={openTarget}
          onClose={() => setOpenTarget(null)}
          onChanged={() => changed.current?.()}
          onSessionExpired={onSessionExpired}
        />
      )}
    </section>
  );
};
