import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import GlassSurface from './GlassSurface';
import { SuperfixMark } from './SuperfixMark';
import './PillNav.css';

export interface PillNavItem {
  label: string;
  href: string;
  ariaLabel?: string;
}

interface PillNavProps {
  items: PillNavItem[];
  activeHref?: string;
  className?: string;
  ease?: string;
  /** tenta fundalului principal de sticlă (structural) */
  glassTint?: string;
  /** tenta indicatorului glisant (selecție/hover) */
  indicatorTint?: string;
  textColor?: string;
  activeTextColor?: string;
}

const PillNav: React.FC<PillNavProps> = ({
  items,
  activeHref,
  className = '',
  ease = 'power3.out',
  glassTint = 'rgba(97,99,104,0.16)',
  indicatorTint = 'rgba(225,55,70,0.55)',
  textColor = '#2E333B',
  activeTextColor = '#FFFFFF',
}) => {
  const pillNavRef = useRef<HTMLElement>(null);
  const discRef = useRef<SVGGElement>(null);
  const logoTweenRef = useRef<gsap.core.Tween | null>(null);
  const listWrapRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeIndex = items.findIndex((it) => it.href === activeHref);
  const targetIndex = hoveredIndex ?? (activeIndex >= 0 ? activeIndex : null);

  // Indicatorul glisant (sticlă): urmează link-ul peste care e mouse-ul sau,
  // altfel, pagina curentă. Mecanismul de "switch" — un singur indicator care
  // se mută/redimensionează, adaptat pentru linkuri reale (nu radio inputs,
  // care ar strica semantica/accesibilitatea navigării).
  useEffect(() => {
    const wrap = listWrapRef.current;
    const indicator = indicatorRef.current;
    if (!wrap || !indicator) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const xTo = gsap.quickTo(indicator, 'x', { duration: reduceMotion ? 0 : 0.4, ease });
    const widthTo = gsap.quickTo(indicator, 'width', { duration: reduceMotion ? 0 : 0.4, ease });

    const move = () => {
      if (targetIndex === null) {
        gsap.to(indicator, { opacity: 0, duration: 0.2 });
        return;
      }
      const el = itemRefs.current[targetIndex];
      if (!el) return;
      // offsetLeft/offsetWidth, nu getBoundingClientRect(): indicatorul e sub
      // acelasi ancestor scalat (.pill-nav se micsoreaza la scroll, scale(0.73)).
      // getBoundingClientRect() da pozitia deja scalata pe ecran, dar indicatorul
      // o aplica drept transform LOCAL sub acelasi ancestor — se scala a doua
      // oara, si iese in loc gresit cat timp navbar-ul e mic. offsetLeft/Width
      // sunt din modelul de layout, neafectate de transform, deci raman corecte
      // la orice scara. (Hover peste link "repara" vizual doar pentru ca readuce
      // scara la 1, unde cele doua metode dadeau acelasi rezultat.)
      xTo(el.offsetLeft);
      widthTo(el.offsetWidth);
      gsap.to(indicator, { opacity: 1, duration: 0.2 });
    };

    move();
    window.addEventListener('resize', move);

    // Textul link-urilor își schimbă lățimea când fontul custom termină de
    // încărcat (FOUT) — asta se întâmplă după acest efect, deci indicatorul
    // rămânea dimensionat pe fontul de rezervă până la următoarea schimbare
    // de pagină. ResizeObserver prinde orice schimbare reală de lățime, nu
    // doar resize-ul ferestrei.
    const resizeObserver = new ResizeObserver(move);
    resizeObserver.observe(wrap);

    return () => {
      window.removeEventListener('resize', move);
      resizeObserver.disconnect();
    };
  }, [targetIndex, ease, items]);

  /* Micșorarea urmează derularea, nu o comută.

     Înainte era o stare cu două valori: sub prag mare, peste prag mic, cu o
     tranziție CSS de 0.35s între ele. Oricât de bine alegeai pragul, momentul
     în care îl treceai nu avea nicio legătură cu cât de repede mișcai degetul:
     navbarul pleca singur în sus, cu ritmul lui, în timp ce pagina mergea cu
     al ei. Peste asta, bara de sus a browserului pe telefon se retrage tot
     atunci, cu încă o mișcare independentă — trei lucruri care se mișcă
     nesincronizat, de-acolo senzația de glitch.

     Acum e o singură mărime continuă: cât ai derulat între START și END se
     traduce direct în cât e de mic navbarul. Dacă miști încet, se micșorează
     încet; dacă te oprești la jumătate, rămâne la jumătate. Fiind legat de
     poziție, nu de direcție, e mereu în pas cu pagina.

     `EASING` (interpolare spre țintă, ~0.18/cadru) nu întârzie mișcarea, doar
     rotunjește tremurul de sub-pixel de la rubber-band-ul iOS. */
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const hoverRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const kickRef = useRef<() => void>(() => {});
  /** ultima directie de derulare: 1 = in jos, -1 = in sus */
  const dirRef = useRef(1);
  const lastYRef = useRef(0);
  /** cat timp un deget e pe navbar, transformarea sta pe loc */
  const frozenRef = useRef(false);
  const freezeRef = useRef<(v: boolean) => void>(() => {});

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // cu mișcare redusă, navbarul rămâne pur și simplu la mărimea lui
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const START = 24;
    const END = 170;
    const EASING = 0.18;

    /* Micșorarea urmează derularea în jos, dar creșterea ascultă de direcție.

       Înainte mărimea depindea numai de cât ai derulat, deci navbarul redevenea
       mare doar dacă ajungeai înapoi în capul paginii. Când ești la jumătatea
       unei liste lungi și vrei să schimbi pagina, asta înseamnă că nu ai cum:
       ținta rămâne mică oriunde ai fi. Acum, prima mișcare în sus îl aduce
       întreg — gestul cu care oricum cauți meniul e chiar gestul care îl aduce. */
    const target = () => {
      if (hoverRef.current) return 0; // mouse deasupra -> revine la mărime maximă
      const y = window.scrollY;
      if (y <= START) return 0;
      if (dirRef.current < 0) return 0; // derulezi în sus -> navbar întreg
      return Math.min(1, Math.max(0, (y - START) / (END - START)));
    };

    const tick = () => {
      /* Degetul e pe navbar: nu-i mai schimbăm transformarea.

         Altfel ținta se mișcă sub deget între atingere și ridicare — Safari
         hit-testează la început, dar decide click-ul la sfârșit, iar dacă
         elementul a plecat între timp click-ul se pierde. De-aici veneau
         apăsările care „nu intră" și schimbatul de pagină din a treia
         încercare, mai ales imediat după o derulare, când navbarul încă se
         așază. Cât ține atingerea, navbarul e o țintă fixă. */
      if (frozenRef.current) { rafRef.current = null; return; }

      const want = target();
      const next = progressRef.current + (want - progressRef.current) * EASING;
      const settled = Math.abs(want - next) < 0.0015;
      progressRef.current = settled ? want : next;
      el.style.setProperty('--nav-p', progressRef.current.toFixed(4));
      rafRef.current = settled ? null : requestAnimationFrame(tick);
    };

    const kick = () => {
      const y = window.scrollY;
      const dy = y - lastYRef.current;
      // pragul de 3px ignoră tremurul de sub-pixel de la rubber-band-ul iOS,
      // care altfel ar comuta direcția de câteva ori pe secundă stând pe loc
      if (Math.abs(dy) > 3) {
        dirRef.current = dy > 0 ? 1 : -1;
        lastYRef.current = y;
      }
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
    };
    kickRef.current = kick;
    freezeRef.current = (v: boolean) => {
      frozenRef.current = v;
      if (!v) kick();
    };

    lastYRef.current = window.scrollY;
    kick(); // poziția corectă și la intrarea pe pagină derulată (revenire din back)
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);

    /* Dezghețarea stă pe `window`, nu pe navbar: dacă ridici degetul după ce
       l-ai tras în afara capsulei, `pointerup` nu mai ajunge la ea și navbarul
       ar rămâne înghețat pentru totdeauna. */
    const thaw = () => { if (frozenRef.current) { frozenRef.current = false; kick(); } };
    window.addEventListener('pointerup', thaw);
    window.addEventListener('pointercancel', thaw);

    return () => {
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
      window.removeEventListener('pointerup', thaw);
      window.removeEventListener('pointercancel', thaw);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  /* Pe touch nu intram NICIODATA in stare de hover.

     Aici era `onMouseEnter`. Pe telefon, primul deget pe un link declanseaza
     mai intai `mouseenter` sintetic: componenta se redeseneaza (culoarea
     linkului se schimba, indicatorul de sticla aluneca), iar Safari trateaza
     atingerea aia ca simpla trecere cu mouse-ul si NU mai trimite click-ul.
     De-acolo venea „trebuie sa apas de doua ori". `pointerType` ne spune exact
     ce a atins ecranul, deci hover-ul ramane doar pentru mouse real. */
  const isMouse = (e: React.PointerEvent) => e.pointerType === 'mouse';

  /* Plasa de siguranta pentru atingerea pe care iOS o inghite.

     Cat timp pagina inca aluneca din inertie, Safari foloseste prima atingere
     ca sa opreasca derularea si NU mai trimite `click` — de-aici „la primul tap
     se opreste din derulat si abia dupa pot sa apas pe buton". Evenimentele de
     pointer ajung insa normal la noi.

     Deci: la ridicarea degetului pornim un ceas scurt. Daca `click` vine (cazul
     obisnuit), il oprim si nu facem nimic — navigheaza linkul, ca pana acum.
     Daca nu vine deloc, mergem noi la pagina. Pragul de 12px face diferenta
     intre o apasare si inceputul unui gest de derulare, iar `pointercancel`
     (cand degetul ia pagina la vale) anuleaza tot. */
  const navigate = useNavigate();
  const location = useLocation();
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);
  const tapTimerRef = useRef<number | null>(null);

  const cancelTapRescue = () => {
    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  };

  const rescueTap = (e: React.PointerEvent, href: string) => {
    const start = tapStartRef.current;
    tapStartRef.current = null;
    if (isMouse(e) || !start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return;
    cancelTapRescue();
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      if (location.pathname !== href) navigate(href);
    }, 320);
  };

  useEffect(() => cancelTapRescue, []);

  const handleLogoEnter = (e: React.PointerEvent) => {
    if (!isMouse(e)) return;
    const disc = discRef.current;
    if (!disc) return;
    logoTweenRef.current?.kill();
    // svgOrigin: centrul real al discului în coordonatele SVG (526.5, 515.55),
    // nu al cutiei de contur — rotate/transform-origin CSS obișnuit s-ar roti
    // în jurul colțului grupului, nu al cercului.
    gsap.set(disc, { rotate: 0, svgOrigin: '526.5 515.55' });
    logoTweenRef.current = gsap.to(disc, { rotate: 360, duration: 0.5, ease, svgOrigin: '526.5 515.55' });
  };

  return (
    <div className="pill-nav-container" ref={containerRef}>
      <nav
        ref={pillNavRef}
        className={`pill-nav ${className}`}
        aria-label="Primary"
        onPointerEnter={(e) => { if (isMouse(e)) { hoverRef.current = true; kickRef.current(); } }}
        onPointerLeave={(e) => { if (isMouse(e)) { hoverRef.current = false; kickRef.current(); } }}
        onPointerDown={(e) => {
          if (isMouse(e)) return;
          freezeRef.current(true);
          tapStartRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerCancel={() => { tapStartRef.current = null; cancelTapRescue(); }}
      >
        <GlassSurface
          className="pill-nav-glass"
          width="100%"
          height="100%"
          borderRadius={999}
          backgroundOpacity={0.6}
          saturation={1.6}
          blur={14}
          displace={0.4}
          distortionScale={-80}
          redOffset={2}
          greenOffset={4}
          blueOffset={8}
          brightness={60}
          style={{ backgroundColor: glassTint }}
        />

        <Link
          to={items[0]?.href ?? '/'}
          className="pill-logo"
          aria-label="Home"
          onPointerEnter={handleLogoEnter}
          onPointerUp={(e) => rescueTap(e, items[0]?.href ?? '/')}
          onClick={cancelTapRescue}
        >
          <SuperfixMark discRef={discRef} />
        </Link>

        <div className="pill-list-wrap" ref={listWrapRef}>
          <div ref={indicatorRef} className="pill-indicator" aria-hidden="true">
            <GlassSurface
              width="100%"
              height="100%"
              borderRadius={999}
              backgroundOpacity={0.66}
              saturation={2}
              blur={8}
              displace={0.5}
              distortionScale={-70}
              redOffset={3}
              greenOffset={5}
              blueOffset={9}
              brightness={74}
              style={{ backgroundColor: indicatorTint }}
            />
          </div>

          <ul className="pill-list" role="menubar">
            {items.map((item, i) => {
              const selected = (hoveredIndex ?? activeIndex) === i;
              return (
                <li key={item.href} role="none">
                  <Link
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    role="menuitem"
                    to={item.href}
                    className="pill-link"
                    aria-label={item.ariaLabel || item.label}
                    aria-current={activeHref === item.href ? 'page' : undefined}
                    onPointerEnter={(e) => { if (isMouse(e)) setHoveredIndex(i); }}
                    onPointerLeave={(e) => { if (isMouse(e)) setHoveredIndex(null); }}
                    onPointerUp={(e) => rescueTap(e, item.href)}
                    onClick={cancelTapRescue}
                    style={{ color: selected ? activeTextColor : textColor }}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </div>
  );
};

export default PillNav;
