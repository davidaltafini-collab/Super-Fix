/* ============================================================
   Paginile pe care le citesc Google și WhatsApp (FRONTEND-HANDOFF A14).

   Google, WhatsApp și Facebook citesc HTML-ul trimis de server. Nu așteaptă
   aplicația, deci un cuvânt care nu e aici nu există pentru căutare, iar un
   link fără `og:image` pleacă pe WhatsApp fără poză.

   Funcția ia `index.html`-ul aplicației (cu scripturile ei, exact cum iese din
   build) și pune în el:
   - în `<head>`: titlul, descrierea, canonical, previzualizarea și JSON-LD-ul,
     toate luate ca atare din `/api/seo/*` — nu le compunem aici;
   - în `#root`: tot textul paginii, netrunchiat, cu linkuri `<a href>`;
   - lângă `#root`: răspunsul API-ului, ca aplicația să pornească direct cu el
     (`seedFromServer` în services/dataService.ts), fără a doua cerere.

   Apoi aplicația pornește normal și desenează pagina ei peste. Tagurile din
   `<head>` au `data-ssr`: la pornire aplicația le scoate și pune ale ei, cu
   aceleași valori (`releaseServerHead` în lib/seo.ts). Cu React 19, Helmet nu
   preia taguri existente, doar adaugă; fără asta ar apărea de două ori.

   Adresele vin din `vercel.json` (rewrites): `/hero/:slug`,
   `/hero/:slug/origine`, `/meserii/...`, `/zone/...`.

   Confidențialitatea e rezolvată în API: se afișează doar ce vine în răspuns.
   Telefonul nu e public și nu apare nicăieri aici.
   ============================================================ */

export const config = { runtime: 'edge' };

const SITE = 'https://super-fix.ro';
const API = 'https://api.super-fix.ro/api';
const DEFAULT_OG_IMAGE = `${SITE}/og-default.jpg`;
const API_TIMEOUT_MS = 6000;
const LANDING_LIMIT = 24;

/* Un nume ascuns sau un cont șters nu trebuie să mai apară după un minut. */
const CACHE_OK = 'public, s-maxage=60';

type Json = Record<string, any>;

/* ---------- scăpări ---------- */

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, ch => ENTITIES[ch]);

/** JSON într-un `<script>`: `<` scris ca escape, ca un `</script>` dintr-o descriere să nu închidă tagul. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/** Doar căi interne („/meserii/…”), niciodată `//alt-site` sau `javascript:`. */
const internalPath = (value: unknown): string | null =>
  typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/* ---------- formatare ---------- */

/** 1 recenzie, 2 recenzii, 20 de recenzii. */
function count(n: number, one: string, few: string): string {
  const rest = n % 100;
  if (n === 1) return `1 ${one}`;
  if (n === 0 || rest >= 20 || (rest === 0 && n > 0)) return `${n} de ${few}`;
  return `${n} ${few}`;
}

const rating = (value: unknown): string => Number(value).toFixed(1).replace('.', ',');

function date(value: unknown): string {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' });
}

const paragraphs = (value: unknown): string =>
  text(value).split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => `<p>${esc(line)}</p>`).join('');

/* ---------- poze ---------- */

const UPLOAD = '/image/upload/';

/* Aceleași lățimi ca în aplicație (profil 720, carduri 640): când React preia
   pagina cere exact aceeași adresă, iar poza vine din memoria browserului în loc
   să dispară și să se descarce a doua oară. */
const AVATAR_WIDTH = 720;
const CARD_WIDTH = 640;
/* Primele carduri se văd fără derulare: pozele lor pornesc imediat. Același
   număr ca `PRIORITY_CARDS` din components/HeroListCard.tsx. */
const EAGER_CARDS = 4;

/** Poza la lățimea la care se vede, ca în lib/img.ts. */
function picture(url: unknown, width: number, square = false): string {
  const raw = text(url);
  if (!raw.startsWith('https://')) return '';
  const at = raw.indexOf(UPLOAD);
  if (at === -1) return raw;
  const crop = square ? 'c_fill,g_auto,ar_1:1' : 'c_limit';
  return `${raw.slice(0, at + UPLOAD.length)}f_auto,q_auto,${crop},w_${width}/${raw.slice(at + UPLOAD.length)}`;
}

/* Previzualizarea pe WhatsApp: poza omului, lărgită la 1200×630 pe un fundal
   făcut din ea însăși, cu logoul Super-Fix în colț. O face api/og.ts, la
   /og/<versiune>/<id>.jpg. Ține funcția la fel cu `wideOgImage` din lib/seo.ts. */
const OG_SOURCE = /^https:\/\/res\.cloudinary\.com\/dnsmgqllf\/image\/upload\/(?:[^/]+\/)*?(v\d+)\/([A-Za-z0-9_\-/]+)(\.[A-Za-z0-9]+)?$/;

function ogImage(url: unknown): { url: string; wide: boolean } {
  const raw = text(url);
  const match = OG_SOURCE.exec(raw);
  if (!match) return raw.startsWith('https://') ? { url: raw, wide: false } : { url: DEFAULT_OG_IMAGE, wide: true };
  const [, version, id] = match;
  return { url: `${SITE}/og/${version}/${id}.jpg`, wide: true };
}

/* ---------- <head> ---------- */

interface Head {
  title: string;
  description?: string;
  canonical?: string;
  robots?: string;
  og?: { title?: string; description?: string; image?: unknown; url?: string; type?: string; alt?: string };
  jsonLd?: unknown[];
}

const meta = (attr: 'name' | 'property', key: string, content: unknown) =>
  text(content) ? `<meta ${attr}="${key}" content="${esc(content)}" data-ssr="">` : '';

/* `data-default` = titlul aplicației din index.html. La pornire titlul revine la
   el, ca paginile care nu-și pun titlul să arate ce arătau și înainte. */
function headHtml(head: Head, defaultTitle: string): string {
  const tags = [
    `<title data-ssr="" data-default="${esc(defaultTitle)}">${esc(head.title)}</title>`,
    meta('name', 'description', head.description),
  ];
  if (head.robots) tags.push(meta('name', 'robots', head.robots));
  if (head.canonical) tags.push(`<link rel="canonical" href="${esc(head.canonical)}" data-ssr="">`);
  if (head.og) {
    const image = head.og.image ? ogImage(head.og.image) : { url: DEFAULT_OG_IMAGE, wide: true };
    tags.push(
      meta('property', 'og:site_name', 'Super-Fix'),
      meta('property', 'og:locale', 'ro_RO'),
      meta('property', 'og:title', head.og.title),
      meta('property', 'og:description', head.og.description),
      meta('property', 'og:url', head.og.url),
      meta('property', 'og:type', head.og.type || 'website'),
      meta('property', 'og:image', image.url),
    );
    if (image.wide) tags.push(meta('property', 'og:image:width', '1200'), meta('property', 'og:image:height', '630'));
    tags.push(meta('property', 'og:image:alt', head.og.alt || head.og.title), meta('name', 'twitter:card', 'summary_large_image'));
  }
  for (const item of head.jsonLd || []) {
    tags.push(`<script type="application/ld+json" data-ssr="">${scriptJson(item)}</script>`);
  }
  return tags.filter(Boolean).join('\n    ');
}

/* ---------- bucăți de pagină ---------- */

/* Pentru Google, WhatsApp și cine n-are JavaScript (ei citesc textul, nu se uită
   la CSS). Pe ecran, varianta asta simplă NU apare cât timp aplicația se încarcă:
   omul vede fundalul, ca înainte de SSR, apoi direct pagina aplicației. Cu o
   întârziere de 1,5 s, pe un telefon lent apărea după 1,5 s și era înlocuită
   abia după alte câteva secunde, adică „alt site” care clipea (14 sept).
   Apare doar dacă aplicația nu pornește deloc în 10 s (script picat, browser
   foarte vechi) sau fără JavaScript (<noscript>). Pozele se descarcă oricum de
   la început (opacitatea nu le oprește), deci aplicația le găsește gata. */
const STYLE = `<noscript><style>.ssr{animation:none!important}</style></noscript>
<style>
@keyframes ssr-in{from{opacity:0}to{opacity:1}}
.ssr{animation:ssr-in .25s ease-out 10s both}
.ssr{max-width:60rem;margin:0 auto;padding:7rem 1.25rem 3rem;font-family:Nunito,system-ui,-apple-system,"Segoe UI",sans-serif;color:#2E333B;line-height:1.6}
.ssr h1{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:2.4rem;line-height:1.1;margin:.4rem 0 .6rem}
.ssr h2{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:1.4rem;margin:2.2rem 0 .6rem}
.ssr h3{font-size:1rem;margin:0}
.ssr a{color:#C8303D}
.ssr ol,.ssr ul{padding:0;list-style:none}
.ssr-crumbs ol{display:flex;flex-wrap:wrap;gap:.3rem;font-size:.9rem;color:#616368;margin:0}
.ssr-crumbs li+li:before{content:"›";margin-right:.3rem}
.ssr-kicker,.ssr-muted{color:#616368}
.ssr-facts{display:flex;flex-wrap:wrap;gap:.5rem 1.2rem;font-weight:700}
.ssr-avatar{width:10rem;height:10rem;border-radius:1.5rem;object-fit:cover}
.ssr-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:1rem}
.ssr-cards li,.ssr-reviews li{background:#fff;border-radius:1rem;padding:1rem;box-shadow:0 6px 18px -10px rgba(46,51,59,.35)}
.ssr-cards img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:.75rem}
.ssr-reviews{display:grid;gap:.8rem}
.ssr-links{display:flex;flex-wrap:wrap;gap:.5rem}
.ssr-links a{display:inline-block;padding:.35rem .8rem;border-radius:999px;background:#fff;text-decoration:none}
.ssr dt{font-weight:800;margin-top:.8rem}
.ssr dd{margin:0}
</style>`;

function crumbs(list: unknown): string {
  if (!Array.isArray(list) || list.length === 0) return '';
  const items = list
    .map(item => {
      const path = internalPath(item?.path);
      return path ? `<li><a href="${esc(path)}">${esc(item.name)}</a></li>` : '';
    })
    .join('');
  return `<nav class="ssr-crumbs" aria-label="Firimituri"><ol>${items}</ol></nav>`;
}

function linkList(title: string, list: unknown): string {
  if (!Array.isArray(list) || list.length === 0) return '';
  const items = list
    .map(item => {
      const path = internalPath(item?.path);
      const label = text(item?.label) || text(item?.name);
      return path && label ? `<li><a href="${esc(path)}">${esc(label)}</a></li>` : '';
    })
    .join('');
  return items ? `<nav aria-label="${esc(title)}"><h2>${esc(title)}</h2><ul class="ssr-links">${items}</ul></nav>` : '';
}

/* Aceleași întrebări ca pe pagina „Cine e sub costum” (pages/HeroOrigin.tsx). */
const STORY: [key: string, question: string][] = [
  ['originStory', 'Cum a început tot'],
  ['hardestMission', 'Cea mai grea misiune'],
  ['favoriteTool', 'Nu pleacă de acasă fără'],
  ['neverDoes', 'Ce nu face niciodată'],
  ['team', 'Ține cu'],
  ['petPeeve', 'Ce îl scoate din sărite'],
];

function story(hero: Json): string {
  return STORY
    .filter(([key]) => text(hero[key]))
    .map(([key, question]) => `<dt>${esc(question)}</dt><dd>${esc(text(hero[key]))}</dd>`)
    .join('');
}

const slugOf = (hero: Json, fallback: string) => text(hero.slug) || text(hero.id) || fallback;

/* ---------- profilul ---------- */

function heroPage(hero: Json, seo: Json, slug: string): { head: Head; body: string } {
  const heroSlug = slugOf(hero, slug);
  const place = seo.place || {};
  const where = [text(place.locality), text(place.county)].filter((v, i, all) => v && all.indexOf(v) === i).join(', ') || text(hero.location);
  const reviewCount = Number(hero.reviewCount) || 0;
  const reviews: Json[] = Array.isArray(hero.reviews) ? hero.reviews : [];
  const portfolio: Json[] = Array.isArray(hero.portfolio) ? hero.portfolio : [];
  const counties: Json[] = Array.isArray(seo.counties) ? seo.counties : [];
  const storyItems = story(hero);

  const facts = [
    Number(hero.hourlyRate) > 0 ? `Tarif ${esc(hero.hourlyRate)} lei/oră` : '',
    reviewCount > 0 && hero.ratingAvg != null ? `Nota ${rating(hero.ratingAvg)} din ${count(reviewCount, 'recenzie', 'recenzii')}` : '',
    Number(hero.missionsCompleted) > 0 ? count(Number(hero.missionsCompleted), 'misiune', 'misiuni') : '',
    Number(hero.yearsActive) > 0 ? `${count(Number(hero.yearsActive), 'an', 'ani')} de meserie` : '',
  ].filter(Boolean);

  const body = `
<div class="ssr">
  ${crumbs(seo.breadcrumbs)}
  <article>
    <header>
      ${hero.avatarUrl ? `<img class="ssr-avatar" src="${esc(picture(hero.avatarUrl, AVATAR_WIDTH, true))}" alt="${esc(hero.alias)}" width="160" height="160" fetchpriority="high">` : ''}
      <p class="ssr-kicker">${esc(text(hero.category))}${where ? ` · ${esc(where)}` : ''}</p>
      <h1>${esc(hero.alias)}</h1>
      ${text(hero.realName) ? `<p>Identitate secretă: <strong>${esc(hero.realName)}</strong></p>` : ''}
      ${facts.length ? `<ul class="ssr-facts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
    </header>
    ${text(hero.description) || text(hero.powers) ? `<section><h2>Despre</h2>${paragraphs(hero.description)}${paragraphs(hero.powers)}</section>` : ''}
    ${counties.length ? `<section><h2>Unde lucrează</h2><p>${counties.map(c => esc(c?.name)).filter(Boolean).join(', ')}</p></section>` : ''}
    ${storyItems ? `<section><h2>Cine e sub costum</h2><dl>${storyItems}</dl><p><a href="/hero/${esc(heroSlug)}/origine">Povestea lui ${esc(hero.alias)}</a></p></section>` : ''}
    ${portfolio.length ? `<section><h2>Misiuni rezolvate</h2><ul class="ssr-cards">${portfolio.map(item => `<li>
      ${item.afterUrl || item.beforeUrl ? `<img src="${esc(picture(item.afterUrl || item.beforeUrl, 640))}" alt="${esc(text(item.title) || 'Lucrare')}" loading="lazy">` : ''}
      ${text(item.title) ? `<h3>${esc(item.title)}</h3>` : ''}${paragraphs(item.description)}</li>`).join('')}</ul></section>` : ''}
    ${reviews.length ? `<section><h2>Recenzii</h2><ul class="ssr-reviews">${reviews.map(review => `<li>
      <p class="ssr-muted"><strong>${esc(text(review.clientName) || 'Client')}</strong> · ${esc(review.rating)} din 5${date(review.date) ? ` · ${esc(date(review.date))}` : ''}</p>
      ${paragraphs(review.comment)}</li>`).join('')}</ul></section>` : ''}
  </article>
  ${linkList('Mai mulți meseriași', seo.links)}
</div>`;

  return {
    head: {
      title: text(seo.title) || `${text(hero.alias)} | Super-Fix`,
      description: seo.metaDescription,
      canonical: seo.canonical,
      og: { ...(seo.og || {}), alt: text(hero.alias) },
      jsonLd: Array.isArray(seo.jsonLd) ? seo.jsonLd : [],
    },
    body,
  };
}

/* ---------- „Cine e sub costum” ---------- */

function originPage(hero: Json, seo: Json, slug: string): { head: Head; body: string } {
  const heroSlug = slugOf(hero, slug);
  const name = text(hero.realName) || text(hero.alias);
  const url = `${SITE}/hero/${encodeURIComponent(heroSlug)}/origine`;
  // Aceleași texte ca în pages/HeroOrigin.tsx.
  const title = `Cine e sub costum: ${text(hero.alias)} | Superfix`;
  const description = `Povestea lui ${name}, ${text(hero.category)} pe Superfix.`;
  const storyItems = story(hero);

  const body = `
<div class="ssr">
  ${crumbs(seo.breadcrumbs)}
  <article>
    <p class="ssr-kicker">Cine e sub costum</p>
    <h1>${esc(name)}</h1>
    <p>${esc(hero.alias)} · ${esc(text(hero.category))}${Number(hero.yearsActive) > 0 ? ` · ${count(Number(hero.yearsActive), 'an', 'ani')} de meserie` : ''}</p>
    ${storyItems ? `<dl>${storyItems}</dl>` : ''}
    <p><a href="/hero/${esc(heroSlug)}">Profilul lui ${esc(hero.alias)}</a></p>
  </article>
</div>`;

  return {
    head: {
      title,
      description,
      // Povestea e și pe profil; paginile se adună la profil, nu se concurează.
      canonical: seo.canonical,
      og: { title, description, image: seo.og?.image, url, type: 'profile', alt: name },
    },
    body,
  };
}

/* ---------- paginile pe meserie și loc ---------- */

function landingPage(data: Json, path: string, page: number): { head: Head; body: string } {
  const heroes: Json[] = Array.isArray(data.heroes) ? data.heroes : [];
  const stats = data.stats || {};
  const related = data.related || {};
  const faq: Json[] = Array.isArray(data.faq) ? data.faq : [];
  const pageHref = (n: number) => (n <= 1 ? path : `${path}?page=${n}`);

  const facts = [
    Number(stats.heroes) > 0 ? count(Number(stats.heroes), 'meseriaș', 'meseriași') : '',
    Number(stats.reviewCount) > 0 && stats.ratingAvg != null ? `Nota medie ${rating(stats.ratingAvg)} din ${count(Number(stats.reviewCount), 'recenzie', 'recenzii')}` : '',
    Number(stats.priceMin) > 0 && Number(stats.priceMax) > 0
      ? (stats.priceMin === stats.priceMax ? `Tarif ${esc(stats.priceMin)} lei/oră` : `Tarife între ${esc(stats.priceMin)} și ${esc(stats.priceMax)} lei/oră`)
      : '',
  ].filter(Boolean);

  const cards = heroes.map((hero, index) => {
    const slug = slugOf(hero, '');
    const reviews = Number(hero.reviewCount) || 0;
    return `<li><a href="/hero/${esc(slug)}">
      ${hero.avatarUrl ? `<img src="${esc(picture(hero.avatarUrl, CARD_WIDTH, true))}" alt="${esc(hero.alias)}"${index < EAGER_CARDS ? ' fetchpriority="high"' : ' loading="lazy"'}>` : ''}
      <h3>${esc(hero.alias)}</h3></a>
      <p class="ssr-muted">${esc(text(hero.category))}${text(hero.location) ? ` · ${esc(hero.location)}` : ''}</p>
      <p>${reviews > 0 && hero.ratingAvg != null ? `Nota ${rating(hero.ratingAvg)} (${count(reviews, 'recenzie', 'recenzii')})` : 'Fără recenzii încă'}${Number(hero.hourlyRate) > 0 ? ` · ${esc(hero.hourlyRate)} lei/oră` : ''}</p>
    </li>`;
  }).join('');

  const pager = [
    page > 1 ? `<a rel="prev" href="${esc(pageHref(page - 1))}">Pagina anterioară</a>` : '',
    data.hasMore ? `<a rel="next" href="${esc(pageHref(page + 1))}">Pagina următoare</a>` : '',
  ].filter(Boolean).join(' · ');

  const body = `
<div class="ssr">
  ${crumbs(data.breadcrumbs)}
  <header>
    <h1>${esc(data.h1 || data.title)}</h1>
    ${paragraphs(data.intro)}
    ${facts.length ? `<ul class="ssr-facts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
  </header>
  ${cards ? `<section><h2>Meseriașii</h2><ul class="ssr-cards">${cards}</ul>${pager ? `<p>${pager}</p>` : ''}</section>` : ''}
  ${faq.length ? `<section><h2>Întrebări frecvente</h2><dl>${faq.map(item => `<dt>${esc(item?.question)}</dt><dd>${esc(item?.answer)}</dd>`).join('')}</dl></section>` : ''}
  ${linkList('Pe meserii', related.trades)}
  ${linkList('Pe localități', related.places)}
  ${linkList('Vezi și', related.also)}
</div>`;

  return {
    head: {
      title: text(data.title),
      description: data.metaDescription,
      canonical: data.canonical,
      robots: data.indexable === false ? 'noindex, follow' : undefined,
      og: { ...(data.og || {}), alt: text(data.h1) },
      jsonLd: Array.isArray(data.jsonLd) ? data.jsonLd : [],
    },
    body,
  };
}

function missingPage(): { head: Head; body: string } {
  return {
    head: { title: 'Pagina nu există | Super-Fix', robots: 'noindex' },
    body: `
<div class="ssr">
  <h1>Aici n-a ajuns nimeni</h1>
  <p>Pagina nu mai există sau adresa e greșită.</p>
  <p><a href="/heroes">Caută un erou</a> · <a href="/">Înapoi acasă</a></p>
</div>`,
  };
}

/* ---------- șablonul și răspunsul ---------- */

/* `index.html` din build (numele scripturilor au hash, deci nu se poate scrie de
   mână). Se cere o dată pe instanță: fiecare deploy are instanțele lui. */
let templateCache: Promise<string> | null = null;

function loadTemplate(origin: string): Promise<string> {
  if (!templateCache) {
    const headers: Record<string, string> = {};
    // Pe preview-urile protejate de Vercel; pe producție nu există.
    const bypass = typeof process !== 'undefined' ? process.env?.VERCEL_AUTOMATION_BYPASS_SECRET : undefined;
    if (bypass) headers['x-vercel-protection-bypass'] = bypass;
    const pending = fetch(`${origin}/index.html`, { headers }).then(res => {
      if (!res.ok) throw new Error(`index.html ${res.status}`);
      return res.text();
    });
    pending.catch(() => { templateCache = null; });
    templateCache = pending;
  }
  return templateCache;
}

/* Tagurile implicite ale aplicației, înlocuite cu cele ale paginii. */
const DEFAULT_HEAD_TAGS = [
  /<title>[\s\S]*?<\/title>\s*/gi,
  /<meta\s+name="description"[^>]*>\s*/gi,
  /<meta\s+name="robots"[^>]*>\s*/gi,
  /<meta\s+property="og:[^"]*"[^>]*>\s*/gi,
  /<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/gi,
];

/* Mascota e poza principală doar pe prima pagină. Pe profil și pe paginile pe
   meserie și loc nu apare, iar preîncărcarea ei (79 KB, prioritate mare) lua
   banda pozelor care chiar se văd. */
const MASCOT_PRELOAD = /<link\s+rel="preload"\s+href="\/mascot\.png"[^>]*>\s*/i;

function render(template: string, page: { head: Head; body: string }, seed: unknown): string {
  const defaultTitle = /<title>([\s\S]*?)<\/title>/i.exec(template)?.[1].trim() || 'Super-Fix';
  let html = template;
  for (const pattern of DEFAULT_HEAD_TAGS) html = html.replace(pattern, '');
  html = html.replace(MASCOT_PRELOAD, '');
  html = html.replace('</head>', `    ${headHtml(page.head, defaultTitle)}\n    ${STYLE}\n  </head>`);
  const data = seed ? `<script type="application/json" id="sf-ssr-data">${scriptJson(seed)}</script>` : '';
  return html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${page.body}</div>${data}`);
}

const htmlResponse = (html: string, status: number, cache: string, extra: Record<string, string> = {}) =>
  new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache, ...extra } });

type ApiResult = { status: 'ok'; data: Json } | { status: 'missing' } | { status: 'down' };

async function api(path: string): Promise<ApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'down' };
    return { status: 'ok', data: await res.json() };
  } catch {
    return { status: 'down' };
  } finally {
    clearTimeout(timer);
  }
}

/* Câmpuri care n-au ce căuta în pagină chiar dacă ar apărea vreodată în API. */
function publicHero(hero: Json): Json {
  const { phone, email, username, ...rest } = hero || {};
  return rest;
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = url.searchParams.get('__r');
  const slug = (url.searchParams.get('__s') || '').trim();
  const path = (url.searchParams.get('__p') || '').replace(/\/+$/, '').toLowerCase();
  const pageParam = Number(url.searchParams.get('page') || '1');
  const page = Number.isInteger(pageParam) && pageParam >= 1 && pageParam <= 1000 ? pageParam : 1;

  let template: string;
  try {
    template = await loadTemplate(url.origin);
  } catch {
    return htmlResponse('<!doctype html><title>Super-Fix</title><p>Pagina se încarcă greu. Reîncearcă peste câteva secunde.</p>', 503, 'no-store', { 'Retry-After': '30' });
  }

  // API-ul nu răspunde: aplicația merge oricum, iar Google revine mai târziu în loc să scoată pagina.
  const unavailable = () => htmlResponse(template, 503, 'no-store', { 'Retry-After': '120' });
  const missing = () => htmlResponse(render(template, missingPage(), null), 404, CACHE_OK);

  if ((route === 'hero' || route === 'origin') && slug) {
    const result = await api(`/seo/hero/${encodeURIComponent(slug)}`);
    if (result.status === 'missing') return missing();
    if (result.status === 'down' || !result.data?.hero || !result.data?.seo) return unavailable();
    const hero = publicHero(result.data.hero);
    const seo = result.data.seo;
    const view = route === 'hero' ? heroPage(hero, seo, slug) : originPage(hero, seo, slug);
    return htmlResponse(render(template, view, { kind: 'hero', slug, hero, seo }), 200, CACHE_OK);
  }

  if (route === 'landing' && /^\/(meserii|zone)\/[a-z0-9-]+(\/[a-z0-9-]+){0,2}$/.test(path)) {
    const query = new URLSearchParams({ path, page: String(page), limit: String(LANDING_LIMIT) });
    const result = await api(`/seo/landing?${query}`);
    if (result.status === 'missing') return missing();
    if (result.status === 'down' || typeof result.data?.title !== 'string') return unavailable();
    const view = landingPage(result.data, path, page);
    return htmlResponse(render(template, view, { kind: 'landing', path, page, data: result.data }), 200, CACHE_OK);
  }

  return missing();
}
