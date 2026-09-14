/* ============================================================
   Ce trimite `/api/seo/*` (FRONTEND-HANDOFF A14) și previzualizarea pe WhatsApp.

   Titlul, descrierea, canonical-ul, firimiturile și JSON-LD-ul vin gata de la
   server; site-ul doar le pune în pagină, nu le compune. Aceleași date ajung în
   HTML-ul randat pe server (api/ssr.ts), iar aplicația le preia de acolo.
   ============================================================ */
import type { Hero } from '../types';

export interface SeoCrumb { name: string; path: string; }

export interface SeoLink {
  name?: string;
  label?: string;
  path: string;
  heroes?: number;
  indexable?: boolean;
}

export interface SeoOg {
  title?: string;
  description?: string;
  image?: string | null;
  url?: string;
  type?: string;
}

export interface HeroSeo {
  canonical: string;
  title: string;
  metaDescription?: string;
  place?: { locality?: string | null; county?: string | null; countyCode?: string | null } | null;
  counties?: { code: string; name: string }[];
  og?: SeoOg;
  breadcrumbs?: SeoCrumb[];
  links?: SeoLink[];
  jsonLd?: unknown[];
}

export interface SeoLanding {
  path: string;
  kind: string;
  canonical: string;
  indexable: boolean;
  title: string;
  h1: string;
  metaDescription?: string;
  intro?: string;
  category?: { slug?: string; label?: string } | string | null;
  stats?: {
    heroes?: number;
    trades?: number;
    ratingAvg?: number | null;
    reviewCount?: number;
    priceMin?: number | null;
    priceMax?: number | null;
    priceAvg?: number | null;
  };
  faq?: { question: string; answer: string }[];
  breadcrumbs?: SeoCrumb[];
  related?: { places?: SeoLink[]; trades?: SeoLink[]; also?: SeoLink[] };
  og?: SeoOg;
  jsonLd?: unknown[];
  heroes: Hero[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Un rând din `/api/seo/pages`: pentru subsol. */
export interface SeoPage {
  path: string;
  kind: string;
  label: string;
  heroes: number;
  indexable: boolean;
}

/** Doar căi interne („/meserii/…”), niciodată `//alt-site` sau `javascript:`. */
export const isInternalPath = (value: unknown): value is string =>
  typeof value === 'string' && /^\/(?![/\\])/.test(value);

export const DEFAULT_OG_IMAGE = 'https://super-fix.ro/og-default.jpg';

/* Previzualizarea pe WhatsApp: poza omului, lărgită la 1200×630 pe un fundal
   făcut din ea însăși, cu logoul Super-Fix (public/logo.png) în colț. O face
   api/og.ts, la /og/<versiune>/<id>.jpg.

   Ține funcția la fel cu `ogImage` din api/ssr.ts: pagina din aplicație
   trebuie să arate aceeași poză ca HTML-ul de la server. */
const OG_SOURCE = /^https:\/\/res\.cloudinary\.com\/dnsmgqllf\/image\/upload\/(?:[^/]+\/)*?(v\d+)\/([A-Za-z0-9_\-/]+)(\.[A-Za-z0-9]+)?$/;

/* Tagurile puse de server în <head> (api/ssr.ts, marcate `data-ssr`) sunt
   pentru cine nu rulează aplicația: Google la prima citire, WhatsApp, Facebook.
   Odată pornită, aplicația pune aceleași taguri prin Helmet. Cu React 19 Helmet
   nu preia taguri existente, doar adaugă, deci le scoatem pe ale serverului
   înainte de prima randare; altfel pagina ar avea două canonical-uri și două
   descrieri. Titlul rămâne, cu textul implicit al aplicației: React pune
   titlul paginii înaintea lui, iar paginile fără titlu arată ca înainte. */
export function releaseServerHead(): void {
  document.head.querySelectorAll('[data-ssr]').forEach(el => {
    if (el.tagName === 'TITLE') {
      el.textContent = el.getAttribute('data-default') || el.textContent;
      el.removeAttribute('data-ssr');
      el.removeAttribute('data-default');
    } else {
      el.remove();
    }
  });
}

/* index.html are o descriere implicită (marcată `data-fallback`), pentru cine
   citește HTML-ul fără să ruleze aplicația. Paginile cu descrierea lor o pun
   prin Helmet lângă ea (React 19 doar adaugă), iar Google vedea două, cea
   implicită prima. Cât timp pagina are descrierea ei, cea implicită iese din
   joc (i se schimbă numele); revine pe paginile care n-au una a lor. */
export function keepSingleDescription(): void {
  const fallback = document.head.querySelector('meta[data-fallback]');
  if (!fallback) return; // pe paginile de la server a scos-o deja api/ssr.ts
  const sync = () => {
    const own = document.head.querySelector('meta[name="description"]:not([data-fallback])');
    fallback.setAttribute('name', own ? 'description-fallback' : 'description');
  };
  sync();
  // Doar copiii lui <head>: schimbarea numelui nu e o astfel de mutație, deci nu se reapelează singur.
  new MutationObserver(sync).observe(document.head, { childList: true });
}

export function wideOgImage(url?: string | null): { url: string; wide: boolean } {
  const raw = (url || '').trim();
  const match = OG_SOURCE.exec(raw);
  if (!match) return raw.startsWith('https://') ? { url: raw, wide: false } : { url: DEFAULT_OG_IMAGE, wide: true };
  const [, version, id] = match;
  return { url: `https://super-fix.ro/og/${version}/${id}.jpg`, wide: true };
}
