import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { collapseOnto, prefersReducedMotion, EASE } from '@/lib/flip';
import { lockBodyScroll } from '@/lib/scrollLock';

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
  /** 'sheet' (implicit): foaie lipită de jos pe telefon, card pe desktop — pentru
      conținut lung (înregistrare, detalii misiune). 'modal': card centrat, cu
      margine vizibilă pe toate laturile pe orice ecran — pentru formulare scurte
      care nu trebuie să arate ca un drawer fixat pe ecran. */
  variant?: 'sheet' | 'modal';
  /** Rămâne lipit jos, în afara zonei care se derulează: acțiunea principală nu
      trebuie să dispară din ecran cât timp completezi câmpurile. Un buton de
      trimitere pus aici se leagă de formularul din `children` prin `form="id"`. */
  footer?: React.ReactNode;
}

export function Sheet({ open, onClose, title, subtitle, originRect, children, variant = 'sheet', footer }: SheetProps) {
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
    return lockBodyScroll();
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
      className={cn(
        'fixed inset-0 z-[200] flex justify-center',
        /* Modalul nu se deruleaza pe dinauntru: se deruleaza tot, ca o bucata.
           Cand continutul depaseste ecranul, cel care aluneca e invelisul asta,
           deci antetul si butonul pleaca in sus odata cu formularul si nu ramane
           nimic lipit de ecran. `items-start` + `my-auto` pe panou: centrat cat
           incape, dar fara sa i se taie capul cand nu incape — flexbox cu
           `items-center` taie exact partea de sus, la care nu mai ajungi. */
        variant === 'modal'
          ? 'items-start overflow-y-auto overscroll-contain p-4 sm:p-6'
          : 'items-end sm:items-center sm:p-6',
      )}
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
      <div className="fixed inset-0 bg-white/55 backdrop-blur-[8px] backdrop-saturate-125" />

      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'sf-glass relative z-10 flex w-full flex-col overflow-hidden',
          variant === 'modal'
            // card centrat, compact, cu margine vizibilă în jur pe orice ecran
            ? 'my-auto max-w-md rounded-[28px]'
            // telefon: foaie lipită de jos, colțuri rotunjite doar sus; desktop: card centrat
            : 'max-h-[92svh] rounded-t-[28px] sm:max-w-lg sm:rounded-[28px]',
        )}
      >
        <div
          className={cn(
            'flex items-start justify-between gap-4 border-b border-graphite/10',
            variant === 'modal' ? 'px-5 pb-3 pt-4' : 'px-6 pb-4 pt-5',
          )}
        >
          <div className="min-w-0">
            <h2 className={cn('font-heading font-semibold text-graphite', variant === 'modal' ? 'text-lg' : 'text-xl')}>{title}</h2>
            {subtitle && <p className={cn('mt-1 text-graphite-soft', variant === 'modal' ? 'text-xs' : 'text-sm')}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Închide"
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full border border-graphite/10 bg-white/80 text-graphite transition-transform hover:scale-105 active:scale-95',
              variant === 'modal' ? 'h-9 w-9' : 'h-10 w-10',
            )}
          >
            <X size={variant === 'modal' ? 16 : 18} weight="bold" />
          </button>
        </div>

        <div
          ref={bodyRef}
          data-fade={fade}
          className={cn(variant === 'modal' ? 'px-5 pt-4' : 'sf-scroll overflow-y-auto px-6 pt-5')}
          style={
            footer
              // cu subsol lipit, marginea de siguranță de jos e treaba subsolului
              ? { paddingBottom: '1rem' }
              : { paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }
          }
        >
          <div>{children}</div>
        </div>

        {/* La 'sheet' subsolul ramane lipit jos: `shrink-0` il scoate din
            impartirea spatiului, deci zona de deasupra e cea care cedeaza. La
            'modal' nu se mai lipeste nimic — e ultimul rand al cardului si
            pleaca in sus odata cu el. Marginea de siguranta de jos are sens
            doar cand chiar atinge marginea ecranului. */}
        {footer && (
          <div
            className={cn(
              'shrink-0 border-t border-graphite/10 bg-white/45',
              variant === 'modal' ? 'px-5 pb-4 pt-3' : 'px-6 pt-4',
            )}
            style={variant === 'modal' ? undefined : { paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
