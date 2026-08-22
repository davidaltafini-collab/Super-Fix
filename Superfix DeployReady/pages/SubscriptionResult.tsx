import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle, Clock, WarningCircle } from '@phosphor-icons/react';

import { getSubscriptionStatus, onDate, SubscriptionState } from '../services/subscription';
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

   Deci nu ne uităm deloc la ce scrie în adresă. Browserul poate ajunge aici
   înaintea IPN-ului, iar dacă ne-am lua după redirect am spune „gata, ești
   listat" unei plăți care încă nu s-a așezat — sau invers, „n-a mers" uneia
   care a mers. Întrebăm serverul, și avem răbdare.
   ============================================================ */

/** Cât așteptăm IPN-ul înainte să spunem „durează mai mult decât de obicei". */
const CHECK_EVERY_MS = 2500;
const GIVE_UP_AFTER_MS = 45_000;

type Phase = 'waiting' | 'done' | 'slow' | 'problem';

export const SubscriptionResult: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [state, setState] = useState<SubscriptionState | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    let timer = 0;

    const check = async () => {
      const data = await getSubscriptionStatus();
      if (!alive) return;
      setState(data);

      /* `archived: false` e singurul semn care contează: înseamnă că serverul a
         primit și a verificat IPN-ul, iar profilul chiar e în căutări. */
      if (!data.archived && (data.status === 'ACTIVE' || data.status === 'FREE')) {
        setPhase('done');
        return;
      }
      if (data.status === 'PAST_DUE' || data.status === 'ACTION_REQUIRED') {
        setPhase('problem');
        return;
      }
      if (Date.now() - startedAt.current > GIVE_UP_AFTER_MS) {
        setPhase('slow');
        return;
      }
      timer = window.setTimeout(check, CHECK_EVERY_MS);
    };

    check();
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);

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

        {phase === 'problem' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-graphite/8 text-graphite">
              <WarningCircle size={30} weight="duotone" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">
              {state?.status === 'ACTION_REQUIRED' ? 'Banca mai cere o confirmare' : 'Plata n-a trecut'}
            </h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              {state?.status === 'ACTION_REQUIRED'
                ? 'Mai e un pas de făcut la bancă pentru card. Deschide din nou plata securizată.'
                : 'Cardul n-a fost acceptat. Încearcă din nou, sau cu alt card.'}
            </p>
            <div className="mt-7">
              <GlassLink to="/abonament" tone="red" full>Încearcă din nou</GlassLink>
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
