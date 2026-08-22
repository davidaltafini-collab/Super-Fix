import React from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { House, MagnifyingGlass } from '@phosphor-icons/react';

import { SuperfixMark } from '../components/SuperfixMark';
import { GlassLink } from '../components/Button';

/* ============================================================
   Adresa care nu duce nicăieri.

   Până acum nu exista nicio rută `*` în App, deci o adresă greșită nu dădea
   nimic: navigația și subsolul rămâneau pe ecran, iar între ele era gol. Arăta
   ca un sit stricat, nu ca o adresă greșită — și e o diferență pe care omul o
   simte imediat.
   ============================================================ */

export const NotFound: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-24 font-sans text-graphite">
      <Helmet>
        <title>Pagina nu există | Superfix</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <section className="sf-glass w-full max-w-md rounded-[28px] p-8 text-center">
        <SuperfixMark className="mx-auto h-20 w-20" />

        <h1 className="mt-6 font-heading text-[1.9rem] font-bold uppercase leading-[1.08] text-graphite">
          Aici n-a ajuns nimeni
        </h1>
        <p className="mt-3 leading-relaxed text-graphite-soft">
          Adresa <code className="rounded-md bg-graphite/8 px-1.5 py-0.5 text-[0.85em] text-graphite">{pathname}</code>{' '}
          nu duce la nicio pagină. Ori s-a mutat, ori s-a strecurat o literă în plus.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <GlassLink to="/heroes" tone="red" full>
            <MagnifyingGlass size={19} weight="bold" aria-hidden="true" />
            Caută un erou
          </GlassLink>
          <GlassLink to="/" tone="neutral" full>
            <House size={19} weight="fill" aria-hidden="true" />
            Înapoi acasă
          </GlassLink>
        </div>
      </section>
    </div>
  );
};
