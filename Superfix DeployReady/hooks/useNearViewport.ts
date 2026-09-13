import { useEffect, useRef, type RefObject } from 'react';

/* ============================================================
   „Omul a ajuns aproape": cheamă `onNear` când elementul intră în zona
   `rootMargin` din jurul ecranului.

   Pentru încărcarea treptată: un element gol pus la finalul listei, iar când
   omul derulează spre el, venim cu bucata următoare — înainte să vadă capătul,
   nu după.

   `resetKey`: la fiecare schimbare observatorul se reface și raportează din nou
   starea de acum. Fără asta, dacă după o încărcare elementul e tot în zonă
   (ecran înalt, bucată scurtă), IntersectionObserver nu mai anunță nimic — el
   anunță doar intrările, nu și faptul că stai deja acolo.
   ============================================================ */
export function useNearViewport(
  ref: RefObject<Element | null>,
  onNear: () => void,
  { enabled = true, rootMargin = '600px 0px', resetKey }: { enabled?: boolean; rootMargin?: string; resetKey?: unknown } = {},
): void {
  // Mereu ultima variantă a funcției, fără să refacem observatorul la fiecare desenare.
  const callback = useRef(onNear);
  callback.current = onNear;

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      entries => { if (entries.some(entry => entry.isIntersecting)) callback.current(); },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, enabled, rootMargin, resetKey]);
}
