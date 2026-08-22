import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FlipHorizontal, ArrowsClockwise, PaperPlaneTilt } from '@phosphor-icons/react';
import './camera.css';
import { lockBodyScroll } from '@/lib/scrollLock';

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
  label?: string;
}

/* ============================================================
   Poza de la fața locului.

   Două lucruri contează aici mai mult decât aspectul:

   1. Ce vezi e ce se salvează. Oglindirea nu mai stă în două locuri (o clasă pe
      video și un desen pe pânză, care puteau ajunge să nu se potrivească); e o
      singură stare, aplicată la fel în amândouă. Implicit: fără oglindire —
      camera din spate arată lumea așa cum e, iar o poză de lucrare cu textul
      întors pe dos e inutilizabilă ca dovadă.

   2. Camera se stinge. Varianta veche oprea fluxul într-o funcție de curățenie
      care citea `stream` din prima randare, adică `null` — deci nu oprea nimic,
      iar ledul rămânea aprins după închidere. Acum fluxul stă într-un ref.

   3. Se randează prin portal, în `document.body`. Altfel rămâne prinsă în
      `<div class="relative z-10">` din App, care e context de stivuire: `z-index`
      de acolo se bate doar înăuntrul lui, iar navbarul — frate la z-99 — pictează
      peste tot ecranul camerei. Nu e o problemă de număr, ci de cutie. Sheet,
      Lightbox și notificările fac deja la fel.
   ============================================================ */

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onClose,
  label = 'Fă o poză',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* Fluxul stă în ref, nu în state: funcția de curățenie trebuie să vadă
     fluxul curent, nu pe cel de la montare. */
  const streamRef = useRef<MediaStream | null>(null);

  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mirrored, setMirrored] = useState(false);
  const [flashing, setFlashing] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    setShot(null);

    const attach = (stream: MediaStream) => {
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    };

    const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };

    /* Trei încercări, în ordinea asta, și ordinea contează.

       `exact: 'environment'` e o cerință, nu o preferință: dacă telefonul are
       cameră în spate, o primim pe aia sigur. `ideal` e doar o rugăminte, iar
       unele browsere o ignoră și dau tot camera frontală — de acolo vine, cel
       mai des, imaginea care pare întoarsă în oglindă. Camera din spate nu se
       oglindește nicăieri, pe niciun sistem.

       Dacă nu există cameră în spate (un laptop), prima încercare eșuează
       curat și coborâm la următoarea. */
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { exact: 'environment' }, ...size }, audio: false },
      { video: { facingMode: { ideal: 'environment' }, ...size }, audio: false },
      { video: true, audio: false },
    ];

    for (const constraints of attempts) {
      try {
        attach(await navigator.mediaDevices.getUserMedia(constraints));
        return;
      } catch { /* încercăm varianta următoare */ }
    }

    setError('Nu am putut porni camera. Verifică permisiunea din browser și încearcă din nou.');
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // pagina de dedesubt n-are voie să se miște cât ține ecranul tot
  useEffect(() => {
    return lockBodyScroll();
  }, []);

  // Escape închide, ca la orice fereastră care acoperă tot
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* Aceeași oglindire ca pe imaginea live, aplicată pe pânză. Aici se
       garantează că poza salvată arată exact ca previzualizarea. */
    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setShot(canvas.toDataURL('image/jpeg', 0.92));
    setFlashing(true);
    window.setTimeout(() => setFlashing(false), 340);
    stopCamera();
  };

  const send = () => {
    if (!shot) return;
    onCapture(shot);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  if (error) {
    return createPortal(
      <div className="cam" role="dialog" aria-modal="true" aria-label={label}>
        <div className="cam__bar">
          <span className="cam__title">{label}</span>
          <button type="button" className="cam__icon" onClick={onClose} aria-label="Închide">
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="cam__error" role="alert">
          <h3>Camera nu pornește</h3>
          <p>{error}</p>
          <div className="cam__verdict" style={{ marginTop: '1.25rem' }}>
            <button type="button" className="cam__btn cam__btn--again" onClick={onClose}>
              Închide
            </button>
            <button type="button" className="cam__btn cam__btn--send" onClick={startCamera}>
              Încearcă din nou
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className={`cam${mirrored ? ' cam--mirror' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="cam__bar">
        {/* Oglinda: implicit oprită. E aici pentru că unele telefoane întorc
            singure imaginea de la camera frontală, iar atunci un singur apăsat
            o pune la loc — și pe previzualizare, și pe poză. */}
        {!shot ? (
          <button
            type="button"
            className="cam__icon"
            data-on={mirrored ? 'true' : 'false'}
            onClick={() => setMirrored(v => !v)}
            aria-pressed={mirrored}
            title="Întoarce imaginea în oglindă"
            aria-label="Întoarce imaginea în oglindă"
          >
            <FlipHorizontal size={18} weight="bold" />
          </button>
        ) : (
          <span className="cam__icon" style={{ visibility: 'hidden' }} aria-hidden="true" />
        )}

        <span className="cam__title">{shot ? 'Iese bine?' : label}</span>

        <button type="button" className="cam__icon" onClick={onClose} aria-label="Închide">
          <X size={18} weight="bold" />
        </button>
      </div>

      <div className="cam__stage">
        {shot ? (
          <img src={shot} alt="Poza făcută" className="cam__shot" />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="cam__view"
            />
            <div className="cam__grid" aria-hidden="true" />
          </>
        )}
        {flashing && <div className="cam__flash" aria-hidden="true" />}
      </div>

      <div className="cam__deck">
        {shot ? (
          <div className="cam__verdict">
            <button type="button" className="cam__btn cam__btn--again" onClick={startCamera}>
              <ArrowsClockwise size={18} weight="bold" aria-hidden="true" />
              Mai fac una
            </button>
            <button type="button" className="cam__btn cam__btn--send" onClick={send}>
              <PaperPlaneTilt size={18} weight="fill" aria-hidden="true" />
              Trimite poza
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="cam__shutter"
              onClick={capture}
              aria-label="Fă poza"
            />
            <p className="cam__hint">Prinde toată lucrarea în cadru.</p>
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>,
    document.body,
  );
};
