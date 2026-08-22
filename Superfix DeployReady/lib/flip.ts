/* Helperele de mișcare comune întregului site.

   Regula de bază a limbajului: nimic nu apare din senin, totul vine de undeva.
   Când un panou se deschide, pornește din elementul pe care l-ai apăsat și crește
   până la locul lui. Tehnica se numește FLIP: măsori poziția finală, calculezi
   transformarea care o suprapune peste cea de start, o aplici, apoi o lași să se
   anuleze. Browserul animează o singură proprietate, `transform`, deci merge pe GPU. */

/** Durate: prezentarea e mereu mai lentă decât închiderea. Deschizi ca să
 *  privești, închizi ca să pleci. */
export const DURATION = {
  micro: 150,
  state: 300,
  dismiss: 400,
  present: 600,
} as const;

export const EASE = {
  /** intrare cu salt: al doilea punct de control depășește 1, deci trece de țintă și revine */
  entry: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** așezare fără depășire: obligatoriu la orice mișcare de întoarcere */
  settle: 'cubic-bezier(0.32, 0.72, 0, 1)',
  /** echilibrată: distribuie mișcarea uniform, deci un fade se poate suprapune peste ea */
  dismiss: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/**
 * Transformarea care aduce `el`, de la mărimea și locul lui final, exact peste
 * dreptunghiul `from`. Aplicată direct, îl strânge acolo. Aplicată invers
 * (transform gol), îl face să crească de acolo.
 *
 * Întoarce null dacă elementul n-are încă dimensiuni.
 */
export function collapseOnto(el: HTMLElement, from: DOMRect): string | null {
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return null;
  const scale = Math.max(from.width / to.width, 0.06);
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
