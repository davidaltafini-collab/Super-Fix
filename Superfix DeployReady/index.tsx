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
