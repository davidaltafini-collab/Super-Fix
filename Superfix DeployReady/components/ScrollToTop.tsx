import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Duce pagina sus la fiecare schimbare de rută.
 *
 * Două detalii fac toată diferența:
 *
 * `useLayoutEffect`, nu `useEffect` — al doilea rulează DUPĂ ce browserul a
 * desenat, deci apuci să vezi un cadru din pagina nouă la poziția veche de
 * derulare. Dacă ai dat click pe un link din footer, cadrul ăla e fix footerul.
 *
 * `behavior: 'instant'` — `index.css` are `scroll-behavior: smooth` pe `html`,
 * iar `scrollTo` fără `behavior` explicit respectă regula aia și ANIMEAZĂ
 * drumul înapoi sus. Adică te uiți câteva sute de milisecunde cum urcă pagina
 * de la footer. Aici ne trebuie tăiat scurt; derularea lină rămâne pentru
 * ancorele din pagină, unde chiar o vrei.
 */
export const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      return;
    }

    let attempts = 0;
    let timer: number | undefined;
    const scrollToAnchor = () => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView({ block: "start", behavior: "instant" });
        return;
      }
      // Rutele încărcate lazy pot monta conținutul după schimbarea adresei.
      // Reîncercăm scurt, fără animație și fără să ținem vreun proces deschis.
      attempts += 1;
      if (attempts < 20) timer = window.setTimeout(scrollToAnchor, 50);
    };

    scrollToAnchor();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pathname, hash]);

  return null;
};
