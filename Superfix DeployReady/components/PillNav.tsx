import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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

  // Mic la scroll-down / mare la scroll-up — prin clasă CSS, exact ca în versiunea
  // care funcționa. NU prin GSAP: GSAP scrie transform inline pe element, iar stilul
  // inline bate clasa CSS, ceea ce bloca complet micșorarea.
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const THRESHOLD = 60;
    let lastY = window.scrollY;
    let ticking = false;

    const evaluate = () => {
      ticking = false;
      const y = window.scrollY;
      const goingDown = y > lastY;
      lastY = y;

      if (y > THRESHOLD && goingDown) setIsCompact(true);
      else if (y <= THRESHOLD || !goingDown) setIsCompact(false);
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(evaluate);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Pe touch nu intram NICIODATA in stare de hover.

     Aici era `onMouseEnter`. Pe telefon, primul deget pe un link declanseaza
     mai intai `mouseenter` sintetic: componenta se redeseneaza (culoarea
     linkului se schimba, indicatorul de sticla aluneca), iar Safari trateaza
     atingerea aia ca simpla trecere cu mouse-ul si NU mai trimite click-ul.
     De-acolo venea „trebuie sa apas de doua ori". `pointerType` ne spune exact
     ce a atins ecranul, deci hover-ul ramane doar pentru mouse real. */
  const isMouse = (e: React.PointerEvent) => e.pointerType === 'mouse';

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
    <div className={`pill-nav-container${isCompact ? ' is-compact' : ''}`}>
      <nav ref={pillNavRef} className={`pill-nav ${className}`} aria-label="Primary">
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
