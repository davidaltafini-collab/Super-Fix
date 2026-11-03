import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { lockBodyScroll } from '@/lib/scrollLock';
import './open-in-app.css';

/* ============================================================
   „Continuă în aplicația Superfix" — ca la Google, pe telefon.

   Ca standardul (Google, Reddit): pagina se întunecă, de jos urcă o foaie cu
   iconița aplicației mare, pe mijloc, butonul roșu „Continuă în aplicația
   Superfix" și dedesubt mic „Continuă pe site". Doar „Continuă pe site" o
   închide (David, 03.11: nu cu un tap pe fundal), iar pagina din spate nu se
   derulează cât e deschisă.

   - Android: `intent://` cu pachetul `superfix.app` deschide aplicația pe
     aceeași pagină (schema `superfix://`, pe care o are orice versiune); fără
     aplicație, Chrome merge singur la Google Play.
   - iPhone: Safari nu poate întreba dacă aplicația e instalată fără o alertă
     „adresă invalidă", deci butonul duce în App Store, care arată „Deschide"
     sau „Obține". Cine are aplicația nici nu ajunge aici: linkurile
     `/hero/...` o deschid direct (apple-app-site-association).

   Codul din link se aplică singur (David, 03.11: „fără să mai pui codul"):
   invitația unui meseriaș (`?ref=`), codul de recruiter (`?recruiter=`) și
   codul echipei (`?echipa=`) merg cu pagina în aplicație — direct dacă e
   instalată, prin magazin dacă nu (vezi `playStore` / `goToApp`). Rămân și
   scrise în foaie, ca omul să știe ce primește.

   Apare la fiecare intrare pe site, pe orice pagină (David, 03.11: „mereu când
   intri", „absolut oriunde"), peste banda de cookies, care rămâne sub ea.
   „Continuă pe site" o închide doar pentru vizita asta (sessionStorage).
   Roboții nu o văd. În aplicație nu apare: plata (card-verify) nu încarcă
   pagini de pe site, întoarcerea e prinsă înainte.
   ============================================================ */

const CLOSED_KEY = 'superfix_open_in_app_closed';
export const COOKIE_CHOICE_EVENT = 'superfix:cookie-choice';

const APP_STORE = 'https://apps.apple.com/ro/app/id6819299663';
/* Aplicația din magazine citește singură linkul la prima pornire abia de la 1.0.4 (modulul `superfix-link`).
   Până atunci codul se copiază și omul îl lipește la „Ai un cod?"; cu 1.0.4 în ambele magazine → `true`. */
const APP_READS_LINK = false;
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

/* Fără aplicație, pagina merge mai departe prin magazin: Google Play o dă aplicației proaspăt instalate (Install
   Referrer, `sf=<calea>`), iar pe iPhone copiem linkul, pe care aplicația îl citește la prima pornire
   (`src/services/arrivalLink.ts` în aplicație). Așa codul din invitație se aplică singur. */
const playStore = (path: string) =>
  path ? `${PLAY_STORE}&referrer=${encodeURIComponent(`sf=${encodeURIComponent(`/${path}`)}`)}` : PLAY_STORE;

const appHref = (platform: Platform, pathname: string, search: string) => {
  const path = appPath(pathname, search);
  return platform === 'android'
    ? `intent://${path}#Intent;scheme=superfix;package=superfix.app;S.browser_fallback_url=${encodeURIComponent(playStore(path))};end`
    : APP_STORE;
};

/* Ca pe server (`normalizeCode`): majuscule, doar litere, cifre și liniuță. */
const normalizeCode = (value: string | null) => (value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

type LinkCode = { code: string; label: string; where: string };

const linkCode = (search: string): LinkCode | null => {
  const params = new URLSearchParams(search);
  const ref = normalizeCode(params.get('ref'));
  const recruiter = normalizeCode(params.get('recruiter'));
  const team = normalizeCode(params.get('echipa'));
  if (APP_READS_LINK) {
    if (ref) return { code: ref, label: 'Invitația ta', where: 'Se aplică singură în aplicație: lunile gratuite rămân ale tale.' };
    if (recruiter) return { code: recruiter, label: 'Codul tău de recruiter', where: 'Se aplică singur în aplicație.' };
    if (team) return { code: team, label: 'Invitația în echipă', where: 'Se aplică singură în aplicație.' };
    return null;
  }
  if (ref) return { code: ref, label: 'Invitația ta', where: 'Ți-l copiem. Lunile gratuite rămân ale tale: în aplicație îl pui la „Ai un cod?”, înainte de verificarea cardului.' };
  if (recruiter) return { code: recruiter, label: 'Codul tău de recruiter', where: 'Ți-l copiem: în aplicație îl pui la „Ai un cod?”, înainte de verificarea cardului.' };
  if (team) return { code: team, label: 'Invitația în echipă', where: 'Ți-l copiem: în aplicație, Cont → Echipa mea → Am un cod.' };
  return null;
};

const copy = async (text: string) => {
  try {
    await Promise.race([navigator.clipboard.writeText(text), new Promise(r => setTimeout(r, 400))]);
  } catch {
    /* fără clipboard: codul rămâne scris în foaie */
  }
};

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

  /* Alegerea e obligatorie (David, 03.11): pagina din spate stă pe loc (numărătoarea comună a sitului), iar pe
     iPhone degetul tras pe fundal sau pe foaie nu mai derulează pagina de dedesubt. */
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

  const code = linkCode(search);
  const href = appHref(platform, pathname, search);

  const stayOnSite = () => {
    rememberClosed();
    setClosed(true);
  };

  const path = appPath(pathname, search);

  /* Un nou drum din magazin înapoi în tab nu trebuie să găsească foaia tot acolo. Pe iPhone, linkul paginii pleacă
     prin clipboard (App Store nu duce nimic mai departe); copierea cere apăsarea omului, deci se face chiar aici. */
  const goToApp = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    rememberClosed();
    const clip = APP_READS_LINK ? (platform === 'ios' && path ? `https://super-fix.ro/${path}` : '') : code?.code || '';
    if (clip) {
      event.preventDefault();
      await copy(clip);
      window.location.href = href;
    }
    setTimeout(() => setClosed(true), 400);
  };

  return createPortal(
    <div ref={layerRef}>
      <div className="oia-scrim" aria-hidden="true" />
      <div className="oia" role="dialog" aria-modal="true" aria-labelledby="oia-title">
        <img className="oia__icon" src="/app-icon.png" alt="" width={84} height={84} />
        <p className="oia__title" id="oia-title">Superfix</p>
        {code ? (
          <>
            <p className="oia__text">{code.label}:</p>
            <p className="oia__code">{code.code}</p>
            <p className="oia__hint">
              {code.where}
              {APP_READS_LINK && platform === 'ios' ? ' La prima deschidere, apasă „Permite” când te întreabă de lipire.' : ''}
            </p>
          </>
        ) : (
          <p className="oia__text">Meseriași din zona ta, cu chat și notificări când îți răspund. Mai rapid în aplicație.</p>
        )}
        <a className="oia__btn" href={href} onClick={goToApp}>
          Continuă în aplicația Superfix
        </a>
        <button type="button" className="oia__site" onClick={stayOnSite}>
          Continuă pe site
        </button>
      </div>
    </div>,
    document.body,
  );
};
