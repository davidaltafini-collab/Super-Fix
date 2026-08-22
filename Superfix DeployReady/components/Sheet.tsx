import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { collapseOnto, prefersReducedMotion, EASE } from '@/lib/flip';

/* ============================================================
   Sheet — panoul care crește din butonul apăsat.

   Pe telefon urcă de jos ca o foaie; pe desktop e un card centrat. Același
   conținut, aceeași mișcare, un singur component.

   Respectă limbajul de mișcare al sitului: present 600 / dismiss 400, curbă cu
   salt la intrare și curbă echilibrată la ieșire, sticlă albă în loc de scrim
   negru, iar fade-ul de închidere se suprapune peste drum ca panoul să nu
   ajungă vizibil la destinație și apoi să dispară brusc.
   ============================================================ */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** text mic sub titlu */
  subtitle?: string;
  /** dreptunghiul butonului care l-a deschis: de acolo crește */
  originRect?: DOMRect | null;
  children: React.ReactNode;
}

export function Sheet({ open, onClose, title, subtitle, originRect, children }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [fade, setFade] = useState<'none' | 'top' | 'bottom' | 'both'>('none');
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const didOpenRef = useRef(false);
  const flipTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    const el = panelRef.current;
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    if (el && originRect && !prefersReducedMotion()) {
      el.style.willChange = 'transform';
      const collapsed = collapseOnto(el, originRect);
      if (collapsed) {
        el.style.transition = `transform 400ms ${EASE.dismiss}, opacity 280ms ease 100ms`;
        el.style.transform = collapsed;
        el.style.opacity = '0';
      }
    }
    setEntered(false);
    onClose();
    setTimeout(() => setMounted(false), 420);
  }, [onClose, originRect]);

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // creșterea din buton
  useLayoutEffect(() => {
    if (!open) { didOpenRef.current = false; return; }
    const el = panelRef.current;
    if (!el || didOpenRef.current) return;
    didOpenRef.current = true;

    if (!originRect || prefersReducedMotion()) {
      el.style.transform = '';
      el.style.opacity = '';
      return;
    }
    const collapsed = collapseOnto(el, originRect);
    if (!collapsed) return;

    el.style.willChange = 'transform';
    el.style.transition = 'none';
    el.style.transform = collapsed;
    el.style.opacity = '0';
    void el.offsetWidth; // reflow, altfel browserul comasează cele două stări
    el.style.transition = `transform 600ms cubic-bezier(0.22,1,0.36,1), opacity 280ms ease`;
    el.style.transform = 'translate(0px, 0px) scale(1)';
    el.style.opacity = '1';

    // transform și will-change creează un containing block care ar strica
    // backdrop-filter la orice element de sticlă dinăuntru
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    flipTimer.current = window.setTimeout(() => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
    }, 640);

    return () => { if (flipTimer.current) window.clearTimeout(flipTimer.current); };
  }, [open, mounted, originRect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // blocarea scroll-ului, în efect separat care depinde DOAR de open
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  /* Cât mai e de derulat: de asta depinde unde se stinge conținutul.

     Fără bară de derulare nu mai rămâne niciun semn că panoul continuă, așa că
     marginea prin care mai ai unde să mergi devine ea semnul. Urmărim și
     înălțimea conținutului, nu doar derularea: harta apare după ce vin
     coordonatele, iar erorile apar la trimitere. */
  useEffect(() => {
    const el = bodyRef.current;
    if (!mounted || !el) return;

    const update = () => {
      const above = el.scrollTop > 4;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
      setFade(above && below ? 'both' : above ? 'top' : below ? 'bottom' : 'none');
    };

    update();
    el.addEventListener('scroll', update, { passive: true });

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);

    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [mounted]);

  // focus pe primul câmp, ca la orice dialog
  useEffect(() => {
    if (!open || !mounted) return;
    const t = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('input:not([type="checkbox"]), textarea, button')
        ?.focus();
    }, 320);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={close}
      style={{
        opacity: entered ? 1 : 0,
        transition: entered
          ? 'opacity 320ms cubic-bezier(0.16,1,0.3,1)'
          : 'opacity 240ms ease 140ms',
      }}
    >
      <div className="absolute inset-0 bg-white/55 backdrop-blur-[8px] backdrop-saturate-125" />

      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'sf-glass relative z-10 flex w-full max-h-[92dvh] flex-col overflow-hidden',
          // telefon: foaie lipită de jos, colțuri rotunjite doar sus
          'rounded-t-[28px]',
          // desktop: card centrat
          'sm:max-w-lg sm:rounded-[28px]',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-graphite/10 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold text-graphite">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-graphite-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Închide"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-graphite/10 bg-white/80 text-graphite transition-transform hover:scale-105 active:scale-95"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div
          ref={bodyRef}
          data-fade={fade}
          className="sf-scroll overflow-y-auto px-6 pt-5"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <div>{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
