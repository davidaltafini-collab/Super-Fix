import React from 'react';
import { ArrowCounterClockwise, House } from '@phosphor-icons/react';

import { SuperfixMark } from './SuperfixMark';
import { GlassButton, GlassLink } from './Button';

/* ============================================================
   Plasa de siguranță pentru o pagină care se strică la desenare.

   Fără ea, o singură eroare de JavaScript într-o pagină golea tot situl: React
   demontează tot arborele, deci omul rămânea în fața unui ecran alb, fără
   navigație și fără nicio ieșire (FRONTEND-HANDOFF A3).

   Cazul cel mai des: după o publicare nouă, un tab deschis dinainte cere
   bucăți de cod care nu mai există pe server. Acolo reîncărcarea rezolvă tot,
   deci o facem singuri, o singură dată.
   ============================================================ */

const RELOAD_KEY = 'superfix_chunk_reload_at';

function isStaleChunk(error: unknown): boolean {
  const text = String((error as Error)?.message || error || '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS/i.test(text);
}

/** Cel mult o reîncărcare la 30 s: dacă serverul chiar lipsește, nu intrăm în buclă. */
function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Vite anunță singur când nu poate aduce o bucată de cod (`vite:preloadError`). */
export function installStaleChunkReload(): () => void {
  const onPreloadError = (event: Event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  };
  window.addEventListener('vite:preloadError', onPreloadError);
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}

interface Props {
  /** la schimbarea lui (altă pagină) plasa se ridică */
  resetKey?: string;
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (isStaleChunk(error)) reloadForStaleChunk();
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex min-h-[70vh] items-center justify-center px-5 py-24 font-sans text-graphite" role="alert">
        <section className="sf-glass w-full max-w-md rounded-[28px] p-8 text-center">
          <SuperfixMark className="mx-auto h-20 w-20" />

          <h1 className="mt-6 font-heading text-[1.9rem] font-bold uppercase leading-[1.08] text-graphite">
            Ceva s-a blocat
          </h1>
          <p className="mt-3 leading-relaxed text-graphite-soft">
            Pagina s-a oprit din cauza noastră, nu din ce ai făcut tu. Reîncarc-o și ar trebui să meargă.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <GlassButton type="button" tone="red" full onClick={() => window.location.reload()}>
              <ArrowCounterClockwise size={19} weight="bold" aria-hidden="true" />
              Reîncarcă pagina
            </GlassButton>
            <GlassLink to="/" tone="neutral" full>
              <House size={19} weight="fill" aria-hidden="true" />
              Înapoi acasă
            </GlassLink>
          </div>
        </section>
      </div>
    );
  }
}
