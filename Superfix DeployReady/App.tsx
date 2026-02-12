import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async'; // <--- IMPORT SEO
import { logPageView } from './utils/analytics'; // <--- IMPORT ANALYTICS

import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { HeroesList } from './pages/HeroesList';
import { HeroProfile } from './pages/HeroProfile';
import { RegisterHero } from './pages/RegisterHero';
import { Admin } from './pages/Admin';
import { HeroPortal } from './pages/HeroPortal';
import { ScrollToTop } from './components/ScrollToTop';
import { CookieBanner } from './components/CookieBanner';
import HeroOnboarding from './pages/HeroOnboarding';

// === MODIFICARE AICI: Importăm toate paginile legale ===
// Asigură-te că fișierul tău cu paginile legale se numește exact 'LegalPages.tsx' 
// sau 'pages.tsx' (caz în care schimbi calea de mai jos în './pages/pages')
import { Terms, Privacy, Cookies, GDPR } from './pages/LegalPages'; 

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

const App: React.FC = () => {
  return (
    // 1. HelmetProvider gestionează titlurile paginilor (SEO)
    <HelmetProvider>
      <Router>
        {/* 2. Tracker-ul trebuie să fie în interiorul Router-ului */}
        <AnalyticsTracker />
        
        <ScrollToTop />
        
        <div className="flex flex-col min-h-screen font-sans bg-dots">
          <Navbar />
          
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/heroes" element={<HeroesList />} />
              <Route path="/hero/:id" element={<HeroProfile />} />
              <Route path="/register" element={<RegisterHero />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/onboarding" element={<HeroOnboarding />} />
              <Route path="/portal" element={<HeroPortal />} />

              {/* === MODIFICARE AICI: Rutele legale specifice === */}
              {/* Acestea rezolvă erorile "No routes matched" */}
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/cookies" element={<Cookies />} />
              <Route path="/gdpr" element={<GDPR />} />
              
            </Routes>
          </main>
          
          <Footer />
          <CookieBanner />
        </div>
      </Router>
    </HelmetProvider>
  );
};

export default App;
