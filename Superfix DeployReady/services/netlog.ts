import { API_URL } from '../config/api';

/* ============================================================
   Jurnalul de apeluri, partea din browser.

   Ce vede: numai cererile făcute de fila asta, de la deschiderea ei. E util
   imediat — se vede pe loc ce rută a picat, cât a durat și cu ce cod — dar nu
   răspunde la „ce a pățit meseriașul X marți". Aia are nevoie de un jurnal pe
   server; e descris în `BACKEND-MEDIA-SI-JURNAL.md`, punctul 5.

   Ce NU se înregistrează, niciodată: corpuri de cerere sau de răspuns, anteturi
   de autorizare, parametri de interogare. Prin ele trec parole, IBAN-uri,
   tokenuri de invitație și telefoane de clienți, iar panoul din admin e vizibil
   oricui are acces acolo. Reținem ruta, starea, durata și codul de eroare —
   adică exact ce trebuie ca să găsești problema, și nimic în plus.
   ============================================================ */

export interface NetEntry {
  id: number;
  /** momentul plecării, ca timp local */
  at: number;
  method: string;
  /** calea, fără gazdă și fără parametri de interogare */
  path: string;
  status: number | null;
  ms: number;
  /** codul intern de eroare întors de server, dacă a fost vreunul */
  code: string | null;
  /** cererea n-a ajuns deloc: rețea căzută, CORS, filă închisă */
  offline: boolean;
}

const MAX = 300;
const buffer: NetEntry[] = [];
const listeners = new Set<() => void>();
let counter = 0;
let installed = false;

const announce = () => listeners.forEach(fn => { try { fn(); } catch { /* un ascultător rupt nu oprește restul */ } });

export function netLog(): NetEntry[] {
  // copie, ca nimeni să nu poată modifica inelul din afară
  return buffer.slice();
}

export function onNetLog(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearNetLog() {
  buffer.length = 0;
  announce();
}

/** Doar calea. Parametrii de interogare pot conține tokenuri. */
function cleanPath(input: string): string {
  try {
    const url = new URL(input, window.location.origin);
    return url.pathname;
  } catch {
    return String(input).split('?')[0];
  }
}

function record(entry: NetEntry) {
  buffer.push(entry);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  announce();
}

/**
 * Se pune o singură dată, cât mai devreme.
 *
 * `fetch` original se păstrează și se apelează întotdeauna, orice s-ar întâmpla
 * aici. Un jurnal care poate să strice o cerere nu e un jurnal, e o defecțiune
 * în plus.
 */
export function installNetLog() {
  if (installed || typeof window === 'undefined' || !window.fetch) return;
  installed = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string'
      ? input
      : input instanceof URL ? input.href : (input as Request).url;

    // urmărim doar API-ul nostru; restul (Cloudinary, hărți, fonturi) e zgomot
    const ours = raw.includes(API_URL) || raw.startsWith('/api/');
    if (!ours) return original(input as RequestInfo, init);

    const method = (init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET') || 'GET').toUpperCase();
    const started = performance.now();
    const id = ++counter;

    try {
      const response = await original(input as RequestInfo, init);

      /* Codul de eroare se citește dintr-o clonă. Fără clonă am consuma corpul
         și apelantul ar primi un răspuns deja golit. */
      let code: string | null = null;
      if (!response.ok) {
        try {
          const copy = response.clone();
          const payload = await copy.json();
          code = typeof payload?.error === 'string' ? payload.error : null;
        } catch {
          /* răspuns fără JSON: rămâne doar starea */
        }
      }

      record({
        id,
        at: Date.now(),
        method,
        path: cleanPath(raw),
        status: response.status,
        ms: Math.round(performance.now() - started),
        code,
        offline: false,
      });
      return response;
    } catch (error) {
      record({
        id,
        at: Date.now(),
        method,
        path: cleanPath(raw),
        status: null,
        ms: Math.round(performance.now() - started),
        code: null,
        offline: true,
      });
      // eroarea merge mai departe neatinsă, la cine a cerut
      throw error;
    }
  };
}
