import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { collapseOnto, prefersReducedMotion, EASE } from '@/lib/flip';
import { lockBodyScroll } from '@/lib/scrollLock';

/* ============================================================
   Lightbox — conținutul pe tot ecranul, curat, fără nimic în jur.

   Doar sticlă albă în spate, un buton de închidere și ce pui înăuntru.
   Crește din elementul pe care l-ai apăsat, ca tot restul sitului.

   Diferența față de Sheet: Sheet e un panou cu titlu și conținut care se
   derulează, pentru formulare. Ăsta n-are cadru deloc, e pentru media.
   ============================================================ */

interface LightboxProps {
  open: boolean;
  onClose: () => void;
  label: string;
  /** dreptunghiul elementului care l-a deschis: de acolo crește */
  originRect?: DOMRect | null;
  children: React.ReactNode;
}

export function Lightbox({ open, onClose, label, originRect, children }: LightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const didOpenRef = useRef(false);
  const flipTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    const el = stageRef.current;
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

  useLayoutEffect(() => {
    if (!open) { didOpenRef.current = false; return; }
    const el = stageRef.current;
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
    el.style.transition = 'transform 600ms cubic-bezier(0.22,1,0.36,1), opacity 280ms ease';
    el.style.transform = 'translate(0px, 0px) scale(1)';
    el.style.opacity = '1';

    // transform și will-change creează un containing block care ar strica
    // backdrop-filter la orice sticlă dinăuntru
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

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={close}
      style={{
        opacity: entered ? 1 : 0,
        transition: entered
          ? 'opacity 320ms cubic-bezier(0.16,1,0.3,1)'
          : 'opacity 240ms ease 140ms',
      }}
    >
      <div className="absolute inset-0 bg-white/55 backdrop-blur-[8px] backdrop-saturate-125" />

      <button
        onClick={(e) => { e.stopPropagation(); close(); }}
        aria-label="Închide"
        className="absolute right-4 top-4 z-[210] flex h-11 w-11 items-center justify-center rounded-full border border-graphite/10 bg-white/80 text-graphite shadow-lift backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
      >
        <X size={18} weight="bold" />
      </button>

      <div
        ref={stageRef}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-full w-full max-w-4xl items-center justify-center"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
