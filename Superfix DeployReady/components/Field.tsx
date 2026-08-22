import React, { useId, useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import './form.css';

/* ============================================================
   Un câmp de formular, cap-coadă: eticheta, controlul, lămurirea de sub el și
   eroarea. Toate legate cum trebuie pentru cititoarele de ecran, o singură dată
   aici, în loc de zece ori prin pagini.

   De ce nu lăsăm validarea browserului să facă asta: balonul lui apare lângă
   câmp doar pe desktop, e scris în limba sistemului (deci engleză, la aproape
   toată lumea), dispare la primul clic și nu rămâne nicăieri o urmă. Un
   meseriaș care greșește IBAN-ul pe telefon vede un dreptunghi gri care zice
   „Please match the requested format" și nu află niciodată care cifră e de vină.
   ============================================================ */

type Common = {
  label: string;
  /** Lămurire scurtă sub câmp. Rămâne vizibilă și când apare eroarea. */
  hint?: React.ReactNode;
  error?: string;
  /** Se pune pe id-ul câmpului ca să-l putem aduce în ecran la trimitere. */
  id?: string;
  className?: string;
};

type InputProps = Common &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

/** Leagă eticheta, lămurirea și eroarea de control — o dată, corect. */
function useWiring(id: string | undefined, hint: unknown, error: unknown) {
  const auto = useId();
  const fieldId = id ?? `f${auto.replace(/:/g, '')}`;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return { fieldId, hintId, errorId, describedBy: describedBy || undefined };
}

const Shell: React.FC<{
  label: string;
  fieldId: string;
  hintId: string;
  errorId: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, fieldId, hintId, errorId, hint, error, className = '', children }) => (
  <div className={`sf-field ${className}`}>
    <label htmlFor={fieldId} className="sf-field__label">{label}</label>
    {children}
    {hint && <p id={hintId} className="mt-2 text-[0.8125rem] leading-relaxed text-graphite-soft">{hint}</p>}
    {/* `role="alert"` ar întrerupe cititorul de ecran în mijlocul altei fraze;
        `status` îl lasă să termine și abia apoi anunță. */}
    {error && <p id={errorId} className="sf-field__error" role="status">{error}</p>}
  </div>
);

export const Field: React.FC<InputProps> = ({
  label, hint, error, id, className, ...rest
}) => {
  const w = useWiring(id, hint, error);
  return (
    <Shell label={label} fieldId={w.fieldId} hintId={w.hintId} errorId={w.errorId} hint={hint} error={error} className={className}>
      <input
        {...rest}
        id={w.fieldId}
        className={`sf-field__input ${rest.type === 'password' ? 'pr-12' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={w.describedBy}
      />
    </Shell>
  );
};

type AreaProps = Common &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> & {
    /** Arată câte caractere au mai rămas, dar abia când chiar se apropie. */
    counter?: number;
  };

export const FieldArea: React.FC<AreaProps> = ({
  label, hint, error, id, className, counter, value, ...rest
}) => {
  const w = useWiring(id, hint, error);
  const used = String(value ?? '').length;
  // un contor care stă aprins tot timpul e o presiune degeaba; apare pe ultimul sfert
  const showCounter = counter !== undefined && used > counter * 0.75;

  return (
    <Shell label={label} fieldId={w.fieldId} hintId={w.hintId} errorId={w.errorId} hint={hint} error={error} className={className}>
      <div className="relative">
        <textarea
          {...rest}
          value={value}
          id={w.fieldId}
          className="sf-field__input resize-y leading-relaxed"
          aria-invalid={error ? true : undefined}
          aria-describedby={w.describedBy}
        />
        {showCounter && (
          <span
            className="pointer-events-none absolute bottom-2.5 right-3 rounded-full bg-white/80 px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums text-graphite-soft"
            aria-hidden="true"
          >
            {counter - used}
          </span>
        )}
      </div>
    </Shell>
  );
};

type SelectProps = Common &
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'>;

export const FieldSelect: React.FC<SelectProps> = ({
  label, hint, error, id, className, children, ...rest
}) => {
  const w = useWiring(id, hint, error);
  return (
    <Shell label={label} fieldId={w.fieldId} hintId={w.hintId} errorId={w.errorId} hint={hint} error={error} className={className}>
      <div className="relative">
        <select
          {...rest}
          id={w.fieldId}
          className="sf-field__input cursor-pointer appearance-none pr-11"
          aria-invalid={error ? true : undefined}
          aria-describedby={w.describedBy}
        >
          {children}
        </select>
        {/* săgeata proprie: cea a sistemului arată altfel pe fiecare platformă */}
        <svg
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-graphite-soft"
          width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true"
        >
          <path d="M1 1.5 6 6.5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Shell>
  );
};

/**
 * Parolă, cu ochiul de arătat.
 *
 * Pe telefon, o parolă lungă tastată orbește se greșește aproape sigur, iar
 * omul o ia de la capăt de trei ori. Ochiul e mai sigur decât alternativa
 * reală: parole scurte, alese ca să se poată tasta din prima.
 */
export const FieldPassword: React.FC<InputProps> = ({
  label, hint, error, id, className, ...rest
}) => {
  const [shown, setShown] = useState(false);
  const w = useWiring(id, hint, error);

  return (
    <Shell label={label} fieldId={w.fieldId} hintId={w.hintId} errorId={w.errorId} hint={hint} error={error} className={className}>
      <div className="relative">
        <input
          {...rest}
          id={w.fieldId}
          type={shown ? 'text' : 'password'}
          className="sf-field__input pr-12"
          aria-invalid={error ? true : undefined}
          aria-describedby={w.describedBy}
        />
        <button
          type="button"
          onClick={() => setShown(v => !v)}
          aria-label={shown ? 'Ascunde parola' : 'Arată parola'}
          aria-pressed={shown}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-graphite-soft transition-colors hover:bg-graphite/8 hover:text-graphite"
        >
          {shown ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
        </button>
      </div>
    </Shell>
  );
};
