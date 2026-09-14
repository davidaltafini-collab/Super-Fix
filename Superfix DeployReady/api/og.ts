/* ============================================================
   Poza de previzualizare (WhatsApp, Facebook, Google): poza meseriașului pe
   un fundal făcut din ea însăși, cu logoul Super-Fix (public/logo.png) în colț.

   Cloudinary face fundalul încețoșat și încadrarea pozei. Logoul nu-l poate
   lipi el: pe contul nostru tipul `fetch` e restricționat, deci nu ia imagini
   de la alte adrese. Îl lipim aici, cu sharp.

   Adresa: /og/<versiune>/<id>.jpg (rewrite în vercel.json). Versiunea e în
   adresă, deci o poză nouă înseamnă altă adresă, iar răspunsul poate sta mult
   în cache. Se generează o dată; după aceea îl dă CDN-ul Vercel.
   ============================================================ */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const CLOUD = 'https://res.cloudinary.com/dnsmgqllf/image/upload';
const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 24;
const FALLBACK = '/og-default.jpg';
const CACHE_OK = 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400';

/* Doar poze de pe contul nostru: `v123/id` sau `v123/folder/id`, fără extensie.
   Nimic altceva nu ajunge într-o adresă cerută de funcție. */
const PATH_RE = /^(v\d{1,12})\/([A-Za-z0-9_-]{1,120}(?:\/[A-Za-z0-9_-]{1,120}){0,5})$/;

let logoFile: Promise<Buffer> | null = null;

/* Inclus lângă funcție prin `includeFiles` (vercel.json); dacă totuși lipsește,
   îl luăm de pe site, de la aceeași adresă. */
function loadLogo(origin: string): Promise<Buffer> {
  if (!logoFile) {
    logoFile = readFile(path.join(process.cwd(), 'public', 'logo.png')).catch(async () => {
      const res = await fetch(`${origin}/logo.png`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`logo.png ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    });
    logoFile.catch(() => { logoFile = null; });
  }
  return logoFile;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function fallback(res: ServerResponse): void {
  res.statusCode = 302;
  res.setHeader('Location', FALLBACK);
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  res.end();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'super-fix.ro');
  const url = new URL(req.url || '/', `https://${host}`);
  const match = PATH_RE.exec((url.searchParams.get('p') || '').replace(/\.jpg$/i, ''));
  if (!match) return fallback(res);
  const [, version, id] = match;

  try {
    const [background, photo, logo] = await Promise.all([
      download(`${CLOUD}/c_fill,w_${WIDTH},h_${HEIGHT}/e_blur:1500/e_brightness:-20/f_jpg,q_90/${version}/${id}`),
      download(`${CLOUD}/c_fit,w_${WIDTH},h_${HEIGHT}/f_webp,q_90/${version}/${id}`),
      loadLogo(url.origin),
    ]);

    const { width = WIDTH, height = HEIGHT } = await sharp(photo).metadata();
    const left = Math.round((WIDTH - width) / 2);
    const top = Math.round((HEIGHT - height) / 2);

    /* Logoul stă în colțul din dreapta-jos AL POZEI, nu al fundalului: WhatsApp
       taie uneori previzualizarea la pătrat, pe centru, iar colțul fundalului
       s-ar pierde. Mărimea urmează poza, ca pe una îngustă să nu o acopere. */
    const size = Math.max(110, Math.min(190, Math.round(Math.min(width, height) * 0.28)));
    const right = Math.min(left + width, Math.round((WIDTH + HEIGHT) / 2));
    const mark = await sharp(logo).resize(size, size).png().toBuffer();

    const jpeg = await sharp(background)
      .composite([
        { input: photo, left, top },
        { input: mark, left: right - size - MARGIN, top: Math.min(top + height, HEIGHT) - size - MARGIN },
      ])
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(jpeg.length));
    res.setHeader('Cache-Control', CACHE_OK);
    res.end(jpeg);
  } catch {
    // Poza nu mai există sau Cloudinary nu răspunde: previzualizarea implicită.
    fallback(res);
  }
}
