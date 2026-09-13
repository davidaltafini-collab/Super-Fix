/* ============================================================
   Memoria sesiunii.

   Până acum fiecare navigare cerea totul de la zero: intri în portal, deschizi
   o misiune, te întorci — se cer din nou toate misiunile, deși erau deja în
   pagină cu zece secunde înainte. De-aia se vedea scheletul la fiecare pas.

   Regula e „arată ce ai, întreabă în fundal": pagina se desenează instantaneu
   din ce știm deja, iar cererea către server rulează oricum și actualizează
   dacă s-a schimbat ceva. Scheletul rămâne doar pentru prima intrare, când
   chiar n-avem nimic.

   DOAR în memorie, intenționat — nu în localStorage. Misiunile conțin numele,
   telefonul și adresa clientului; alea n-au ce căuta scrise pe disc, unde
   rămân după ce omul închide pagina. La reîncărcare pornim curat.
   ============================================================ */

interface Entry {
  data: unknown;
  at: number;
}

const store = new Map<string, Entry>();

/* ============================================================
   Cereri identice pornite in acelasi timp.

   `React.StrictMode` monteaza fiecare componenta de doua ori in dezvoltare, ca
   sa scoata la iveala efecte scrise gresit. Efectul secundar: fiecare `useEffect`
   care cere date porneste doua cereri identice. In productie nu se intampla, dar
   in dezvoltare platesti dublu la fiecare pagina — si se vede in Network.

   Aici tinem promisiunea care e deja pe drum: a doua cerere pentru aceeasi cheie
   nu mai pleaca, primeste acelasi raspuns. Rezolva si dublarea din StrictMode, si
   orice alta remontare accidentala.
   ============================================================ */

const inflight = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const started = run().finally(() => { inflight.delete(key); });
  inflight.set(key, started);
  return started;
}

export const CacheKey = {
  heroes: 'heroes',
  heroSearch: (query: string) => `heroSearch:${query}`,
  heroCategories: 'heroCategories',
  heroBySlug: (slug: string) => `hero:slug:${slug}`,
  heroById: (id: string) => `hero:id:${id}`,
  heroSeo: (slug: string) => `seo:hero:${slug}`,
  seoLanding: (path: string, page: number) => `seo:landing:${path}?page=${page}`,
  seoPages: (kind: string) => `seo:pages:${kind}`,
  missions: 'missions',
  origin: (token?: string | null) => `origin:${token || 'me'}`,
  basics: 'basics',
  myPortfolio: 'myPortfolio',
} as const;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  return entry ? (entry.data as T) : undefined;
}

/** Vârsta intrării în milisecunde, sau `Infinity` dacă nu există. */
export function cacheAge(key: string): number {
  const entry = store.get(key);
  return entry ? Date.now() - entry.at : Infinity;
}

/* Plafon pe tipuri de intrări. Căutările și profilurile se adună cu fiecare
   filtru încercat și fiecare erou deschis; fără limită, o sesiune lungă ține în
   memorie răspunsuri vechi pe care nu le mai cere nimeni. `Map` păstrează
   ordinea inserării, deci primele chei ale unui tip sunt cele mai vechi. */
const LIMITS: [prefix: string, max: number][] = [
  ['heroSearch:', 30],
  ['hero:slug:', 40],
  ['hero:id:', 40],
  ['seo:hero:', 40],
  ['seo:landing:', 30],
];

export function cacheSet<T>(key: string, data: T): T {
  store.delete(key); // reinserată la final: devine cea mai proaspătă
  store.set(key, { data, at: Date.now() });

  const limit = LIMITS.find(([prefix]) => key.startsWith(prefix));
  if (limit) {
    const [prefix, max] = limit;
    const keys = Array.from(store.keys()).filter(k => k.startsWith(prefix));
    for (const old of keys.slice(0, Math.max(0, keys.length - max))) store.delete(old);
  }
  return data;
}

export function cacheDrop(prefix: string): void {
  for (const key of Array.from(store.keys())) {
    if (key === prefix || key.startsWith(`${prefix}:`)) store.delete(key);
  }
}

/**
 * Golește tot. Se cheamă la intrare și la ieșire din cont.
 *
 * Fără asta, dacă doi eroi folosesc același browser, al doilea ar vedea o clipă
 * misiunile primului — cu tot cu datele clienților lui.
 */
export function cacheClear(): void {
  store.clear();
  inflight.clear();
}
