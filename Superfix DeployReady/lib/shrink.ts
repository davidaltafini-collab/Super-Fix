/* ============================================================
   Micșorarea fișierelor înainte să plece de pe telefon.

   Livrarea e deja rezolvată: `lib/img.ts` cere de la Cloudinary `f_auto,q_auto`,
   deci vizitatorul primește WebP sau AVIF, la lățimea de care are nevoie. Ce nu
   era rezolvat e capătul celălalt — ce urcă meseriașul.

   Un iPhone dă o poză de 12 megapixeli, 4–6MB. Din ea, pe sit, se folosesc în
   cel mai bun caz 1600 de pixeli pe latura mare. Restul se urcă degeaba: pe
   datele lui, în stocarea noastră, în fiecare copie de siguranță. La 80.000 de
   meseriași diferența nu se mai măsoară în megaocteți.

   Aici o aducem la ce se folosește, în WebP, în browser, înainte de urcare. Un
   procesor de telefon face treaba asta în sub o secundă.

   Două reguli pe care codul le respectă strict:

   1. Nu stricăm niciodată originalul. Dacă ceva nu merge — format necunoscut,
      pânză blocată, memorie insuficientă — pleacă fișierul așa cum a venit.
   2. Nu întoarcem niciodată un fișier mai mare decât cel primit. La o poză deja
      mică, sau la una cu mult zgomot, reîncodarea poate ieși mai grasă; atunci
      păstrăm originalul.
   ============================================================ */

export interface ShrinkOptions {
  /** latura mare, în pixeli; peste atât nu se folosește nicăieri pe sit */
  maxEdge?: number;
  /** 0–1; 0.82 e pragul de la care ochiul nu mai vede diferența pe fotografii */
  quality?: number;
}

const DEFAULTS = { maxEdge: 1600, quality: 0.82 };

/** WebP la codare nu e universal (Safari vechi). Se întreabă o singură dată. */
let webpSupport: boolean | null = null;

function canWriteWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    webpSupport = probe.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

/**
 * Deschide fișierul ca imagine, cu orientarea din EXIF aplicată.
 *
 * `createImageBitmap` decodează în afara firului principal, deci interfața nu
 * îngheață la o poză de 12MP. Unde nu există, cădem pe `<img>`, care aplică și
 * el orientarea în browserele curente.
 */
async function openImage(file: File): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, w: bitmap.width, h: bitmap.height };
    } catch {
      /* unele formate (HEIC) nu trec pe aici; încercăm varianta clasică */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return { source: image, w: image.naturalWidth, h: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const kb = (bytes: number) => Math.round(bytes / 1024);

export async function shrinkImage(file: File, options: ShrinkOptions = {}): Promise<File> {
  const maxEdge = options.maxEdge ?? DEFAULTS.maxEdge;
  const quality = options.quality ?? DEFAULTS.quality;

  if (!file.type.startsWith('image/')) return file;

  /* Deja mică și deja în formatul bun — de pildă ce iese din decupaj. A doua
     reîncodare n-ar câștiga nimic și ar mai lua o dată din calitate. */
  if (file.type === 'image/webp' && file.size < 400 * 1024) return file;

  try {
    const { source, w, h } = await openImage(file);
    if (!w || !h) return file;

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const width = Math.round(w * scale);
    const height = Math.round(h * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    /* Fundal alb: un PNG cu transparență ar ieși cu zone negre după conversie. */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);

    // bitmap-urile țin memorie până sunt închise explicit
    if ('close' in source && typeof (source as ImageBitmap).close === 'function') {
      (source as ImageBitmap).close();
    }

    const type = canWriteWebp() ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob) return file;

    // regula 2: nu urcăm ceva mai greu decât ce ne-a dat
    if (blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') || 'poza';
    const ext = type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${name}.${ext}`, { type, lastModified: Date.now() });
  } catch {
    // regula 1: orice s-ar întâmpla, pleacă originalul
    return file;
  }
}

/** Pentru mesaje: „4,1MB → 280KB". Se vede că merită. */
export function sizeChange(before: number, after: number) {
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1).replace('.', ',');
  return before >= 1024 * 1024
    ? `${mb(before)}MB → ${after >= 1024 * 1024 ? `${mb(after)}MB` : `${kb(after)}KB`}`
    : `${kb(before)}KB → ${kb(after)}KB`;
}

/* ============================================================
   Clipurile.

   Aici browserul nu poate face mare lucru: transcodarea ar cere ffmpeg compilat
   în WebAssembly, câteva megaocteți de bibliotecă și un minut de așteptare pe un
   telefon mediu — pentru un clip de 30 de secunde nu merită, iar pe teren, cu
   bateria la 20%, e chiar rău.

   Reducerea propriu-zisă se face la Cloudinary, prin preset (vezi documentul de
   backend). Ce putem face aici e să nu-l lăsăm să ardă 50MB de date mobile
   pentru un fișier care oricum n-are ce căuta: îl măsurăm înainte de urcare.
   ============================================================ */

export interface VideoFacts {
  width: number;
  height: number;
  seconds: number;
}

/** Citește dimensiunile și durata fără să încarce tot fișierul. */
export function readVideoFacts(file: File): Promise<VideoFacts | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    // fără asta, iOS refuză să citească metadatele fără interacțiune
    video.muted = true;
    (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;

    let timer = 0;
    let settled = false;
    const done = (facts: VideoFacts | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(facts);
    };

    video.onloadedmetadata = () => done({
      width: video.videoWidth,
      height: video.videoHeight,
      seconds: Number.isFinite(video.duration) ? video.duration : 0,
    });
    video.onerror = () => done(null);
    // un fișier stricat poate să nu declanșeze niciun eveniment
    timer = window.setTimeout(() => done(null), 8000);

    video.src = url;
  });
}

/**
 * Ce e în neregulă cu clipul, spus pe limba omului — sau `null` dacă e bun.
 *
 * Nu blocăm pentru rezoluție prea mare: aia o rezolvă serverul la primire, iar
 * un meseriaș n-are cum să schimbe setările camerei ca să ne facă nouă pe plac.
 * Blocăm doar ce chiar e de mâna lui: un clip prea lung.
 */
export function videoComplaint(facts: VideoFacts | null, maxSeconds = 90): string | null {
  if (!facts) return null; // nu-l oprim pentru ceva ce n-am putut măsura
  if (facts.seconds > maxSeconds) {
    const minutes = Math.round(facts.seconds / 60);
    return `Clipul are ${minutes >= 2 ? `${minutes} minute` : 'peste un minut'}. Treizeci de secunde spun tot ce trebuie — taie-l și încearcă din nou.`;
  }
  return null;
}
