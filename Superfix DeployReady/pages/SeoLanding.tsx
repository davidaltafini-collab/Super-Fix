import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ArrowCounterClockwise, Coins, MapPin, Question, Star, Users,
} from '@phosphor-icons/react';

import { getSeoLanding, peekSeoLanding } from '../services/dataService';
import type { SeoLanding as LandingData } from '../lib/seo';
import { HeroListCard, HeroCardSkeleton, iconForTrade } from '../components/HeroListCard';
import { SeoHead } from '../components/SeoHead';
import { SeoCrumbs, SeoLinks } from '../components/SeoNav';
import { GlassButton } from '../components/Button';
import { NotFound } from './NotFound';

/* ============================================================
   Paginile pe meserie și loc (FRONTEND-HANDOFF A14):
   /meserii/electrician, /meserii/electrician/cluj, /zone/bucuresti …

   Câte o pagină pentru fiecare combinație care are meseriași. Adresele,
   titlurile și textele le dă backendul (`/api/seo/landing`); site-ul doar le
   pune în pagină. La intrarea directă pagina vine deja randată de server
   (api/ssr.ts), cu datele alături, deci se desenează fără așteptare.
   ============================================================ */

type View =
  | { status: 'loading' }
  | { status: 'ok'; data: LandingData }
  | { status: 'missing' }
  | { status: 'error' };

/* La fel ca în api/ssr.ts, ca datele trimise de server să fie găsite. */
const normalize = (pathname: string) => pathname.replace(/\/+$/, '').toLowerCase();

function readPage(value: string | null): number {
  const page = Number(value || '1');
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

const rating = (value: number) => value.toFixed(1).replace('.', ',');

/** 1 recenzie, 2 recenzii, 20 de recenzii. */
function count(n: number, one: string, few: string): string {
  const rest = n % 100;
  if (n === 1) return `1 ${one}`;
  if (rest >= 20 || rest === 0) return `${n} de ${few}`;
  return `${n} ${few}`;
}

const GRID = 'relative z-10 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:grid-cols-4';
const PAGER_LINK =
  'sf-glass inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-heading text-sm font-semibold text-graphite transition-transform hover:-translate-y-0.5 active:scale-[0.97]';

export const SeoLanding: React.FC = () => {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const path = normalize(pathname);
  const page = readPage(params.get('page'));

  const [view, setView] = useState<View>(() => {
    const cached = peekSeoLanding(path, page);
    return cached ? { status: 'ok', data: cached } : { status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const cached = peekSeoLanding(path, page);
    if (cached) {
      setView({ status: 'ok', data: cached });
      return;
    }
    let alive = true;
    setView({ status: 'loading' });
    getSeoLanding(path, page).then(result => {
      if (alive) setView(result);
    });
    return () => { alive = false; };
  }, [path, page, attempt]);

  // „Pagina următoare” rămâne pe aceeași adresă, doar `?page` se schimbă: urcăm sus.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) { firstPage.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [page]);

  if (view.status === 'missing') return <NotFound />;

  if (view.status === 'error') {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-24 text-center font-sans text-graphite">
        <h1 className="font-heading text-3xl font-bold">Pagina nu s-a încărcat</h1>
        <p className="mt-3 leading-relaxed text-graphite-soft">Mai încearcă o dată peste câteva momente.</p>
        <GlassButton tone="red" className="mt-7" onClick={() => setAttempt(n => n + 1)}>
          <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
          Încearcă din nou
        </GlassButton>
      </div>
    );
  }

  if (view.status === 'loading') {
    return (
      <div className="relative mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-28 font-sans sm:px-6" aria-busy="true">
        <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center">
          <div className="h-9 w-32 animate-pulse rounded-full bg-graphite/10" />
          <div className="mt-5 h-12 w-4/5 animate-pulse rounded-2xl bg-graphite/10" />
          <div className="mt-5 h-4 w-full animate-pulse rounded-full bg-graphite/10" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-graphite/10" />
        </div>
        <div className={GRID}>
          {[0, 1, 2, 3].map(i => <HeroCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  const { data } = view;
  const isTrade = data.kind.startsWith('trade');
  const categoryLabel = typeof data.category === 'string' ? data.category : data.category?.label || '';
  const KindIcon = isTrade ? iconForTrade(categoryLabel) : MapPin;
  const stats = data.stats || {};
  const pages = data.limit > 0 ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const pageHref = (n: number) => (n <= 1 ? path : `${path}?page=${n}`);
  const faq = (data.faq || []).filter(item => item?.question && item?.answer);

  const chips: { key: string; Icon: React.ElementType; label: string }[] = [];
  if (stats.heroes) chips.push({ key: 'heroes', Icon: Users, label: count(stats.heroes, 'meseriaș', 'meseriași') });
  if (stats.reviewCount && stats.ratingAvg != null) {
    chips.push({ key: 'rating', Icon: Star, label: `Nota ${rating(stats.ratingAvg)} din ${count(stats.reviewCount, 'recenzie', 'recenzii')}` });
  }
  if (stats.priceMin && stats.priceMax) {
    chips.push({
      key: 'price',
      Icon: Coins,
      label: stats.priceMin === stats.priceMax ? `${stats.priceMin} lei/oră` : `${stats.priceMin}–${stats.priceMax} lei/oră`,
    });
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-28 font-sans text-graphite sm:px-6">
      <SeoHead
        title={data.title}
        description={data.metaDescription}
        canonical={data.canonical}
        robots={data.indexable === false ? 'noindex, follow' : undefined}
        og={{ ...data.og, alt: data.h1 }}
        jsonLd={data.jsonLd}
      />

      <SeoCrumbs items={data.breadcrumbs} className="mb-8" />

      <header className="relative z-10 mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 font-heading text-sm font-semibold shadow-clay-sm">
          <KindIcon size={18} weight="fill" className="text-super-red" aria-hidden="true" />
          {isTrade ? categoryLabel || 'Meserie' : 'Zonă'}
        </span>
        <h1 className="mt-5 font-heading text-[2.4rem] font-bold leading-[1.1] sm:text-5xl md:text-6xl">{data.h1}</h1>
        {data.intro && (
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-graphite-soft">{data.intro}</p>
        )}
        {chips.length > 0 && (
          <ul className="mt-7 flex flex-wrap justify-center gap-2 sm:gap-3">
            {chips.map(({ key, Icon, label }) => (
              <li key={key} className="sf-glass inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-heading text-sm font-semibold">
                <Icon size={17} weight="fill" className="text-super-red" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        )}
      </header>

      <section aria-label="Meseriașii">
        <div className={GRID}>
          {data.heroes.map(hero => <HeroListCard key={hero.id} hero={hero} showDistance={false} />)}
        </div>

        {pages > 1 && (
          <nav aria-label="Pagini" className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {page > 1 && (
              <Link to={pageHref(page - 1)} rel="prev" className={PAGER_LINK}>
                <ArrowLeft size={16} weight="bold" aria-hidden="true" />
                Pagina anterioară
              </Link>
            )}
            <span className="px-2 text-sm font-semibold text-graphite-soft">Pagina {page} din {pages}</span>
            {data.hasMore && (
              <Link to={pageHref(page + 1)} rel="next" className={PAGER_LINK}>
                Pagina următoare
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            )}
          </nav>
        )}
      </section>

      {/* Google cere ca întrebările din JSON-LD să se vadă în pagină: text vizibil, nu acordeon închis. */}
      {faq.length > 0 && (
        <section className="sf-glass mx-auto mt-16 max-w-3xl rounded-[28px] p-6 sm:p-8">
          <h2 className="flex items-center gap-2 font-heading text-xl font-medium">
            <Question size={22} weight="duotone" className="text-super-red" aria-hidden="true" />
            Întrebări frecvente
          </h2>
          <dl className="mt-5 space-y-5">
            {faq.map(item => (
              <div key={item.question}>
                <dt className="font-heading text-base font-semibold text-graphite">{item.question}</dt>
                <dd className="mt-1.5 leading-relaxed text-graphite-soft">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="mx-auto mt-12 max-w-3xl space-y-10">
        <SeoLinks title="Pe meserii" links={data.related?.trades} />
        <SeoLinks title="Pe localități" links={data.related?.places} />
        <SeoLinks title="Vezi și" links={data.related?.also} />
      </div>
    </div>
  );
};
