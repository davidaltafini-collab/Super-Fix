/** @type {import('tailwindcss').Config} */
export default {
  /* Stilurile de hover doar unde exista mouse.

     Fara asta, Tailwind scoate `.hover\:x:hover` fara nicio conditie, deci
     regulile se aplica si pe telefon. iOS trateaza atunci prima atingere ca pe
     o trecere cu mouse-ul: intra in starea de hover si INGHITE click-ul, care
     vine abia la a doua atingere. Starea ramane lipita pe elementul ala pana
     atingi altundeva — de-aici „in zona aia a ecranului se strica si trebuie sa
     apas de doua ori", inclusiv pe lucruri care nici macar nu sunt butoane
     (mascota, un titlu), fiindca stau intr-un container care are hover.

     Comutatorul ambaleaza fiecare utilitar `hover:` in `@media (hover: hover)`.
     Pe desktop nu se schimba absolut nimic. */
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    './index.html',
    './*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand (kept)
        'super-red': 'hsl(355, 74%, 55%)',
        'super-red-dark': 'hsl(355, 66%, 45%)',
        'comic-yellow': 'hsl(51, 90%, 50%)',
        // Mascot-derived palette (v2 "Supererou Disney")
        'graphite': '#2E333B',       // robot charcoal body -> ink / dark sections
        'graphite-soft': '#474E59',
        'spark': '#3E9BFF',          // robot eye-blue glow accent
        'spark-soft': '#8FC4FF',
        'cloud': '#EEF3FB',          // soft cool page background
        'cream': '#FBF7F1',
        // legacy (other pages still use these)
        'super-blue': 'hsl(215, 50%, 23%)',
        'super-gold': 'hsl(28, 78%, 65%)',
        'super-light': 'hsl(96, 40%, 96%)',
        'super-dark': 'hsl(222, 47%, 11%)',
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        heading: ['Anton', 'system-ui', 'sans-serif'],
        display: ['Anton', 'system-ui', 'sans-serif'],
        comic: ['Nunito', 'system-ui', 'sans-serif'], // kills Comic Sans everywhere
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // overshoot = tactile spring feel
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      backgroundImage: {
        halftone: 'radial-gradient(circle, #1D3557 1px, transparent 1px)',
        'halftone-light': 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
      },
      backgroundSize: {
        'halftone-size': '20px 20px',
      },
      boxShadow: {
        comic: '4px 4px 0 0 #000', // legacy (other pages)
        // Claymorphism: soft outer depth + inner highlight/shadow = puffy 3D feel
        clay: '0 20px 42px -14px rgba(46,51,59,0.38), inset 0 -7px 14px rgba(0,0,0,0.06), inset 0 6px 10px rgba(255,255,255,0.9)',
        'clay-sm': '0 12px 26px -12px rgba(46,51,59,0.32), inset 0 -4px 10px rgba(0,0,0,0.05), inset 0 4px 8px rgba(255,255,255,0.85)',
        'clay-red': '0 18px 36px -12px rgba(214,51,63,0.55), inset 0 -7px 12px rgba(0,0,0,0.16), inset 0 6px 10px rgba(255,255,255,0.28)',
        'clay-dark': '0 20px 42px -14px rgba(0,0,0,0.5), inset 0 -7px 14px rgba(0,0,0,0.3), inset 0 6px 10px rgba(255,255,255,0.09)',
        lift: '0 30px 66px -20px rgba(46,51,59,0.5)',
        glow: '0 0 46px rgba(62,155,255,0.5)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-14px)' } },
        'float-slow': { '0%,100%': { transform: 'translateY(0) rotate(0deg)' }, '50%': { transform: 'translateY(-10px) rotate(1.5deg)' } },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        'float-slow': 'float-slow 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
