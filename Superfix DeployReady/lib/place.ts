/* ============================================================
   Locul și drumul — portul web al regulilor din aplicație.

   Aceleași funcții ca în `SuperfixApp/src/services/searchPlace.ts` și
   `src/components/zone/travel.ts`, cu aceleași texte: un loc arătat pe site
   trebuie să se numească la fel și să coste la fel ca în aplicație.
   ============================================================ */

import type { GeoPoint } from './geo';

/* ---------------- numele locului ---------------- */

/* Străzile nu spun nimic pe o pastilă („Strada Gării 72"): cuvântul bun e locul, nu adresa. */
const STREET = /^(str(ada|\.)?|bd\.?|b-dul|bulevardul|calea|șos(eaua|\.)?|sos(eaua|\.)?|intrarea|aleea|splaiul|piața|drumul|fundătura)\b/i;

const parts = (address: string | undefined) =>
  (address || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

/** Numele scurt al unui loc, din adresa lungă: prima bucată care nu e stradă sau număr. */
export function shortPlaceName(address: string | undefined): string {
  const list = parts(address);
  const name = list.find(part => !STREET.test(part) && !/\d/.test(part));
  return name || list[0] || 'Locul ales';
}

/**
 * Adresa e doar o localitate („Voluntari, Ilfov”): nicio stradă și niciun număr. E bună pentru
 * listă, dar meseriașul n-are unde veni — formularul întreabă „Unde anume în Voluntari?”.
 */
export function isLocalityOnly(address: string | undefined): boolean {
  const list = parts(address);
  /* „Sector 1” și codul poștal au cifre, dar tot nu spun unde e casa. */
  const precise = (part: string) =>
    STREET.test(part) || (/\d/.test(part) && !/^sector\s*\d/i.test(part) && !/^\d{6}$/.test(part));
  return list.length > 0 && !list.some(precise);
}

/* ---------------- „Unde” din lista de eroi ---------------- */

/**
 * Locul pentru care caută clientul (ca `services/searchPlace.ts` din aplicație): un singur loc.
 * `gps` = „Lângă tine” (punctul se ia la fiecare intrare), `place` = ales de mână, rămâne ales.
 * Același loc pornește formularul de cerere; locul schimbat acolo devine noul „Unde”.
 */
export type SearchPlace =
  | { kind: 'gps' }
  | { kind: 'place'; lat: number; lng: number; label: string; address?: string };

const SEARCH_KEY = 'superfix_search_place';

export function loadSearchPlace(): SearchPlace | null {
  try {
    const value = JSON.parse(localStorage.getItem(SEARCH_KEY) || 'null');
    if (value?.kind === 'gps') return { kind: 'gps' };
    if (value?.kind === 'place' && Number.isFinite(value.lat) && Number.isFinite(value.lng) && typeof value.label === 'string') {
      return {
        kind: 'place',
        lat: value.lat,
        lng: value.lng,
        label: value.label,
        ...(typeof value.address === 'string' && value.address.trim() ? { address: value.address } : {}),
      };
    }
  } catch { /* citire stricată = n-a ales nimic */ }
  return null;
}

export function saveSearchPlace(place: SearchPlace | null) {
  try {
    if (place) localStorage.setItem(SEARCH_KEY, JSON.stringify(place));
    else localStorage.removeItem(SEARCH_KEY);
  } catch { /* nesalvat = data viitoare întreabă iar */ }
}

/* ---------------- locul ținut minte ---------------- */

/** Locul ultimei cereri trimise de pe acest browser: formularul următor pornește de la el. */
export interface SavedPlace extends GeoPoint {
  address: string;
}

const PLACE_KEY = 'superfix_request_place';

export function loadSavedPlace(): SavedPlace | null {
  try {
    const value = JSON.parse(localStorage.getItem(PLACE_KEY) || 'null');
    if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && typeof value.address === 'string') return value;
  } catch { /* citire stricată = nimic ținut minte */ }
  return null;
}

export function saveSavedPlace(place: SavedPlace) {
  try { localStorage.setItem(PLACE_KEY, JSON.stringify(place)); } catch { /* mod privat */ }
}

/** Contactul de la ultima cerere: ca în aplicație, nu se mai cere de fiecare dată. */
export interface SavedContact {
  name: string;
  phone: string;
  email: string;
}

const CONTACT_KEY = 'superfix_request_contact';

export function loadSavedContact(): SavedContact | null {
  try {
    const value = JSON.parse(localStorage.getItem(CONTACT_KEY) || 'null');
    if (value && typeof value.name === 'string' && typeof value.phone === 'string' && typeof value.email === 'string') return value;
  } catch { /* nimic */ }
  return null;
}

export function saveSavedContact(contact: SavedContact) {
  try { localStorage.setItem(CONTACT_KEY, JSON.stringify(contact)); } catch { /* mod privat */ }
}

/* ---------------- validarea, ca în aplicație ---------------- */

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** Regula strictă a `POST /api/request`: numai numere mobile 07xxxxxxxx. */
export const isValidMobileRo = (phone: string) => {
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+40')) p = `0${p.slice(3)}`;
  if (p.startsWith('40') && p.length === 11) p = `0${p.slice(2)}`;
  return /^07\d{8}$/.test(p);
};

/* ---------------- zona și drumul ---------------- */

export type Reach = 'zone' | 'travel' | 'far';

/** Cercul zonei: centrul (rotunjit de server la ~100 m), raza și inelul în care vine cu bani pe km. */
export interface ZoneCircle {
  nationwide: false;
  lat: number;
  lng: number;
  radiusKm: number;
  travelKm?: number | null;
  travelRatePerKm?: number | null;
}

/** Zona publică din profil: cercul, „toată țara” sau nimic. */
export type PublicZone = { nationwide: true } | ZoneCircle;

/** Cercul, dacă zona are unul (proiectul nu are `strictNullChecks`, deci uniunea nu se îngustează singură). */
export const zoneCircle = (zone: PublicZone | null | undefined): ZoneCircle | null =>
  zone && !zone.nationwide ? (zone as ZoneCircle) : null;

/** „1 leu”, „19 lei”, „20 de lei”, „101 lei”: „de” la 20+ și la sute întregi, ca în română. */
export const plural = (n: number, one: string, many: string) =>
  n === 1
    ? `1 ${one}`
    : !Number.isInteger(n)
      ? `${String(n).replace('.', ',')} ${many}`
      : (n % 100 === 0 && n > 0) || n % 100 >= 20
        ? `${n} de ${many}`
        : `${n} ${many}`;

export const leiText = (n: number) => plural(n, 'leu', 'lei');
/** Suma drumului, cum o vede clientul: „~62 de lei” (socotită în linie dreaptă, deci cu semnul de circa). */
export const aboutLeiText = (n: number) => `~${leiText(n)}`;
export const kmText = (n: number) => plural(n, 'km', 'km');
export const formatRate = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ','));
export const rateText = (value: number) => `${formatRate(value)} ${value === 1 ? 'leu' : 'lei'}/km`;
/** „45 km”, „7,5 km”. */
export const formatKm = (km: number) => (km < 10 ? `${String(Math.round(km * 10) / 10).replace('.', ',')} km` : `${Math.round(km)} km`);

/** Distanța pe glob, aceeași formulă ca serverul (`reachOf`). */
export function distanceKm(a: GeoPoint, b: GeoPoint) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Unde cade un loc față de zona cuiva: în verde, în portocaliu (cu suma), sau dincolo. Ca pe server. */
export function reachOfZone(zone: PublicZone | null | undefined, point: GeoPoint | null | undefined): { reach: Reach; fee: number | null } | null {
  if (!zone || !point) return null;
  const circle = zoneCircle(zone);
  if (!circle) return { reach: 'zone', fee: null };
  // Ca serverul: locul rotunjit la ~1 km, ca marginea să dea un singur răspuns.
  const at = { lat: Math.round(point.lat * 100) / 100, lng: Math.round(point.lng * 100) / 100 };
  const d = distanceKm(circle, at);
  if (d <= circle.radiusKm) return { reach: 'zone', fee: null };
  const extra = circle.travelKm ?? 0;
  const rate = circle.travelRatePerKm ?? 0;
  if (extra > 0 && rate > 0 && d <= circle.radiusKm + extra) return { reach: 'travel', fee: Math.max(0, Math.round((d - circle.radiusKm) * rate)) };
  return { reach: 'far', fee: null };
}

/** Zona venită de la server, verificată: stricată sau lipsă = nu știm, deci nu spunem nimic. */
export function parseZone(value: any): PublicZone | null {
  if (value?.nationwide === true) return { nationwide: true };
  if (Number.isFinite(value?.lat) && Number.isFinite(value?.lng) && Number.isFinite(value?.radiusKm)) {
    return { nationwide: false, lat: value.lat, lng: value.lng, radiusKm: value.radiusKm, travelKm: value.travelKm ?? null, travelRatePerKm: value.travelRatePerKm ?? null };
  }
  return null;
}
