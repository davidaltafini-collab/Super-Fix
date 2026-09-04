import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle, Clock, WarningCircle, XCircle } from '@phosphor-icons/react';

import {
  getPaymentAttempt,
  getSubscriptionStatus,
  onDate,
  PaymentOutcome,
  SubscriptionState,
} from '../services/subscription';
import { GlassLink } from '../components/Button';

import './subscription.css';

/* ============================================================
   Întoarcerea de la bancă.

   Aici trimite NETOPIA omul după checkout (`server/netopia-v2.ts:147`,
   `redirectUrl: ${frontendUrl}/abonament/rezultat`). Ruta asta **nu exista** în
   App: cine plătea ateriza pe o pagină goală, iar de azi ar fi aterizat pe 404.

   Regula pe care se construiește pagina, din `SuperfixApp/PAYMENTS.md`:

     „sursa de adevăr este IPN-ul verificat ori reconcilierea NETOPIA,
      nu redirect-ul browserului"

   Deci nu ne luăm după ce scrie în adresă. Browserul poate ajunge aici
   înaintea IPN-ului, iar dacă ne-am lua după redirect am spune „gata, ești
   listat" unei plăți care încă nu s-a așezat — sau invers, „n-a mers" uneia
   care a mers. Întrebăm serverul, și avem răbdare.

   **Ce întrebăm** e partea în care pagina a fost greșită la început. Se uita
   doar la starea CONTULUI (`/subscription/status`), dar o plată respinsă nu
   schimbă contul: un card refuzat sub ochii omului nu-l bagă în restanță, deci
   contul rămâne pe `NONE` și pagina aștepta „confirmarea de la bancă" la
   nesfârșit pentru o plată pe care serverul o știa deja refuzată. Semnalat de
   echipa NETOPIA la testarea POS-ului, 4 sept 2026.

   Acum întrebăm și de TENTATIVĂ (`/subscription/attempt?orderId=…`). `orderId`
   e luat din adresă, dar doar ca să știe serverul despre care plată e vorba —
   verdictul tot din IPN-ul verificat de el vine.
   ============================================================ */

/** Cât așteptăm IPN-ul înainte să spunem „durează mai mult decât de obicei". */
const CHECK_EVERY_MS = 2500;
const GIVE_UP_AFTER_MS = 45_000;

type Phase = 'waiting' | 'done' | 'slow' | 'failed' | 'action' | 'review';

export const SubscriptionResult: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null);
  const startedAt = useRef(Date.now());
  const { search } = useLocation();

  useEffect(() => {
    let alive = true;
    let timer = 0;

    /* NETOPIA compune adresa de întoarcere, deci nu-i garantăm forma. Acceptăm
       ambele scrieri; dacă lipsește, serverul ia ultima plată a omului. */
    const params = new URLSearchParams(search);
    const orderId = params.get('orderId') || params.get('orderID') || '';

    const check = async () => {
      const [data, attempt] = await Promise.all([
        getSubscriptionStatus(),
        getPaymentAttempt(orderId),
      ]);
      if (!alive) return;
      setState(data);
      const result = attempt.found ? (attempt.outcome ?? null) : null;
      setOutcome(result);

      /* `archived: false` pe cont e semnul cel mai tare că s-a așezat totul:
         serverul a primit IPN-ul, l-a verificat, iar profilul e în căutări. */
      if (!data.archived && (data.status === 'ACTIVE' || data.status === 'FREE')) {
        setPhase('done');
        return;
      }
      if (result === 'PAID') { setPhase('done'); return; }
      if (result === 'DECLINED' || result === 'CANCELLED' || result === 'REVERSED') {
        setPhase('failed');
        return;
      }
      if (result === 'ACTION_REQUIRED' || data.status === 'ACTION_REQUIRED') {
        setPhase('action');
        return;
      }
      if (result === 'REVIEW' || data.status === 'PAYMENT_REVIEW') {
        setPhase('review');
        return;
      }
      if (data.status === 'PAST_DUE') { setPhase('failed'); return; }
      if (Date.now() - startedAt.current > GIVE_UP_AFTER_MS) {
        setPhase('slow');
        return;
      }
      timer = window.setTimeout(check, CHECK_EVERY_MS);
    };

    check();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [search]);

  return (
    <div className="sub flex min-h-[70vh] items-center justify-center px-5 py-24 font-sans text-graphite">
      <Helmet>
        <title>Rezultatul plății | Superfix</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <section className="sf-glass w-full max-w-md rounded-[28px] p-8 text-center" aria-live="polite">
        {phase === 'waiting' && (
          <>
            <div className="sub-wait" aria-hidden="true" />
            <h1 className="mt-6 font-heading text-2xl font-bold text-graphite">Confirmăm plata</h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              Durează câteva secunde. Nu închide pagina și nu plăti încă o dată —
              așteptăm confirmarea de la bancă.
            </p>
          </>
        )}

        {phase === 'done' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-super-red/12 text-super-red">
              <CheckCircle size={30} weight="fill" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">Gata, ești listat</h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              Profilul tău apare de acum în căutările clienților.
              {state?.status === 'FREE'
                ? ` Ești gratuit până la ${onDate(state.subscriptionEndsAt)}.`
                : state?.nextChargeAt
                  ? ` Următoarea plată: ${onDate(state.nextChargeAt)}.`
                  : ''}
            </p>
            <div className="mt-7 flex flex-col gap-3">
              <GlassLink to="/portal" tone="red" full>Mergi în portal</GlassLink>
              <GlassLink to="/heroes" tone="neutral" full>Vezi cum arăți în căutări</GlassLink>
            </div>
          </>
        )}

        {phase === 'slow' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-graphite/8 text-graphite">
              <Clock size={30} weight="duotone" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">Durează ceva mai mult</h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              Banca nu ne-a răspuns încă. Se întâmplă, și de obicei se lămurește singur în
              câteva minute. <strong className="text-graphite">Nu plăti din nou</strong> — dacă
              banii au plecat, plata e înregistrată.
            </p>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              Îți scriem pe email cum se confirmă.
            </p>
            <div className="mt-7">
              <GlassLink to="/portal" tone="dark" full>Înapoi în portal</GlassLink>
            </div>
          </>
        )}

        {phase === 'failed' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-graphite/8 text-graphite">
              <XCircle size={30} weight="duotone" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">
              {outcome === 'CANCELLED' ? 'Plata a fost anulată'
                : outcome === 'REVERSED' ? 'Plata a fost stornată'
                  : 'Plata n-a trecut'}
            </h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              {outcome === 'CANCELLED'
                ? 'Nu s-a luat niciun ban și nu s-a salvat niciun card. Poți relua oricând.'
                : outcome === 'REVERSED'
                  ? 'Banii s-au întors la tine, iar listarea nu s-a activat. Poți încerca din nou.'
                  : 'Banca n-a acceptat cardul, deci nu s-a luat niciun ban. Încearcă din nou, cu același card sau cu altul.'}
            </p>
            <div className="mt-7">
              <GlassLink to="/abonament" tone="red" full>Încearcă din nou</GlassLink>
            </div>
          </>
        )}

        {phase === 'action' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-graphite/8 text-graphite">
              <WarningCircle size={30} weight="duotone" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">Banca mai cere o confirmare</h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              A rămas un pas de făcut la bancă pentru card. Deschide din nou plata
              securizată și du-l până la capăt — nu s-a luat niciun ban până acum.
            </p>
            <div className="mt-7">
              <GlassLink to="/abonament" tone="red" full>Reia plata</GlassLink>
            </div>
          </>
        )}

        {/* Răspuns incert de la procesator. Aici omul chiar n-are ce repara, deci
            singurul lucru util pe care i-l putem cere e să NU plătească din nou. */}
        {phase === 'review' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-graphite/8 text-graphite">
              <Clock size={30} weight="duotone" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">Verificăm plata</h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              Banca ne-a dat un răspuns neclar, așa că o verificăm manual — ca să nu
              rămâi taxat de două ori. <strong className="text-graphite">Nu plăti din nou.</strong>
            </p>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              Îți scriem pe email cum se lămurește.
            </p>
            <div className="mt-7">
              <GlassLink to="/portal" tone="dark" full>Înapoi în portal</GlassLink>
            </div>
          </>
        )}

        {phase !== 'done' && (
          <p className="mt-6 text-[0.8125rem] text-graphite-soft">
            <Link to="/portal" className="underline decoration-super-red/40 underline-offset-2">
              Poți închide pagina liniștit
            </Link>
            {' '}— confirmarea nu depinde de ea.
          </p>
        )}
      </section>
    </div>
  );
};
