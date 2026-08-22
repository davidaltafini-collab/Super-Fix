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
import { Field } from '../components/Field';
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
  const yearWas = money((s.priceBani ?? 2500) * 12, s.currency || 'RON');
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

      <header className="mx-auto max-w-2xl px-5 pt-28 sm:px-6">
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi în portal
        </Link>

        <h1 className="mt-7 font-heading text-[2.2rem] font-bold uppercase leading-[1.04] text-graphite sm:text-5xl">
          Listarea ta
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="sub-flag" data-tone={flag.tone}>{flag.word}</span>
          {s.cardMask && (
            <span className="text-sm font-semibold tabular-nums text-graphite-soft">{s.cardMask}</span>
          )}
        </div>
        <p className="mt-3 max-w-xl leading-relaxed text-graphite-soft">{line}</p>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-5 py-9 sm:px-6">
        {/* ---------------- planurile ---------------- */}
        {needsCard && (
          <section className="sf-glass rounded-[28px] p-6 sm:p-7">
            <h2 className="font-heading text-xl text-graphite">Cât costă</h2>

            <div className="sub-plans mt-5">
              <button type="button" className="sub-plan" aria-pressed="true">
                <span className="sub-plan__name">Lunar</span>
                <p className="sub-plan__price">
                  {price}<span className="sub-plan__per"> / lună</span>
                </p>
                <p className="sub-plan__note">Se reînnoiește singur. Îl oprești oricând, fără explicații.</p>
              </button>

              {/* Anualul nu există încă pe server: un singur preț și un singur
                  interval. Îl arătăm stins, cu motivul scris — un card gri fără
                  explicație e mai enervant decât lipsa lui. */}
              <button type="button" className="sub-plan" disabled aria-disabled="true">
                <span className="sub-plan__tag">În curând</span>
                <span className="sub-plan__name">Pe un an</span>
                <p className="sub-plan__price">
                  —<span className="sub-plan__was">{yearWas}</span>
                </p>
                <p className="sub-plan__note">Plătești o dată pe an, mai ieftin. Îl pregătim.</p>
              </button>
            </div>

            <ul className="mt-6 space-y-2.5">
              {PERKS.map(perk => (
                <li key={perk} className="sub-perk">
                  <Check size={17} weight="bold" className="sub-perk__tick" aria-hidden="true" />
                  {perk}
                </li>
              ))}
            </ul>

            {/* Anul gratuit și planurile plătite nu se adună: gratuitatea se
                aplică la prima activare, iar planul se alege abia după ce se
                termină. Scris aici, unde se decide, nu îngropat în termeni. */}
            <p className="mt-5 rounded-2xl bg-white/60 p-3.5 text-[0.8125rem] leading-relaxed text-graphite-soft">
              Dacă ai cod de invitație, primul an e gratuit și nu plătești nimic acum —
              planul îl alegi când se termină.
            </p>
          </section>
        )}

        {/* ---------------- acțiunea ---------------- */}
        <section className="sf-glass rounded-[28px] p-6 sm:p-7">
          {needsCard ? (
            <>
              {notReady ? (
                /* Nu e nimic de reparat de mâna lui, deci nu-i explicăm nici POS,
                   nici bridge. Îi spunem doar că nu e din vina lui. */
                <div className="rounded-2xl bg-white/60 p-4">
                  <p className="font-heading text-base text-graphite">Plățile nu sunt încă deschise</p>
                  <p className="mt-2 text-sm leading-relaxed text-graphite-soft">
                    Mai punem la punct partea de plată. Nu e nimic de făcut din partea ta —
                    îți scriem pe email în clipa în care se poate activa.
                  </p>
                </div>
              ) : (
                <GlassButton type="button" tone="red" full disabled={busy} onClick={goToCheckout} className="min-h-14 text-lg">
                  <CreditCard size={20} weight="fill" aria-hidden="true" />
                  {busy ? 'Se deschide…' : actionWord}
                </GlassButton>
              )}

              <p className="mt-4 flex items-start justify-center gap-2 text-center text-[0.8125rem] leading-relaxed text-graphite-soft">
                <Lock size={14} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Cardul se introduce numai în pagina securizată NETOPIA. Noi nu vedem
                  numărul cardului și nu-l păstrăm nicăieri.
                </span>
              </p>

              <p className="mt-3 text-center text-[0.8125rem] leading-relaxed text-graphite-soft">
                Continuând, ești de acord cu{' '}
                <Link to="/terms" className="font-semibold underline decoration-super-red/40 underline-offset-2 hover:text-graphite">
                  termenii
                </Link>
                {s.termsVersion ? `, versiunea ${s.termsVersion}` : ''}.
              </p>

              {/* Codul, numai cât timp contul n-a fost activat. Ăsta e ultimul
                  moment în care se mai poate lega: după activare, atribuirea nu
                  se mai face (vezi termenii, secțiunea 4). */}
              {s.status === 'NONE' && !notReady && (
                <div className="mt-7 border-t border-graphite/10 pt-6">
                  <div className="flex items-end gap-2">
                    <Field
                      id="sub-promo"
                      label="Ai un cod de invitație sau promoțional?"
                      placeholder="ERO-… / REC-… / SUPERFIX2026"
                      autoCapitalize="characters"
                      spellCheck={false}
                      className="flex-1 [&_input]:font-mono [&_input]:uppercase"
                      hint="Un singur cod pe cont, și numai acum — după activare nu se mai poate lega. Dacă l-ai pus la înscriere, e deja aplicat."
                      value={promo}
                      error={promoError}
                      onChange={e => { setPromo(e.target.value.toUpperCase()); setPromoError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendPromo(); } }}
                    />
                    <button
                      type="button"
                      onClick={sendPromo}
                      disabled={busy}
                      className="mb-[1.9rem] inline-flex min-h-12 items-center gap-2 rounded-full bg-graphite px-5 font-heading text-sm text-white transition-transform active:scale-[0.97] disabled:opacity-50"
                    >
                      <Ticket size={16} weight="fill" aria-hidden="true" />
                      Aplică
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : renewalStopped ? (
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
      </main>
    </div>
  );
};
