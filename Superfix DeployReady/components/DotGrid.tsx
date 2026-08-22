import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

import './DotGrid.css';

gsap.registerPlugin(InertiaPlugin);

/* Peste 2 nu se mai vede diferenta la un punct de 5px, dar memoria panzei creste
   cu patratul: pe un telefon cu dpr 3 erau 85 MB doar pentru fundal. */
const MAX_DPR = 2;

/* Cat timp tinem bucla de desen vie dupa ultima interactiune. Inertia plus
   revenirea elastica (1.3s) incap lejer; dupa aia nu mai are ce sa se schimbe
   in imagine, deci oprim complet requestAnimationFrame. */
const IDLE_MS = 3500;

const throttle = <T extends (...args: any[]) => void>(func: T, limit: number) => {
  let lastCall = 0;
  return function (this: unknown, ...args: Parameters<T>) {
    const now = performance.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func.apply(this, args);
    }
  };
};

function hexToRgb(hex: string) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

/* Grila reactioneaza la cursor: proximitate, inertie la miscare rapida, unda de
   soc la click. Pe touch nu exista cursor, deci tot mecanismul e cost pur —
   acolo punem aceeasi retea de puncte ca fundal CSS (o singura pictura, zero
   memorie video, zero cadre). La fel si cand omul cere miscare redusa. */
const useInteractive = () => {
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setInteractive(fine.matches && !reduce.matches);
    read();
    fine.addEventListener('change', read);
    reduce.addEventListener('change', read);
    return () => {
      fine.removeEventListener('change', read);
      reduce.removeEventListener('change', read);
    };
  }, []);
  return interactive;
};

interface Dot {
  cx: number;
  cy: number;
  xOffset: number;
  yOffset: number;
  _inertiaApplied: boolean;
}

interface DotGridProps {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  speedTrigger?: number;
  shockRadius?: number;
  shockStrength?: number;
  maxSpeed?: number;
  resistance?: number;
  returnDuration?: number;
  className?: string;
  style?: React.CSSProperties;
}

const DotGrid: React.FC<DotGridProps> = ({
  dotSize = 16,
  gap = 32,
  baseColor = '#5227FF',
  activeColor = '#5227FF',
  proximity = 150,
  speedTrigger = 100,
  shockRadius = 250,
  shockStrength = 5,
  maxSpeed = 5000,
  resistance = 750,
  returnDuration = 1.5,
  className = '',
  style,
}) => {
  const interactive = useInteractive();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  // -9999: fara asta pointerul porneste in (0,0) si la incarcare se aprinde
  // degeaba un petic rosu in coltul din stanga-sus.
  const pointerRef = useRef({
    x: -9999,
    y: -9999,
    vx: 0,
    vy: 0,
    speed: 0,
    lastTime: 0,
    lastX: 0,
    lastY: 0,
  });

  const cell = dotSize + gap;

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

  const circlePath = useMemo(() => {
    if (typeof window === 'undefined' || !window.Path2D) return null;
    const p = new window.Path2D();
    p.arc(0, 0, dotSize / 2, 0, Math.PI * 2);
    return p;
  }, [dotSize]);

  /* Bucla de desen porneste la cerere si se opreste singura. */
  const rafRef = useRef<number | null>(null);
  const wakeRef = useRef(0);
  const wakeDrawRef = useRef<() => void>(() => {});

  const buildGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /* Panza acopera ecranul plus un rand, nu tot documentul.
       Inainte era intinsa peste toata pagina: pe home, 390x6389 CSS px inseamna
       1170x19165 px reali la dpr 3 — 22 de megapixeli, ~85 MB, peste limita de
       suprafata a lui Safari pe iPhone, si 5238 de puncte redesenate la fiecare
       cadru. Reteaua fiind periodica cu pasul `cell`, derularea o mutam cu un
       transform (treaba compozitorului, fara redesenare) si arata identic. */
    const width = window.innerWidth;
    const height = window.innerHeight + cell;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    sizeRef.current = { w: width, h: height };

    const cols = Math.ceil(width / cell) + 1;
    const rows = Math.ceil(height / cell) + 1;

    const dots: Dot[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        dots.push({
          cx: dotSize / 2 + x * cell,
          cy: dotSize / 2 + y * cell,
          xOffset: 0,
          yOffset: 0,
          _inertiaApplied: false,
        });
      }
    }
    dotsRef.current = dots;
    wakeDrawRef.current();
  }, [cell, dotSize]);

  useEffect(() => {
    if (!interactive || !circlePath) return;
    const proxSq = proximity * proximity;

    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h } = sizeRef.current;
      // clearRect in px CSS: contextul e deja scalat cu dpr, deci canvas.width
      // ar sterge de dpr ori mai mult decat trebuie.
      ctx.clearRect(0, 0, w, h);

      const { x: px, y: py } = pointerRef.current;

      for (const dot of dotsRef.current) {
        const ox = dot.cx + dot.xOffset;
        const oy = dot.cy + dot.yOffset;
        const dx = dot.cx - px;
        const dy = dot.cy - py;
        const dsq = dx * dx + dy * dy;

        let style = baseColor;
        let glow = 0;
        if (dsq <= proxSq) {
          const dist = Math.sqrt(dsq);
          const t = 1 - dist / proximity;
          const r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t);
          const g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t);
          const b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t);
          style = `rgb(${r},${g},${b})`;
          glow = t * 14; // halou real (canvas shadow), nu doar schimbare de culoare
        }

        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillStyle = style;
        if (glow > 0) {
          ctx.shadowColor = activeColor;
          ctx.shadowBlur = glow;
        }
        ctx.fill(circlePath);
        ctx.restore();
      }
    };

    const loop = () => {
      paint();
      if (performance.now() < wakeRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };

    wakeDrawRef.current = () => {
      wakeRef.current = performance.now() + IDLE_MS;
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(loop);
    };

    paint();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      wakeDrawRef.current = () => {};
    };
  }, [interactive, proximity, baseColor, activeColor, activeRgb, baseRgb, circlePath]);

  useEffect(() => {
    if (!interactive) return;
    buildGrid();
    // `resize` pe fereastra, nu ResizeObserver pe un strat cat pagina: al doilea
    // se redeclansa la orice schimbare de inaltime a continutului (imagini care
    // se incarca, liste care sosesc) si realoca panza degeaba.
    window.addEventListener('resize', buildGrid);
    return () => window.removeEventListener('resize', buildGrid);
  }, [interactive, buildGrid]);

  /* Derularea muta grila printr-un transform: reteaua e periodica, deci o
     deplasare cu restul impartirii la `cell` da exact aceeasi imagine ca o
     grila ancorata in pagina — dar fara niciun pixel redesenat. */
  useEffect(() => {
    if (!interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      canvas.style.transform = `translate3d(0, ${-(window.scrollY % cell)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [interactive, cell]);

  useEffect(() => {
    if (!interactive) return;

    const settleBack = (dot: Dot) => {
      gsap.to(dot, {
        xOffset: 0,
        yOffset: 0,
        duration: returnDuration,
        ease: 'elastic.out(1,0.75)',
      });
      dot._inertiaApplied = false;
      wakeDrawRef.current(); // revenirea elastica are nevoie de cadre proaspete
    };

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      const pr = pointerRef.current;
      const dt = pr.lastTime ? now - pr.lastTime : 16;
      const dx = e.clientX - pr.lastX;
      const dy = e.clientY - pr.lastY;
      let vx = (dx / dt) * 1000;
      let vy = (dy / dt) * 1000;
      let speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        vx *= scale;
        vy *= scale;
        speed = maxSpeed;
      }
      pr.lastTime = now;
      pr.lastX = e.clientX;
      pr.lastY = e.clientY;
      pr.vx = vx;
      pr.vy = vy;
      pr.speed = speed;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pr.x = e.clientX - rect.left;
      pr.y = e.clientY - rect.top;
      wakeDrawRef.current();

      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y);
        if (speed > speedTrigger && dist < proximity && !dot._inertiaApplied) {
          dot._inertiaApplied = true;
          gsap.killTweensOf(dot);
          const pushX = dot.cx - pr.x + vx * 0.005;
          const pushY = dot.cy - pr.y + vy * 0.005;
          gsap.to(dot, {
            inertia: { xOffset: pushX, yOffset: pushY, resistance },
            onComplete: () => settleBack(dot),
          });
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      wakeDrawRef.current();
      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
        if (dist < shockRadius && !dot._inertiaApplied) {
          dot._inertiaApplied = true;
          gsap.killTweensOf(dot);
          const falloff = Math.max(0, 1 - dist / shockRadius);
          const pushX = (dot.cx - cx) * shockStrength * falloff;
          const pushY = (dot.cy - cy) * shockStrength * falloff;
          gsap.to(dot, {
            inertia: { xOffset: pushX, yOffset: pushY, resistance },
            onComplete: () => settleBack(dot),
          });
        }
      }
    };

    const throttledMove = throttle(onMove, 50);
    window.addEventListener('mousemove', throttledMove, { passive: true });
    window.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('mousemove', throttledMove);
      window.removeEventListener('click', onClick);
    };
  }, [interactive, maxSpeed, speedTrigger, proximity, resistance, returnDuration, shockRadius, shockStrength]);

  if (!interactive) {
    return (
      <div
        className={`dot-grid dot-grid--static ${className}`}
        aria-hidden="true"
        style={
          {
            ...style,
            '--dot-color': baseColor,
            '--dot-radius': `${dotSize / 2}px`,
            '--dot-cell': `${cell}px`,
          } as React.CSSProperties
        }
      />
    );
  }

  return (
    <section className={`dot-grid ${className}`} style={style}>
      <canvas ref={canvasRef} className="dot-grid__canvas" />
    </section>
  );
};

export default DotGrid;
