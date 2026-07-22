/** @type {import('tailwindcss').Config} */
export default {
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
        'super-red': 'hsl(355, 74%, 55%)',
        'super-blue': 'hsl(215, 50%, 23%)',
        'super-gold': 'hsl(28, 78%, 65%)',
        'super-light': 'hsl(96, 40%, 96%)',
        'super-dark': 'hsl(222, 47%, 11%)',
        'comic-yellow': 'hsl(51, 90%, 50%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Impact', 'Arial Black', 'sans-serif'],
        comic: ['Comic Sans MS', 'Chalkboard SE', 'sans-serif'],
      },
      backgroundImage: {
        halftone: 'radial-gradient(circle, #1D3557 1px, transparent 1px)',
        'halftone-light': 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
      },
      backgroundSize: {
        'halftone-size': '20px 20px',
      },
      boxShadow: {
        comic: '4px 4px 0 0 #000',
      },
    },
  },
  plugins: [],
};
