import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, Check, CheckCircle, Clock, CreditCard, Lock, ShieldCheck,
  Sparkle, Ticket, Trophy, UsersThree, WarningCircle,
} from '@phosphor-icons/react';

import {
  applyPromoCode, BillingMonth, capitalize, dayLabel, getSubscriptionStatus,
  jobsLabel, leiLabel, markCardChange, monthLabel, payOutstanding, startCheckout,
  SubscriptionState,
} from '../services/subscription';
import { hasHeroSession } from '../services/dataService';
import { GlassButton } from '../components/Button';
import { useToast } from '../components/Toast';
import { Skel, SkeletonPage } from '../components/Loader';

import './subscription.css';
import '../components/form.css';

/** „Luna cu lucrări de echipă: 25 lei + 15 lei pe om; de la a 3-a lucrare de echipă, 50 lei + 30 lei pe om.” */
const teamPriceText = (s: SubscriptionState) =>
  `Luna cu lucrări de echipă: ${leiLabel(s.prices.tier1Bani)} + ${leiLabel(s.prices.teamMemberBani)} pe om; de la a ${s.prices.teamBusyFrom}-a lucrare de echipă, ${leiLabel(s.prices.tier2Bani)} + ${leiLabel(s.prices.teamMemberBusyBani)} pe om.${s.free ? ' Lunile gratuite n-o acoperă.' : ''}`;

const benefits = (s: SubscriptionState) => [
  'Apari la clienții din zona ta și primești cereri',
  `Plătești doar lunile cu lucrări: ${leiLabel(s.prices.tier1Bani)} pentru 1–${s.prices.busyFrom - 1}, ${leiLabel(s.prices.tier2Bani)} de la a ${s.prices.busyFrom}-a`,
  ...(s.team ? [teamPriceText(s)] : []),
  'Luna fără lucrări nu costă nimic',
];

const monthsLabel = (months: number) => months === 1 ? 'o lună' : `${months} luni`;

type Head = { label: string; title: string; body?: string; tone: string; icon: React.ReactNode };

function headline(s: SubscriptionState, monthName: string, allJobs: number, blockedDebt: boolean): Head {
  const monthTitle = `${capitalize(monthName)}: ${s.current ? leiLabel(s.current.totalBani) : '0 lei'}`;
  if (s.status === 'CANCELLED') return { label: 'Cont închis', title: 'Nu apari la clienți', tone: 'off', icon: <WarningCircle weight="duotone" /> };
  if (s.status === 'PAYMENT_REVIEW') return {
    label: 'Plată în verificare', title: monthTitle, tone: 'info', icon: <Clock weight="duotone" />,
    body: 'Verificăm plata cu banca. Nu o retrimitem singuri, ca să nu te taxăm de două ori.',
  };
  if (s.status === 'ACTION_REQUIRED') return s.needsConsent ? {
    label: 'Nu apari la clienți', title: 'Confirmă cardul', tone: 'stop', icon: <CreditCard weight="duotone" />,
    body: 'Plata s-a schimbat: plătești doar lunile în care ai lucrări. Confirmă cardul (0 lei) pe regula nouă și apari din nou.',
  } : {
    label: 'Nu apari la clienți', title: 'Banca vrea să confirmi cardul', tone: 'stop', icon: <ShieldCheck weight="duotone" />,
    body: 'Confirmă cardul (0 lei). Ce e restant se plătește singur, apoi apari din nou la clienți.',
  };
  if (s.status === 'NONE') return {
    label: 'Nu apari încă la clienți', title: 'Verifică-ți cardul', tone: 'stop', icon: <CreditCard weight="duotone" />,
    body: s.cardIssue === 'DUPLICATE'
      ? 'Cardul încercat e deja pe alt cont. Fiecare meseriaș își verifică propriul card.'
      : 'Cardul verificat e intrarea în Superfix. Verificarea este gratuită: 0 lei.',
  };
  if (s.status === 'PAST_DUE') return blockedDebt ? {
    label: 'Nu mai apari la clienți', title: 'Ai o lună de plătit', tone: 'stop', icon: <WarningCircle weight="fill" />,
    body: 'Plătește și apari din nou.',
  } : {
    label: 'Plată restantă', title: 'O lună n-a trecut', tone: 'wait', icon: <WarningCircle weight="fill" />,
    body: 'Apari în continuare cât mai încercăm. Poți plăti acum sau schimba cardul.',
  };
  if (s.exempt) return {
    label: 'Apari la clienți · bilet de aur', title: 'Nu plătești nimic', tone: 'live', icon: <Trophy weight="fill" />,
    body: `${capitalize(monthName)} până acum: ${jobsLabel(allJobs)}.`,
  };
  return {
    label: 'Apari la clienți', title: monthTitle, tone: 'live', icon: <CheckCircle weight="fill" />,
    body: allJobs === 1 ? 'O lucrare acceptată până acum.' : allJobs ? `${jobsLabel(allJobs)} acceptate până acum.` : 'Nicio lucrare încă luna asta.',
  };
}

function UnpaidRow({ month }: { month: BillingMonth }) {
  const why = month.status === 'REVERSED' ? 'banca a întors plata'
    : month.status === 'DUE' ? 'se ia acum'
      : month.nextRetryAt ? `n-a trecut · mai încercăm pe ${dayLabel(month.nextRetryAt)}` : 'n-a trecut';
  return (
    <div className="sub-debt">
      <WarningCircle size={18} weight="fill" aria-hidden="true" />
      <p><strong>{capitalize(monthLabel(month.month))}: {leiLabel(month.totalBani)}</strong><span> · {why}</span></p>
    </div>
  );
}

function HistoryRow({ month }: { month: BillingMonth }) {
  const all = month.jobs + month.freeJobs;
  const tag = month.reason === 'EXEMPT' ? 'bilet de aur'
    : month.reason === 'FREE' ? 'gratuit'
      : month.status === 'PAID' ? 'plătit'
        : month.status === 'WAIVED' ? 'iertat'
          : month.status === 'NOTHING_DUE' ? '' : 'restant';
  return (
    <div className="sub-history__row">
      <strong>{capitalize(monthLabel(month.month))}</strong>
      <span>{jobsLabel(all)}</span>
      <strong>{leiLabel(month.totalBani)}</strong>
      {tag && <span data-alert={tag === 'restant' || undefined}>· {tag}</span>}
    </div>
  );
}

export const Subscription: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const nativeCheckout = searchParams.get('nativeCheckout') === '1';
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(nativeCheckout);
  const [promo, setPromo] = useState('');
  const [promoError, setPromoError] = useState('');

  const refresh = async () => setState(await getSubscriptionStatus());

  useEffect(() => {
    if (!hasHeroSession()) { navigate('/portal'); return; }
    markCardChange(false);
    let alive = true;
    void getSubscriptionStatus().then(data => {
      if (!alive) return;
      setState(data);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [navigate]);

  const openCheckout = async (replacing = false) => {
    if (!state) return;
    setBusy(true);
    const result = await startCheckout(state.termsVersion);
    setBusy(false);
    if (result.url) {
      markCardChange(replacing);
      window.location.href = result.url;
      return;
    }
    if (result.termsChanged) { setConsent(false); await refresh(); }
    toast.error(result.message || 'N-am putut deschide verificarea cardului.');
  };

  const changeCard = async () => {
    if (!state) return;
    // WebView-ul vechi pornește singur fluxul când vede `nativeCheckout=1`.
    // Aplicația nu-l mai folosește, dar păstrăm compatibilitatea până dispare.
    if (nativeCheckout) { await openCheckout(true); return; }
    const accepted = await toast.confirm(
      `Cardul de acum rămâne până îl confirmi pe cel nou. Verificarea este 0 lei. Plătești doar lunile cu lucrări: ${leiLabel(state.prices.tier1Bani)} pentru 1–${state.prices.busyFrom - 1}, ${leiLabel(state.prices.tier2Bani)} de la a ${state.prices.busyFrom}-a, luați pe 1 ale lunii următoare. Luna fără lucrări costă 0 lei. Datele cardului se introduc doar la NETOPIA.`,
      { confirmLabel: 'Accept și continui' },
    );
    if (accepted) await openCheckout(true);
  };

  const resumePayment = async () => {
    setBusy(true);
    const result = await payOutstanding();
    setBusy(false);
    if (result.ok) {
      toast.success(result.nothingDue ? 'Nu ai nimic de plată.' : 'Am pornit plata. Îți spunem imediat ce confirmă banca.');
    } else if (result.error === 'CARD_REQUIRED') {
      setConsent(false);
      toast.error('Verifică un card ca să plătești restanța.');
    } else if (result.error === 'ACTION_REQUIRED') {
      toast.error('Banca vrea să confirmi cardul. Confirmă-l și plata se face singură.');
    } else if (result.error === 'PAYMENT_REVIEW_REQUIRED') {
      toast.info('Plata este deja în verificare. Nu o pornim încă o dată.');
    } else {
      toast.error(result.message || 'Banca a refuzat plata. Încearcă alt card.');
    }
    await refresh();
  };

  const sendPromo = async () => {
    if (!promo.trim()) { setPromoError('Scrie codul, apoi apasă „Aplică”.'); return; }
    setBusy(true);
    setPromoError('');
    const result = await applyPromoCode(promo);
    setBusy(false);
    if (result.success) {
      setPromo('');
      toast.success(result.message || 'Codul e aplicat.');
      await refresh();
    } else setPromoError(result.message || 'Codul ăsta nu merge. Verifică-l o dată.');
  };

  const view = useMemo(() => {
    if (!state) return null;
    const current = state.current;
    const monthName = current ? monthLabel(current.month) : 'luna asta';
    const allJobs = current ? current.jobs + current.freeJobs : 0;
    const blockedDebt = state.unpaid.some(month => month.status === 'REVERSED' || (month.status === 'FAILED' && !month.nextRetryAt));
    return {
      current, monthName, allJobs, blockedDebt,
      head: headline(state, monthName, allJobs, blockedDebt),
      cardCta: state.status === 'NONE' || state.status === 'ACTION_REQUIRED' || (state.status === 'PAST_DUE' && !state.hasCard),
      freeActive: !!state.free?.active,
    };
  }, [state]);

  if (loading || !state || !view) return (
    <SkeletonPage className="pb-16 font-sans">
      <header className="mx-auto max-w-3xl px-5 pt-28 sm:px-6">
        <Skel className="h-5 w-36" /><Skel className="mt-7 h-11 w-64" /><Skel className="mt-5 h-5 w-full max-w-xl" />
      </header>
      <main className="mx-auto max-w-3xl px-5 py-9 sm:px-6"><Skel className="h-[32rem] w-full rounded-[28px]" /></main>
    </SkeletonPage>
  );

  const s = state;
  const { current, monthName, head, cardCta, freeActive } = view;
  // Treapta aprinsă e cea socotită de server. Luna cu lucrări de echipă: pragul e a 3-a lucrare de echipă, fără zile gratuite.
  const teamMonth = (current?.teamJobs || 0) > 0;
  const busyFrom = teamMonth ? s.prices.teamBusyFrom : s.prices.busyFrom;
  const what = teamMonth ? ' de echipă' : ' lucrări';
  const tierNow = current?.tierBani || 0;
  const tiers = [
    { price: '0 lei', caption: 'fără lucrări', on: tierNow === 0 },
    { price: leiLabel(s.prices.tier1Bani), caption: busyFrom - 1 === 1 ? `1${teamMonth ? what : ' lucrare'}` : `1–${busyFrom - 1}${what}`, on: tierNow === s.prices.tier1Bani },
    { price: leiLabel(s.prices.tier2Bani), caption: teamMonth ? `${busyFrom}+${what}` : `de la ${busyFrom}`, on: tierNow === s.prices.tier2Bani },
  ];

  return (
    <div className="sub pb-16 font-sans text-graphite">
      <Helmet><title>Plata | Superfix</title><meta name="robots" content="noindex" /></Helmet>

      <header className="mx-auto max-w-3xl px-5 pt-28 sm:px-6">
        <Link to="/portal" className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite">
          <ArrowLeft size={16} weight="bold" aria-hidden="true" /> Înapoi în portal
        </Link>
        <h1 className="mt-7 font-heading text-[2.2rem] font-bold uppercase leading-[1.04] text-graphite sm:text-5xl">Plata</h1>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-9 sm:px-6">
        <section className="sub-panel sf-glass rounded-[28px] p-5 sm:p-8" aria-live="polite">
          <div className="sub-head">
            <span className="sub-head__icon" data-tone={head.tone}>{head.icon}</span>
            <div>
              <span className="sub-flag" data-tone={head.tone}>{head.label}</span>
              <h2 className="mt-2 font-heading text-2xl text-graphite sm:text-3xl">{head.title}</h2>
            </div>
          </div>
          {head.body && <p className="mt-4 max-w-xl leading-relaxed text-graphite-soft">{head.body}</p>}

          {s.status === 'NONE' && (
            <ul className="mt-5 space-y-2.5">
              {benefits(s).map(item => <li className="sub-perk" key={item}><Check size={17} weight="bold" className="sub-perk__tick" aria-hidden="true" />{item}</li>)}
            </ul>
          )}

          {current && s.hasCard && !s.exempt && s.status !== 'NONE' && (
            <div className="mt-6">
              <div className="sub-tiers" role="list" aria-label="Treptele de plată ale lunii">
                {tiers.map(tier => (
                  <div key={tier.caption} role="listitem" className="sub-tier" data-active={tier.on || undefined} aria-label={`${tier.price}, ${tier.caption}${tier.on ? ', luna aceasta' : ''}`}>
                    <strong>{tier.price}</strong><span>{tier.caption}</span>
                  </div>
                ))}
              </div>

              {freeActive && s.free && <p className="sub-line"><Sparkle size={17} weight="fill" aria-hidden="true" /><span>{teamMonth
                ? `Gratuit până pe ${dayLabel(s.free.until)}, dar nu și luna cu lucrări de echipă: ea se plătește întreagă.`
                : `Gratuit până pe ${dayLabel(s.free.until)}: lucrările de până atunci nu se plătesc.`}</span></p>}
              {s.team && <p className="sub-line"><UsersThree size={18} weight="fill" aria-hidden="true" /><span>{current.teamBani > 0
                ? `Echipa: ${current.teamMembers === 1 ? 'un om' : `${current.teamMembers} oameni`} × ${leiLabel(current.teamBani / Math.max(1, current.teamMembers))} = ${leiLabel(current.teamBani)} luna asta.`
                : `${teamPriceText(s)} Acum ai ${s.team.verifiedMembers === 1 ? 'un om verificat' : `${s.team.verifiedMembers} oameni verificați`}.`}</span></p>}
              <p className="sub-line"><CreditCard size={18} weight="fill" aria-hidden="true" /><span>{current.totalBani > 0
                ? `Îi luăm pe ${dayLabel(current.closesAt)} de pe cardul ${s.cardMask || 'salvat'}.`
                : `Dacă rămâne așa, ${monthName} nu costă nimic.`}</span></p>
            </div>
          )}

          {!!s.unpaid.length && <div className="sub-debts">{s.unpaid.map(month => <UnpaidRow key={month.id || month.month} month={month} />)}</div>}

          {cardCta && (
            <div className="sub-actions">
              {!nativeCheckout && (
                <label className="sub-consent">
                  <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
                  <span>
                    Verificarea este 0 lei. Plătesc doar lunile cu lucrări: {leiLabel(s.prices.tier1Bani)} pentru 1–{s.prices.busyFrom - 1}, {leiLabel(s.prices.tier2Bani)} de la a {s.prices.busyFrom}-a, luați pe 1 ale lunii următoare. Luna fără lucrări costă 0 lei. Datele cardului le scriu doar la NETOPIA. Accept <Link to="/terms">termenii</Link>.
                  </span>
                </label>
              )}
              <GlassButton type="button" tone="red" full disabled={busy || !consent} onClick={() => void openCheckout(false)} className="min-h-14 text-lg">
                <CreditCard size={21} weight="fill" aria-hidden="true" />
                {busy ? 'Se deschide…' : nativeCheckout ? 'Adaugă cardul și activează · 0 lei' : s.status === 'NONE' ? 'Verifică cardul · 0 lei' : s.status === 'PAST_DUE' ? 'Pune un card și plătește' : 'Confirmă cardul · 0 lei'}
              </GlassButton>
              {!consent && !nativeCheckout && <p className="sub-action-hint">Bifează acordul ca să continui spre pagina NETOPIA.</p>}
            </div>
          )}

          {s.status === 'PAST_DUE' && s.hasCard && (
            <div className="sub-actions"><GlassButton type="button" tone="red" full disabled={busy} onClick={() => void resumePayment()} className="min-h-14 text-lg">{busy ? 'Se pornește…' : 'Reia plata'}</GlassButton></div>
          )}

          {s.hasCard && (s.status === 'ACTIVE' || s.status === 'PAST_DUE') && (
            <button type="button" onClick={() => void changeCard()} disabled={busy} className="sub-change-card">
              <CreditCard size={18} weight="bold" aria-hidden="true" /> {s.cardMask ? `Schimbă cardul ${s.cardMask}` : 'Schimbă cardul'}
            </button>
          )}

          {s.code && !['APPLIED', 'QUALIFIED'].includes(s.code.status) && !s.hasCard && (
            <p className="sub-line mt-5"><Sparkle size={17} weight="fill" aria-hidden="true" /><span>Codul tău: {monthsLabel(s.code.months)} gratuite, din ziua în care îți verifici cardul.</span></p>
          )}

          {s.canApplyCode && (
            <div className="sub-promo">
              <label htmlFor="sub-promo" className="sub-promo__label"><Ticket size={18} weight="fill" aria-hidden="true" />Ai un cod?</label>
              <div className="sub-promo__controls">
                <input id="sub-promo" className="sf-field__input font-mono uppercase" placeholder="SUPERFIX2026" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={promo} aria-invalid={promoError ? true : undefined} aria-describedby={promoError ? 'sub-promo-hint sub-promo-error' : 'sub-promo-hint'} onChange={e => { setPromo(e.target.value.toUpperCase()); setPromoError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void sendPromo(); } }} />
                <button type="button" onClick={() => void sendPromo()} disabled={busy} className="sub-promo__apply">Aplică</button>
              </div>
              <p id="sub-promo-hint" className="sub-promo__hint">Cod promo sau de recruiter: 6 luni gratuite. Codul unui meseriaș: 3 luni. Lunile curg din ziua în care îți verifici cardul.</p>
              {promoError && <p id="sub-promo-error" className="sf-field__error" role="status">{promoError}</p>}
            </div>
          )}

          {!!s.history.length && (
            <div className="sub-history">
              <h3 className="font-heading text-lg text-graphite">Lunile trecute</h3>
              <div className="mt-3 space-y-2">{s.history.map(month => <HistoryRow key={month.id || month.month} month={month} />)}</div>
            </div>
          )}

          <div className="sub-trust"><Lock size={17} weight="fill" aria-hidden="true" /><p>Cardul se introduce doar în pagina securizată NETOPIA. Superfix nu vede și nu păstrează numărul cardului.</p></div>
        </section>
      </main>
    </div>
  );
};
