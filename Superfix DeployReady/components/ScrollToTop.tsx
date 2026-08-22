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
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
};
