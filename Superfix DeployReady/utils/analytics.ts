import ReactGA from "react-ga4";

const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
let initialized = false;

export const initGA = () => {
  if (!initialized && /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID)) {
    ReactGA.initialize(GA_MEASUREMENT_ID);
    initialized = true;
  }
};

export const logPageView = () => {
  if (initialized) ReactGA.send({ hitType: "pageview", page: window.location.pathname });
};
