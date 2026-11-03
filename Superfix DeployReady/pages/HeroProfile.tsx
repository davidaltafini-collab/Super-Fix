import React, { useEffect, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Lightbox } from '../components/Lightbox';
import { ClientAuthPanel } from '../components/ClientAuthPanel';
import { useToast } from '../components/Toast';
import { RequestSheet } from '../components/RequestSheet';
import {
  CoveragePanel, GearPanel, PapersPanel, ProfileSection, SignalChip, TeamLink, VerifiedMeter, ownDescription, ownPowers,
} from '../components/HeroParts';
import { loadSearchPlace, parseZone, reachOfZone } from '../lib/place';
import { pauseLabel } from '../lib/signal';
import '../components/form.css';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Hero } from '../types';
import {
  addReview, getHeroBySlug, peekHeroBySlug, getHeroPhone, getHeroSeo, peekHeroSeo, getHeroVerified, type VerifiedStats,
} from '../services/dataService';
import { Skel, SkeletonPage } from '../components/Loader';
import { thumb } from '../lib/img';
import { Helmet } from 'react-helmet-async';
import { failureMessage } from '../lib/apiError';
import { GlassButton } from '../components/Button';
import { AnimatedFolder } from '../components/ui/3d-folder';
import { useNearViewport } from '../hooks/useNearViewport';
import { SeoHead } from '../components/SeoHead';
import { SeoCrumbs, SeoLinks } from '../components/SeoNav';
import type { HeroSeo } from '../lib/seo';
import {
  Phone, PaperPlaneTilt, Target, Star, Play, MoonStars, Prohibit,
  ChatCircleText, CheckCircle, Sparkle, IdentificationCard, Lightning, MaskHappy, ArrowLeft,
  Drop, Wrench, PaintRoller, Hammer, Key, Broom, Toolbox, X, Images,
} from '@phosphor-icons/react';

// Aceleași iconițe de meserie ca pe /heroes și pe homepage.
const TRADE_ICONS: Record<string, React.ElementType> = {
  ELECTRICIAN: Lightning, INSTALATOR: Drop, MECANIC: Wrench,
  ZUGRAV: PaintRoller, TÂMPLAR: Hammer, TAMPLAR: Hammer,
  LĂCĂTUȘ: Key, LACATUS: Key, CURĂȚENIE: Broom, CURATENIE: Broom,
};
const iconForTrade = (name: string): React.ElementType =>
  TRADE_ICONS[(name || '').toUpperCase()] || Toolbox;

/* Recenziile se desenează câte 10, pe măsură ce omul derulează spre ele. Un erou
   cu sute de recenzii nu mai construiește sute de bule la deschiderea paginii,
   deși cei mai mulți nu ajung niciodată până jos. Textul lor complet rămâne
   oricum în răspunsul API (și, la A14, în HTML-ul randat pe server). */
const REVIEWS_STEP = 10;


export const HeroProfile: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const contactPanelRef = React.useRef<HTMLDivElement>(null);
  /** butonul din pil: de acolo creste formularul */
  const msgBtnRef = React.useRef<HTMLButtonElement>(null);
  const [formOrigin, setFormOrigin] = React.useState<DOMRect | null>(null);
  const toast = useToast();
  /** posterul video: de acolo creste lightbox-ul */
  const posterRef = React.useRef<HTMLButtonElement>(null);
  const [videoOpen, setVideoOpen] = React.useState(false);
  const [videoOrigin, setVideoOrigin] = React.useState<DOMRect | null>(null);

  // === STATE BUTON „SUNĂ ACUM" (numărul se cere la apăsare, CONT-FANTOMA.md §7) ===
  const phoneBtnRef = React.useRef<HTMLButtonElement>(null);
  const [phoneLoading, setPhoneLoading] = React.useState(false);
  const [showPhoneQuota, setShowPhoneQuota] = React.useState(false);
  const [phoneQuotaOrigin, setPhoneQuotaOrigin] = React.useState<DOMRect | null>(null);
  const [phoneQuotaMessage, setPhoneQuotaMessage] = React.useState('');
  const canReview = localStorage.getItem('superfix_role') === 'CLIENT' && !!localStorage.getItem('superfix_token');
  
  // === STATE DATE ===
  /* Profilul poate fi deja stiut (te-ai intors din pagina de origine, de exemplu):
     atunci se deseneaza pe loc si se reimprospateaza in fundal. */
  const [hero, setHero] = useState<Hero | null>(() => peekHeroBySlug(slug || '') ?? null);
  const [loading, setLoading] = useState(() => !peekHeroBySlug(slug || ''));
  // Titlul, descrierea, firimiturile și linkurile vin gata de la server (A14).
  const [seo, setSeo] = useState<HeroSeo | undefined>(() => peekHeroSeo(slug || ''));

  // === RECENZII DESENATE TREPTAT ===
  const [visibleReviews, setVisibleReviews] = useState(REVIEWS_STEP);
  const reviewsEndRef = React.useRef<HTMLDivElement>(null);
  const totalReviews = hero?.reviews?.length ?? 0;
  useEffect(() => { setVisibleReviews(REVIEWS_STEP); }, [slug]);
  useNearViewport(reviewsEndRef, () => setVisibleReviews(count => count + REVIEWS_STEP), {
    enabled: visibleReviews < totalReviews,
    resetKey: visibleReviews,
  });
  

  // === CEREREA (formularul, ca în aplicație: components/RequestSheet.tsx) ===
  const [showForm, setShowForm] = useState(false);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  // === STATE RECENZII ===
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [reviewData, setReviewData] = useState({ clientName: '', rating: 5, comment: '' });

  // Nota vine calculată de server (FRONTEND-HANDOFF A9). După o recenzie nouă,
  // `fetchData` reîncarcă profilul, iar serverul o include imediat.
  // Ca în aplicație (`heroRating`): fără nicio recenzie, „0.0”.
  const ratingCount = typeof hero?.reviewCount === 'number' ? hero.reviewCount : hero?.reviews?.length ?? 0;
  const averageRating = ratingCount && hero?.ratingAvg != null ? hero.ratingAvg.toFixed(1) : '0.0';

  // Încărcare date erou
  const fetchData = async () => {
    if (!slug) return;

    try {
      // Folosim noul endpoint de slug pe care l-am creat pe backend
      // prin serviciu, nu cu `fetch` direct: asa raspunsul intra si in memoria
      // de sesiune, iar pagina de origine il gaseste deja acolo
      const data = await getHeroBySlug(slug as string);

      if (!data) {
        navigate('/heroes');
      } else {
        setHero(data);
      }
    } catch (error) {
      console.error("Eroare la încărcare:", error);
      navigate('/heroes');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
    if (slug && localStorage.getItem(`superfix_review_${slug}`)) {
        setHasReviewed(true);
    }
  }, [slug, navigate]);

  /* La intrarea directă, datele SEO au venit deja cu HTML-ul de la server; se
     cer doar când ajungi aici din site (din listă, de pe altă pagină). */
  useEffect(() => {
    if (!slug) return;
    const known = peekHeroSeo(slug);
    setSeo(known);
    if (known) return;
    let alive = true;
    getHeroSeo(slug).then(data => { if (alive && data) setSeo(data); });
    return () => { alive = false; };
  }, [slug]);


  /* HANDLER: „Sună acum" — numărul se cere abia acum, niciodată la încărcarea
     paginii (CONT-FANTOMA.md §7). Anonimii nu mai au barieră (31 aug 2026);
     doar contul verificat mai poate primi `PHONE_QUOTA` (10/zi), caz în care
     arătăm oferta de cont, nu o eroare. */
  const handleCallClick = async () => {
    if (!hero || phoneLoading) return;
    setPhoneLoading(true);
    const result = await getHeroPhone(hero.id);
    setPhoneLoading(false);
    if (result.ok) {
      window.location.href = `tel:${result.phone}`;
      return;
    }
    if (result.error === 'PHONE_QUOTA') {
      setPhoneQuotaMessage(result.message || 'Cu un cont ai numerele salvate, vezi când ajunge omul și îi poți scrie.');
      setPhoneQuotaOrigin(phoneBtnRef.current?.getBoundingClientRect() ?? null);
      setShowPhoneQuota(true);
      return;
    }
    toast.error(result.message || 'Nu am putut deschide numărul. Încearcă din nou.');
  };

  /* După login (Google sau cod pe email), reia direct cererea de telefon —
     omul a ajuns aici fiindcă voia un număr, nu un cont în sine. */
  const handleAuthSuccess = () => {
    setShowPhoneQuota(false);
    handleCallClick();
  };


  /* Butonul spre pagina de origine apare doar dacă are ce arăta. Altfel ar
     duce la o pagină goală, ceea ce e mai rău decât să nu existe. */
  /* Ca în aplicație (`buildInterview`): butonul apare cât interviul are ce arăta — un răspuns
     sau misiunea de care e mândru, cu poze. Sculele au zona lor pe profil („Cu ce lucrează”). */
  const proudMission = hero?.proudMissionId ? hero.portfolio?.find(p => p.missionId === hero.proudMissionId) : undefined;
  const hasOrigin = Boolean(
    [hero?.originStory, hero?.hardestMission, hero?.neverDoes, hero?.favoriteTool, hero?.team, hero?.petPeeve].some(text => text?.trim()) ||
    (proudMission && (proudMission.beforeUrl || proudMission.afterUrl)),
  );

  /* Superputerile: text liber; pe rânduri, virgule, punct și virgulă sau buline devin pastile (ca în aplicație). */
  const powers = ownPowers(hero?.powers);
  const powerList = powers.split(/\r?\n|[,;•]+/).map(x => x.trim()).filter(Boolean);
  const description = ownDescription(hero?.description).trim();

  /* „Verificat de Superfix”: cifre din lucrările reale, venite separat (ca în aplicație). */
  const [verified, setVerified] = useState<VerifiedStats | null>(null);
  useEffect(() => {
    const ref = hero?.slug || hero?.id;
    if (!ref) return;
    let alive = true;
    getHeroVerified(ref).then(stats => { if (alive) setVerified(stats); });
    return () => { alive = false; };
  }, [hero?.slug, hero?.id]);

  /* Locul pentru care caută omul (lista de eroi, sau ultima cerere): dacă eroul nu ajunge până acolo,
     bara spune „Nu ajunge până la tine”, ca în aplicație. Fără loc știut, nu spunem nimic. */
  const zone = parseZone(hero?.zone);
  const searchPlace = loadSearchPlace();
  const reach = reachOfZone(zone, searchPlace?.kind === 'place' ? searchPlace : null);
  const paused = pauseLabel(hero?.offUntil);

  /* Venit cu `?cerere=1` (butonul „Trimite cerere” de pe „Cine e sub costum”): formularul se
     deschide singur, ca în aplicație (`autoRequest`) — dacă eroul ajunge până la locul căutat. */
  const [params, setParams] = useSearchParams();
  const wantsRequest = params.get('cerere') === '1';
  useEffect(() => {
    if (!hero?.id || !wantsRequest) return;
    const timer = window.setTimeout(() => {
      if (reach?.reach !== 'far') setShowForm(true);
      setParams(prev => { const next = new URLSearchParams(prev); next.delete('cerere'); return next; }, { replace: true });
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero?.id, wantsRequest]);

  // HANDLER: Trimitere Recenzie
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Verificăm dacă avem eroul încărcat (el conține ID-ul real de bază de date)
    if (!hero) return;

    const errors: Record<string, string> = {};
    if (!reviewData.clientName.trim()) errors.clientName = 'Cine lasă părerea?';
    if (!reviewData.comment.trim()) errors.comment = 'Câteva vorbe despre cum s-a descurcat.';
    else if (reviewData.comment.trim().length < 10) errors.comment = 'Încă două vorbe și chiar ajuți pe cineva.';
    if (Object.keys(errors).length > 0) {
      setReviewErrors(errors);
      document.getElementById(errors.clientName ? 'review-name' : 'review-comment')?.focus();
      return;
    }
    setReviewErrors({});

    const saved = await addReview(hero.id, {
      clientName: reviewData.clientName,
      rating: reviewData.rating,
      comment: reviewData.comment
    });

    if (saved.ok) {
      setReviewData({ clientName: '', rating: 5, comment: '' });
      setShowReviewForm(false);
      setHasReviewed(true);
      // Salvăm în localStorage folosind slug-ul pentru a ține minte că a votat
      localStorage.setItem(`superfix_review_${slug}`, 'true');
      await fetchData();
    } else {
      toast.error(failureMessage(saved.failure, 'Recenzia nu a putut fi salvată. Poate ai lăsat deja una recent.'));
    }
  };

  /* Scheletul urmeaza exact compozitia profilului: panoul mare de sus, apoi
     doua coloane — dosarul cu misiuni la stanga, Fix-o-metrul si clipul la
     dreapta. Cand vin datele, nimic nu se muta din loc. */
  if (loading) return (
    <SkeletonPage>
      <div className="mx-auto max-w-6xl px-5 pt-28 sm:px-6">
        <div className="sf-panel rounded-[36px] p-6 md:p-10">
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-start">
            <Skel className="h-56 w-56 shrink-0 rounded-[28px]" />
            <div className="w-full">
              <Skel className="h-4 w-32" />
              <Skel className="mt-4 h-11 w-2/3" />
              <Skel className="mt-4 h-4 w-1/2" />
              <div className="mt-7 flex flex-wrap gap-3">
                {[0, 1, 2, 3].map(i => <Skel key={i} className="h-20 w-28 rounded-2xl" />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 py-12 sm:px-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Skel className="h-6 w-44" />
          <Skel className="mt-6 h-[320px] w-full rounded-[28px]" />
        </div>
        <div className="space-y-6">
          <Skel className="h-[190px] w-full rounded-[28px]" />
          <Skel className="h-[240px] w-full rounded-[28px]" />
        </div>
      </div>
    </SkeletonPage>
  );
  if (!hero) return null;

  const TradeIcon = iconForTrade(hero.category);
  /* Ca în aplicație: pe profil stau doar lucrările cu ambele poze (înainte și după), cele mai noi întâi. */
  const portfolio = (hero.portfolio || [])
    .filter(p => p.beforeUrl && p.afterUrl)
    .sort((a, b) => (b.completedAt ? new Date(b.completedAt).getTime() : 0) - (a.completedAt ? new Date(a.completedAt).getTime() : 0));
  // Coperta din dosar = rezultatul ("după"); vizualizatorul primește ambele poze,
  // ca să le poată stivui una în spatele alteia.
  const folderProjects = portfolio.map((p, i) => ({
    id: p.id,
    image: (p.afterUrl || p.beforeUrl) as string,
    title: p.title || `Misiunea ${i + 1}`,
    beforeUrl: p.beforeUrl,
    afterUrl: p.afterUrl,
  }));
  const realNameLabel = hero.showRealNamePublic === false ? 'Ascunsă' : hero.realName || 'Necunoscută';
  const reviews = hero.reviews || [];
  const far = reach?.reach === 'far';

  const openRequest = () => {
    // citim ACUM dreptunghiul butonului: de acolo creste panoul
    setFormOrigin(msgBtnRef.current?.getBoundingClientRect() ?? null);
    setShowForm(true);
  };

  return (
    // pb mai mare pe mobil: conținutul să nu rămână sub bara fixă de acțiune
    <div className="pb-8 font-sans text-graphite md:pb-20">
      {/* === SEO (A14) ===
          Aceleași taguri ca în HTML-ul de pe server (api/ssr.ts), luate ca atare
          din `/api/seo/hero`: titlul, descrierea, canonical, previzualizarea și
          JSON-LD-ul potrivit meseriei. Nimic compus aici. */}
      {seo ? (
        <SeoHead
          title={seo.title}
          description={seo.metaDescription}
          canonical={seo.canonical}
          og={{ ...seo.og, alt: hero.alias }}
          jsonLd={seo.jsonLd}
        />
      ) : (
        <Helmet>
          <title>{`${hero.alias} | Super-Fix`}</title>
        </Helmet>
      )}

      {/* === HEADER: FIȘA EROULUI (ca în aplicație: poza, nivelul, meseria, numele,
          identitatea, semnalul, „Cine e sub costum”, cele trei cifre) === */}
      <div className="mx-auto max-w-6xl px-5 pt-28 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Link
            to="/heroes"
            className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
          >
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            Înapoi la eroi
          </Link>
          {/* „Super-Fix › Electrician › București › Petrica Iscusitul” (seo.breadcrumbs) */}
          <SeoCrumbs items={seo?.breadcrumbs} />
        </div>

        <div className="sf-panel relative overflow-hidden rounded-[36px] p-6 md:p-10">
          <div className="relative flex flex-col items-center gap-7 md:flex-row md:items-start md:gap-10">

             {/* Avatar cu Level Badge */}
             <div className="relative shrink-0">
                <div className="absolute -inset-4 rounded-[36px] bg-spark/15 blur-2xl" aria-hidden="true" />
                <div className="sf-clay relative h-44 w-44 overflow-hidden rounded-[26px] p-1.5 sm:h-52 sm:w-52 md:h-60 md:w-60">
                    <img
                      src={thumb(hero.avatarUrl || '/revizie-card.webp', 720, { square: true })}
                      alt={hero.alias}
                      fetchPriority="high"
                      className="h-full w-full rounded-[20px] object-cover"
                    />
                </div>
                <div className="sf-clay-red absolute -bottom-2.5 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-heading text-xs font-bold text-white md:left-auto md:right-0 md:translate-x-2">
                    <Sparkle size={13} weight="fill" aria-hidden="true" />
                    LVL {Math.floor(hero.missionsCompleted / 10) + 1}
                </div>
             </div>

             {/* Info Text */}
             <div className="flex-grow text-center md:pt-1 md:text-left">
               <span className="sf-clay inline-flex items-center gap-2 rounded-full px-4 py-2 font-heading text-sm font-semibold text-graphite">
                 <TradeIcon size={17} weight="fill" className="text-super-red" aria-hidden="true" />
                 {hero.category}
               </span>

               <h1 className="mt-4 font-heading text-[2.1rem] font-bold leading-[1.08] text-graphite sm:text-5xl md:text-6xl">{hero.alias}</h1>

               <p className="mt-3 inline-flex items-center gap-2 text-sm text-graphite-soft md:text-base">
                   <IdentificationCard size={17} weight="duotone" aria-hidden="true" />
                   Identitate secretă: <span className="font-semibold text-graphite">{realNameLabel}</span>
               </p>

               {/* Semnalul: la datorie acum, sau când răspunde. Cererea pleacă oricum. */}
               <div className="mt-3">
                 <SignalChip offUntil={hero.offUntil} />
               </div>

               {hasOrigin && (
                 <Link
                   to={`/hero/${slug}/origine`}
                   className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-graphite/15 bg-white/80 px-5 font-heading text-sm font-semibold text-graphite shadow-lift backdrop-blur-md transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
                 >
                   <MaskHappy size={18} weight="duotone" className="text-super-red" aria-hidden="true" />
                   Cine e sub costum
                 </Link>
               )}

               {/* Stats: aceleași trei cifre ca în aplicație */}
               <div className="mt-7 grid grid-cols-3 gap-3">
                 <div className="sf-clay rounded-2xl p-4 text-center">
                   <Target size={20} weight="duotone" className="mx-auto text-spark" aria-hidden="true" />
                   <div className="mt-1.5 font-heading text-2xl font-bold text-graphite">{hero.missionsCompleted}</div>
                   <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-graphite-soft">Misiuni</div>
                 </div>

                 <div className="sf-clay rounded-2xl p-4 text-center">
                   <Star size={20} weight="fill" className="mx-auto text-amber-500" aria-hidden="true" />
                   <div className="mt-1.5 font-heading text-2xl font-bold text-graphite">{averageRating}</div>
                   <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-graphite-soft">{ratingCount} recenzii</div>
                 </div>

                 {/* Celula roșie: cifra sus, iar jos ce trebuie știut despre ea (tariful e orientativ). */}
                 <div className="sf-clay-red flex flex-col justify-between rounded-2xl px-2 pb-2.5 pt-4 text-center text-white">
                   <div>
                     <div className="font-heading text-2xl font-bold leading-none">{hero.hourlyRate}</div>
                     <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/85">RON / oră</div>
                   </div>
                   <div className="mt-1.5 text-[9px] leading-[1.25] text-white/75">estimativ,<br />poate varia</div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* === CONȚINUTUL, în ordinea din aplicație ===
          Pe telefon o singură coloană: echipa, Fix-o-metrul, clipul, misiunile, dosarul,
          superputerile, sculele, actele, zona, recenziile. Pe ecran lat, Fix-o-metrul și
          clipul stau în coloana din dreapta, lipite cât derulezi. */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 py-12 sm:px-6 md:grid-cols-3">

        <div className="space-y-8 md:col-span-2">
          {/* === MISIUNI REZOLVATE (poze înainte/după) === */}
          {portfolio.length > 0 && (
            <ProfileSection title="Misiuni rezolvate" icon={Images} sub="Lucrări reale, verificate de echipa Superfix." panel={false}>
              {/* Dosarul 3D e SINGURA cale de intrare în portofoliu. */}
              <div className="sf-glass flex justify-center rounded-[28px] p-6 sm:p-7">
                <AnimatedFolder
                  className="shrink-0"
                  title="Dosar lucrări"
                  subtitle={`${portfolio.length} ${portfolio.length === 1 ? 'misiune' : 'misiuni'}`}
                  projects={folderProjects}
                />
              </div>
            </ProfileSection>
          )}

          {/* Textul pus de server la aprobare nu e al omului: fără el, fără panou. */}
          {description && (
            <ProfileSection title="Dosar erou" icon={IdentificationCard}>
              <p className="whitespace-pre-line text-lg leading-relaxed text-graphite-soft">{description}</p>
            </ProfileSection>
          )}

          {powers && (
            <ProfileSection title="Superputeri" icon={Sparkle} weight="fill">
              {powerList.length > 1 ? (
                <ul className="flex flex-wrap gap-2.5">
                  {powerList.map(power => (
                    <li key={power} className="sf-clay rounded-full px-4 py-2 font-heading text-sm font-semibold text-graphite">
                      {power}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-lg leading-relaxed text-graphite-soft">{powers}</p>
              )}
            </ProfileSection>
          )}

          {/* Sculele: zona lor, ca în aplicație (înainte stăteau în „Cine e sub costum”). */}
          <GearPanel items={hero.arsenal} alias={hero.alias} />

          <PapersPanel papers={hero.papers} alias={hero.alias} />

          <CoveragePanel zone={zone} areas={Array.isArray(hero.actionAreas) ? hero.actionAreas : []} />

          {/* Jurnalul gol apare doar cui poate scrie prima recenzie (ca în aplicație). */}
          {(reviews.length > 0 || hasReviewed || canReview) && (
          <ProfileSection
            title="Jurnal de recenzii"
            icon={ChatCircleText}
            panel={false}
            action={!hasReviewed && canReview ? (
              <GlassButton type="button" tone="neutral" onClick={() => setShowReviewForm(!showReviewForm)}>
                {showReviewForm
                  ? <><X size={16} weight="bold" aria-hidden="true" /> Închide</>
                  : <><Star size={16} weight="fill" aria-hidden="true" /> Recenzie</>}
              </GlassButton>
            ) : undefined}
          >
             {/* Formular Recenzie */}
            {showReviewForm && !hasReviewed && canReview && (
              <div className="sf-glass mb-8 rounded-[28px] p-6">
                <h3 className="font-heading text-xl font-medium">Scrie o recenzie</h3>
                <form onSubmit={handleReviewSubmit} noValidate className="mt-5 space-y-5">
                   <div className="sf-field">
                       <label htmlFor="review-name" className="sf-field__label">Numele tău</label>
                       <input
                           id="review-name"
                           type="text"
                           className="sf-field__input"
                           value={reviewData.clientName}
                           placeholder="Ex: Popescu Ion"
                           aria-invalid={Boolean(reviewErrors.clientName)}
                           aria-describedby={reviewErrors.clientName ? 'review-name-error' : undefined}
                           onChange={e => {
                             setReviewData({ ...reviewData, clientName: e.target.value });
                             if (reviewErrors.clientName) setReviewErrors(prev => { const n = { ...prev }; delete n.clientName; return n; });
                           }}
                       />
                       {reviewErrors.clientName && (
                         <p id="review-name-error" className="sf-field__error">
                           {reviewErrors.clientName}
                         </p>
                       )}
                   </div>

                   <div>
                       <span className="mb-2 block text-sm font-semibold text-graphite">Nota</span>
                       <div className="flex gap-1.5" role="group" aria-label="Alege nota">
                           {[1, 2, 3, 4, 5].map(star => (
                           <button
                               key={star}
                               type="button"
                               onClick={() => setReviewData({...reviewData, rating: star})}
                               aria-label={`${star} ${star === 1 ? 'stea' : 'stele'}`}
                               aria-pressed={star === reviewData.rating}
                               className="rounded-full p-1 transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-super-red"
                           >
                               <Star
                                   size={30}
                                   weight="fill"
                                   className={star <= reviewData.rating ? 'text-comic-yellow' : 'text-graphite/20'}
                                   aria-hidden="true"
                               />
                           </button>
                           ))}
                       </div>
                   </div>

                   <div className="sf-field">
                       <label htmlFor="review-comment" className="sf-field__label">Comentariu</label>
                       <textarea
                           id="review-comment"
                           rows={3}
                           className="sf-field__input"
                           value={reviewData.comment}
                           placeholder="Cum s-a descurcat eroul?"
                           aria-invalid={Boolean(reviewErrors.comment)}
                           aria-describedby={reviewErrors.comment ? 'review-comment-error' : undefined}
                           onChange={e => {
                             setReviewData({ ...reviewData, comment: e.target.value });
                             if (reviewErrors.comment) setReviewErrors(prev => { const n = { ...prev }; delete n.comment; return n; });
                           }}
                       ></textarea>
                       {reviewErrors.comment && (
                         <p id="review-comment-error" className="sf-field__error">
                           {reviewErrors.comment}
                         </p>
                       )}
                   </div>

                   <GlassButton type="submit" tone="dark" full>
                     Publică recenzia
                   </GlassButton>
                </form>
              </div>
            )}

            {/* Feedback Recenzie Adăugată */}
            {hasReviewed && (
                <div className="mb-6 flex items-center gap-3 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200" role="status">
                    <CheckCircle size={26} weight="fill" className="shrink-0 text-emerald-600" aria-hidden="true" />
                    <h3 className="font-heading text-lg font-semibold text-emerald-900">Mulțumim pentru feedback!</h3>
                </div>
            )}

            {/* Lista Recenzii */}
            <div className="space-y-5">
              {reviews.length === 0 && !hasReviewed && (
                  <div className="sf-glass rounded-[28px] p-8 text-center">
                      <Star size={34} weight="regular" className="mx-auto text-graphite/30" aria-hidden="true" />
                      <p className="mt-3 text-graphite-soft">Încă nu sunt recenzii.</p>
                  </div>
              )}
              {reviews.slice(0, visibleReviews).map((review: any) => (
                // bulă de dialog: colțul din stânga-jos e "coada" (rounded-bl-md)
                <div key={review.id} className="sf-glass rounded-[24px] rounded-bl-md p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                     <span className="font-heading text-lg font-semibold text-graphite">{review.clientName}</span>
                     <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-graphite-soft">
                       {new Date(review.date).toLocaleDateString('ro-RO')}
                     </span>
                  </div>
                  <div className="mt-2 flex gap-0.5" aria-label={`${review.rating} din 5 stele`}>
                    {[0, 1, 2, 3, 4].map(i => (
                      <Star
                        key={i}
                        size={15}
                        weight="fill"
                        className={i < review.rating ? 'text-comic-yellow' : 'text-graphite/20'}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  {review.comment && <p className="mt-3 leading-relaxed text-graphite-soft">{review.comment}</p>}
                  {review.teamName && <p className="mt-2.5 text-xs font-semibold text-graphite-soft">La o lucrare cu echipa {review.teamName}</p>}
                </div>
              ))}
              {visibleReviews < totalReviews && <div ref={reviewsEndRef} aria-hidden="true" className="h-px" />}
            </div>
          </ProfileSection>
          )}
        </div>

        {/* COLOANA DREAPTA: echipa, Fix-o-metrul, clipul. `order-first` doar pe telefon,
            ca ordinea să fie cea din aplicație (înaintea misiunilor). */}
        <div className="order-first md:order-none md:col-span-1">
          <div ref={contactPanelRef} className="space-y-5 scroll-mt-28 md:sticky md:top-28">
            {hero.memberOf && <TeamLink team={hero.memberOf} alias={hero.alias} />}

            <VerifiedMeter trust={hero.trustFactor} stats={verified} />

            {hero.videoUrl && (
              <button
                ref={posterRef}
                type="button"
                onClick={() => {
                  setVideoOrigin(posterRef.current?.getBoundingClientRect() ?? null);
                  setVideoOpen(true);
                }}
                aria-label={`Vezi videoclipul de prezentare al lui ${hero.alias}`}
                className="sf-glass group relative block w-full overflow-hidden rounded-[28px] p-2 text-left transition-transform duration-300 hover:-translate-y-0.5"
              >
                <div className="relative overflow-hidden rounded-[20px] bg-cloud">
                  {hero.avatarUrl ? (
                    <img
                      src={thumb(hero.avatarUrl, 800)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="block aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] md:aspect-square"
                    />
                  ) : (
                    <div className="aspect-[4/5] w-full md:aspect-square" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/60 bg-white/85 text-super-red shadow-[0_10px_24px_-8px_rgba(46,51,59,0.55)] backdrop-blur-md transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
                      <Play size={26} weight="fill" className="ml-0.5" aria-hidden="true" />
                    </span>
                  </span>

                  <span
                    className="absolute inset-x-4 bottom-4 font-heading text-sm font-semibold text-white"
                    style={{ textShadow: '0 1px 2px rgba(20,24,30,0.7), 0 2px 14px rgba(20,24,30,0.5)' }}
                  >
                    Cunoaște-l pe {hero.alias}
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* === MAI MULȚI MESERIAȘI (seo.links, A14) === */}
      {seo?.links?.length ? (
        <div className="mx-auto max-w-6xl px-5 pb-12 sm:px-6">
          <SeoLinks title="Mai mulți meseriași" links={seo.links} className="sf-glass rounded-[28px] p-6 sm:p-7" />
        </div>
      ) : null}

      {/* === BARĂ DE ACȚIUNE ANDOCABILĂ ===
          Singura suprafață de acțiune din pagină, pe toate ecranele. `sticky`, nu
          `fixed`: stă lipită jos cât timp poziția ei reală e sub ecran.
          Aceleași acțiuni ca în aplicație: „Sună acum” (în pauză, până când) și
          cererea — „Trimite cerere”, sau „Nu ajunge până la tine” când locul căutat
          e dincolo de unde vine. */}
      <div
        className="sticky bottom-0 z-40 px-3 pb-3 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="sf-glass mx-auto flex max-w-xl gap-2.5 rounded-full p-2">
          <button
            ref={phoneBtnRef}
            type="button"
            onClick={handleCallClick}
            disabled={phoneLoading}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3.5 font-heading text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-70 sm:hover:-translate-y-0.5 ${
              paused ? 'bg-[#3B4460] shadow-[0_10px_22px_-10px_rgba(59,68,96,0.8)]' : 'bg-emerald-600 shadow-[0_10px_22px_-10px_rgba(5,150,105,0.8)]'
            }`}
          >
            {paused ? <MoonStars size={18} weight="fill" aria-hidden="true" /> : <Phone size={18} weight="fill" aria-hidden="true" />}
            {phoneLoading ? 'Se caută numărul…' : paused ?? 'Sună acum'}
          </button>
          <button
            ref={msgBtnRef}
            type="button"
            onClick={openRequest}
            disabled={far}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(355,74%,57%)] to-[hsl(355,66%,46%)] px-4 py-3.5 font-heading text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(225,55,70,0.85)] transition-transform active:scale-[0.97] disabled:opacity-60 disabled:saturate-50 sm:hover:-translate-y-0.5"
          >
            {far ? <Prohibit size={18} weight="bold" aria-hidden="true" /> : <PaperPlaneTilt size={18} weight="fill" aria-hidden="true" />}
            {far ? 'Nu ajunge până la tine' : 'Trimite cerere'}
          </button>
        </div>
      </div>

      {/* Video curat, pe tot ecranul: doar clipul, colțuri rotunjite, sticlă în
          spate. Crește din poster, ca tot restul sitului. */}
      <Lightbox
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        originRect={videoOrigin}
        label={`Videoclip de prezentare: ${hero.alias}`}
      >
        <div className="flex h-[78svh] w-full items-center justify-center">
          <video
            src={hero.videoUrl}
            controls
            autoPlay
            playsInline
            preload="metadata"
            poster={hero.avatarUrl}
            className="max-h-full max-w-full rounded-[20px] bg-transparent shadow-[0_28px_60px_-24px_rgba(46,51,59,0.6)]"
          >
            Browserul tău nu suportă video.
          </video>
        </div>
      </Lightbox>

      {/* Oferta de cont la a doua cerere de număr într-o zi (CONT-FANTOMA.md §8).
          Copy-ul e dat cuvânt cu cuvânt acolo — nu-l reformula. */}
      <Sheet
        open={showPhoneQuota}
        onClose={() => setShowPhoneQuota(false)}
        originRect={phoneQuotaOrigin}
        title="Ține minte eroii pe care i-ai sunat"
        subtitle={phoneQuotaMessage}
        variant="modal"
      >
        <ClientAuthPanel
          onSuccess={handleAuthSuccess}
          onSkip={() => {
            setShowPhoneQuota(false);
            setFormOrigin(phoneQuotaOrigin);
            setShowForm(true);
          }}
        />
      </Sheet>

      {/* Cererea, ca în aplicație: crește din butonul „Trimite cerere”. Stă montată tot timpul,
          ca ce ai scris să rămână dacă o închizi și o redeschizi. */}
      <RequestSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        originRect={formOrigin}
        hero={{ id: hero.id, alias: hero.alias, zone: hero.zone, offUntil: hero.offUntil }}
      />
    </div>
  );
};
