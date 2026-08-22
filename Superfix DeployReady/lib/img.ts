/* ============================================================
   Pozele, la dimensiunea la care se văd.

   Toate pozele eroilor stau pe Cloudinary, dar linkurile salvate în baza de
   date sunt originalele brute — fără nicio transformare. Adică o poză făcută
   cu telefonul, 998×1920 și 320 KB, se descarcă întreagă ca să fie afișată
   într-un pătrat de 200px.

   Cloudinary știe să facă asta singur: pui parametrii în URL, el generează
   varianta o dată și o ține pe CDN-ul lui. Aceeași poză, cerută la 400px cu
   `f_auto,q_auto`, vine ca WebP de 12 KB. De 26 de ori mai puțin, la o
   calitate care pe ecran nu se distinge.

   E doar rescriere de link — nimic nu se schimbă în baza de date și nici pe
   server. Linkurile care nu sunt de Cloudinary trec neatinse.
   ============================================================ */

const UPLOAD = '/image/upload/';

interface ThumbOptions {
  /** taie pătrat, centrat pe subiect; pentru grile de pătrate */
  square?: boolean;
}

/**
 * Aceeași poză, cerută la lățimea la care chiar se afișează.
 *
 * `f_auto` alege formatul pe care îl înțelege browserul (AVIF, WebP, altfel
 * JPEG), `q_auto` alege compresia după conținutul pozei, iar `c_limit` nu mărește
 * niciodată o poză mică — doar o limitează pe cea mare.
 *
 * Dă lățimea în pixeli REALI, nu CSS: pentru un pătrat de 240px pe un ecran
 * retina ceri 480.
 */
export function thumb(
  url: string | null | undefined,
  width: number,
  options: ThumbOptions = {},
): string {
  if (!url) return '';

  const at = url.indexOf(UPLOAD);
  if (at === -1) return url; // nu e Cloudinary: îl lăsăm cum e

  const crop = options.square ? `c_fill,g_auto,ar_1:1` : 'c_limit';
  const params = `f_auto,q_auto,${crop},w_${Math.round(width)}`;

  // Transformările se pot înlănțui, deci se pot pune oricând înaintea restului
  // căii — chiar dacă linkul ar avea deja altele.
  return `${url.slice(0, at + UPLOAD.length)}${params}/${url.slice(at + UPLOAD.length)}`;
}

/**
 * Varianta mare, pentru lightbox și pentru vizualizatorul de misiuni: acolo poza
 * se vede pe tot ecranul, deci n-o micșorăm — dar tot merită formatul modern și
 * compresia automată.
 */
export const full = (url: string | null | undefined): string => thumb(url, 1600);
