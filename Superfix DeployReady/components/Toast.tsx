import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, WarningCircle, Info, X } from '@phosphor-icons/react';

import './toast.css';

/* ============================================================
   Notificări și confirmări, în locul ferestrelor sistemului de operare.

   `alert()` și `confirm()` arată altfel pe fiecare browser, blochează firul de
   execuție și n-au nicio legătură cu designul paginii.

   Tot stilul stă în toast.css. Aici e doar logica: cine apare, cât stă și cum
   răspunde confirmarea.
   ============================================================ */

type ToastTone = 'success' | 'error' | 'info';

const LIFE: Record<ToastTone, number> = {
  success: 4000,
  info: 4500,
  // erorile stau mai mult: omul trebuie să apuce să citească ce a greșit
  error: 6500,
};

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** Întoarce o promisiune: `if (!(await confirm('...'))) return;` */
  confirm: (
    message: string,
    options?: { confirmLabel?: string; danger?: boolean },
  ) => Promise<boolean>;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast trebuie folosit în interiorul <ToastProvider>');
  return ctx;
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle size={24} weight="fill" />,
  error: <WarningCircle size={24} weight="fill" />,
  info: <Info size={24} weight="fill" />,
};

/* ---------------- o notificare ---------------- */

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: number) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ item, onDismiss }) => {
  const [state, setState] = useState<'idle' | 'in' | 'out'>('idle');
  // ref stabil: altfel efectul s-ar relua la fiecare randare a providerului
  // și cronometrul ar porni mereu de la capăt
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setState('in'));
    const leave = window.setTimeout(() => setState('out'), LIFE[item.tone]);
    const gone = window.setTimeout(() => dismissRef.current(item.id), LIFE[item.tone] + 320);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(leave);
      window.clearTimeout(gone);
    };
  }, [item.id, item.tone]);

  const close = () => {
    setState('out');
    window.setTimeout(() => dismissRef.current(item.id), 300);
  };

  return (
    <div
      className="sf-toast"
      data-tone={item.tone}
      data-state={state === 'idle' ? undefined : state}
      style={{ ['--life' as string]: `${LIFE[item.tone]}ms` }}
      role={item.tone === 'error' ? 'alert' : 'status'}
      aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="sf-toast__icon" aria-hidden="true">{ICONS[item.tone]}</span>
      <p className="sf-toast__text">{item.message}</p>
      <button type="button" onClick={close} aria-label="Închide" className="sf-toast__close">
        <X size={15} weight="bold" />
      </button>
      <span className="sf-toast__life" aria-hidden="true" />
    </div>
  );
};

/* ---------------- confirmarea ---------------- */

interface ConfirmDialogProps {
  request: ConfirmRequest;
  onAnswer: (ok: boolean) => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ request, onAnswer }) => {
  const [shown, setShown] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    // focusul cade pe Renunță, niciodată pe acțiunea distructivă
    const t = window.setTimeout(() => cancelRef.current?.focus(), 260);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answerRef.current(false);
      if (e.key === 'Enter') answerRef.current(true);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="sf-confirm"
      data-state={shown ? 'in' : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={request.message}
      onClick={() => onAnswer(false)}
    >
      <div className="sf-confirm__scrim" />
      <div
        className="sf-confirm__card"
        data-danger={String(request.danger)}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="sf-confirm__icon" aria-hidden="true">
          <WarningCircle size={30} weight="fill" />
        </span>
        <p className="sf-confirm__message">{request.message}</p>
        <div className="sf-confirm__actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onAnswer(false)}
            className="sf-confirm__btn sf-confirm__btn--ghost"
          >
            Renunță
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className={`sf-confirm__btn ${request.danger ? 'sf-confirm__btn--danger' : 'sf-confirm__btn--go'}`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------------- providerul ---------------- */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const push = (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      // maxim trei odată: peste atât devine zid, nu notificare
      setItems((prev) => [...prev.slice(-2), { id, tone, message }]);
    };
    return {
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
      confirm: (message, options) =>
        new Promise<boolean>((resolve) => {
          setRequest({
            message,
            confirmLabel: options?.confirmLabel ?? 'Confirm',
            danger: options?.danger ?? false,
            resolve,
          });
        }),
    };
  }, []);

  const answer = useCallback((ok: boolean) => {
    setRequest((current) => {
      // rezolvarea iese din actualizarea de stare: în StrictMode updater-ul
      // e apelat de două ori, iar promisiunea nu are ce căuta acolo
      if (current) queueMicrotask(() => current.resolve(ok));
      return null;
    });
  }, []);

  const canPortal = typeof document !== 'undefined';

  return (
    <ToastContext.Provider value={api}>
      {children}
      {canPortal && createPortal(
        <div className="sf-toasts">
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
      {canPortal && request && createPortal(
        <ConfirmDialog request={request} onAnswer={answer} />,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
