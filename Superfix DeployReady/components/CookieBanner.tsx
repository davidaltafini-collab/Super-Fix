import React, { useEffect, useRef, useState } from 'react';
import { lockBodyScroll } from '@/lib/scrollLock';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Cookie } from '@phosphor-icons/react';
import { initGA } from '../utils/analytics';
import { COOKIE_CHOICE_EVENT } from './OpenInApp';
import './cookie.css';

/* ============================================================
   Întrebarea despre cookies.

   Trei lucruri erau de reparat, nu doar aspectul:

   1. „Detalii legale" ducea la /legal, o rută care nu există în App. Adică
      primul link pe care îl vede un vizitator nou deschidea o pagină goală.
      Acum duce la /cookies, care e chiar politica potrivită.

   2. `animate-slide-up` nu e definit nicăieri în proiect, deci banda apărea
      brusc. Animația e acum în `cookie.css`, cu o jumătate de secundă de
      așteptare: una care sare odată cu pagina se citește ca o eroare.

   3. Se randează prin portal. Stătea în `<div class="relative z-10">` din App,
      care e context de stivuire — `z-index: 100` de acolo nu însemna nimic în
      afara acelei cutii. Aceeași poveste ca la cameră.
   ============================================================ */

const KEY = 'superfix_cookie_consent';

export const CookieBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* Un browser cu stocarea blocată aruncă la citire. Fără try, banda n-ar mai
       apărea deloc, iar restul efectului n-ar mai rula. */
    let consent: string | null = null;
    try {
      consent = localStorage.getItem(KEY);
    } catch {
      /* fără memorie: întrebăm de fiecare dată, e alegerea mai sigură */
    }

    if (!consent) setShow(true);
    else if (consent === 'accepted') initGA();
  }, []);

  const choose = (choice: 'accepted' | 'refused') => {
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* dacă nu se poate salva, măcar sesiunea asta merge cum a ales omul */
    }
    if (choice === 'accepted') initGA();
    setShow(false);
    /* Abia acum poate veni „Continuă în aplicație" (OpenInApp): nu două benzi una peste alta. */
    window.dispatchEvent(new Event(COOKIE_CHOICE_EVENT));
  };

  /* Alegerea e obligatorie (David, 03.11: „să fii obligat să apeși pe una dintre ele”): fundal întunecat, pagina
     stă pe loc, nimic nu se închide cu un tap alături. „Doar strictul necesar” e la fel de aproape ca „De acord”.
     Pe telefon vine după „Continuă în aplicație” (OpenInApp stă deasupra, cu fundalul ei). */
  const layerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) return;
    const unlock = lockBodyScroll();
    const layer = layerRef.current;
    const stop = (event: TouchEvent) => event.preventDefault();
    layer?.addEventListener('touchmove', stop, { passive: false });
    return () => {
      unlock();
      layer?.removeEventListener('touchmove', stop);
    };
  }, [show]);

  if (!show || typeof document === 'undefined') return null;

  return createPortal(
    <div ref={layerRef}>
    <div className="ck-scrim" aria-hidden="true" />
    <div className="ck" role="dialog" aria-modal="true" aria-live="polite" aria-label="Setări de confidențialitate">
      <div className="ck__inner">
        <div className="ck__row">
          <span className="ck__icon" aria-hidden="true">
            <Cookie size={20} weight="duotone" />
          </span>
          <div className="ck__copy">
            <p className="ck__title">Ne dai voie să ținem minte?</p>
            <p className="ck__text">
              Păstrăm doar ce ne ajută să facem situl mai bun. Nimic nu pleacă la
              răufăcători, și te poți răzgândi oricând.{' '}
              <Link to="/cookies" className="ck__link">Ce anume păstrăm</Link>
            </p>
          </div>
        </div>

        <div className="ck__buttons">
          <button type="button" className="ck__btn ck__btn--no" onClick={() => choose('refused')}>
            Doar strictul necesar
          </button>
          <button type="button" className="ck__btn ck__btn--yes" onClick={() => choose('accepted')}>
            De acord
          </button>
        </div>
      </div>
    </div>
    </div>,
    document.body,
  );
};
