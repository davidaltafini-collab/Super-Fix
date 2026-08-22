/* ============================================================
   Căutarea în misiuni.

   Nu e un `filter(includes)`. Un meseriaș nu-și amintește cum era scrisă
   adresa — își amintește „ăla cu boilerul, săptămâna trecută". Deci căutarea
   trebuie să înțeleagă trei feluri de cuvinte deodată, în aceeași frază:

     „boiler saptamana trecuta terminate"
       └ text      └ interval de timp   └ stare

   Și trebuie să ierte greșelile de scris. Cine caută de pe telefon, cu mâinile
   murdare, scrie „chiveuta". Dacă asta nu găsește nimic, căutarea e inutilă
   exact în momentul în care ar fi fost nevoie de ea.

   Totul se întâmplă în browser, peste lista deja încărcată: fără cereri, fără
   așteptare, rezultatele apar în timp ce scrii.
   ============================================================ */

import { ServiceRequest } from '../types';

/* ---------------- normalizare ---------------- */

/**
 * Textul, adus la o formă în care „Țeavă" și „teava" sunt același lucru.
 *
 * Fără asta, jumătate din căutări ar pica pe diacritice: oamenii scriu „soseaua"
 * pentru „Șoseaua" și n-ar găsi nimic.
 */
export function fold(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // semnele diacritice, după descompunere
    .replace(/[^a-z0-9\s.\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------- toleranță la greșeli de scris ---------------- */

/**
 * Distanța Damerau–Levenshtein până la cuvânt SAU până la oricare început al lui.
 *
 * Două lucruri, amândouă necesare aici:
 *
 * Damerau, nu Levenshtein simplu — numără inversarea a două litere vecine ca o
 * singură greșeală. „bolier" în loc de „boiler" e cea mai frecventă greșeală de
 * tastare; cu Levenshtein clasic ar costa două operații și ar cădea sub prag.
 *
 * Pe început de cuvânt, pentru că româna flexionează tot: cine caută „boiler"
 * trebuie să găsească „boilerul", „boilere", „boilerului". Luăm minimul de pe
 * ultimul rând al matricei — adică cea mai bună potrivire cu orice început al
 * cuvântului — și scăpăm de orice listă de terminații de întreținut.
 *
 * Oprirea din drum nu e lux: altfel am compara fiecare cuvânt căutat cu fiecare
 * cuvânt din fiecare misiune, până la ultima literă, degeaba.
 */
export function bestDistance(term: string, word: string, max: number): number {
  if (word.startsWith(term)) return 0;
  if (word.length + max < term.length) return max + 1;

  let prev2: number[] = [];
  let prev: number[] = [];
  let curr: number[] = [];

  for (let j = 0; j <= word.length; j++) prev[j] = j;

  for (let i = 1; i <= term.length; i++) {
    curr = [i];
    let best = i;

    for (let j = 1; j <= word.length; j++) {
      const cost = term[i - 1] === word[j - 1] ? 0 : 1;
      let value = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);

      // literele inversate: „ab" scris „ba"
      if (i > 1 && j > 1 && term[i - 1] === word[j - 2] && term[i - 2] === word[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1);
      }

      curr[j] = value;
      if (value < best) best = value;
    }

    if (best > max) return max + 1; // niciun drum de aici nu mai coboară sub prag
    prev2 = prev;
    prev = curr;
  }

  return Math.min(...prev);
}

/**
 * Cât de mult iertăm, după lungimea cuvântului.
 *
 * Pragurile sunt strânse dinadins. Cu două greșeli permise la șapte litere,
 * „popescu" găsea „ionescu" — două substituții, deci trecea. Exact genul de
 * rezultat după care omul nu mai are încredere în căutare.
 */
export function tolerance(word: string): number {
  if (word.length <= 3) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

/* ---------------- timpul, în cuvinte ---------------- */

export interface When {
  from: number;
  to: number;
  /** cum se numește intervalul, ca să putem spune ce am înțeles */
  label: string;
}

const DAY = 86400000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const endOfDay = (d: Date) => startOfDay(d) + DAY - 1;

/** Luni, nu duminică: săptămâna de lucru din România începe luni. */
function startOfWeek(d: Date): number {
  const day = (d.getDay() + 6) % 7;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - day));
}

const MONTHS = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];

const WEEKDAYS = ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata'];

/**
 * Scoate din interogare partea care vorbește despre timp.
 *
 * Întoarce intervalul înțeles și restul frazei, ca să caute mai departe doar
 * cuvintele care chiar sunt cuvinte.
 */
export function extractWhen(query: string, now = new Date()): { when: When | null; rest: string } {
  let rest = ` ${query} `;
  let when: When | null = null;

  const take = (re: RegExp, build: (m: RegExpMatchArray) => When): boolean => {
    if (when) return false;
    const match = rest.match(re);
    if (!match) return false;
    when = build(match);
    rest = rest.replace(match[0], ' ');
    return true;
  };

  const days = (back: number, label: string): When => {
    const d = new Date(now.getTime() - back * DAY);
    return { from: startOfDay(d), to: endOfDay(d), label };
  };

  // Ordinea contează: frazele lungi întâi, altfel „saptamana" ar înghiți
  // „saptamana trecuta" și am pierde jumătate din sens.
  take(/\balaltaieri\b/, () => days(2, 'alaltăieri'));
  take(/\b(azi|astazi)\b/, () => days(0, 'azi'));
  take(/\bieri\b/, () => days(1, 'ieri'));

  take(/\bsaptamana (trecuta|precedenta)\b/, () => {
    const from = startOfWeek(now) - 7 * DAY;
    return { from, to: from + 7 * DAY - 1, label: 'săptămâna trecută' };
  });

  take(/\bsaptamana (asta|aceasta|curenta)\b/, () => {
    const from = startOfWeek(now);
    return { from, to: from + 7 * DAY - 1, label: 'săptămâna asta' };
  });

  take(/\bluna (trecuta|precedenta)\b/, () => {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    return { from, to: new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1, label: 'luna trecută' };
  });

  take(/\bluna (asta|aceasta|curenta)\b/, () => {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return { from, to: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1, label: 'luna asta' };
  });

  take(/\banul (trecut|precedent)\b/, () => ({
    from: new Date(now.getFullYear() - 1, 0, 1).getTime(),
    to: new Date(now.getFullYear(), 0, 1).getTime() - 1,
    label: 'anul trecut',
  }));

  /* „acum 3 zile" și „ultimele 3 zile" NU înseamnă același lucru: primul e o zi
     anume, al doilea e un interval până azi. Le-am avut la un loc, și „acum 10
     zile" întorcea tot ce se întâmplase de atunci încoace. */
  const unitDays = (n: number, unit: string) =>
    unit.startsWith('zi') ? n : unit.startsWith('sapt') ? n * 7 : n * 30;

  take(/\bacum\s+(\d{1,3})\s*(zile|zi|saptamani|saptamana|luni|luna)\b/, m => {
    const d = new Date(now.getTime() - unitDays(Number(m[1]), m[2]) * DAY);
    return { from: startOfDay(d), to: endOfDay(d), label: `acum ${m[1]} ${m[2]}` };
  });

  take(/\b(?:ultimele|ultimile|ultimii)\s+(\d{1,3})\s*(zile|zi|saptamani|saptamana|luni|luna)\b/, m => {
    const back = unitDays(Number(m[1]), m[2]);
    return {
      from: startOfDay(new Date(now.getTime() - back * DAY)),
      to: endOfDay(now),
      label: `ultimele ${m[1]} ${m[2]}`,
    };
  });

  // „12 august", „12 aug"
  take(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.map(m => m.slice(0, 3)).join('|')})[a-z]*\\b`), m => {
    const day = Number(m[1]);
    const month = MONTHS.findIndex(name => name.startsWith(m[2]));
    let year = now.getFullYear();
    if (new Date(year, month, day).getTime() > now.getTime() + DAY) year -= 1; // o dată din viitor e, aproape sigur, de anul trecut
    const d = new Date(year, month, day);
    return { from: startOfDay(d), to: endOfDay(d), label: `${day} ${MONTHS[month]}` };
  });

  // o lună singură: „august"
  take(new RegExp(`\\b(${MONTHS.join('|')})\\b`), m => {
    const month = MONTHS.indexOf(m[1]);
    let year = now.getFullYear();
    if (month > now.getMonth()) year -= 1;
    return {
      from: new Date(year, month, 1).getTime(),
      to: new Date(year, month + 1, 1).getTime() - 1,
      label: `${MONTHS[month]} ${year}`,
    };
  });

  // „12.08" sau „12/08/2026"
  take(/\b(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\b/, m => {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = m[3] ? Number(m[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    return { from: startOfDay(d), to: endOfDay(d), label: d.toLocaleDateString('ro-RO') };
  });

  // o zi a săptămânii: cea mai recentă „joi"
  take(new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`), m => {
    const target = WEEKDAYS.indexOf(m[1]);
    let back = (now.getDay() - target + 7) % 7;
    if (back === 0) back = 0;
    const d = new Date(now.getTime() - back * DAY);
    return { from: startOfDay(d), to: endOfDay(d), label: `${m[1]}, ${d.toLocaleDateString('ro-RO')}` };
  });

  return { when, rest: rest.replace(/\s+/g, ' ').trim() };
}

/* ---------------- starea, în cuvinte ---------------- */

type Status = ServiceRequest['status'];

const STATUS_WORDS: Array<[RegExp, Status, string]> = [
  [/\b(noi|nou|noua|neacceptat\w*|in asteptare|asteapta|nepreluat\w*)\b/, 'PENDING', 'noi'],
  [/\b(acceptat\w*|preluat\w*)\b/, 'ACCEPTED', 'acceptate'],
  [/\b(in lucru|inceput\w*|in desfasurare|lucrez)\b/, 'IN_PROGRESS', 'în lucru'],
  [/\b(terminat\w*|finalizat\w*|gata|incheiat\w*|rezolvat\w*)\b/, 'COMPLETED', 'terminate'],
  [/\b(refuzat\w*|respins\w*)\b/, 'REJECTED', 'refuzate'],
  [/\b(anulat\w*)\b/, 'CANCELLED', 'anulate'],
];

export function extractStatus(query: string): { status: Status | null; label: string; rest: string } {
  for (const [re, status, label] of STATUS_WORDS) {
    const match = query.match(re);
    if (match) {
      return { status, label, rest: query.replace(match[0], ' ').replace(/\s+/g, ' ').trim() };
    }
  }
  return { status: null, label: '', rest: query };
}

/* ---------------- căutarea propriu-zisă ---------------- */

export interface Understood {
  /** ce a rămas de căutat ca text simplu */
  terms: string[];
  when: When | null;
  status: Status | null;
  statusLabel: string;
}

/** Ce am înțeles din ce a scris omul. Se afișează, ca să nu pară magie. */
export function understand(query: string, now = new Date()): Understood {
  const folded = fold(query);
  const afterWhen = extractWhen(folded, now);
  const afterStatus = extractStatus(afterWhen.rest);

  return {
    terms: afterStatus.rest.split(' ').filter(t => t.length > 1),
    when: afterWhen.when,
    status: afterStatus.status,
    statusLabel: afterStatus.label,
  };
}

/**
 * Tot textul unei misiuni, într-un singur șir, plus data scrisă în cuvinte.
 *
 * Data intră și ea în text ca să meargă „august" sau „2026" ca simplu cuvânt,
 * pe lângă interpretarea ca interval.
 */
function haystack(mission: ServiceRequest): string {
  const d = new Date(mission.date);
  const written = Number.isNaN(d.getTime())
    ? ''
    : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${WEEKDAYS[d.getDay()]}`;

  return fold(
    [
      mission.description,
      mission.clientName,
      mission.clientPhone,
      mission.clientEmail,
      mission.address,
      written,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/** Cât de bine se potrivește un cuvânt cu textul misiunii. 0 = deloc. */
export function scoreTerm(term: string, words: string[], whole: string): number {
  /* Cifrele nu au voie la indulgență. Un telefon greșit cu o cifră e alt telefon,
     iar „0745" ajungea să găsească și 0744, și 0755 — adică pe altcineva. */
  if (/^\d+$/.test(term)) return whole.includes(term) ? 3 : 0;

  if (whole.includes(term)) {
    // cuvânt întreg > început de cuvânt > undeva prin mijloc
    if (words.includes(term)) return 4;
    if (words.some(w => w.startsWith(term))) return 3;
    return 2;
  }

  const max = tolerance(term);
  if (max === 0) return 0;

  for (const word of words) {
    if (bestDistance(term, word, max) <= max) return 1;
  }
  return 0;
}

export interface Hit<T> {
  item: T;
  score: number;
}

/**
 * Caută în misiuni și le întoarce ordonate după cât de bine se potrivesc.
 *
 * Toate condițiile trebuie îndeplinite deodată (interval, stare, fiecare
 * cuvânt): cine scrie mai mult vrea să restrângă, nu să primească mai multe.
 */
export function searchMissions(
  missions: ServiceRequest[],
  query: string,
  now = new Date(),
): { results: ServiceRequest[]; understood: Understood } {
  const understood = understand(query, now);
  const { terms, when, status } = understood;

  if (!terms.length && !when && !status) {
    return { results: missions, understood };
  }

  const hits: Hit<ServiceRequest>[] = [];

  for (const mission of missions) {
    if (status && mission.status !== status) continue;

    if (when) {
      const t = new Date(mission.date).getTime();
      if (Number.isNaN(t) || t < when.from || t > when.to) continue;
    }

    const whole = haystack(mission);
    const words = whole.split(' ');

    let score = 0;
    let matchedAll = true;

    for (const term of terms) {
      const s = scoreTerm(term, words, whole);
      if (s === 0) { matchedAll = false; break; }
      score += s;
    }

    if (!matchedAll) continue;
    // o misiune care se potrivește și pe interval, și pe stare, urcă
    if (when) score += 1;
    if (status) score += 1;

    hits.push({ item: mission, score });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.item.date).getTime() - new Date(a.item.date).getTime();
  });

  return { results: hits.map(h => h.item), understood };
}
