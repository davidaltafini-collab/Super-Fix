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
  | { ok: false; reason: 'denied' | 'blocked' | 'unavailable' | 'insecure' | 'error' };

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

  /* Dacă omul a respins promptul de mai multe ori, Chrome blochează site-ul
     de-a binelea: nu mai întreabă niciodată, indiferent câte ori chemăm
     getCurrentPosition — doar loghează un avertisment în consolă de fiecare
     dată. Verificăm dinainte, ca să dăm mesajul corect ("resetează din site
     settings") în loc de generalul "n-am putut" și să nu mai spamăm consola. */
  if (typeof navigator.permissions?.query === 'function') {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (status.state === 'denied') return { ok: false, reason: 'blocked' };
    } catch { /* API-ul poate lipsi sau eșua — mergem mai departe, încercăm oricum */ }
  }

  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });

  // Browserul nu spune de ce a eșuat într-un fel pe care merită să-l traducem
  // în trei mesaje diferite: pentru om, „n-am putut lua locația" e același lucru.
  if (!position) return { ok: false, reason: 'denied' };

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
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
