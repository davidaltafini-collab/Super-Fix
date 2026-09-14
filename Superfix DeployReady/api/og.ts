/* ============================================================
   Poza de previzualizare (WhatsApp, Facebook, Google): poza meseriașului pe
   un fundal făcut din ea însăși, cu logoul Super-Fix (public/logo.png) în colț.

   Cloudinary face fundalul încețoșat și încadrează poza peste el, într-o
   singură imagine. Logoul nu-l poate lipi el: pe contul nostru tipul `fetch` e
   restricționat, deci nu ia imagini de la alte adrese. Îl lipim aici, pixel cu
   pixel, în JavaScript curat (jpeg-js).

   E funcție Edge, ca ssr.ts și geo.ts: pe proiectul ăsta orice funcție Node
   pică la build (14 sept), iar cele Edge trec.

   Adresa: /og/<versiune>/<id>.jpg (rewrite în vercel.json). Versiunea e în
   adresă, deci o poză nouă înseamnă altă adresă, iar răspunsul poate sta mult
   în cache. Se generează o dată; după aceea îl dă CDN-ul Vercel.
   ============================================================ */
import jpeg from 'jpeg-js';

export const config = { runtime: 'edge' };

const CLOUD = 'https://res.cloudinary.com/dnsmgqllf/image/upload';
const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 24;
const QUALITY = 82;
const DOWNLOAD_TIMEOUT_MS = 6000;
const FALLBACK = '/og-default.jpg';
const CACHE_OK = 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400';

/* Doar poze de pe contul nostru: `v123/id` sau `v123/folder/id`, fără extensie.
   Nimic altceva nu ajunge într-o adresă cerută de funcție. */
const PATH_RE = /^(v\d{1,12})\/([A-Za-z0-9_-]{1,120}(?:\/[A-Za-z0-9_-]{1,120}){0,5})$/;

type Pixels = { width: number; height: number; data: Uint8Array };

async function download(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function fallback(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: FALLBACK, 'Cache-Control': 'public, s-maxage=300' },
  });
}

/* PNG → pixeli RGBA. Știe doar formatul lui logo.png (RGBA pe 8 biți, fără
   întrețesere); orice alt fișier aruncă eroare și se dă previzualizarea implicită. */
async function decodePng(bytes: Uint8Array): Promise<Pixels> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('logo.png: aștept RGBA pe 8 biți');
    } else if (type === 'IDAT') {
      parts.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }

  const stream = new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const stride = width * 4;
  if (!width || raw.length < (stride + 1) * height) throw new Error('logo.png incomplet');

  // Fiecare rând începe cu filtrul lui (0–4), aplicat față de vecinii deja decodați.
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? data[row + x - 4] : 0;
      const up = y ? data[row - stride + x] : 0;
      const corner = x >= 4 && y ? data[row - stride + x - 4] : 0;
      let value = raw[line + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const guess = left + up - corner;
        const toLeft = Math.abs(guess - left);
        const toUp = Math.abs(guess - up);
        const toCorner = Math.abs(guess - corner);
        value += toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner;
      }
      data[row + x] = value; // Uint8Array păstrează restul la 256, cum cere PNG
    }
  }
  return { width, height, data };
}

/* Micșorare prin medie pe arie (1024 px → ~190 px), cu alfa premultiplicat, ca
   marginile logoului să nu capete contur închis. */
function shrink(source: Pixels, size: number): Pixels {
  const data = new Uint8Array(size * size * 4);
  const stepX = source.width / size;
  const stepY = source.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * stepY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * stepY));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * stepX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * stepX));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * source.width + xx) * 4;
          const alpha = source.data[i + 3];
          r += source.data[i] * alpha;
          g += source.data[i + 1] * alpha;
          b += source.data[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const o = (y * size + x) * 4;
      if (a) {
        data[o] = Math.round(r / a);
        data[o + 1] = Math.round(g / a);
        data[o + 2] = Math.round(b / a);
      }
      data[o + 3] = Math.round(a / n);
    }
  }
  return { width: size, height: size, data };
}

function paste(image: Pixels, mark: Pixels, left: number, top: number): void {
  for (let y = 0; y < mark.height; y++) {
    const py = top + y;
    if (py < 0 || py >= image.height) continue;
    for (let x = 0; x < mark.width; x++) {
      const px = left + x;
      if (px < 0 || px >= image.width) continue;
      const m = (y * mark.width + x) * 4;
      const alpha = mark.data[m + 3] / 255;
      if (!alpha) continue;
      const p = (py * image.width + px) * 4;
      for (let c = 0; c < 3; c++) {
        image.data[p + c] = Math.round(mark.data[m + c] * alpha + image.data[p + c] * (1 - alpha));
      }
    }
  }
}

/* jpeg-js dă rezultatul prin `Buffer.from(octeți)`, iar pe Edge `Buffer` nu
   există. Îi punem exact funcția asta, doar cât durează codarea, și numai dacă
   lipsește (codarea e sincronă, deci nimic altceva nu rulează între timp). */
function encodeJpeg(image: Pixels): Uint8Array {
  const scope = globalThis as { Buffer?: unknown };
  const missing = scope.Buffer === undefined;
  if (missing) scope.Buffer = { from: (bytes: ArrayLike<number>) => Uint8Array.from(bytes) };
  try {
    return new Uint8Array(jpeg.encode(image, QUALITY).data);
  } finally {
    if (missing) delete scope.Buffer;
  }
}

let logo: Promise<Pixels> | null = null;
const marks = new Map<number, Pixels>();

/* Logoul vine de pe site (public/logo.png), o dată pe instanță. */
function loadLogo(origin: string): Promise<Pixels> {
  if (!logo) {
    logo = download(`${origin}/logo.png`).then(async res => decodePng(new Uint8Array(await res.arrayBuffer())));
    logo.catch(() => { logo = null; });
  }
  return logo;
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const match = PATH_RE.exec((url.searchParams.get('p') || '').replace(/\.jpg$/i, ''));
  if (!match) return fallback();
  const [, version, id] = match;
  const frame = `c_fit,w_${WIDTH},h_${HEIGHT}`;

  try {
    const [composed, info, source] = await Promise.all([
      download(
        `${CLOUD}/c_fill,w_${WIDTH},h_${HEIGHT}/e_blur:1500/e_brightness:-20/l_${id.replace(/\//g, ':')}/${frame}/fl_layer_apply,g_center/f_jpg,q_90/${version}/${id}.jpg`,
      ).then(res => res.arrayBuffer()),
      // Cât iese poza încadrată, fără fundal: logoul se așază după ea.
      download(`${CLOUD}/${frame}/fl_getinfo/${version}/${id}.jpg`)
        .then(res => res.json() as Promise<{ output?: { width?: number; height?: number } }>),
      loadLogo(url.origin),
    ]);

    const image: Pixels = jpeg.decode(new Uint8Array(composed), {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 2,
      maxMemoryUsageInMB: 64,
    });
    const width = info.output?.width ?? WIDTH;
    const height = info.output?.height ?? HEIGHT;
    const left = Math.round((WIDTH - width) / 2);
    const top = Math.round((HEIGHT - height) / 2);

    /* Logoul stă în colțul din dreapta-jos AL POZEI, nu al fundalului: WhatsApp
       taie uneori previzualizarea la pătrat, pe centru, iar colțul fundalului
       s-ar pierde. Mărimea urmează poza, ca pe una îngustă să nu o acopere. */
    const size = Math.max(110, Math.min(190, Math.round(Math.min(width, height) * 0.28)));
    const right = Math.min(left + width, Math.round((WIDTH + HEIGHT) / 2));
    let mark = marks.get(size);
    if (!mark) {
      mark = shrink(source, size);
      marks.set(size, mark);
    }
    paste(image, mark, right - size - MARGIN, Math.min(top + height, HEIGHT) - size - MARGIN);

    return new Response(encodeJpeg(image), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE_OK },
    });
  } catch {
    // Poza nu mai există sau Cloudinary nu răspunde: previzualizarea implicită.
    return fallback();
  }
}
