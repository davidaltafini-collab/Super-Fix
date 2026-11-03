import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Phone, PaperPlaneTilt, Images } from '@phosphor-icons/react';

import { Hero } from '../types';
import { getHeroBySlug, getHeroPhone, peekHeroBySlug } from '../services/dataService';
import { Skel, SkeletonPage } from '../components/Loader';
import { thumb } from '../lib/img';
import { Reveal } from '../components/motion';
import { useToast } from '../components/Toast';

import './hero-origin.css';

/* ============================================================
   „Cine e sub costum" — pagina de origine.

   Pe profil vezi meseriașul. Aici vezi omul. Restul sitului îl numește pe
   erou după alias și îi ține identitatea secretă; pagina asta o deschide,
   deci titlul e numele lui real, iar aliasul trece pe locul doi.

   Se construiește din ce a completat eroul. Nicio secțiune nu apare goală:
   întrebările la care n-a răspuns pur și simplu nu există pe pagină.
   ============================================================ */

interface Panel {
  key: string;
  question: string;
  answer: string;
  span: 'wide' | 'big' | 'small';
  tone: 'red' | 'calm';
}

/** Panourile care au conținut, în ordinea în care se citesc bine. */
function buildPanels(hero: Hero): Panel[] {
  const all: Panel[] = [
    /* Aceleași întrebări, în aceeași ordine, ca interviul din aplicație (`INTERVIEW_ASKS`). */
    { key: 'origin', question: 'Cum ai început?', answer: hero.originStory || '', span: 'wide', tone: 'red' },
    { key: 'hardest', question: 'Care a fost cea mai grea misiune?', answer: hero.hardestMission || '', span: 'big', tone: 'red' },
    { key: 'tool', question: 'Fără ce nu pleci de acasă?', answer: hero.favoriteTool || '', span: 'small', tone: 'calm' },
    { key: 'never', question: 'Ce nu faci niciodată?', answer: hero.neverDoes || '', span: 'big', tone: 'calm' },
    { key: 'team', question: 'Cu cine ții?', answer: hero.team || '', span: 'small', tone: 'red' },
    { key: 'peeve', question: 'Ce te scoate din sărite?', answer: hero.petPeeve || '', span: 'wide', tone: 'calm' },
  ];
  return all.filter(p => p.answer.trim() !== '').map(p => ({ ...p, answer: p.answer.trim() }));
}

export const HeroOrigin: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  /* Daca vii de pe profilul eroului, el e deja incarcat: pagina de origine se
     deseneaza pe loc si doar se reimprospateaza in fundal. Scheletul ramane
     pentru intrarea directa pe link. */
  const [hero, setHero] = useState<Hero | null>(() => peekHeroBySlug(slug || '') ?? null);
  const [loading, setLoading] = useState(() => !peekHeroBySlug(slug || ''));



  useEffect(() => {
    let alive = true;
    (async () => {
      if (!slug) return;
      const data = await getHeroBySlug(slug);
      if (!alive) return;
      setHero(data ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [slug]);

  const panels = useMemo(() => (hero ? buildPanels(hero) : []), [hero]);
  const navigate = useNavigate();
  const toast = useToast();
  const [calling, setCalling] = useState(false);
  /* „Sună acum”: numărul nu vine cu profilul (CONT-FANTOMA.md §7), se cere la apăsare, ca pe profil.
     Oferta de cont (a doua cerere de număr într-o zi) stă pe profil: acolo trimitem. */
  const callHero = async () => {
    if (!hero || calling) return;
    setCalling(true);
    const result = await getHeroPhone(hero.id);
    setCalling(false);
    if (result.ok) { window.location.href = `tel:${result.phone}`; return; }
    if (result.error === 'PHONE_QUOTA') { navigate(`/hero/${slug}`); return; }
    toast.error(result.message || 'Nu am putut deschide numărul. Încearcă din nou.');
  };
  const proud = useMemo(() => {
    if (!hero?.proudMissionId) return null;
    // `proudMissionId` e id-ul misiunii alese, nu al item-ului de portofoliu
    return hero.portfolio?.find(p => p.missionId === hero.proudMissionId) ?? null;
  }, [hero]);

  if (loading) {
    return (
      <SkeletonPage className="pb-8 font-sans md:pb-20">
        <header className="mx-auto max-w-5xl px-5 pt-28 sm:px-6">
          <Skel className="h-5 w-36" />

          <div className="mt-8 flex flex-col items-center gap-7 sm:flex-row sm:items-end">
            <Skel className="h-32 w-32 shrink-0 rounded-[28px] sm:h-40 sm:w-40" />
            <div className="w-full min-w-0">
              <Skel className="h-4 w-40" />
              <Skel className="mt-4 h-11 w-4/5 sm:h-14" />
              <Skel className="mt-4 h-5 w-3/5" />
            </div>
          </div>
        </header>

        {/* aceeasi plansa asimetrica: cadru lat, apoi doua inegale */}
        <main className="mx-auto max-w-5xl px-5 py-12 sm:px-6">
          <div className="origin-grid">
            <div className="origin-cell origin-cell--wide">
              <div className="origin-panel">
                <Skel className="h-4 w-full" />
                <Skel className="mt-3 h-4 w-11/12" />
                <Skel className="mt-3 h-4 w-2/3" />
              </div>
            </div>
            <div className="origin-cell origin-cell--big">
              <div className="origin-panel">
                <Skel className="h-4 w-full" />
                <Skel className="mt-3 h-4 w-3/4" />
              </div>
            </div>
            <div className="origin-cell origin-cell--small">
              <div className="origin-panel">
                <Skel className="h-4 w-full" />
                <Skel className="mt-3 h-4 w-1/2" />
              </div>
            </div>
          </div>
        </main>
      </SkeletonPage>
    );
  }

  if (!hero) {
    return (
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-32 text-center sm:px-6">
        <h1 className="font-heading text-3xl font-bold text-graphite">Eroul nu a fost găsit</h1>
        <Link to="/heroes" className="mt-6 inline-flex text-super-red underline underline-offset-4">
          Înapoi la eroi
        </Link>
      </div>
    );
  }

  /* Sculele au zona lor pe profil („Cu ce lucrează”), ca în aplicație; aici rămâne povestea. */
  const hasAnything = panels.length > 0 || Boolean(proud && (proud.beforeUrl || proud.afterUrl));
  /* Numele adevărat ascuns de erou nu se arată nici aici. */
  const shownName = hero.showRealNamePublic === false ? hero.alias : hero.realName || hero.alias;

  return (
    <div className="pb-8 font-sans text-graphite md:pb-20">
      <Helmet>
        <title>{`Cine e sub costum: ${hero.alias} | Superfix`}</title>
        <meta
          name="description"
          content={`Povestea lui ${shownName}, ${hero.category} pe Superfix.`}
        />
        {/* Povestea e și pe profil, deci Google le adună la profil (la fel în api/ssr.ts). */}
        <link rel="canonical" href={`https://super-fix.ro/hero/${hero.slug || slug}`} />
      </Helmet>

      {/* === DEMASCAREA ===
          Profilul spune „Identitate secretă: X". Aici o deschidem: numele real
          devine titlul, iar aliasul coboară pe locul doi. */}
      <header className="mx-auto max-w-5xl px-5 pt-28 sm:px-6">
        <Link
          to={`/hero/${slug}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi la profil
        </Link>

        <div className="mt-8 flex flex-col items-center gap-7 text-center sm:flex-row sm:items-end sm:text-left">
          {hero.avatarUrl && (
            <div className="sf-clay shrink-0 rounded-[28px] p-2">
              <img
                src={thumb(hero.avatarUrl, 360, { square: true })}
                alt=""
                className="block h-32 w-32 rounded-[22px] object-cover sm:h-40 sm:w-40"
              />
            </div>
          )}

          <div className="min-w-0">
            <p className="font-heading text-sm font-semibold uppercase tracking-[0.18em] text-super-red">
              Cine e sub costum
            </p>
            <h1 className="mt-3 font-heading text-[2.4rem] font-bold leading-[1.05] text-graphite sm:text-5xl md:text-6xl">
              {shownName}
            </h1>
            {(shownName !== hero.alias || hero.yearsActive) ? (
              <p className="mt-3 text-lg text-graphite-soft">
                {shownName !== hero.alias && <>Pe teren îi zice <span className="font-semibold text-graphite">{hero.alias}</span></>}
                {shownName !== hero.alias && hero.yearsActive ? ' · ' : null}
                {hero.yearsActive ? <>{hero.yearsActive} ani de meserie</> : null}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-6">
        {!hasAnything && (
          <div className="sf-glass rounded-[28px] p-10 text-center">
            <p className="font-heading text-xl font-medium text-graphite">
              {hero.alias} încă nu și-a scris povestea.
            </p>
            <p className="mt-3 text-graphite-soft">
              Revino peste câteva zile. Între timp, poți vedea ce a lucrat până acum.
            </p>
            <Link
              to={`/hero/${slug}`}
              className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-graphite px-7 font-heading font-semibold text-white transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
            >
              Vezi misiunile lui
            </Link>
          </div>
        )}

        {panels.length > 0 && (
          <div className="origin-grid">
            {panels.map((panel, i) => (
              <Reveal key={panel.key} delay={i * 70} className={`origin-cell origin-cell--${panel.span}`}>
                <article className="origin-panel" data-tone={panel.tone}>
                  <span className="origin-panel__caption">{panel.question}</span>
                  <p className="origin-panel__answer">{panel.answer}</p>
                </article>
              </Reveal>
            ))}
          </div>
        )}

        {proud && (proud.beforeUrl || proud.afterUrl) && (
          <Reveal className="mt-14 block">
            <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-graphite">
              <Images size={24} weight="duotone" className="text-super-red" aria-hidden="true" />
              De ce lucrare ești mândru?
            </h2>
            {proud.title && <p className="mt-2 text-graphite-soft">{proud.title}</p>}

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { url: proud.beforeUrl, label: 'Înainte' },
                { url: proud.afterUrl, label: 'După' },
              ]
                .filter(x => x.url)
                .map(x => (
                  <figure key={x.label}>
                    <img
                      src={x.url as string}
                      alt={`${x.label}: ${proud.title || 'misiune'}`}
                      className="block w-full rounded-[22px] shadow-[0_24px_48px_-20px_rgba(46,51,59,0.5)]"
                    />
                    <figcaption
                      className={`mt-2.5 text-center font-heading text-[11px] font-semibold tracking-wide ${
                        x.label === 'După' ? 'text-super-red' : 'text-graphite-soft'
                      }`}
                    >
                      {x.label}
                    </figcaption>
                  </figure>
                ))}
            </div>
          </Reveal>
        )}
      </main>

      {/* Aceeași bară de acțiune ca pe profil: o singură formă de contact pe tot situl.
          Numărul se cere abia la apăsare (ca pe profil); cererea se deschide pe profil,
          direct cu formularul (`?cerere=1`), ca în aplicație. */}
      <div
        className="sticky bottom-0 z-40 px-3 pb-3 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="sf-glass mx-auto flex max-w-xl gap-2.5 rounded-full p-2">
          <button
            type="button"
            onClick={callHero}
            disabled={calling}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3.5 font-heading text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(5,150,105,0.8)] transition-transform active:scale-[0.97] disabled:opacity-70 sm:hover:-translate-y-0.5"
          >
            <Phone size={18} weight="fill" aria-hidden="true" />
            {calling ? 'Se caută numărul…' : 'Sună acum'}
          </button>
          <Link
            to={`/hero/${slug}?cerere=1`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(355,74%,57%)] to-[hsl(355,66%,46%)] px-4 py-3.5 font-heading text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(225,55,70,0.85)] transition-transform active:scale-[0.97] sm:hover:-translate-y-0.5"
          >
            <PaperPlaneTilt size={18} weight="fill" aria-hidden="true" />
            Trimite cerere
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HeroOrigin;
