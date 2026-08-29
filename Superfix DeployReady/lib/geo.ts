/* ============================================================
   Locație, geocodare, ETA și navigație — portul web al utilitarelor din aplicație.

   Aplicația folosește `expo-location` și hărți native. Pe web echivalentele sunt
   `navigator.geolocation` și Nominatim. Logica e aceeași ca în
   `SuperfixApp/src/utils/{location,geocode,eta,navApps}.ts`, ca eroul să vadă
   același lucru indiferent de unde intră.
   ============================================================ */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ClientLocation extends GeoPoint {
  address?: string;
}

export type LocationResult =
  | { ok: true; location: ClientLocation }
  | { ok: false; reason: 'denied' | 'blocked' | 'timeout' | 'unavailable' | 'insecure' | 'error' };

/* Proiectul nu e pe `strict`, iar fara `strictNullChecks` TypeScript nu mai
   ingusteaza uniunile dupa un discriminant boolean: dupa `if (!result.ok)`
   crede in continuare ca ar putea fi ramura de succes si se plange ca `reason`
   nu exista. Garda asta ii spune explicit ce ramura e. */
export const isLocationError = (
  result: LocationResult,
): result is Extract<LocationResult, { ok: false }> => !result.ok;

/* Textul pentru om, într-un singur loc.

   Era scris de trei ori, în trei pagini, și toate trei îi spuneau să apese
   iconița de lângă adresa paginii. Pe iPhone nu există iconița aia: permisiunea
   de locație stă în meniul „aA" din bara de adresă, la Setări site web. Adică
   exact oamenii care aveau problema primeau instrucțiuni pentru un buton care
   nu e pe ecranul lor. */
export function locationErrorText(reason: Extract<LocationResult, { ok: false }>['reason']): string {
  switch (reason) {
    case 'blocked':
      return 'Locația e blocată pentru site. Pe iPhone: „aA" în bara de adresă → Setări site web → Locație → Permite. Pe Android: iconița de lângă adresă → Permisiuni → Locație.';
    case 'denied':
      return 'N-am primit locația. Apasă din nou și alege „Permite" când întreabă browserul.';
    case 'timeout':
      return 'Semnalul de locație se lasă așteptat. Încearcă din nou peste câteva secunde, de preferat lângă o fereastră.';
    case 'unavailable':
      return 'Telefonul nu dă locația acum. Verifică dacă ai Serviciile de localizare pornite în setările telefonului.';
    case 'insecure':
      return 'Locația merge doar pe conexiune securizată — deschide direct super-fix.ro.';
    default:
      return 'N-am putut afla locația. Scrie adresa de mână, e la fel de bine.';
  }
}

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/* ---------------- geocodare ---------------- */

const CACHE_PREFIX = 'superfix_geo_';
/** Adresele care nu s-au putut rezolva se marchează, ca să nu reîncercăm la infinit. */
const NEG = '__none__';

const cacheKey = (address: string) =>
  CACHE_PREFIX +
  address
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-z0-9 ,.-]/g, '')
    .slice(0, 80);

const readCache = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const writeCache = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* mod privat, storage plin */ }
};

/**
 * Adresă → coordonate, prin Nominatim (keyless, orientat pe România).
 *
 * Nominatim public cere maxim o cerere pe secundă. Cache-ul de mai jos ne ține
 * sub prag: o adresă se rezolvă o singură dată, apoi vine din localStorage.
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const clean = (address || '').trim();
  if (clean.length < 4) return null;

  const key = cacheKey(clean);
  const cached = readCache(key);
  if (cached === NEG) return null;
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (valid(parsed.lat, parsed.lng)) return parsed;
    } catch { /* cache stricat, recalculăm */ }
  }

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ro` +
      `&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'ro' } });
    if (!res.ok) return null;
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (first) {
      const point = { lat: Number(first.lat), lng: Number(first.lon) };
      if (valid(point.lat, point.lng)) {
        writeCache(key, JSON.stringify(point));
        return point;
      }
    }
    writeCache(key, NEG);
  } catch { /* fără rețea: nu marcăm negativ, poate merge data viitoare */ }
  return null;
}

/* ---------------- sugestii de adresă, în timp ce scrie ---------------- */

/** O variantă propusă sub câmpul de adresă. */
export interface AddressSuggestion {
  /** ce vede omul în listă: „Strada Republicii 12, Timișoara" */
  label: string;
  /** partea a doua, mai ștearsă: județul sau cartierul */
  detail?: string;
  lat: number;
  lng: number;
}

/* Nominatim NU se folosește aici, deși e chiar deasupra.
   Politica lui de utilizare interzice pe față căutarea în timp ce scrii
   („no autocomplete search"), iar sancțiunea e blocarea adresei IP — adică
   s-ar strica și geocodarea de mai sus, care merge bine azi.

   Photon e tot pe date OpenStreetMap, tot fără cheie, dar e construit exact
   pentru asta: caută după cuvinte incomplete și răspunde în câteva zeci de
   milisecunde. Numele vin în limba locului, deci în română. */
const PHOTON = 'https://photon.komoot.io/api/';

/** Colțurile României, ca să nu propună o stradă din Portugalia. */
const RO_BBOX = '20.26,43.62,29.71,48.27';

/** Aceleași litere, același răspuns: omul șterge și rescrie mult. */
const suggestCache = new Map<string, AddressSuggestion[]>();

/** Ce scrie pe rândul din listă. Photon dă bucățile separat. */
function describe(p: Record<string, any>): AddressSuggestion['label'] | null {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const place = p.city || p.town || p.village || p.county;
  // `name` e numele locului (o firmă, un parc); strada bate numele doar dacă
  // n-avem nume, altfel „Kaufland, Calea Aradului" e mai util decât strada seacă
  const head = p.name || street;
  if (!head) return null;
  const parts = [head];
  if (street && street !== head) parts.push(street);
  if (place && !parts.includes(place)) parts.push(place);
  return parts.join(', ');
}

/**
 * Ce a scris până acum → câteva adrese din care poate alege.
 *
 * Nu aruncă niciodată: fără rețea sau cu serviciul picat, întoarce listă goală
 * și câmpul rămâne un câmp de text obișnuit, exact ca înainte.
 *
 * `signal` vine din `AbortController`: la fiecare literă nouă o anulăm pe cea
 * veche, altfel răspunsurile se întorc în altă ordine decât au plecat și lista
 * ar clipi cu rezultate pentru un text pe care omul l-a lăsat deja în urmă.
 */
export async function suggestAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const clean = (query || '').trim();
  if (clean.length < 3) return [];

  const key = clean.toLowerCase();
  const cached = suggestCache.get(key);
  if (cached) return cached;

  try {
    const url = `${PHOTON}?q=${encodeURIComponent(clean)}&limit=6&bbox=${RO_BBOX}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];

    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const f of features) {
      const p = f?.properties || {};
      // bbox e un dreptunghi, iar dreptunghiul din jurul României prinde și
      // bucăți din vecini; codul de țară taie fix
      if (p.countrycode && p.countrycode !== 'RO') continue;
      const coords = f?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!valid(lat, lng)) continue;
      const label = describe(p);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push({ label, detail: p.county || p.district || undefined, lat, lng });
    }

    suggestCache.set(key, out);
    return out;
  } catch {
    /* anulare sau rețea: lista rămâne goală, câmpul merge mai departe */
    return [];
  }
}

/** Coordonate → adresă lizibilă, scurtă (stradă, număr, oraș). */
export async function reverseGeocode(point: GeoPoint): Promise<string | undefined> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${point.lat}&lon=${point.lng}&zoom=18`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'ro' } });
    if (!res.ok) return undefined;
    const data = await res.json();
    const a = data?.address || {};
    const line = [a.road, a.house_number].filter(Boolean).join(' ');
    const city = a.city || a.town || a.village || a.county;
    const text = [line || undefined, city || undefined].filter(Boolean).join(', ').trim();
    return text.length ? text : undefined;
  } catch { return undefined; }
}

/* ---------------- locația clientului ---------------- */

/** Cere permisiunea, ia coordonatele, încearcă o adresă lizibilă. Nu aruncă niciodată. */
export async function getCurrentLocation(): Promise<LocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, reason: 'unavailable' };
  }

  /* Browserul refuză geolocația în tăcere (fără prompt de permisiune) pe orice
     origine care nu e https sau localhost. Fără verificarea asta, omul apasă
     butonul, nu se întâmplă nimic vizibil, și pare că nu merge — deși de fapt
     browserul nici n-a ajuns să întrebe. */
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return { ok: false, reason: 'insecure' };
  }

  /* Aici era o verificare a permisiunii ÎNAINTE de a cere poziția, ca să dăm un
     mesaj mai bun când Chrome blochează definitiv un site. Făcea două rele, și
     amândouă cădeau taman pe iPhone:

     1. Renunța de tot. Dacă `permissions.query` zicea `denied`, nu se mai chema
        niciodată `getCurrentPosition`. Numai că pe Safari starea aia nu e de
        încredere: implementarea reflectă și comutatoare de sistem, răspunde
        `denied` în situații în care o cerere reală ar fi întrebat frumos, iar
        pentru geolocație numele nici măcar nu e susținut peste tot. Rezultat:
        omul apăsa și primea „n-ai dat permisiunea" fără ca browserul să fi fost
        întrebat vreodată.

     2. Consuma gestul. `await` pe query se interpune între atingerea omului și
        cererea propriu-zisă, iar Safari leagă promptul de permisiune de
        activarea utilizatorului. Cu un await la mijloc, lanțul se rupe și
        promptul poate să nu mai apară deloc.

     Acum ordinea e invers: încercăm întâi (prima operație după atingere, deci
     gestul e intact), și abia dacă browserul chiar refuză întrebăm Permissions
     API — doar ca să știm dacă refuzul e de-o clipă sau permanent, adică dacă
     merită să-i spunem omului să reseteze din setări. */
  const attempt = (highAccuracy: boolean) =>
    new Promise<GeolocationPosition | number>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => resolve(err.code),
        { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 10000 : 20000, maximumAge: 60000 },
      );
    });

  let outcome = await attempt(true);

  /* GPS-ul de mare precizie cere cerul liber: în casă, într-un bloc sau într-un
     subsol expiră sau răspunde „poziție indisponibilă". A doua încercare
     acceptă precizia din rețea/Wi-Fi, care pentru „ce erou e mai aproape" e
     mai mult decât suficientă. Nu mai apare al doilea prompt: permisiunea a
     fost deja dată la prima cerere. */
  if (outcome === 2 /* POSITION_UNAVAILABLE */ || outcome === 3 /* TIMEOUT */) {
    outcome = await attempt(false);
  }

  if (typeof outcome === 'number') {
    if (outcome === 1 /* PERMISSION_DENIED */) {
      let permanent = false;
      try {
        const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        permanent = status?.state === 'denied';
      } catch { /* Safari poate să nu susțină numele ăsta — atunci nu știm, și e ok */ }
      return { ok: false, reason: permanent ? 'blocked' : 'denied' };
    }
    return { ok: false, reason: outcome === 3 ? 'timeout' : 'unavailable' };
  }

  const lat = outcome.coords.latitude;
  const lng = outcome.coords.longitude;
  if (!valid(lat, lng)) return { ok: false, reason: 'error' };

  const address = await reverseGeocode({ lat, lng });
  return { ok: true, location: { lat, lng, address } };
}

/* ---------------- ETA ---------------- */

export interface RouteETA {
  durationMin: number;
  distanceKm: number;
  /** true = estimare în linie dreaptă, serverul de rutare n-a răspuns */
  approx: boolean;
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Fără rețea: distanță dreaptă × 1.3 (drum real), la ~30 km/h mediu urban. */
function straightLineEstimate(from: GeoPoint, to: GeoPoint): RouteETA {
  const straight = haversineKm(from, to);
  const distanceKm = Math.round(straight * 1.3 * 10) / 10;
  return { durationMin: Math.max(1, Math.round((distanceKm / 30) * 60)), distanceKm, approx: true };
}

/**
 * Timp și distanță pe drum, prin OSRM public (keyless).
 *
 * Serverul demo are rate-limit, deci nu se cheamă la fiecare mișcare. Dacă nu
 * răspunde, cădem pe estimarea în linie dreaptă și marcăm `approx`, ca eroul să
 * știe că e orientativ.
 */
export async function routeETA(from: GeoPoint, to: GeoPoint): Promise<RouteETA> {
  try {
    const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      if (route && Number.isFinite(route.duration) && Number.isFinite(route.distance)) {
        return {
          durationMin: Math.max(1, Math.round(route.duration / 60)),
          distanceKm: Math.round((route.distance / 1000) * 10) / 10,
          approx: false,
        };
      }
    }
  } catch { /* cădem pe estimare */ }
  return straightLineEstimate(from, to);
}

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/* ---------------- navigație ---------------- */

/** Waze îl deschide aplicația dacă e instalată; altfel rămâne în browser. */
export const wazeUrl = (point: GeoPoint) =>
  `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`;

export const wazeSearchUrl = (address: string) =>
  `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;

export const mapsUrl = (point: GeoPoint, label?: string) =>
  `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}` +
  (label ? `&query_place_id=${encodeURIComponent(label)}` : '');

export const mapsSearchUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/* ---------------- mai multe destinații, o singură cerere ---------------- */

export interface Leg {
  durationMin: number;
  distanceKm: number;
  /** true = calculat în linie dreaptă, serverul de rutare n-a răspuns */
  approx: boolean;
}

/* Două oglinzi ale aceluiași serviciu. Prima e demo-ul oficial OSRM, a doua e
   instanța comunității germane — măsurat, a doua răspunde de două ori mai
   repede. Dacă una cade, mergem pe cealaltă. */
const TABLE_HOSTS = [
  'https://routing.openstreetmap.de/routed-car',
  'https://router.project-osrm.org',
];

/**
 * Timp și distanță pe drum de la un punct la mai multe, într-o singură cerere.
 *
 * Ăsta e tot rostul: o listă de misiuni ar cere altfel câte o rutare de fiecare,
 * adică zece cereri către un server public limitat, care ne-ar refuza pe la a
 * treia. Serviciul „table" al OSRM întoarce toată matricea deodată — o cerere,
 * ~150ms, oricâte destinații.
 *
 * Nu aruncă niciodată: dacă rutarea nu răspunde, cade pe estimarea în linie
 * dreaptă și marchează `approx`, ca să putem spune omului că e orientativ.
 */
export async function routeMatrix(from: GeoPoint, to: GeoPoint[]): Promise<Leg[]> {
  const fallback = (): Leg[] => to.map(point => straightLineEstimate(from, point));
  if (!to.length) return [];

  const coords = [from, ...to].map(p => `${p.lng},${p.lat}`).join(';');

  for (const host of TABLE_HOSTS) {
    try {
      const url = `${host}/table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
      const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) continue;

      const data = await res.json();
      const durations: unknown[] = data?.durations?.[0] ?? [];
      const distances: unknown[] = data?.distances?.[0] ?? [];
      if (durations.length !== to.length + 1) continue;

      return to.map((point, i) => {
        const seconds = durations[i + 1];
        const meters = distances[i + 1];
        // un punct de pe care nu se poate ajunge cu mașina vine ca null
        if (!Number.isFinite(seconds) || !Number.isFinite(meters)) {
          return straightLineEstimate(from, point);
        }
        return {
          durationMin: Math.max(1, Math.round((seconds as number) / 60)),
          distanceKm: Math.round(((meters as number) / 1000) * 10) / 10,
          approx: false,
        };
      });
    } catch { /* încercăm oglinda următoare */ }
  }

  return fallback();
}
