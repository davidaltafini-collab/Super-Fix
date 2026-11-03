import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import './open-in-app.css';

/* ============================================================
   „Continuă în aplicația Superfix" — ca la Google, pe telefon.

   Ca standardul (Google, Reddit): pagina se întunecă, de jos urcă o foaie cu
   iconița aplicației mare, pe mijloc, butonul roșu „Continuă în aplicația
   Superfix" și dedesubt mic „Continuă pe site" (și tapul pe fundal).

   - Android: `intent://` cu pachetul `superfix.app` deschide aplicația pe
     aceeași pagină (schema `superfix://`, pe care o are orice versiune); fără
     aplicație, Chrome merge singur la Google Play.
   - iPhone: Safari nu poate întreba dacă aplicația e instalată fără o alertă
     „adresă invalidă", deci butonul duce în App Store, care arată „Deschide"
     sau „Obține". Cine are aplicația nici nu ajunge aici: linkurile
     `/hero/...` o deschid direct (apple-app-site-association).

   Apare la fiecare intrare pe site, pe orice pagină (David, 03.11: „mereu când
   intri", „absolut oriunde"), peste banda de cookies, care rămâne sub ea.
   „Continuă pe site" o închide doar pentru vizita asta (sessionStorage).
   Roboții nu o văd. În aplicație nu apare: plata (card-verify) nu încarcă
   pagini de pe site, întoarcerea e prinsă înainte.
   ============================================================ */

const CLOSED_KEY = 'superfix_open_in_app_closed';
export const COOKIE_CHOICE_EVENT = 'superfix:cookie-choice';

const APP_STORE = 'https://apps.apple.com/ro/app/id6819299663';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=superfix.app';


type Platform = 'ios' | 'android' | null;

const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/bot|crawl|spider|slurp|lighthouse|inspectiontool|headless/i.test(ua)) return null;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipod|ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return null;
};

/* Pagina din aplicație care corespunde celei de pe site (cu tokenul/codul din adresă), altfel Acasă. */
const IN_APP = /^\/(hero\/[^/]+(\/origine)?|onboarding|cine-e-sub-costum|app|register)\/?$/;
const appPath = (pathname: string, search: string) =>
  IN_APP.test(pathname) ? pathname.replace(/^\/|\/$/g, '') + search : '';

const appHref = (platform: Platform, pathname: string, search: string) =>
  platform === 'android'
    ? `intent://${appPath(pathname, search)}#Intent;scheme=superfix;package=superfix.app;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`
    : APP_STORE;

const wasClosed = () => {
  try {
    return sessionStorage.getItem(CLOSED_KEY) === '1';
  } catch {
    return false;
  }
};

const rememberClosed = () => {
  try {
    sessionStorage.setItem(CLOSED_KEY, '1');
  } catch {
    /* fără memorie: o închidem doar acum */
  }
};

export const OpenInApp: React.FC = () => {
  const { pathname, search } = useLocation();
  const [platform] = useState<Platform>(detectPlatform);
  const [closed, setClosed] = useState(wasClosed);

  const show = !!platform && !closed;
  if (!show || typeof document === 'undefined') return null;

  const stayOnSite = () => {
    rememberClosed();
    setClosed(true);
  };

  /* Un nou drum din magazin înapoi în tab nu trebuie să găsească banda tot acolo. */
  const goToApp = () => {
    rememberClosed();
    setTimeout(() => setClosed(true), 400);
  };

  return createPortal(
    <>
      <div className="oia-scrim" onClick={stayOnSite} aria-hidden="true" />
      <div className="oia" role="dialog" aria-modal="true" aria-labelledby="oia-title">
        <img className="oia__icon" src="/app-icon.png" alt="" width={84} height={84} />
        <p className="oia__title" id="oia-title">Superfix</p>
        <p className="oia__text">Meseriași din zona ta, cu chat și notificări când îți răspund. Mai rapid în aplicație.</p>
        <a className="oia__btn" href={appHref(platform, pathname, search)} onClick={goToApp}>
          Continuă în aplicația Superfix
        </a>
        <button type="button" className="oia__site" onClick={stayOnSite}>
          Continuă pe site
        </button>
      </div>
    </>,
    document.body,
  );
};
