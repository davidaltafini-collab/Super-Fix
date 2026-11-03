import React, { useEffect, useState } from 'react';
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

   Apare doar pe paginile pe care aplicația le are, doar după ce omul a
   răspuns la cookies (nu două benzi una peste alta) și nu revine 7 zile după
   ce a ales „Continuă pe site". Roboții nu o văd.
   ============================================================ */

const SNOOZE_KEY = 'superfix_open_in_app_until';
const CONSENT_KEY = 'superfix_cookie_consent';
export const COOKIE_CHOICE_EVENT = 'superfix:cookie-choice';

const APP_STORE = 'https://apps.apple.com/ro/app/id6819299663';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=superfix.app';

const SHOWN_ON = [/^\/$/, /^\/heroes\/?$/, /^\/hero\/[^/]+(\/origine)?\/?$/, /^\/meserii\//, /^\/zone\//];

type Platform = 'ios' | 'android' | null;

const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/bot|crawl|spider|slurp|lighthouse|inspectiontool|headless/i.test(ua)) return null;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipod|ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return null;
};

/* Pagina din aplicație care corespunde celei de pe site: profilul (și povestea lui) sau Acasă. */
const appPath = (pathname: string) => {
  const hero = pathname.match(/^\/hero\/([^/]+)(\/origine)?\/?$/);
  return hero ? `hero/${hero[1]}${hero[2] || ''}` : '';
};

const appHref = (platform: Platform, pathname: string) =>
  platform === 'android'
    ? `intent://${appPath(pathname)}#Intent;scheme=superfix;package=superfix.app;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`
    : APP_STORE;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const snooze = (days: number) => {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 86400000));
  } catch {
    /* fără memorie: o închidem doar acum */
  }
};

export const OpenInApp: React.FC = () => {
  const { pathname } = useLocation();
  const [platform] = useState<Platform>(detectPlatform);
  const [consented, setConsented] = useState(() => !!read(CONSENT_KEY));
  const [closed, setClosed] = useState(() => Number(read(SNOOZE_KEY) || 0) > Date.now());

  useEffect(() => {
    if (consented) return;
    const onChoice = () => setConsented(true);
    window.addEventListener(COOKIE_CHOICE_EVENT, onChoice);
    return () => window.removeEventListener(COOKIE_CHOICE_EVENT, onChoice);
  }, [consented]);

  const show = !!platform && consented && !closed && SHOWN_ON.some(re => re.test(pathname));
  if (!show || typeof document === 'undefined') return null;

  const stayOnSite = () => {
    snooze(7);
    setClosed(true);
  };

  /* Un nou drum din magazin înapoi în tab nu trebuie să găsească banda tot acolo. */
  const goToApp = () => {
    snooze(1);
    setTimeout(() => setClosed(true), 400);
  };

  return createPortal(
    <>
      <div className="oia-scrim" onClick={stayOnSite} aria-hidden="true" />
      <div className="oia" role="dialog" aria-modal="true" aria-labelledby="oia-title">
        <img className="oia__icon" src="/app-icon.png" alt="" width={84} height={84} />
        <p className="oia__title" id="oia-title">Superfix</p>
        <p className="oia__text">Meseriași din zona ta, cu chat și notificări când îți răspund. Mai rapid în aplicație.</p>
        <a className="oia__btn" href={appHref(platform, pathname)} onClick={goToApp}>
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
