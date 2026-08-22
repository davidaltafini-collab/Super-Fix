import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { HelmetProvider } from 'react-helmet-async';
import { installNetLog } from './services/netlog';
import './index.css';

/* Înainte de orice randare, ca să prindă și cererile de la prima pagină.
   Nu trimite nimic nicăieri: ține un inel în memorie, pe care îl citește panoul
   din admin. Vezi `services/netlog.ts`. */
installNetLog();

/* O înălțime de ecran care NU se mișcă la derulare.

   Pe telefon, bara de adrese se retrage când dai scroll în jos și reapare când
   dai în sus. Orice înălțime legată de viewport (`vh`, `svh`, `dvh`) e la
   cheremul ei: secțiunile își schimbă înălțimea în timp ce derulezi, pagina se
   recalculează sub deget și tot ce e dimensionat de acolo (mascota din hero)
   pare că se umflă și se dezumflă.

   `--sf-vh` se măsoară o dată și se rescrie DOAR când se schimbă lățimea, adică
   la rotirea telefonului sau la redimensionarea ferestrei pe desktop. Bara de
   adrese nu schimbă lățimea, deci nu mai atinge nimic. */
const setStableViewportHeight = () => {
  document.documentElement.style.setProperty('--sf-vh', `${window.innerHeight}px`);
};
let lastViewportWidth = window.innerWidth;
setStableViewportHeight();
window.addEventListener('resize', () => {
  if (window.innerWidth === lastViewportWidth) return;
  lastViewportWidth = window.innerWidth;
  setStableViewportHeight();
});
window.addEventListener('orientationchange', () => {
  // după rotire, dimensiunile noi ajung în `window` abia la cadrul următor
  requestAnimationFrame(setStableViewportHeight);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
);
