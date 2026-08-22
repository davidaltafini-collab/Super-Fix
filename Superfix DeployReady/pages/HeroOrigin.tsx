import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Phone, PaperPlaneTilt, Wrench, Images } from '@phosphor-icons/react';

import { Hero } from '../types';
import { getHeroBySlug, peekHeroBySlug } from '../services/dataService';
import { Skel, SkeletonPage } from '../components/Loader';
import { thumb, full } from '../lib/img';
import { Reveal } from '../components/motion';
import { Lightbox } from '../components/Lightbox';

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
    { key: 'origin', question: 'Cum a început tot', answer: hero.originStory || '', span: 'wide', tone: 'red' },
    { key: 'hardest', question: 'Cea mai grea misiune', answer: hero.hardestMission || '', span: 'big', tone: 'red' },
    { key: 'tool', question: 'Nu pleacă de acasă fără', answer: hero.favoriteTool || '', span: 'small', tone: 'calm' },
    { key: 'never', question: 'Ce nu face niciodată', answer: hero.neverDoes || '', span: 'big', tone: 'calm' },
    { key: 'team', question: 'Ține cu', answer: hero.team || '', span: 'small', tone: 'red' },
    { key: 'peeve', question: 'Ce îl scoate din sărite', answer: hero.petPeeve || '', span: 'wide', tone: 'calm' },
  ];
  return all.filter(p => p.answer.trim() !== '');
}

export const HeroOrigin: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  /* Daca vii de pe profilul eroului, el e deja incarcat: pagina de origine se
     deseneaza pe loc si doar se reimprospateaza in fundal. Scheletul ramane
     pentru intrarea directa pe link. */
  const [hero, setHero] = useState<Hero | null>(() => peekHeroBySlug(slug || '') ?? null);
  const [loading, setLoading] = useState(() => !peekHeroBySlug(slug || ''));

  // arsenalul se deschide mare, în același lightbox ca video-ul de pe profil
  const [shot, setShot] = useState<string | null>(null);
  const [shotOrigin, setShotOrigin] = useState<DOMRect | null>(null);

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
  const arsenal = hero?.arsenal?.filter(Boolean) ?? [];
  const proud = useMemo(() => {
    if (!hero?.proudMissionId) return null;
    return hero.portfolio?.find(p => p.id === hero.proudMissionId) ?? null;
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

  const hasAnything = panels.length > 0 || arsenal.length > 0 || Boolean(proud);

  return (
    <div className="pb-8 font-sans text-graphite md:pb-20">
      <Helmet>
        <title>{`Cine e sub costum: ${hero.alias} | Superfix`}</title>
        <meta
          name="description"
          content={`Povestea lui ${hero.realName || hero.alias}, ${hero.category} pe Superfix.`}
        />
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
              {hero.realName || hero.alias}
            </h1>
            <p className="mt-3 text-lg text-graphite-soft">
              Pe teren îi zice <span className="font-semibold text-graphite">{hero.alias}</span>
              {hero.yearsActive ? <> · {hero.yearsActive} ani de meserie</> : null}
            </p>
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

        {arsenal.length > 0 && (
          <Reveal className="mt-14 block">
            <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-graphite">
              <Wrench size={24} weight="duotone" className="text-super-red" aria-hidden="true" />
              Arsenalul
            </h2>
            <p className="mt-2 text-graphite-soft">Cu ce vine {hero.alias} la ușa ta.</p>

            <div className="origin-arsenal mt-6">
              {arsenal.map((url, i) => (
                <ArsenalShot
                  key={url + i}
                  url={url}
                  alias={hero.alias}
                  onOpen={(rect) => { setShotOrigin(rect); setShot(url); }}
                />
              ))}
            </div>
          </Reveal>
        )}

        {proud && (proud.beforeUrl || proud.afterUrl) && (
          <Reveal className="mt-14 block">
            <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-graphite">
              <Images size={24} weight="duotone" className="text-super-red" aria-hidden="true" />
              Misiunea de care e mândru
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

      {/* aceeași bară de acțiune ca pe profil: o singură formă de contact pe tot situl */}
      <div
        className="sticky bottom-0 z-40 px-3 pb-3 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="sf-glass mx-auto flex max-w-xl gap-2.5 rounded-full p-2">
          <a
            href={`tel:${hero.phone}`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3.5 font-heading text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(5,150,105,0.8)] transition-transform active:scale-[0.97] sm:hover:-translate-y-0.5"
          >
            <Phone size={18} weight="fill" aria-hidden="true" />
            Sună acum
          </a>
          <Link
            to={`/hero/${slug}`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-graphite px-4 py-3.5 font-heading text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(46,51,59,0.9)] transition-transform active:scale-[0.97] sm:hover:-translate-y-0.5"
          >
            <PaperPlaneTilt size={18} weight="fill" aria-hidden="true" />
            Trimite mesaj
          </Link>
        </div>
      </div>

      <Lightbox
        open={shot !== null}
        onClose={() => setShot(null)}
        originRect={shotOrigin}
        label={`Din arsenalul lui ${hero.alias}`}
      >
        {shot && (
          <img
            src={full(shot)}
            alt=""
            className="max-h-[82svh] w-auto max-w-full rounded-[20px] shadow-[0_28px_60px_-24px_rgba(46,51,59,0.6)]"
          />
        )}
      </Lightbox>
    </div>
  );
};

/* fiecare poză își reține poziția, ca lightbox-ul să crească exact din ea */
const ArsenalShot: React.FC<{
  url: string;
  alias: string;
  onOpen: (rect: DOMRect) => void;
}> = ({ url, alias, onOpen }) => {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      className="origin-arsenal__shot"
      aria-label={`Vezi poza din arsenalul lui ${alias}`}
      onClick={() => { if (ref.current) onOpen(ref.current.getBoundingClientRect()); }}
    >
      <img src={thumb(url, 480)} alt="" loading="lazy" decoding="async" />
    </button>
  );
};

export default HeroOrigin;
