import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SuperfixMark } from './SuperfixMark';
import './loader.css';

/* ============================================================
   Așteptarea, în trei forme.

   `Skel` — când știi ce formă are pagina. Omul vede deja unde va fi fiecare
   lucru, iar când vin datele nimic nu se mută. E prima alegere, mereu.

   `PageLoader` — însemnul, centrat, când nu poți ghici forma.

   `LoadingVeil` — vălul alb peste tot ecranul, pentru „în caz de orice": o rută
   care își aduce codul, un moment în care chiar se mișcă greu. Se ține cu
   `VeilHold` sau cu `useVeil()`, se numără cine îl ține, și dispare când n-a
   mai rămas nimeni.

   Peste tot același prag de 350ms: dacă lucrul se termină mai repede, nu apare
   nimic. Un loader care clipește o zecime de secundă arată mai rău decât
   niciunul.
   ============================================================ */

const SHOW_AFTER = 350;

/** Întârzie apariția; sub prag nu se arată nimic. */
function useAfter(delay: number): boolean {
  const [ready, setReady] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setReady(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  return ready;
}

/* ---------------- însemnul ---------------- */

interface SuperfixLoaderProps {
  /** latura însemnului, în px */
  size?: number;
  /** text sub el; fără el rămâne doar însemnul */
  label?: string;
  /** false = însemnul stă asamblat și nemișcat (folosit la ieșire) */
  animate?: boolean;
  className?: string;
}

export const SuperfixLoader: React.FC<SuperfixLoaderProps> = ({
  size = 120,
  label,
  animate = true,
  className,
}) => (
  <div
    className={cn('sf-loader', className)}
    style={{ ['--sf-loader-size' as string]: `${size}px` }}
    role="status"
    aria-live="polite"
  >
    <div className="sf-loader__badge">
      <SuperfixMark animate={animate} />
    </div>
    {label && <p className="sf-loader__label">{label}</p>}
    <span className="sr-only">{label || 'Se încarcă'}</span>
  </div>
);

/* ---------------- vălul ---------------- */

interface VeilApi {
  /** ține vălul; funcția întoarsă îl eliberează */
  hold: () => () => void;
}

const VeilContext = createContext<VeilApi | null>(null);

export const LoadingVeilProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [holds, setHolds] = useState(0);
  const [shown, setShown] = useState(false);

  /* Se numără, nu se pune un simplu adevărat/fals: dacă două lucruri încep
     odată și primul se termină, vălul trebuie să rămână pentru al doilea. */
  const hold = useCallback(() => {
    setHolds(n => n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHolds(n => Math.max(0, n - 1));
    };
  }, []);

  useEffect(() => {
    if (holds === 0) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), SHOW_AFTER);
    return () => window.clearTimeout(timer);
  }, [holds]);

  return (
    <VeilContext.Provider value={{ hold }}>
      {children}

      {/* Rămâne montat mereu: altfel n-ar avea de unde să se stingă lin, iar
          însemnul ar dispărea sec înainte ca albul să apuce să plece. */}
      <div className={cn('sf-veil', shown && 'sf-veil--on')} aria-hidden={!shown}>
        <SuperfixLoader label="Se încarcă" animate={shown} />
      </div>
    </VeilContext.Provider>
  );
};

/**
 * Ține vălul cât timp e montat.
 *
 * Scris ca element tocmai ca să poată fi dat drept `fallback` unui `<Suspense>`:
 * React îl montează cât aduce codul rutei și îl scoate când a ajuns.
 */
export const VeilHold: React.FC = () => {
  const api = useContext(VeilContext);
  useEffect(() => api?.hold(), [api]);
  return null;
};

/**
 * Vălul, pentru orice altceva durează.
 *
 * ```ts
 * const veil = useVeil();
 * const done = veil();
 * try { await cevaLung(); } finally { done(); }
 * ```
 */
export function useVeil(): () => () => void {
  const api = useContext(VeilContext);
  return useCallback(() => api?.hold() ?? (() => undefined), [api]);
}

/* ---------------- însemnul, în pagină ---------------- */

interface PageLoaderProps {
  label?: string;
  /** ms până apare; sub prag nu apare deloc */
  delay?: number;
}

/**
 * Însemnul centrat pe o suprafață cât ecranul.
 *
 * Înălțimea nu e decor: fără ea, o pagină care încă încarcă e prea scurtă și
 * footerul urcă în ecran.
 */
export const PageLoader: React.FC<PageLoaderProps> = ({ label = 'Se încarcă', delay = SHOW_AFTER }) => {
  const show = useAfter(delay);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-24">
      {show && <SuperfixLoader label={label} />}
    </div>
  );
};

/* ---------------- scheletele ---------------- */

/**
 * O cărămidă de schelet. Forma o dai tu, cu clase Tailwind — asta aduce doar
 * fundalul și dâra de lumină.
 */
export const Skel: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('sf-skel', className)} aria-hidden="true" />
);

/**
 * Învelișul unui schelet de pagină: spune tehnologiilor de asistență că se
 * lucrează, ca să nu citească dreptunghiuri goale.
 */
export const SkeletonPage: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={className} aria-busy="true" aria-live="polite">
    <span className="sr-only">Se încarcă</span>
    {children}
  </div>
);
