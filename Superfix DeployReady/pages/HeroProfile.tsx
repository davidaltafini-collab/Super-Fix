import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Lightbox } from '../components/Lightbox';
import { useToast } from '../components/Toast';
import { getCurrentLocation, geocodeAddress, isLocationError, locationErrorText } from '../lib/geo';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { RequestPhotosField } from '../components/RequestPhotos';
/* Leaflet are ~150 KB si se foloseste abia daca omul deschide formularul SI apasa
   pe locatie. In pachetul de start n-are ce cauta: il aducem la nevoie. */
const MapPicker = lazy(() => import('../components/Map').then(m => ({ default: m.MapPicker })));
import '../components/form.css';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Hero, ServiceRequest } from '../types';
import {
  getHeroById, createServiceRequest, addReview, getHeroBySlug, peekHeroBySlug, getHeroPhone,
} from '../services/dataService';
import { Skel, SkeletonPage } from '../components/Loader';
import { thumb } from '../lib/img';
import { RomaniaMap } from '../components/RomaniaMap';
import { Helmet } from 'react-helmet-async';
import { API_URL } from '../config/api';
import { GlassButton } from '../components/Button';
import { AnimatedFolder } from '../components/ui/3d-folder';
import {
  Phone, PaperPlaneTilt, ShieldCheck, Target, Star, MapPin, VideoCamera, Play,
  ChatCircleText, CheckCircle, Sparkle, IdentificationCard, Lightning, MaskHappy, ArrowLeft, NavigationArrow,
  Drop, Wrench, PaintRoller, Hammer, Key, Broom, Toolbox, X, Info, Images,
} from '@phosphor-icons/react';

// Aceleași iconițe de meserie ca pe /heroes și pe homepage.
const TRADE_ICONS: Record<string, React.ElementType> = {
  ELECTRICIAN: Lightning, INSTALATOR: Drop, MECANIC: Wrench,
  ZUGRAV: PaintRoller, TÂMPLAR: Hammer, TAMPLAR: Hammer,
  LĂCĂTUȘ: Key, LACATUS: Key, CURĂȚENIE: Broom, CURATENIE: Broom,
};
const iconForTrade = (name: string): React.ElementType =>
  TRADE_ICONS[(name || '').toUpperCase()] || Toolbox;


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
  
  // === STATE FORMULAR CERERE ===
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', desc: '', address: '' });
  /* Coordonatele exacte, dacă omul a apăsat „Folosește locația mea". Fără ele,
     eroul primește doar adresa scrisă, iar harta se aprinde prin geocodare,
     care e mai puțin precisă. */
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** adresele pozelor deja urcate; se trimit ca `requestPhotos` */
  const [photos, setPhotos] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // === STATE RECENZII ===
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [reviewData, setReviewData] = useState({ clientName: '', rating: 5, comment: '' });

  // Calculare rating mediu din recenzii
  const averageRating = hero?.reviews && hero.reviews.length > 0 
    ? (hero.reviews.reduce((acc: number, rev: any) => acc + rev.rating, 0) / hero.reviews.length).toFixed(1)
    : 0;

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

  // HANDLER: Trimitere Cerere Misiune (SOS)
  const locate = async () => {
    setLocating(true);
    const result = await getCurrentLocation();
    setLocating(false);
    if (isLocationError(result)) {
      toast.error(locationErrorText(result.reason));
      return;
    }
    setCoords({ lat: result.location.lat, lng: result.location.lng });
    if (result.location.address) {
      setFormData(f => ({ ...f, address: result.location.address as string }));
    }
    setFieldErrors(prev => { const n = { ...prev }; delete n.address; return n; });
    toast.success('Locație preluată. Eroul vede exact unde să vină.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hero) return;
    
    /* Validarea o facem noi, nu browserul. `noValidate` pe formular scoate din
       joc balonul lui: apare în engleză, cu stilul sistemului de operare, lângă
       câmp dar în afara paginii, și nu seamănă cu nimic de aici. */
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Eroul vrea să știe pe cine salvează.';
    const digits = formData.phone.replace(/\D/g, '');
    if (!formData.phone.trim()) errors.phone = 'Aici sună eroul când pornește spre tine.';
    else if (digits.length < 9) errors.phone = 'Numărul pare să fi pierdut câteva cifre.';
    if (!formData.email.trim()) errors.email = 'Aici trimitem confirmarea misiunii.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email.trim()))
      errors.email = 'Parcă lipsește o bucată din adresă.';
    if (!formData.address.trim() && !coords) errors.address = 'Unde venim? Scrie adresa sau apasă pe buton.';
    if (!formData.desc.trim()) errors.desc = 'Ce s-a stricat? Așa știe ce unelte să ia.';
    else if (formData.desc.trim().length < 10) errors.desc = 'Încă două vorbe și știe exact ce-l așteaptă.';
    if (!termsAccepted) errors.terms = 'O bifă și pornim semnalul.';

    if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const first = ['address', 'name', 'phone', 'email', 'desc', 'terms'].find(k => errors[k]);
        document.getElementById(first === 'terms' ? 'gdpr' : `sos-${first}`)?.focus();
        return;
    }
    setFieldErrors({});

    setIsSubmitting(true);
    
    const request: ServiceRequest = {
      id: Date.now().toString(),
      heroId: hero.id,
      clientName: formData.name,
      clientEmail: formData.email,
      clientPhone: formData.phone,
      description: formData.desc,
      status: 'PENDING',
      date: new Date().toISOString(),
      address: formData.address.trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      /* Serverul ignoră în tăcere ce nu e de pe media noastră, dar aici nu are
         ce ignora: adresele vin chiar din răspunsul lui la urcare. */
      requestPhotos: photos,
    };

    const requestCreated = await createServiceRequest(request);
    setIsSubmitting(false);
    if (!requestCreated) {
      toast.error('Semnalul s-a pierdut pe drum. Mai încearcă o dată.');
      return;
    }
    setSubmitSuccess(true);
    
    setTimeout(() => {
      setShowForm(false);
      setSubmitSuccess(false);
      setFormData({ name: '', phone: '', email: '', desc: '', address: '' });
      setCoords(null);
      setPhotos([]);
      setTermsAccepted(false);
    }, 4000);
  };

  /* HANDLER: „Sună acum" — numărul se cere abia acum, niciodată la încărcarea
     paginii (CONT-FANTOMA.md §7): un anonim are dreptul la un singur număr, o
     dată; a doua oară serverul întoarce `PHONE_QUOTA` și arătăm oferta de cont,
     nu o eroare. */
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

  /* `powers` e text liber scris de erou. Dacă e o enumerare, o arătăm ca listă
     de servicii; dacă e o frază, rămâne frază. Nu impunem un format pe care
     eroii nu-l cunosc. */
  /* Butonul de trimitere arată dacă mai lipsește ceva: cât timp un câmp e gol
     sau termenii nu sunt bifați, stă stins. Când totul e pus la punct, se
     saturează. Nu îl dezactivăm: browserul trebuie să poată duce omul la câmpul
     care lipsește când apasă. */
  const formReady =
    formData.name.trim() !== '' &&
    formData.phone.trim() !== '' &&
    formData.email.trim() !== '' &&
    formData.desc.trim() !== '' &&
    termsAccepted;

  /* Butonul spre pagina de origine apare doar dacă are ce arăta. Altfel ar
     duce la o pagină goală, ceea ce e mai rău decât să nu existe. */
  const hasOrigin = Boolean(
    hero?.originStory || hero?.hardestMission || hero?.neverDoes ||
    hero?.favoriteTool || hero?.team || hero?.petPeeve || hero?.arsenal?.length,
  );

  const powerList = React.useMemo(() => {
    const raw = (hero?.powers || '').trim();
    if (!raw) return null;
    const parts = raw
      .split(new RegExp('[,;\u00b7\n|]+'))
      .map(x => x.trim())
      .filter(Boolean);
    const looksLikeList = parts.length >= 2 && parts.every(x => x.length <= 42);
    return looksLikeList ? parts : null;
  }, [hero?.powers]);

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

    const success = await addReview(hero.id, {
      clientName: reviewData.clientName,
      rating: reviewData.rating,
      comment: reviewData.comment
    });

    if (success) {
      setReviewData({ clientName: '', rating: 5, comment: '' });
      setShowReviewForm(false);
      setHasReviewed(true);
      // Salvăm în localStorage folosind slug-ul pentru a ține minte că a votat
      localStorage.setItem(`superfix_review_${slug}`, 'true');
      await fetchData();
    } else {
      toast.error('Recenzia nu a putut fi salvată. Poate ai lăsat deja una recent.');
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
  const reviewCount = hero.reviews?.length || 0;
  // Doar lucrările care au măcar o poză — altfel secțiunea ar arăta găuri.
  const portfolio = (hero.portfolio || []).filter(p => p.beforeUrl || p.afterUrl);
  // Coperta din dosar = rezultatul ("după"); vizualizatorul primește ambele poze,
  // ca să le poată stivui una în spatele alteia.
  const folderProjects = portfolio.map((p, i) => ({
    id: p.id,
    image: (p.afterUrl || p.beforeUrl) as string,
    title: p.title || `Misiunea ${i + 1}`,
    beforeUrl: p.beforeUrl,
    afterUrl: p.afterUrl,
  }));

  return (
    // pb mai mare pe mobil: conținutul să nu rămână sub bara fixă de acțiune
    <div className="pb-8 font-sans text-graphite md:pb-20">
      {/* === SEO DYNAMIC META TAGS === */}
      <Helmet>
        <title>{`${hero.alias} - ${hero.category} Profesionist | Superfix`}</title>
        <meta name="description" content={`Contactează-l pe ${hero.alias} pentru servicii de ${hero.category}. Tarif: ${hero.hourlyRate} RON/h. Vezi recenzii și portofoliu video.`} />
        <meta property="og:title" content={`${hero.alias} - ${hero.category} | Superfix`} />
        <meta property="og:description" content={`Ai nevoie de un ${hero.category}? ${hero.alias} te poate ajuta! Vezi profilul complet.`} />
        <meta property="og:image" content={hero.avatarUrl || 'https://superfix.ro/og-default.jpg'} />
        
        {/* Structured Data pentru Google (Schema.org) */}
        <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              "name": hero.alias,
              "image": hero.avatarUrl,
              "priceRange": `${hero.hourlyRate} RON`,
              "description": hero.description,
              "address": {
                  "@type": "PostalAddress",
                  "addressCountry": "RO"
              }
            })}
        </script>
      </Helmet>

      {/* === HEADER: FIȘA EROULUI === */}
      <div className="mx-auto max-w-6xl px-5 pt-28 sm:px-6">
        <Link
          to="/heroes"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi la eroi
        </Link>

        <div className="sf-panel relative overflow-hidden rounded-[36px] p-6 md:p-10">
          <div className="relative flex flex-col items-center gap-7 md:flex-row md:items-start md:gap-10">

             {/* Avatar cu Level Badge */}
             <div className="relative shrink-0">
                <div className="absolute -inset-4 rounded-[36px] bg-spark/15 blur-2xl" aria-hidden="true" />
                <div className="sf-clay relative h-44 w-44 overflow-hidden rounded-[26px] p-1.5 sm:h-52 sm:w-52 md:h-60 md:w-60">
                    <img
                      src={thumb(hero.avatarUrl || 'https://super-fix.ro/revizie.png', 720, { square: true })}
                      alt={hero.alias}
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
                   Identitate secretă: <span className="font-semibold text-graphite">{hero.realName || 'Necunoscută'}</span>
               </p>

               {hasOrigin && (
                 <Link
                   to={`/hero/${slug}/origine`}
                   className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-graphite/15 bg-white/80 px-5 font-heading text-sm font-semibold text-graphite shadow-lift backdrop-blur-md transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
                 >
                   <MaskHappy size={18} weight="duotone" className="text-super-red" aria-hidden="true" />
                   Cine e sub costum
                 </Link>
               )}

               {/* Stats */}
               {/* Fix-o-metrul nu mai e o celulă printre altele: are blocul lui,
                   lângă video. Aici rămân cele trei cifre factuale. */}
               <div className="mt-7 grid grid-cols-3 gap-3">
                 <div className="sf-clay rounded-2xl p-4 text-center">
                   <Target size={20} weight="duotone" className="mx-auto text-spark" aria-hidden="true" />
                   <div className="mt-1.5 font-heading text-2xl font-bold text-graphite">{hero.missionsCompleted}</div>
                   <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-graphite-soft">Misiuni</div>
                 </div>

                 <div className="sf-clay rounded-2xl p-4 text-center">
                   <Star size={20} weight="fill" className="mx-auto text-amber-500" aria-hidden="true" />
                   <div className="mt-1.5 font-heading text-2xl font-bold text-graphite">{averageRating}</div>
                   <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-graphite-soft">{reviewCount} recenzii</div>
                 </div>

                 <div className="sf-clay-red rounded-2xl p-4 text-center text-white">
                   <div className="font-heading text-2xl font-bold leading-none">{hero.hourlyRate}</div>
                   <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/85">RON / oră</div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* === CONTENT GRID === */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 py-12 sm:px-6 md:grid-cols-3">

        {/* COLOANA STÂNGA: dovada întâi (dosarul), apoi textul */}
        <div className="space-y-8 md:col-span-2">
          {/* === MISIUNI REZOLVATE (poze înainte/după, ca în aplicație) === */}
          {/* Secțiune pe orizontală: textul ocupă lățimea, dosarul stă lângă el.
              Centrat, ar fi lăsat un gol mare stânga-dreapta. */}
          {portfolio.length > 0 && (
            <section className="sf-glass flex flex-col items-center gap-5 rounded-[28px] p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-7">
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h2 className="flex items-center justify-center gap-2 font-heading text-xl font-medium sm:justify-start">
                    <Images size={22} weight="duotone" className="text-super-red" aria-hidden="true" />
                    Misiuni rezolvate
                </h2>
                <p className="mt-2 text-graphite-soft">
                  Lucrări reale, verificate de echipa Superfix. Deschide dosarul ca să le vezi.
                </p>
              </div>

              {/* Dosarul 3D e SINGURA cale de intrare în portofoliu:
                  lucrările se văd deschizându-l, nu listate din nou dedesubt. */}
              <AnimatedFolder
                className="shrink-0"
                title="Dosar lucrări"
                subtitle={`${portfolio.length} ${portfolio.length === 1 ? 'misiune' : 'misiuni'}`}
                projects={folderProjects}
              />
            </section>
          )}


          {/* Descriere */}
          <section className="sf-glass rounded-[28px] p-7 md:p-8">
            <h2 className="flex items-center gap-2 font-heading text-xl font-medium">
                <IdentificationCard size={22} weight="duotone" className="text-super-red" aria-hidden="true" />
                Dosar erou
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-graphite-soft">
              {hero.description}
            </p>
          </section>

          {/* Superputeri: text scris de erou, obligatoriu în profil, care până
              acum nu se afișa nicăieri. Înlocuiește paragraful care repeta
              stats-urile din header. */}
          {hero.powers && (
            <section className="sf-glass rounded-[28px] p-7 md:p-8">
              <h2 className="flex items-center gap-2 font-heading text-xl font-medium">
                <Sparkle size={22} weight="fill" className="text-super-red" aria-hidden="true" />
                Superputeri
              </h2>
              {powerList ? (
                <ul className="mt-5 flex flex-wrap gap-2.5">
                  {powerList.map((power) => (
                    <li
                      key={power}
                      className="sf-clay rounded-full px-4 py-2 font-heading text-sm font-semibold text-graphite"
                    >
                      {power}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-lg leading-relaxed text-graphite-soft">{hero.powers}</p>
              )}
            </section>
          )}

          {/* --- ARIE DE ACOPERIRE (HARTA READ-ONLY) --- */}
          <section className="sf-glass rounded-[28px] p-7">
             <h2 className="flex items-center gap-2 font-heading text-xl font-medium">
                <MapPin size={22} weight="duotone" className="text-spark" aria-hidden="true" />
                Arie de acoperire
             </h2>
             <p className="mt-3 text-graphite-soft">
                <strong className="font-semibold text-graphite">{hero.alias}</strong> este disponibil pentru intervenții în:
             </p>

             {/* Container Hartă */}
             <div className="pointer-events-none mx-auto mt-5 w-full max-w-md rounded-[20px] bg-white/50 p-3">
                 <RomaniaMap
                    value={Array.isArray(hero.actionAreas) ? hero.actionAreas : []}
                 />
             </div>

             {/* Legendă Text (Tag-uri) */}
             <div className="mt-5 text-center">
                {hero.actionAreas && hero.actionAreas.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-2">
                        {hero.actionAreas.map(code => (
                            <span key={code} className="rounded-full bg-white/70 px-3 py-1.5 font-mono text-xs font-bold text-graphite shadow-clay-sm">
                                {code}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-sm text-graphite-soft">Toată România (contactează pentru detalii)</span>
                )}
             </div>
          </section>

          {/* Secțiunea Recenzii */}
          <section>
             <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-heading text-2xl font-bold md:text-3xl">
                    <ChatCircleText size={26} weight="duotone" className="text-super-red" aria-hidden="true" />
                    Jurnal de recenzii
                </h2>

                {!hasReviewed && canReview && (
                    <GlassButton
                        type="button"
                        tone="neutral"
                        onClick={() => setShowReviewForm(!showReviewForm)}
                    >
                        {showReviewForm
                          ? <><X size={16} weight="bold" aria-hidden="true" /> Închide</>
                          : <><Star size={16} weight="fill" aria-hidden="true" /> Adaugă recenzie</>}
                    </GlassButton>
                )}
             </div>

             {!canReview && (
                 <div className="sf-glass mb-6 flex items-start gap-3 rounded-2xl p-4 text-sm text-graphite-soft">
                     <Info size={20} weight="duotone" className="mt-0.5 shrink-0 text-spark" aria-hidden="true" />
                     <span>Recenziile pot fi publicate numai de clienți autentificați, pentru o misiune finalizată. Folosește contul de client din aplicația Superfix.</span>
                 </div>
             )}

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
                 <div className="mb-8 flex items-center gap-3 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200" role="status">
                     <CheckCircle size={26} weight="fill" className="shrink-0 text-emerald-600" aria-hidden="true" />
                     <div>
                        <h3 className="font-heading text-lg font-semibold text-emerald-900">Mulțumim pentru feedback!</h3>
                        <p className="text-sm text-emerald-800">Opinia ta ajută comunitatea Superfix.</p>
                     </div>
                 </div>
             )}

             {/* Lista Recenzii */}
             <div className="space-y-5">
               {reviewCount === 0 && !hasReviewed && (
                   <div className="sf-glass rounded-[28px] p-10 text-center">
                       <ChatCircleText size={40} weight="duotone" className="mx-auto text-graphite/30" aria-hidden="true" />
                       <p className="mt-4 text-graphite-soft">Încă nu sunt recenzii verificate.</p>
                   </div>
               )}
               {(hero.reviews || []).map((review: any) => (
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
                   <p className="mt-3 leading-relaxed text-graphite-soft">{review.comment}</p>
                 </div>
               ))}
             </div>
          </section>
        </div>

        {/* COLOANA DREAPTA: video + Fix-o-metru.
            `order-first` doar pe mobil: când grila se pliază pe o coloană,
            coloana asta ar cădea ultima și video-ul ar ajunge la finalul paginii.
            Un singur element în DOM, fără variantă duplicată pentru mobil. */}
        <div className="order-first md:order-none md:col-span-1">
          <div ref={contactPanelRef} className="space-y-5 scroll-mt-28 md:sticky md:top-28">

            {/* Fix-o-metrul are blocul lui: e singurul lucru de pe pagină pe care
                concurența nu îl poate copia. Spunem ce intră în el, niciodată
                cât cântărește fiecare. */}
            <div className="sf-glass rounded-[28px] p-6 text-center">
              <ShieldCheck size={26} weight="duotone" className="mx-auto text-emerald-600" aria-hidden="true" />
              <div className="mt-2 font-heading text-4xl font-bold leading-none text-graphite">
                {hero.trustFactor}%
              </div>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-graphite-soft">
                Fix-o-metru
              </div>
              <p className="mt-4 font-heading text-base font-semibold leading-snug text-graphite">
                Se câștigă din misiuni.<br />Nu se cumpără.
              </p>
            </div>

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

      {/* === BARĂ DE ACȚIUNE ANDOCABILĂ ===
          Singura suprafață de acțiune din pagină, pe toate ecranele. Nicăieri
          altundeva nu există buton de sunat sau de scris.

          `sticky`, nu `fixed`: bara stă lipită de marginea de jos a ecranului cât
          timp poziția ei reală din pagină e sub viewport, iar când ajungi la finalul
          paginii se așază exact acolo. Fără listener de scroll, fără JS deloc. */}
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
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3.5 font-heading text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(5,150,105,0.8)] transition-transform active:scale-[0.97] disabled:opacity-70 sm:hover:-translate-y-0.5"
          >
            <Phone size={18} weight="fill" aria-hidden="true" />
            {phoneLoading ? 'Se caută numărul…' : 'Sună acum'}
          </button>
          <button
            ref={msgBtnRef}
            type="button"
            onClick={() => {
              // citim ACUM dreptunghiul butonului: de acolo creste panoul
              setFormOrigin(msgBtnRef.current?.getBoundingClientRect() ?? null);
              setShowForm(true);
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-graphite px-4 py-3.5 font-heading text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(46,51,59,0.9)] transition-transform active:scale-[0.97] sm:hover:-translate-y-0.5"
          >
            <PaperPlaneTilt size={18} weight="fill" aria-hidden="true" />
            Trimite mesaj
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
          Copy-ul e dat cuvânt cu cuvânt acolo — nu-l reformula. Reutilizează
          Sheet + GlassButton, niciun stil nou. */}
      <Sheet
        open={showPhoneQuota}
        onClose={() => setShowPhoneQuota(false)}
        originRect={phoneQuotaOrigin}
        title="Ține minte eroii pe care i-ai sunat"
        subtitle={phoneQuotaMessage}
        variant="modal"
      >
        <div className="flex flex-col gap-2.5">
          {/* Fără conectare funcțională încă (Pasul 8, rundă separată) — layout-ul
              e deja cel corect pentru când vine handler-ul. */}
          <GlassButton type="button" tone="neutral" full disabled>
            Conectează-te cu Google
          </GlassButton>
          <GlassButton
            type="button"
            tone="dark"
            full
            onClick={() => {
              setShowPhoneQuota(false);
              setFormOrigin(phoneQuotaOrigin);
              setShowForm(true);
            }}
          >
            Cere ajutor fără cont
          </GlassButton>
        </div>
      </Sheet>

      {/* Formularul nu mai sta in pagina: creste din butonul de mai sus.
          variant="modal": card centrat, compact, cu margine vizibila in jur,
          pe orice ecran — nu drawer lipit de ecran. */}
      <Sheet
        open={showForm}
        onClose={() => setShowForm(false)}
        originRect={formOrigin}
        title="Trimite un semnal"
        subtitle={`${hero.alias} primeste coordonatele si o notificare pe email.`}
        variant="modal"
        footer={submitSuccess ? undefined : (
          <>
            {/* `form="sos-form"`: butonul e in afara <form>, ca sa nu se duca la
                vale odata cu campurile, dar trimite acelasi formular. */}
            <GlassButton
              type="submit"
              form="sos-form"
              tone="red"
              full
              disabled={isSubmitting}
              aria-describedby={formReady ? undefined : 'sos-hint'}
              style={{
                filter: formReady ? 'saturate(1.12)' : 'saturate(0.35)',
                opacity: formReady ? 1 : 0.72,
                boxShadow: formReady
                  ? '0 18px 38px -14px rgba(225,55,70,0.75)'
                  : '0 8px 18px -12px rgba(97,99,104,0.5)',
                transition: 'filter 320ms ease, opacity 320ms ease, box-shadow 320ms ease',
              }}
            >
              {isSubmitting ? 'Se trimite…' : 'Trimite SOS'}
            </GlassButton>
            {!formReady && (
              <p id="sos-hint" className="mt-2 text-center text-xs text-graphite-soft">
                Se aprinde când e totul completat.
              </p>
            )}
          </>
        )}
      >
          {submitSuccess ? (
            <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200" role="alert">
              <CheckCircle size={26} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
              <div>
                <strong className="block font-heading text-lg font-semibold text-emerald-900">Semnal trimis!</strong>
                <span className="text-sm text-emerald-800">Eroul a primit coordonatele și o notificare pe email.</span>
              </div>
            </div>
          ) : (
            <form id="sos-form" onSubmit={handleSubmit} noValidate className="space-y-3">
              {/* Adresa e primul câmp: „unde venim" e întrebarea de care depinde
                  tot restul. Butonul de locație completează adresa singur, prin
                  reverse-geocode, ca omul să nu scrie nimic dacă nu vrea. */}
              <div className="sf-field">
                <label htmlFor="sos-address" className="sf-field__label">Unde e problema</label>
                <AddressAutocomplete
                  id="sos-address"
                  placeholder="Stradă, număr, oraș"
                  value={formData.address}
                  invalid={Boolean(fieldErrors.address)}
                  describedBy={fieldErrors.address ? 'sos-address-error' : undefined}
                  onChange={text => {
                    setFormData({ ...formData, address: text });
                    if (fieldErrors.address) setFieldErrors(prev => { const n = { ...prev }; delete n.address; return n; });
                  }}
                  onPick={picked => {
                    /* Ales din listă: coordonatele vin odată cu textul, deci nu
                       mai ghicim nimic. Harta apare pe loc, cu pinul unde trebuie. */
                    setFormData(f => ({ ...f, address: picked.label }));
                    setCoords({ lat: picked.lat, lng: picked.lng });
                    setFieldErrors(prev => { const n = { ...prev }; delete n.address; return n; });
                  }}
                  onBlur={e => {
                    /* Scrisă de mână și netrecută prin listă: tot o transformăm
                       în pin, ca omul să vadă unde a nimerit și să corecteze.
                       Fără asta, ar trimite o adresă pe care n-a verificat-o nimeni. */
                    const text = e.target.value.trim();
                    if (!text || coords) return;
                    geocodeAddress(text).then(found => { if (found) setCoords(found); });
                  }}
                />

                <button
                  type="button"
                  onClick={locate}
                  disabled={locating}
                  className="sf-locate mt-2.5"
                >
                  <NavigationArrow size={16} weight="fill" aria-hidden="true" />
                  {locating ? 'Preiau locația…' : coords ? 'Actualizează locația' : 'Folosește locația mea'}
                </button>

                {/* Harta apare abia după ce avem un punct: un dreptunghi gol cu
                    toată România n-ar ajuta pe nimeni și ar încărca degeaba. */}
                {coords && (
                  <>
                    <div className="mt-3">
                      {/* aceeasi inaltime ca harta: cand soseste, nu impinge nimic */}
                      <Suspense fallback={<Skel className="h-[140px] w-full rounded-[20px]" />}>
                        <MapPicker
                          point={coords}
                          height={140}
                          onChange={(next, address) => {
                            setCoords(next);
                            if (address) setFormData(f => ({ ...f, address }));
                          }}
                        />
                      </Suspense>
                    </div>
                    <p className="sf-locate__ok">
                      <CheckCircle size={14} weight="fill" aria-hidden="true" />
                      Locație exactă. Mută pinul dacă nu e chiar acolo.
                    </p>
                  </>
                )}

                {fieldErrors.address && (
                  <p id="sos-address-error" className="sf-field__error">{fieldErrors.address}</p>
                )}
              </div>

              <div className="sf-field">
                <label htmlFor="sos-name" className="sf-field__label">Numele tău</label>
                <input
                  id="sos-name"
                  type="text"
                  autoComplete="name"
                  className="sf-field__input"
                  value={formData.name}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'sos-name-error' : undefined}
                  onChange={e => {
                    setFormData({ ...formData, name: e.target.value });
                    if (fieldErrors.name) setFieldErrors(prev => { const n = { ...prev }; delete n.name; return n; });
                  }}
                />
                {fieldErrors.name && (
                  <p id="sos-name-error" className="sf-field__error">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
              <div className="sf-field">
                <label htmlFor="sos-phone" className="sf-field__label">Telefon</label>
                <input
                  id="sos-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="sf-field__input"
                  value={formData.phone}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? 'sos-phone-error' : undefined}
                  onChange={e => {
                    setFormData({ ...formData, phone: e.target.value });
                    if (fieldErrors.phone) setFieldErrors(prev => { const n = { ...prev }; delete n.phone; return n; });
                  }}
                />
                {fieldErrors.phone && (
                  <p id="sos-phone-error" className="sf-field__error">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>
              <div className="sf-field">
                <label htmlFor="sos-email" className="sf-field__label">Email</label>
                <input
                  id="sos-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="sf-field__input"
                  value={formData.email}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'sos-email-error' : undefined}
                  onChange={e => {
                    setFormData({ ...formData, email: e.target.value });
                    if (fieldErrors.email) setFieldErrors(prev => { const n = { ...prev }; delete n.email; return n; });
                  }}
                />
                {fieldErrors.email && (
                  <p id="sos-email-error" className="sf-field__error">
                    {fieldErrors.email}
                  </p>
                )}
              </div>
              <div className="sf-field">
                <label htmlFor="sos-desc" className="sf-field__label">Descriere problemă</label>
                <textarea
                  id="sos-desc"
                  rows={3}
                  className="sf-field__input"
                  value={formData.desc}
                  aria-invalid={Boolean(fieldErrors.desc)}
                  aria-describedby={fieldErrors.desc ? 'sos-desc-error' : undefined}
                  onChange={e => {
                    setFormData({ ...formData, desc: e.target.value });
                    if (fieldErrors.desc) setFieldErrors(prev => { const n = { ...prev }; delete n.desc; return n; });
                  }}
                ></textarea>
                {fieldErrors.desc && (
                  <p id="sos-desc-error" className="sf-field__error">
                    {fieldErrors.desc}
                  </p>
                )}
              </div>

              {/* Pozele vin după descriere, nu înaintea ei: cine nu are chef de
                  poze a terminat deja de completat ce e obligatoriu. */}
              <RequestPhotosField urls={photos} onChange={setPhotos} />

              {/* ZONA GDPR */}
              <div className="sf-consent" data-invalid={Boolean(fieldErrors.terms)}>
                  <input
                      type="checkbox"
                      id="gdpr"
                      checked={termsAccepted}
                      aria-invalid={Boolean(fieldErrors.terms)}
                      aria-describedby={fieldErrors.terms ? 'gdpr-error' : undefined}
                      onChange={e => {
                        setTermsAccepted(e.target.checked);
                        if (e.target.checked) setFieldErrors(prev => { const n = { ...prev }; delete n.terms; return n; });
                      }}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-super-red"
                  />
                  <label htmlFor="gdpr" className="cursor-pointer text-xs leading-relaxed text-graphite-soft">
                      Sunt de acord cu <a href="/terms" target="_blank" className="font-semibold text-super-red underline underline-offset-2">Termenii și Condițiile</a> și sunt de acord ca datele mele să fie prelucrate pentru a fi contactat de erou.
                  </label>
              </div>
              {fieldErrors.terms && (
                <p id="gdpr-error" className="sf-field__error -mt-2">
                  {fieldErrors.terms}
                </p>
              )}

            </form>
          )}
      </Sheet>
    </div>
  );
};
