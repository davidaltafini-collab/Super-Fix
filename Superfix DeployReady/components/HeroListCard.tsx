import React from 'react';
import { Link } from 'react-router-dom';
import { Hero } from '../types';
import { thumb } from '../lib/img';
import { Tilt } from './motion';
import {
  Star, ShieldCheck, Lightning, Drop, Wrench, PaintRoller, Hammer,
  Key, Broom, Toolbox, ArrowRight, Target,
} from '@phosphor-icons/react';

/* Cardul de erou din listă, folosit și pe paginile pe meserie și loc
   (pages/SeoLanding.tsx), ca un meseriaș să arate la fel oriunde apare. */

// Iconița pentru fiecare meserie — același limbaj vizual ca pe homepage,
// ca filtrele de aici să se lege de secțiunea "Alege după putere".
const TRADE_ICONS: Record<string, React.ElementType> = {
  ELECTRICIAN: Lightning,
  INSTALATOR: Drop,
  MECANIC: Wrench,
  ZUGRAV: PaintRoller,
  TÂMPLAR: Hammer,
  TAMPLAR: Hammer,
  LĂCĂTUȘ: Key,
  LACATUS: Key,
  CURĂȚENIE: Broom,
  CURATENIE: Broom,
};
export const iconForTrade = (name: string): React.ElementType =>
  TRADE_ICONS[name.toUpperCase()] || Toolbox;

/* Poza „în revizie", pentru cine n-are încă poză: 640px WebP, 31 KB.
   Originalul (revizie.png, 766px, 306 KB) întârzia pozele adevărate din listă. */
const DEFAULT_AVATAR = '/revizie-card.webp';

/* Primele carduri se văd fără derulare (două coloane pe telefon): pozele lor
   pornesc imediat și cu prioritate, nu abia când le găsește browserul pe ecran.
   Același număr ca `EAGER_CARDS` din api/ssr.ts. */
export const PRIORITY_CARDS = 4;

/* Schelet în forma cardului final (nu spinner generic): la prima încărcare și cât
   vine bucata următoare — pagina nu "sare". */
export const HeroCardSkeleton: React.FC = () => (
  <div className="sf-glass overflow-hidden rounded-[20px] sm:rounded-[28px]">
    <div className="aspect-square animate-pulse bg-graphite/10 sm:aspect-auto sm:h-60" />
    <div className="p-3 sm:p-5">
      <div className="h-5 w-2/3 animate-pulse rounded-full bg-graphite/10" />
      <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-graphite/10" />
      <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-graphite/10" />
      <div className="mt-5 h-8 w-1/2 animate-pulse rounded-full bg-graphite/10" />
    </div>
  </div>
);

/* CARD EROU — tilt 3D + glare la hover (doar pe pointer fin, vezi componenta Tilt).

   `memo`: când vine bucata următoare, React adaugă doar cardurile noi. Cele deja
   afișate primesc exact același obiect `hero` și nu se mai recalculează deloc. */
export const HeroListCard = React.memo(function HeroListCard({ hero, showDistance, priority = false }: { hero: Hero; showDistance: boolean; priority?: boolean }) {
  const avgRating = hero.ratingAvg ?? 0; // calculată pe server (A9)
  const TradeIcon = iconForTrade(hero.category);
  return (
    <Tilt max={8} className="h-full rounded-[20px] sm:rounded-[28px]">
      <Link
        to={`/hero/${hero.slug || hero.id}`}
        className="group sf-glass relative flex h-full flex-col overflow-hidden rounded-[20px] transition-shadow duration-300 sm:rounded-[28px]"
      >
        {/* Cât de departe e, odată ce știm unde ești.

            Fără asta, „Aproape de mine" nu producea NIMIC vizibil:
            singurul lui efect era ordinea din listă, iar eroii de
            acum au toți același oraș, deci ordinea rămânea
            identică. Adică mergea, dar arăta exact ca și cum nu
            merge. Distanța scrisă pe card e dovada că locația a
            fost preluată și folosită, indiferent de ordine. */}
        {showDistance && hero.distanceKm != null && (
          <div className="absolute left-2 top-2 z-20 sm:left-4 sm:top-4">
              <span className="inline-flex items-center gap-1 rounded-full bg-super-red px-2 py-1 font-heading text-[9px] font-semibold text-white shadow-clay-red sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs">
                  <Target size={12} weight="fill" aria-hidden="true" />
                  {/* De la server, în km întregi, minim 1 (A15). */}
                  {`${hero.distanceKm} km`}
              </span>
          </div>
        )}

        {/* Badge Categorie */}
        <div className="absolute right-2 top-2 z-20 sm:right-4 sm:top-4">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[9px] font-heading font-semibold text-graphite shadow-clay-sm backdrop-blur-md sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs">
                <TradeIcon size={12} weight="fill" className="text-super-red" aria-hidden="true" />
                {hero.category}
            </span>
        </div>

        {/* Imagine — patrat, ca sa respecte safe-space-ul circular din cropper-ul de poza profil.
            `content-visibility: auto`: cât cardul e departe de ecran, browserul nu mai
            desenează poza. Blocul are dimensiune fixă (pătrat / h-60), deci nimic nu
            sare când revine în ecran; umbrele cardului sunt pe Link, în afara lui. */}
        <div className="relative aspect-square overflow-hidden bg-cloud [content-visibility:auto] sm:aspect-auto sm:h-60">
          <img
            src={thumb(hero.avatarUrl || DEFAULT_AVATAR, 640, { square: true })}
            alt={hero.alias}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-graphite/70 to-transparent" />
          <h3 className="absolute bottom-2 left-2.5 right-2.5 truncate font-heading text-base font-bold sf-thicken text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] sm:bottom-3 sm:left-4 sm:right-4 sm:text-2xl">
              {hero.alias}
          </h3>
        </div>

        {/* Conținut */}
        <div className="flex flex-grow flex-col p-3 sm:p-5">

          {/* Stats */}
          <div className="flex items-center justify-between gap-1 rounded-xl bg-white/55 px-2 py-1.5 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2.5">
              <div className="flex flex-col items-center">
                  <span className="flex items-center gap-1 font-heading text-xs sf-thicken text-graphite sm:text-base">
                      <ShieldCheck size={13} weight="fill" className="text-emerald-600" aria-hidden="true" />
                      {hero.trustFactor}
                  </span>
                  <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-wide text-graphite-soft sm:text-[10px]">
                      <span className="sm:hidden">Încr.</span>
                      <span className="hidden sm:inline">Încredere</span>
                  </span>
              </div>
              <div className="h-7 w-px bg-graphite/10 sm:h-8" aria-hidden="true" />
              <div className="flex flex-col items-center">
                  <span className="font-heading text-xs sf-thicken text-graphite sm:text-base">{hero.missionsCompleted}</span>
                  <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-wide text-graphite-soft sm:text-[10px]">Misiuni</span>
              </div>
              <div className="h-7 w-px bg-graphite/10 sm:h-8" aria-hidden="true" />
              <div className="flex flex-col items-center">
                  <span className="flex items-center gap-1 font-heading text-xs sf-thicken text-graphite sm:text-base">
                      <Star size={13} weight="fill" className="text-comic-yellow" aria-hidden="true" />
                      {avgRating > 0 ? avgRating.toFixed(1) : '–'}
                  </span>
                  <span className="mt-0.5 whitespace-nowrap text-[8px] font-extrabold uppercase tracking-wide text-graphite-soft sm:text-[10px]">
                      {hero.reviewCount ?? 0} rec.
                  </span>
              </div>
          </div>

          {/* Descriere scurtă */}
          <p className="mt-2.5 flex-grow text-xs leading-snug text-graphite-soft sm:mt-4 sm:text-sm sm:leading-relaxed">
            {hero.description ? (hero.description.length > 80 ? hero.description.substring(0, 80) + "…" : hero.description) : "Erou gata de acțiune."}
          </p>

          {/* Footer Card */}
          <div className="mt-3 flex items-end justify-between gap-1.5 sm:mt-5">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-wide text-graphite-soft sm:text-[10px]">Tarif orar</p>
              <p className="font-heading text-base font-bold text-super-red sm:text-xl">{hero.hourlyRate} RON</p>
            </div>
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-graphite px-2.5 py-1.5 text-[10px] font-heading font-semibold text-white transition-all duration-200 group-hover:bg-super-red sm:gap-1.5 sm:px-4 sm:py-2 sm:text-xs sm:group-hover:gap-2.5">
                <span className="sm:hidden">Profil</span>
                <span className="hidden sm:inline">Vezi profil</span>
                <ArrowRight size={12} weight="bold" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </Tilt>
  );
});
