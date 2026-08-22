import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async'; // <--- IMPORT SEO
import { logPageView } from './utils/analytics'; // <--- IMPORT ANALYTICS

import DotGrid from './components/DotGrid';
import { ToastProvider } from './components/Toast';
import PillNav from './components/PillNav';
import { Footer } from './components/Footer';
import { ScrollToTop } from './components/ScrollToTop';
import { CookieBanner } from './components/CookieBanner';
import { LoadingVeilProvider, VeilHold } from './components/Loader';

/* Drumul principal ramane in pachetul de start: pe astea intra lumea de pe
   Google, si n-au voie sa astepte inca un fisier ca sa apara. */
import { Home } from './pages/Home';
import { HeroesList } from './pages/HeroesList';
import { HeroProfile } from './pages/HeroProfile';

/* Restul se descarca abia cand cineva chiar merge acolo.

   Totul statea intr-un singur fisier de 1,18 MB: cine deschidea pagina de start
   descarca si panoul de administrare, si paginile legale, si onboardingul — cod
   pe care majoritatea nu-l vede niciodata. Bucata separata vine in cateva zeci
   de milisecunde, iar `PageLoader` nici nu apuca sa se arate (are prag de 350ms). */
const HeroOrigin = lazy(() => import('./pages/HeroOrigin').then(m => ({ default: m.HeroOrigin })));
const HeroOriginEditor = lazy(() => import('./pages/HeroOriginEditor').then(m => ({ default: m.HeroOriginEditor })));
const HeroBasics = lazy(() => import('./pages/HeroBasics').then(m => ({ default: m.HeroBasics })));
const MissionDetail = lazy(() => import('./pages/MissionDetail').then(m => ({ default: m.MissionDetail })));
const RegisterHero = lazy(() => import('./pages/RegisterHero').then(m => ({ default: m.RegisterHero })));
const Recruiter = lazy(() => import('./pages/Recruiter').then(m => ({ default: m.Recruiter })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const HeroPortal = lazy(() => import('./pages/HeroPortal').then(m => ({ default: m.HeroPortal })));
const HeroOnboarding = lazy(() => import('./pages/HeroOnboarding'));
const PasswordReset = lazy(() => import('./pages/PasswordReset').then(m => ({ default: m.PasswordReset })));

// === MODIFICARE AICI: Importăm toate paginile legale ===
// Asigură-te că fișierul tău cu paginile legale se numește exact 'LegalPages.tsx' 
// sau 'pages.tsx' (caz în care schimbi calea de mai jos în './pages/pages')
const Terms = lazy(() => import('./pages/LegalPages').then(m => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/LegalPages').then(m => ({ default: m.Privacy })));
const Cookies = lazy(() => import('./pages/LegalPages').then(m => ({ default: m.Cookies })));
const GDPR = lazy(() => import('./pages/LegalPages').then(m => ({ default: m.GDPR })));
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));
const Subscription = lazy(() => import('./pages/Subscription').then(m => ({ default: m.Subscription })));
const SubscriptionResult = lazy(() => import('./pages/SubscriptionResult').then(m => ({ default: m.SubscriptionResult })));

// === COMPONENTA "SENZOR" ===
const AnalyticsTracker = () => {
  const location = useLocation();

  useEffect(() => {
    const consent = localStorage.getItem('superfix_cookie_consent');
    if (consent === 'accepted') {
      logPageView();
    }
  }, [location]);

  return null;
};

// referință stabilă (afară din componentă) — dacă era recreat la fiecare render,
// PillNav credea că a primit "items" noi și replaia animația de intrare la orice schimbare de pagină
const NAV_ITEMS = [
  { label: 'Acasă', href: '/' },
  { label: 'Găsește erou', href: '/heroes' },
  { label: 'Portal eroi', href: '/portal' },
];

// === PillNav (cod David) + GlassSurface (sticlă reală): logo Superfix, item-uri site,
// indicator glisant roșu (selecție), fundal gri (structural). ===
const SiteNav = () => {
  const location = useLocation();
  return (
    <PillNav
      items={NAV_ITEMS}
      activeHref={location.pathname}
      glassTint="rgba(226,228,234,0.50)"
      indicatorTint="rgba(255,40,60,0.85)"
      textColor="#2E333B"
      activeTextColor="#FFFFFF"
    />
  );
};

const App: React.FC = () => {
  return (
    // 1. HelmetProvider gestionează titlurile paginilor (SEO)
    <HelmetProvider>
      {/* Valul alb sta deasupra a tot si e tinut de oricine are nevoie:
          o ruta care isi aduce codul, o operatie lunga. Aici, ca sa fie
          disponibil din toata aplicatia. */}
      <LoadingVeilProvider>
      <Router>
        <ToastProvider>
        {/* 2. Tracker-ul trebuie să fie în interiorul Router-ului */}
        <AnalyticsTracker />
        
        <ScrollToTop />
        
        <div className="relative flex flex-col min-h-screen font-sans bg-dots">
          {/* Background underlay (cod David): grilă de puncte, absolută (scrollează odată cu pagina,
              nu fixă la viewport), peste tot pe site, sub tot conținutul. */}
          <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
            <DotGrid
              dotSize={5}
              gap={17}
              baseColor="#E9EEF4"
              activeColor="#FF3347"
              proximity={150}
              shockRadius={180}
              shockStrength={2.5}
              resistance={700}
              returnDuration={1.3}
            />
          </div>

          {/* Voal foarte subțire între grilă și conținut: temperează punctele.

              Aici era `backdrop-blur-sm`. Un backdrop-filter se aplică pe TOT ce e
              în spatele elementului, iar elementul ăsta e cât documentul: pe home,
              390x6389 px. Adică browserul reblura o suprafață de 6400px la fiecare
              cadru. Măsurat pe telefon emulat: doar scoaterea lui a dus pagina de
              la 25 la 50 de cadre pe secundă. Un strat translucid simplu costă zero
              și se vede aproape la fel. */}
          <div
            className="absolute inset-0 z-[1] pointer-events-none bg-white/10"
            aria-hidden="true"
          />

          <SiteNav />

          <div className="relative z-10 flex flex-col min-h-screen">
            {/* Fără pt-20 global: crea o zonă goală (doar puncte crude) înainte ca fundalul
                fiecărei pagini să înceapă. Home își gestionează singur clearance-ul pt navbar
                (fundalul Hero-ului începe la y=0 și acoperă punctele complet).
                Fiecare pagină redesenată își ține singură distanța de navbar (pt-24). */}
            {/* `min-h-screen` pe main, nu doar pe stiva.

                `flex-grow` singur garanteaza ca main + footer umplu ecranul, nu ca
                main il umple. Iar footerul are ~500px pe desktop si ~1100px pe
                telefon, unde coloanele se stivuiesc — deci orice pagina care inca
                isi asteapta datele era prea scurta si footerul urca in ecran.
                Cu podeaua asta, footerul e mereu sub linia de plutire. */}
            <main className="flex-grow min-h-screen">
              <Suspense fallback={<VeilHold />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/heroes" element={<HeroesList />} />
                <Route path="/hero/:slug" element={<HeroProfile />} />
                <Route path="/hero/:slug/origine" element={<HeroOrigin />} />
                <Route path="/cine-e-sub-costum" element={<HeroOriginEditor />} />
                <Route path="/portal/profil" element={<HeroBasics />} />
                <Route path="/portal/misiune/:id" element={<MissionDetail />} />
                <Route path="/register" element={<RegisterHero />} />
                <Route path="/recruiter" element={<Recruiter />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/onboarding" element={<HeroOnboarding />} />
                <Route path="/portal" element={<HeroPortal />} />
                <Route path="/reset-password" element={<PasswordReset />} />

                {/* Netopia trimite omul la /abonament/rezultat după checkout
                    (`server/netopia-v2.ts:147`). Ruta lipsea din App, deci cine
                    plătea ateriza pe o pagină goală. */}
                <Route path="/abonament" element={<Subscription />} />
                <Route path="/abonament/rezultat" element={<SubscriptionResult />} />

                {/* === MODIFICARE AICI: Rutele legale specifice === */}
                {/* Acestea rezolvă erorile "No routes matched" */}
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/cookies" element={<Cookies />} />
                <Route path="/gdpr" element={<GDPR />} />

                {/* Fără ruta asta, o adresă greșită nu potrivea nimic: navigația și
                    subsolul rămâneau pe ecran, cu gol între ele. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </main>

            <Footer />
            <CookieBanner />
          </div>
        </div>
        </ToastProvider>
      </Router>
      </LoadingVeilProvider>
    </HelmetProvider>
  );
};

export default App;
