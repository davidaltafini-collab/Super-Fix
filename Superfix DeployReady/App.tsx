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
import { Terms } from './pages/LegalPages'; 

// === COMPONENTA "SENZOR" ===
// Aceasta stă ascunsă în Router și anunță Google când schimbi pagina,
// DAR numai dacă utilizatorul a acceptat cookie-urile.
const AnalyticsTracker = () => {
  const location = useLocation();

  useEffect(() => {
    const consent = localStorage.getItem('superfix_cookie_consent');
    if (consent === 'accepted') {
      logPageView();
    }
  }, [location]);

  return null; // Nu randează nimic vizual
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
              <Route path="/portal" element={<HeroPortal />} />
              <Route path="/legal" element={<Terms />} />
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