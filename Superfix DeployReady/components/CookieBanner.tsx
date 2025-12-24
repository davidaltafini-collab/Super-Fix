import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { initGA } from '../utils/analytics'; // <--- IMPORTUL NOULUI SISTEM

export const CookieBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 1. Verificăm "memoria" browserului când intră omul pe site
    const consent = localStorage.getItem('superfix_cookie_consent');

    if (!consent) {
      // Nu a ales nimic încă -> Arată bannerul
      setShow(true);
    } else if (consent === 'accepted') {
      // A acceptat în trecut -> Pornim "motoarele" de tracking (Analytics)
      initializeAnalytics();
    }
    // Dacă e 'refused', nu facem nimic (rămâne doar funcționalitatea de bază)
  }, []);

  // Funcția care pornește scripturile externe (Google, FB, etc.)
  const initializeAnalytics = () => {
    console.log("🚀 [Sistem]: Utilizatorul a acceptat. Pornim Google Analytics...");
    initGA(); // <--- AICI SE ACTIVEAZĂ SPIONUL PRIETENOS
  };

  const handleChoice = (choice: 'accepted' | 'refused') => {
    // 2. Salvăm decizia în memorie ca să nu îl mai întrebăm data viitoare
    localStorage.setItem('superfix_cookie_consent', choice);

    // 3. Dacă a acceptat, pornim tracking-ul ACUM
    if (choice === 'accepted') {
      initializeAnalytics();
    }

    // 4. Ascundem bannerul
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-2 md:p-4 animate-slide-up">
      <div className="container mx-auto max-w-5xl bg-yellow-400 border-4 border-black shadow-[8px_8px_0_rgba(0,0,0,0.8)] p-4 md:p-6 flex flex-col md:flex-row items-center gap-4 md:gap-6 relative">
        
        {/* Element Decorativ Comic */}
        <div className="hidden md:block absolute -top-3 left-10 w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-b-[15px] border-b-black"></div>
        
        <div className="text-4xl animate-bounce">🍪</div>
        
        <div className="flex-grow text-center md:text-left">
            <h4 className="font-heading text-lg md:text-xl uppercase text-black mb-1">CONFIDENȚIALITATE HEROICĂ</h4>
            <p className="font-comic text-xs md:text-sm text-black leading-tight">
                Folosim cookie-uri pentru a îmbunătăți experiența ta pe SuperFix. 
                Poți accepta totul pentru o experiență completă sau poți refuza tracking-ul.
                Nu vindem datele tale răufăcătorilor! 
                <Link to="/legal" className="ml-1 underline font-bold hover:text-white transition-colors">Detalii legale</Link>.
            </p>
        </div>

        {/* GRUP BUTOANE */}
        <div className="flex flex-col sm:flex-row gap-3 min-w-fit">
            {/* Buton REFUZ (Rosu sau Alb simplu - stil secundar) */}
            <button 
                onClick={() => handleChoice('refused')} 
                className="bg-white text-black font-heading px-4 py-2 border-2 border-black hover:bg-gray-200 transition-all text-sm whitespace-nowrap"
            >
                ❌ REFUZ
            </button>

            {/* Buton ACCEPT (Stilul tau original - Prominent) */}
            <button 
                onClick={() => handleChoice('accepted')} 
                className="bg-black text-white font-heading px-6 py-3 border-2 border-white shadow-[4px_4px_0_#fff] hover:bg-gray-800 hover:scale-105 active:scale-95 transition-all whitespace-nowrap text-sm md:text-base"
            >
                ✅ ACCEPT MISIUNEA
            </button>
        </div>

      </div>
    </div>
  );
};