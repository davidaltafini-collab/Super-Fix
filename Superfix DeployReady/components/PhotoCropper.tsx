import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react';
import './cropper.css';

/* ============================================================
   Așezarea pozei de profil.

   De ce există: aceeași poză apare pe sit pătrată (listele de eroi, fișa din
   admin) și rotundă (legitimația, discul de lângă nume). Lăsată cum vine din
   telefon — verticală, cu omul într-un colț — iese tăiată altfel în fiecare loc.
   Aici o aduce el unde vrea, o dată, și pleacă un pătrat curat.

   Ce iese: un JPEG de 900×900. Marginea de sus a fișierelor e și ea rezolvată
   din asta — o poză de 8MB din telefon ajunge la câteva sute de kiloocteți, deci
   se urcă și pe date mobile, la fața locului.

   Ce NU trece pe aici: pozele de lucrare (înainte/după). Alea sunt dovezi și nu
   se decupează niciodată.
   ============================================================ */

const OUT = 900;          // latura fișierului care pleacă
const MAX_ZOOM = 4;

interface PhotoCropperProps {
  file: File;
  onDone: (cropped: File) => void;
  onCancel: () => void;
  title?: string;
}

export const PhotoCropper: React.FC<PhotoCropperProps> = ({
  file, onDone, onCancel, title = 'Așază poza',
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [src, setSrc] = useState('');
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState(0);          // latura ramei, în pixeli de ecran
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);

  /* Adresa temporară a fișierului. `URL.revokeObjectURL` la ieșire, altfel
     fișierul rămâne ținut în memorie cât ține fila deschisă. */
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // pagina de dedesubt stă pe loc cât ține ecranul tot
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  /* Rama e cât încape în scenă, cu puțin aer. Se remăsoară la rotirea
     telefonului — altfel rama rămâne de la ecranul dinainte. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const box = stage.getBoundingClientRect();
      setFrame(Math.max(160, Math.min(box.width, box.height) - 48));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  /** Cât trebuie mărită poza ca să acopere rama la mărire 1. */
  const baseScale = natural && frame
    ? frame / Math.min(natural.w, natural.h)
    : 1;
  const effective = baseScale * zoom;

  /** Cât se poate trage într-o parte fără să iasă marginea în ramă. */
  const limits = natural && frame
    ? {
        x: Math.max(0, (natural.w * effective - frame) / 2),
        y: Math.max(0, (natural.h * effective - frame) / 2),
      }
    : { x: 0, y: 0 };

  const clamp = useCallback((next: { x: number; y: number }, lim = limits) => ({
    x: Math.max(-lim.x, Math.min(lim.x, next.x)),
    y: Math.max(-lim.y, Math.min(lim.y, next.y)),
  }), [limits.x, limits.y]);

  // când se schimbă mărirea, ce era în ramă trebuie să rămână în ramă
  useEffect(() => { setOffset(current => clamp(current)); }, [zoom, frame, clamp]);

  /* ---------------- tras cu degetul sau cu mouse-ul ---------------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragFrom = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchFrom = useRef<{ dist: number; zoom: number } | null>(null);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragFrom.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    } else if (pointers.current.size === 2) {
      dragFrom.current = null;
      pinchFrom.current = { dist: distance(), zoom };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchFrom.current) {
      const ratio = distance() / (pinchFrom.current.dist || 1);
      setZoom(Math.max(1, Math.min(MAX_ZOOM, pinchFrom.current.zoom * ratio)));
      return;
    }
    if (dragFrom.current) {
      const from = dragFrom.current;
      setOffset(clamp({ x: from.ox + (e.clientX - from.x), y: from.oy + (e.clientY - from.y) }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchFrom.current = null;
    if (pointers.current.size === 0) dragFrom.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    setZoom(current => Math.max(1, Math.min(MAX_ZOOM, current - e.deltaY * 0.0016)));
  };

  /* ---------------- ce iese ---------------- */

  const confirm = async () => {
    const image = imgRef.current;
    if (!image || !natural || !frame) return;
    setWorking(true);

    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setWorking(false); return; }

    /* Fundal alb: un PNG cu transparență devine negru la conversia în JPEG, iar
       poza de profil ar ieși cu colțuri negre. */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = 'high';

    // aceeași socoteală ca pe ecran, doar la altă scară
    const ratio = OUT / frame;
    const drawW = natural.w * effective * ratio;
    const drawH = natural.h * effective * ratio;
    const drawX = OUT / 2 + offset.x * ratio - drawW / 2;
    const drawY = OUT / 2 + offset.y * ratio - drawH / 2;
    ctx.drawImage(image, drawX, drawY, drawW, drawH);

    /* WebP unde se poate: la aceeași calitate vizuală iese cam pe jumătate față
       de JPEG. Safari vechi nu știe să scrie WebP, deci întrebăm pânza, nu
       presupunem. */
    const type = canvas.toDataURL('image/webp').startsWith('data:image/webp')
      ? 'image/webp'
      : 'image/jpeg';
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, type, 0.86),
    );
    setWorking(false);
    if (!blob) { onCancel(); return; }

    const name = file.name.replace(/\.[^.]+$/, '') || 'poza';
    const ext = type === 'image/webp' ? 'webp' : 'jpg';
    onDone(new File([blob], `${name}.${ext}`, { type }));
  };

  /* Dacă browserul nu poate deschide fișierul — un HEIC de iPhone în Chrome, de
     exemplu — nu-l ținem pe om blocat într-un ecran gol: trimitem originalul mai
     departe, cum se întâmpla și înainte de decupaj. */
  const onImageError = () => onDone(file);

  if (typeof document === 'undefined') return null;

  const ready = Boolean(natural && frame);
  const safe = frame * 0.9; // cercul, puțin sub latura ramei

  return createPortal(
    <div className="crop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="crop__bar">
        <button type="button" className="crop__icon" onClick={onCancel} aria-label="Renunță">
          <X size={18} weight="bold" />
        </button>
        <span className="crop__title">{title}</span>
        <span className="crop__icon" style={{ visibility: 'hidden' }} aria-hidden="true" />
      </div>

      <div
        ref={stageRef}
        className="crop__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {src && (
          <img
            ref={imgRef}
            src={src}
            alt=""
            className="crop__img"
            onLoad={e => {
              const el = e.currentTarget;
              setNatural({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            onError={onImageError}
            style={natural ? {
              width: natural.w * effective,
              height: natural.h * effective,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              // `translate` din foaia de stil face centrarea; `transform` doar mută
            } : { opacity: 0 }}
          />
        )}

        {ready && (
          <>
            <div className="crop__frame" style={{ width: frame, height: frame }} />
            <div className="crop__safe" style={{ width: safe, height: safe }} />
          </>
        )}
      </div>

      <div className="crop__deck">
        <p className="crop__hint">
          Trage poza și potrivește fața în cerc. Din el nu se pierde nimic, oriunde apare.
        </p>

        <div className="crop__zoom">
          <MagnifyingGlassMinus size={17} weight="bold" aria-hidden="true" />
          <input
            type="range"
            className="crop__range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            aria-label="Mărește poza"
          />
          <MagnifyingGlassPlus size={17} weight="bold" aria-hidden="true" />
        </div>

        <div className="crop__buttons">
          <button type="button" className="crop__btn crop__btn--back" onClick={onCancel}>
            Renunță
          </button>
          <button
            type="button"
            className="crop__btn crop__btn--ok"
            onClick={confirm}
            disabled={!ready || working}
          >
            <Check size={18} weight="bold" aria-hidden="true" />
            {working ? 'O pregătesc…' : 'Gata'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
