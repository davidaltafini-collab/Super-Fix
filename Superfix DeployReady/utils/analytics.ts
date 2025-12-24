import ReactGA from "react-ga4";

// Înlocuiește cu ID-ul tău real din Google Analytics (începe cu G-...)
const GA_MEASUREMENT_ID = "G-XXXXXXXXXX"; 

export const initGA = () => {
  // Verificăm dacă e deja inițializat ca să nu îl pornim de 2 ori
  if (!window.ga) {
    ReactGA.initialize(GA_MEASUREMENT_ID);
    console.log("✅ [SuperFix Analytics] Sistem de monitorizare activat.");
  }
};

export const logPageView = () => {
  ReactGA.send({ hitType: "pageview", page: window.location.pathname });
};