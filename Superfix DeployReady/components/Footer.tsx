import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t-4 border-black mt-auto pt-16 pb-8 relative overflow-hidden text-gray-800">
      {/* Background Pattern subtil */}
      <div className="absolute inset-0 bg-dots opacity-5 pointer-events-none"></div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          
          {/* 1. BRAND & IDENTITATE */}
          <div className="flex flex-col space-y-4">
            <h2 className="font-heading text-4xl italic text-super-red drop-shadow-[2px_2px_0_#000]">
              SUPERFIX
            </h2>
            <p className="font-comic text-sm leading-relaxed text-gray-600">
              Conectăm eroi locali cu probleme casnice urgente. Simplu, rapid și de încredere.
            </p>
            <div className="text-xs font-mono text-gray-500 bg-gray-50 p-3 border-l-4 border-black space-y-1">
              <p className="font-bold text-black uppercase">SC SUPERFIX SERVICES SRL</p>
              <p>CUI: RO12345678</p>
              <p>J40/123/2025</p>
              <p>București, România</p>
            </div>
          </div>

          {/* 2. MENIU RAPID */}
          <div>
            <h3 className="font-heading text-xl mb-6 border-b-4 border-comic-yellow inline-block pb-1">
              NAVIGARE
            </h3>
            <ul className="space-y-3 font-comic text-sm">
              <li><Link to="/" className="hover:text-super-red hover:translate-x-1 transition-transform inline-block">→ Acasă</Link></li>
              <li><Link to="/heroes" className="hover:text-super-red hover:translate-x-1 transition-transform inline-block">→ Găsește Erou</Link></li>
              <li><Link to="/register" className="hover:text-super-red hover:translate-x-1 transition-transform inline-block">→ Devino Erou</Link></li>
              <li><Link to="/hero-portal" className="hover:text-super-red hover:translate-x-1 transition-transform inline-block">→ Portal Eroi</Link></li>
            </ul>
          </div>

          {/* 3. LEGAL & SUPORT */}
          <div>
            <h3 className="font-heading text-xl mb-6 border-b-4 border-comic-yellow inline-block pb-1">
              INFORMAȚII LEGALE
            </h3>
            <ul className="space-y-3 font-comic text-sm">
              <li><Link to="/terms" className="hover:text-super-blue transition-colors">Termeni și Condiții</Link></li>
              <li><Link to="/privacy" className="hover:text-super-blue transition-colors">Politica de Confidențialitate</Link></li>
              <li><Link to="/cookies" className="hover:text-super-blue transition-colors">Politica de Cookies</Link></li>
              <li><Link to="/gdpr" className="hover:text-super-blue transition-colors">GDPR - Drepturile Tale</Link></li>
            </ul>
            <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Ai nevoie de ajutor?</p>
                <a href="mailto:suport@superfix.ro" className="font-heading text-lg text-black hover:text-super-red underline decoration-2 decoration-comic-yellow underline-offset-4">
                    suport@superfix.ro
                </a>
            </div>
          </div>

          {/* 4. PROTECȚIA CONSUMATORULUI (STICKERE) */}
          <div>
            <h3 className="font-heading text-xl mb-6 border-b-4 border-comic-yellow inline-block pb-1">
              SOLUȚIONARE LITIGII
            </h3>
            <div className="flex flex-col gap-4 items-start">
              {/* Sticker SAL */}
              <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer" className="group w-full max-w-[250px]">
                <div className="bg-white border-2 border-gray-200 rounded p-2 hover:border-black hover:shadow-md transition-all flex items-center justify-center h-16">
                    <img 
                        src="/uploads/sal.svg" 
                        alt="ANPC SAL - Soluționarea Alternativă a Litigiilor" 
                        className="h-full w-auto object-contain"
                    />
                </div>
              </a>
              
              {/* Sticker SOL */}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="group w-full max-w-[250px]">
                <div className="bg-white border-2 border-gray-200 rounded p-2 hover:border-black hover:shadow-md transition-all flex items-center justify-center h-16">
                    <img 
                        src="/uploads/sol.svg" 
                        alt="Platforma SOL - Soluționarea Online a Litigiilor" 
                        className="h-full w-auto object-contain"
                    />
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* COPYRIGHT */}
        <div className="border-t-2 border-black/10 pt-8 mt-8 text-center flex flex-col md:flex-row justify-between items-center text-xs font-comic text-gray-500">
          <p>&copy; {currentYear} <strong>Superfix Services SRL</strong>. Toate drepturile rezervate.</p>
          <div className="mt-2 md:mt-0 flex gap-4">
              <span>Made with ⚡ in Bucharest</span>
          </div>
        </div>
      </div>
    </footer>
  );
};