import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

// === COMPONENTA BRAND (LOGO BADGE) ===
// Aceasta reproduce exact stilul din poza ta: Cutie Roșie, Text Alb, Chenar Negru, Umbră Dură.
const SuperfixBadge = ({ size = "normal" }: { size?: "small" | "normal" | "large" }) => {
  const sizeClasses = {
    small: "text-lg px-2 py-0 border-2 shadow-[2px_2px_0_#000]",
    normal: "text-xl md:text-2xl px-3 py-1 border-4 shadow-[4px_4px_0_#000]",
    large: "text-3xl md:text-5xl px-6 py-2 border-4 md:border-8 shadow-[6px_6px_0_#000]"
  };

  return (
    <span 
      className={`
        inline-block 
        bg-super-red 
        text-white 
        font-heading 
        font-black 
        italic 
        tracking-wider 
        border-black 
        transform -rotate-2 
        hover:rotate-0 
        transition-transform 
        align-middle 
        mx-1
        ${sizeClasses[size]}
      `}
    >
      SUPERFIX
    </span>
  );
};

export const Home: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden font-sans">
      
      {/* === SEO META TAGS === */}
      <Helmet>
        <title>Superfix - Găsește Meșteri și Eroi Locali în România</title>
        <meta name="description" content="Platforma unde găsești rapid instalatori, electricieni și meșteri verificați în zona ta. Vezi harta serviciilor locale și alege eroul potrivit." />
        <meta property="og:title" content="Superfix - Meșteri Locali Gata de Acțiune" />
        <meta property="og:description" content="Ai nevoie de un erou? Găsește meseriași verificați în zona ta." />
        <link rel="canonical" href="https://superfix.ro/" />
      </Helmet>

      {/* Stiluri CSS pentru animația infinită */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee-infinite {
          display: flex;
          width: fit-content;
          animation: marquee 40s linear infinite;
        }
      `}</style>

      {/* === HERO SECTION === */}
      <section className="relative bg-[#1a2b4a] text-white pt-24 pb-40 border-b-8 border-black overflow-hidden">
        
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/halftone.png')] opacity-10 pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[200vw] h-[200vw] bg-white opacity-5 rotate-12 pointer-events-none z-0"></div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
            
            {/* ETICHETA SUS */}
            <div className="inline-block relative mb-8 group cursor-default">
                <div className="absolute inset-0 bg-black translate-x-1 translate-y-1"></div>
                <div className="relative bg-super-red text-white px-4 py-2 border-2 border-white transform -rotate-2 group-hover:rotate-0 transition-transform">
                    <h2 className="font-heading text-lg md:text-xl tracking-widest uppercase m-0 leading-none">
                        MARKETPLACE PENTRU MESERIAȘI
                    </h2>
                </div>
            </div>

            {/* TITLUL PRINCIPAL */}
            <h1 className="font-heading text-7xl md:text-9xl mb-10 leading-none tracking-tighter drop-shadow-[8px_8px_0_#000] relative">
              <div className="text-white z-10 relative">AI NEVOIE DE</div>
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 mt-2">
                <span className="text-white">UN</span>
                <span className="text-comic-yellow relative inline-block transform skew-x-[-10deg] hover:scale-110 transition-transform duration-300">
                  <span className="absolute inset-0 text-black translate-x-2 translate-y-2" style={{ WebkitTextStroke: '10px black' }}>EROU?</span>
                  <span className="relative z-10" style={{ WebkitTextStroke: '3px black' }}>EROU?</span>
                </span>
              </div>
            </h1>

            {/* === PANOU MESAJ (Cu Badge) === */}
            <div className="relative max-w-3xl mx-auto mb-16 group cursor-default">
                <div className="absolute inset-0 bg-black translate-x-2 translate-y-2 rounded-none transform rotate-1"></div>
                <div className="relative bg-white border-4 border-black p-8 rounded-none transform -rotate-1 transition-transform group-hover:rotate-0">
                    <p className="text-xl md:text-3xl text-black font-comic leading-tight flex flex-col md:block items-center">
                        {/* Aici folosim componenta Badge */}
                        <span className="inline-flex items-center flex-wrap justify-center gap-2">
                            Echipa <SuperfixBadge size="normal" /> salvează ziua!
                        </span>
                        <span className="mt-2 md:mt-0 block md:inline"> Electricieni, instalatori și mecanici gata de acțiune.</span>
                    </p>
                </div>
            </div>

            {/* === BUTOANE === */}
            <div className="flex flex-col md:flex-row gap-8 w-full md:w-auto items-center justify-center">
              <Link 
                to="/heroes" 
                className="relative group w-full md:w-auto transform -rotate-1 hover:rotate-0 hover:scale-105 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-black translate-x-1 translate-y-2"></div>
                <div className="relative bg-super-red text-white font-heading text-2xl md:text-3xl py-4 px-12 border-4 border-black text-center">
                  ALEGE EROUL TĂU
                </div>
              </Link>

              <a 
                href="#how-it-works"
                className="relative group w-full md:w-auto transform rotate-1 hover:rotate-0 hover:scale-105 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-black translate-x-1 translate-y-2"></div>
                <div className="relative bg-white text-black font-heading text-2xl md:text-3xl py-4 px-12 border-4 border-black text-center hover:bg-comic-yellow transition-colors">
                  CUM FUNCȚIONEAZĂ?
                </div>
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* === BANDA ANIMATĂ (Cu Badge) === */}
      <div className="bg-black py-5 border-b-4 border-black overflow-hidden relative z-20 shadow-lg w-full">
        <div className="animate-marquee-infinite whitespace-nowrap text-white font-heading text-3xl md:text-4xl items-center">
          {[...Array(15)].map((_, i) => (
            <React.Fragment key={i}>
              <span className="mx-8 text-comic-yellow">★</span>
              {/* Badge mic pentru bandă */}
              <SuperfixBadge size="small" />
              <span className="mx-8 text-white">WOW</span>
              <span className="mx-8 text-comic-yellow">★</span>
              <span className="mx-8 text-white">BANG!</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* === FEATURES SECTION === */}
      <section id="how-it-works" className="py-24 bg-white relative bg-dots">
        <div className="container mx-auto px-4">
          <div className="text-center mb-20 relative">
             <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[8rem] md:text-[15rem] font-heading text-gray-100 select-none z-0 opacity-50 rotate-12">
                 POW!
             </div>
            <div className="relative z-10">
                {/* Badge mare pentru titlu */}
                <h2 className="font-heading text-4xl md:text-6xl text-super-blue mb-4 drop-shadow-[4px_4px_0_#000] inline-flex flex-col md:flex-row items-center gap-4 bg-white px-6 py-4 border-4 border-transparent">
                    <span>DE CE</span>
                    <SuperfixBadge size="large" />
                    <span>?</span>
                </h2>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl mx-auto relative z-10">
            {/* Steps (Neschimbate) */}
            <div className="relative group hover:-translate-y-2 transition-transform duration-300">
              <div className="absolute inset-0 bg-black translate-x-2 translate-y-2"></div>
              <div className="relative bg-white border-4 border-black p-8 text-center h-full">
                <div className="w-20 h-20 bg-super-red text-white border-4 border-black rounded-full flex items-center justify-center text-4xl font-heading absolute -top-10 left-1/2 transform -translate-x-1/2 shadow-[2px_2px_0_#000]">1</div>
                <h3 className="text-3xl font-heading uppercase mt-8 mb-4">Alegi Eroul</h3>
                <p className="text-xl text-gray-800 font-comic">Vezi poze, skill-uri și recenzii reale. Tu decizi cine te salvează.</p>
              </div>
            </div>
            <div className="relative group hover:-translate-y-2 transition-transform duration-300 mt-12 md:mt-0">
              <div className="absolute inset-0 bg-black translate-x-2 translate-y-2"></div>
              <div className="relative bg-comic-yellow border-4 border-black p-8 text-center h-full">
                <div className="w-20 h-20 bg-white text-black border-4 border-black rounded-full flex items-center justify-center text-4xl font-heading absolute -top-10 left-1/2 transform -translate-x-1/2 shadow-[2px_2px_0_#000]">2</div>
                <h3 className="text-3xl font-heading uppercase mt-8 mb-4">Lansezi Semnalul</h3>
                <p className="text-xl text-black font-comic">Completează formularul scurt sau sună direct. Eroul răspunde instant!</p>
              </div>
            </div>
            <div className="relative group hover:-translate-y-2 transition-transform duration-300 mt-12 md:mt-0">
              <div className="absolute inset-0 bg-black translate-x-2 translate-y-2"></div>
              <div className="relative bg-white border-4 border-black p-8 text-center h-full">
                <div className="w-20 h-20 bg-super-blue text-white border-4 border-black rounded-full flex items-center justify-center text-4xl font-heading absolute -top-10 left-1/2 transform -translate-x-1/2 shadow-[2px_2px_0_#000]">3</div>
                <h3 className="text-3xl font-heading uppercase mt-8 mb-4">Misiune Gata</h3>
                <p className="text-xl text-gray-800 font-comic">Problema rezolvată! Plătești onest și lași un review pentru a crește puterea eroului.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* === CTA SECTION (Cu Badge) === */}
      <section className="bg-[#111] py-24 border-t-8 border-black relative overflow-hidden">
        <div className="container mx-auto px-4 text-center relative z-10">
             <div className="inline-block relative group cursor-pointer transform rotate-1 hover:rotate-0 transition-transform">
                <div className="absolute inset-0 bg-white translate-x-3 translate-y-3"></div>
            <div className="relative border-4 border-black p-10 bg-super-red max-w-4xl mx-auto">
              <h2 className="text-4xl md:text-6xl font-heading text-white mb-6 uppercase leading-tight drop-shadow-[4px_4px_0_#000]">ESTI MESERIAȘ CU PUTERI SPECIALE?</h2>

              <div className="mb-10 text-2xl text-white font-comic flex flex-col md:flex-row items-center justify-center gap-2">
                <span>Intră în liga</span>
                <SuperfixBadge size="normal" />
                <span>. Orasul are nevoie de tine!</span>
              </div>

              {/* AICI ESTE SCHIMBAREA: Link către register */}
              <Link to="/register" className="inline-block bg-comic-yellow text-black px-12 py-5 font-heading text-2xl border-4 border-black hover:bg-white hover:scale-105 transition-all shadow-[6px_6px_0_#000]">
                ÎNSCRIE-TE ÎN ECHIPĂ
              </Link>
            </div>
             </div>
        </div>
      </section>
    </div>
  );
};