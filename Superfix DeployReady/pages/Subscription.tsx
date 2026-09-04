import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, Check, CreditCard, Lock, ShieldCheck, Ticket,
} from '@phosphor-icons/react';

import {
  getSubscriptionStatus, startCheckout, applyPromoCode, cancelSubscription,
  reactivateSubscription, money, onDate,
  SubscriptionState, SubscriptionStatus,
} from '../services/subscription';
import { hasHeroSession } from '../services/dataService';
import { GlassButton } from '../components/Button';
import { useToast } from '../components/Toast';
import { Skel, SkeletonPage } from '../components/Loader';

import './subscription.css';
import '../components/form.css';

/* ============================================================
   Activarea listării.

   Fără pagina asta, tot restul sitului nu duce nicăieri: un erou creat e
   `archived: true` (`server/prisma/schema.prisma:82`), iar singurul lucru din tot
   backendul care îl face vizibil e modulul de facturare. Completa profilul și
   rămânea invizibil pentru totdeauna, fără să afle vreodată de ce.

   Contractul e cel din `SuperfixApp/PAYMENTS.md`, iar comportamentul oglindește
   `SuperfixApp/src/components/SubscriptionPanel.tsx`, ca web-ul și aplicația să
   spună același lucru despre același cont.

   Datele cardului nu trec pe aici. Se introduc exclusiv în checkout-ul găzduit
   NETOPIA; noi doar deschidem adresa pe care ne-o dă serverul.
   ============================================================ */

/** Cum se numește fiecare stare și ce ton poartă. */
const FLAGS: Record<SubscriptionStatus, { word: string; tone: string }> = {
  ACTIVE: { word: 'Abonament activ', tone: 'live' },
  FREE: { word: 'Perioadă gratuită', tone: 'live' },
  PAST_DUE: { word: 'Plată nereușită', tone: 'wait' },
  ACTION_REQUIRED: { word: 'Cardul cere revalidare', tone: 'wait' },
  PAYMENT_REVIEW: { word: 'Plata se verifică', tone: 'info' },
  CANCELLED: { word: 'Profil arhivat', tone: 'off' },
  NONE: { word: 'Nelistat', tone: 'stop' },
};

const PERKS = [
  'Apari în căutările clienților din zona ta',
  'Primești misiuni direct, cu poza și adresa lucrării',
  'Profil public cu recenzii și reputație',
];

export const Subscription: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [promo, setPromo] = useState('');
  const [promoError, setPromoError] = useState('');
  const [notReady, setNotReady] = useState(false);

  useEffect(() => {
    if (!hasHeroSession()) { navigate('/portal'); return; }
    let alive = true;
    (async () => {
      const data = await getSubscriptionStatus();
      if (!alive) return;
      setState(data);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [navigate]);

  const refresh = async () => setState(await getSubscriptionStatus());

  const goToCheckout = async () => {
    if (!state) return;
    setBusy(true);
    setNotReady(false);
    const result = await startCheckout(state.termsVersion);
    setBusy(false);

    if (result.url) {
      /* Plecăm din aplicație către checkout-ul băncii. Nu în filă nouă: pe
         telefon, o filă nouă se pierde ușor, iar la întoarcere omul trebuie să
         nimerească înapoi exact aici. */
      window.location.href = result.url;
      return;
    }
    if (result.notReady) { setNotReady(true); return; }
    if (result.termsChanged) { toast.error(result.message || ''); await refresh(); return; }
    toast.error(result.message || 'N-am putut deschide plata acum.');
  };

  const sendPromo = async () => {
    const code = promo.trim();
    if (!code) { setPromoError('Scrie codul, apoi apasă „Aplică".'); return; }
    setBusy(true);
    setPromoError('');
    const result = await applyPromoCode(code);
    setBusy(false);
    if (result.ok) {
      setPromo('');
      toast.success(result.message || 'Codul e aplicat.');
      await refresh();
    } else {
      setPromoError(result.message || 'Codul ăsta nu merge. Verifică-l o dată.');
    }
  };

  const stopRenewal = async () => {
    if (!(await toast.confirm(
      'Oprim reînnoirea? Rămâi listat până la finalul perioadei plătite, apoi profilul se ascunde.',
      { confirmLabel: 'Oprește', danger: true },
    ))) return;
    setBusy(true);
    const ok = await cancelSubscription();
    setBusy(false);
    if (ok) { toast.success('Reînnoirea e oprită.'); await refresh(); }
    else toast.error('N-am putut opri reînnoirea acum. Mai încearcă o dată.');
  };

  const resume = async () => {
    setBusy(true);
    const result = await reactivateSubscription();
    setBusy(false);
    if (result.url) { window.location.href = result.url; return; }
    if (result.ok) { toast.success('Reînnoirea e pornită la loc.'); await refresh(); }
    else toast.error('N-am putut reactiva acum. Mai încearcă o dată.');
  };

  if (loading) {
    return (
      <SkeletonPage className="pb-16 font-sans">
        <header className="mx-auto max-w-2xl px-5 pt-28 sm:px-6">
          <Skel className="h-5 w-36" />
          <Skel className="mt-7 h-11 w-72" />
          <Skel className="mt-5 h-5 w-full max-w-md" />
        </header>
        <main className="mx-auto max-w-2xl space-y-5 px-5 py-9 sm:px-6">
          <Skel className="h-40 w-full rounded-[28px]" />
          <Skel className="h-56 w-full rounded-[28px]" />
        </main>
      </SkeletonPage>
    );
  }

  const s = state!;
  const price = money(s.priceBani, s.currency || 'RON');
  const renewalStopped = s.cancelAtPeriodEnd && (s.status === 'ACTIVE' || s.status === 'FREE');
  const flag = renewalStopped
    ? { word: 'Reînnoire oprită', tone: 'wait' }
    : FLAGS[s.status] ?? FLAGS.NONE;

  /* Fraza de sub steag. Aceleași mesaje ca în aplicație — un om care are și
     aplicația, și situl, trebuie să citească același lucru despre contul lui. */
  const line = renewalStopped
    ? `Reînnoirea e oprită. Rămâi listat până la ${onDate(s.subscriptionEndsAt)}, fără altă plată. Poți reactiva până atunci.`
    : s.status === 'ACTIVE'
      ? `Ești listat public. Următoarea plată: ${onDate(s.nextChargeAt)}.`
      : s.status === 'FREE'
        ? `Ești listat gratuit până la ${onDate(s.subscriptionEndsAt)}. După aceea ${price} pe lună, și te poți opri oricând.`
        : s.status === 'PAST_DUE'
          ? 'Ultima plată n-a trecut. Reia plata ca să rămâi în căutări.'
          : s.status === 'ACTION_REQUIRED'
            ? 'Banca cere încă o confirmare pentru card. Deschide din nou plata securizată.'
            : s.status === 'PAYMENT_REVIEW'
              ? 'Verificăm răspunsul de la bancă. Nu retrimitem plata singuri, ca să nu te taxăm de două ori.'
              : s.status === 'CANCELLED'
                ? 'Abonamentul e anulat, iar profilul nu apare în căutări. Reactivează-l ca să revii.'
                : 'Profilul tău e gata, dar încă nu-l vede niciun client. Activează listarea.';

  const needsCard = s.status === 'NONE' || s.status === 'PAST_DUE' || s.status === 'ACTION_REQUIRED';
  const actionWord = s.status === 'PAST_DUE'
    ? 'Reia plata'
    : s.status === 'ACTION_REQUIRED' ? 'Revalidează cardul' : 'Adaugă cardul și activează';

  return (
    <div className="sub pb-16 font-sans text-graphite">
      <Helmet>
        <title>Abonament | Superfix</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="mx-auto max-w-3xl px-5 pt-28 sm:px-6">
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi în portal
        </Link>

        <h1 className="mt-7 font-heading text-[2.2rem] font-bold uppercase leading-[1.04] text-graphite sm:text-5xl">
          {needsCard ? 'Activează listarea' : 'Abonamentul tău'}
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="sub-flag" data-tone={flag.tone}>{flag.word}</span>
          {s.cardMask && (
            <span className="text-sm font-semibold tabular-nums text-graphite-soft">{s.cardMask}</span>
          )}
        </div>
        <p className="mt-3 max-w-xl leading-relaxed text-graphite-soft">{line}</p>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-5 py-9 sm:px-6">
        {/* Un singur flux de checkout: perioadă, preț, plată, apoi cod.
            Anualul rămâne vizibil, dar indisponibil până există și pe server. */}
        {needsCard && (
          <section className="sub-checkout sf-glass rounded-[28px] p-5 sm:p-8">
            <div className="sub-checkout__head">
              <h2 className="font-heading text-xl text-graphite sm:text-2xl">Plan de listare</h2>
              <span className="sub-secure">
                <ShieldCheck size={17} weight="fill" aria-hidden="true" />
                Plată securizată
              </span>
            </div>

            <div className="sub-period" role="group" aria-label="Perioada de facturare">
              <button type="button" className="sub-period__option" aria-pressed="true">
                <span>Lunar</span>
                <Check size={17} weight="bold" aria-hidden="true" />
              </button>
              <button type="button" className="sub-period__option" disabled aria-disabled="true">
                <span>Anual</span>
                <span className="sub-period__soon">În curând</span>
              </button>
            </div>

            <p className="sub-scope">
              Plătești doar listarea profilului tău de meseriaș. Lucrările contractate cu clienții nu se plătesc prin Superfix.
            </p>

            <div className="sub-price" aria-label={`${price} pe lună`}>
              <p className="sub-price__label">Listare Superfix</p>
              <p className="sub-price__amount">{price}</p>
              <p className="sub-price__interval">pe lună, cu reînnoire automată</p>
              <p className="sub-price__note">Oprești oricând. Profilul rămâne activ până la finalul perioadei plătite.</p>
            </div>

            {notReady ? (
              <div className="sub-unavailable" role="status">
                <p className="font-heading text-base text-graphite">Plățile nu sunt încă deschise</p>
                <p className="mt-2 text-sm leading-relaxed text-graphite-soft">
                  Mai punem la punct partea de plată. Nu e nimic de făcut din partea ta.
                  Îți scriem pe email în clipa în care se poate activa.
                </p>
              </div>
            ) : (
              <GlassButton type="button" tone="red" full disabled={busy} onClick={goToCheckout} className="sub-pay min-h-14 text-lg">
                <CreditCard size={21} weight="fill" aria-hidden="true" />
                {busy ? 'Se deschide…' : actionWord}
              </GlassButton>
            )}

            <div className="sub-trust">
              <Lock size={17} weight="fill" aria-hidden="true" />
              <p>
                Cardul se introduce doar în pagina securizată NETOPIA. Superfix nu vede
                și nu păstrează numărul cardului.
              </p>
            </div>

            {!notReady && (
              <p className="sub-terms">
                Continuând, ești de acord cu{' '}
                <Link to="/terms" className="font-semibold underline decoration-super-red/40 underline-offset-2 hover:text-graphite">
                  termenii
                </Link>
                {s.termsVersion ? `, versiunea ${s.termsVersion}` : ''}.
              </p>
            )}

            {s.status === 'NONE' && !notReady && (
              <div className="sub-promo">
                <label htmlFor="sub-promo" className="sub-promo__label">
                  <Ticket size={18} weight="fill" aria-hidden="true" />
                  Cod de invitație sau reducere
                </label>
                <div className="sub-promo__controls">
                  <input
                    id="sub-promo"
                    className="sf-field__input font-mono uppercase"
                    placeholder="ERO-... / REC-..."
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    value={promo}
                    aria-invalid={promoError ? true : undefined}
                    aria-describedby={promoError ? 'sub-promo-hint sub-promo-error' : 'sub-promo-hint'}
                    onChange={e => { setPromo(e.target.value.toUpperCase()); setPromoError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendPromo(); } }}
                  />
                  <button type="button" onClick={sendPromo} disabled={busy} className="sub-promo__apply">
                    Aplică
                  </button>
                </div>
                <p id="sub-promo-hint" className="sub-promo__hint">
                  Dacă ai un cod eligibil, primul an poate fi gratuit. Codul se aplică o singură dată, înainte de activare.
                </p>
                {promoError && <p id="sub-promo-error" className="sf-field__error" role="status">{promoError}</p>}
              </div>
            )}

            <div className="sub-included">
              <h3 className="font-heading text-lg text-graphite">Ce primești</h3>
              <ul className="mt-4 space-y-2.5">
                {PERKS.map(perk => (
                  <li key={perk} className="sub-perk">
                    <Check size={17} weight="bold" className="sub-perk__tick" aria-hidden="true" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Gestionarea unui abonament deja pornit rămâne separată de checkout. */}
        {!needsCard && (
        <section className="sf-glass rounded-[28px] p-6 sm:p-7">
          {renewalStopped ? (
            <GlassButton type="button" tone="red" full disabled={busy} onClick={resume} className="min-h-14 text-lg">
              <ShieldCheck size={20} weight="fill" aria-hidden="true" />
              {busy ? 'Se pornește…' : 'Repornește reînnoirea'}
            </GlassButton>
          ) : s.status === 'ACTIVE' || s.status === 'FREE' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-graphite-soft">Se reînnoiește</p>
                  <p className="mt-1 font-heading text-lg text-graphite">{onDate(s.nextChargeAt || s.subscriptionEndsAt)}</p>
                </div>
                <p className="font-heading text-2xl tabular-nums text-graphite">
                  {price}<span className="text-sm font-normal text-graphite-soft"> / lună</span>
                </p>
              </div>
              <button
                type="button"
                onClick={stopRenewal}
                disabled={busy}
                className="mt-6 w-full rounded-full border border-graphite/12 bg-white/70 py-3 text-sm font-semibold text-graphite-soft transition-colors hover:bg-white hover:text-graphite disabled:opacity-50"
              >
                Oprește reînnoirea
              </button>
            </>
          ) : s.status === 'CANCELLED' ? (
            <GlassButton type="button" tone="red" full disabled={busy} onClick={resume} className="min-h-14 text-lg">
              <ShieldCheck size={20} weight="fill" aria-hidden="true" />
              {busy ? 'Se pornește…' : 'Reactivează profilul'}
            </GlassButton>
          ) : (
            /* PAYMENT_REVIEW: singura stare în care nu-i dăm niciun buton.
               Orice apăsare aici ar putea produce o a doua taxare. */
            <p className="text-sm leading-relaxed text-graphite-soft">
              Nu e nimic de apăsat acum. Îți dăm de știre pe email cum se lămurește.
            </p>
          )}
        </section>
        )}
      </main>
    </div>
  );
};
