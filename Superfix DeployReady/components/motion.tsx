import React, { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useReducedMotion, useTransform } from 'framer-motion';

/* ============================================================
   Motion primitives — tunate pe filozofia Emil Kowalski
   (easing puternic, spring pt. "viu", transform/opacity only,
   gated pe pointer:fine, reduced-motion safe) + concepte React Bits.
   ============================================================ */

// Emil's strong ease-out
export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const isFine = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* --- useInView: IntersectionObserver propriu, StrictMode-safe, cu failsafe.
   (framer-motion whileInView se blochează la initial în React 19 StrictMode) --- */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    // failsafe: dacă din orice motiv observer-ul nu declanșează, arată conținutul
    const t = window.setTimeout(() => setInView(true), 1200);
    return () => { io.disconnect(); window.clearTimeout(t); };
  }, []);
  return { ref, inView };
}

/* --- Reveal: fade/slide la intrarea în viewport (scroll-reveal) --- */
export const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  bounce?: boolean;
}> = ({ children, className, delay = 0, y = 26, bounce = false }) => {
  const reduce = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const ease = bounce ? 'cubic-bezier(.34,1.56,.64,1)' : 'cubic-bezier(.16,1,.3,1)';
  const style: React.CSSProperties = reduce
    ? {}
    : {
        opacity: inView ? 1 : 0,
        transform: inView ? 'none' : `translateY(${y}px)`,
        transition: `opacity .6s ${ease} ${delay}ms, transform .65s ${ease} ${delay}ms`,
        willChange: 'opacity, transform',
      };
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
};

/* --- BlurIn: titlu care apare word-by-word cu blur (React Bits BlurText) --- */
export const BlurIn: React.FC<{
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  trigger?: 'load' | 'view';
}> = ({ text, className, delay = 0, stagger = 0.05, trigger = 'view' }) => {
  const reduce = useReducedMotion();
  const { ref, inView } = useInView<HTMLSpanElement>();
  const words = text.split(' ');
  if (reduce) return <span className={className}>{text}</span>;
  const anim = { opacity: 1, y: 0, filter: 'blur(0px)' };
  const init = { opacity: 0, y: '0.35em', filter: 'blur(10px)' };
  const active = trigger === 'load' ? true : inView;
  return (
    <span ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          initial={init}
          animate={active ? anim : init}
          transition={{ duration: 0.6, delay: delay + i * stagger, ease: EASE_OUT }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  );
};

/* --- Magnetic: elementul e atras spre cursor (Emil: max 1-2 focale) --- */
export const Magnetic: React.FC<{
  children: React.ReactNode;
  className?: string;
  strength?: number;
}> = ({ children, className, strength = 0.35 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 170, damping: 15, mass: 0.1 });
  const y = useSpring(0, { stiffness: 170, damping: 15, mass: 0.1 });
  const reduce = useReducedMotion();

  const move = (e: React.MouseEvent) => {
    if (reduce || !isFine() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * strength);
    y.set((e.clientY - r.top - r.height / 2) * strength);
  };
  const reset = () => { x.set(0); y.set(0); };

  return (
    <motion.div ref={ref} style={{ x, y }} onMouseMove={move} onMouseLeave={reset} className={className}>
      {children}
    </motion.div>
  );
};

/* --- Tilt: card cu tilt 3D + glare la hover (React Bits TiltedCard) --- */
export const Tilt: React.FC<{
  children: React.ReactNode;
  className?: string;
  max?: number;
  glare?: boolean;
}> = ({ children, className, max = 9, glare = true }) => {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 200, damping: 18 });
  const ry = useSpring(0, { stiffness: 200, damping: 18 });
  const gx = useSpring(50, { stiffness: 200, damping: 20 });
  const gy = useSpring(50, { stiffness: 200, damping: 20 });
  const go = useSpring(0, { stiffness: 200, damping: 20 });
  const glareBg = useTransform(
    [gx, gy],
    ([x, y]: number[]) => `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.9), transparent 45%)`
  );
  const reduce = useReducedMotion();

  const move = (e: React.MouseEvent) => {
    if (reduce || !isFine() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 2 * max);
    rx.set(-(py - 0.5) * 2 * max);
    gx.set(px * 100); gy.set(py * 100); go.set(glare ? 0.18 : 0);
  };
  const reset = () => { rx.set(0); ry.set(0); go.set(0); };

  return (
    <motion.div
      ref={ref}
      onMouseMove={move}
      onMouseLeave={reset}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, transformStyle: 'preserve-3d' }}
      className={`relative ${className || ''}`}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light"
          style={{ opacity: go, background: glareBg }}
        />
      )}
    </motion.div>
  );
};

/* --- ClickSpark: scântei la click, din punctul apăsat (React Bits ClickSpark) --- */
export const ClickSpark: React.FC<{
  children: React.ReactNode;
  color?: string;
  className?: string;
}> = ({ children, color = '#F5C518', className }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<{ x: number; y: number; a: number; t: number }[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => {
    const c = canvas.current, w = wrap.current;
    if (!c || !w) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const resize = () => { const r = w.getBoundingClientRect(); c.width = r.width; c.height = r.height; };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(w);

    const DUR = 500, COUNT = 11;
    const draw = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, c.width, c.height);
      sparks.current = sparks.current.filter((s) => now - s.t < DUR);
      sparks.current.forEach((s) => {
        const p = (now - s.t) / DUR;
        const ease = 1 - Math.pow(1 - p, 3);
        const d = ease * 30;
        const len = 15 * (1 - p);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = 1 - p;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(s.a) * d, s.y + Math.sin(s.a) * d);
        ctx.lineTo(s.x + Math.cos(s.a) * (d + len), s.y + Math.sin(s.a) * (d + len));
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      raf = sparks.current.length ? requestAnimationFrame(draw) : 0;
    };
    const onClick = (e: MouseEvent) => {
      if (reduce) return;
      const r = w.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
      for (let i = 0; i < COUNT; i++) sparks.current.push({ x, y, a: (Math.PI * 2 * i) / COUNT, t: now });
      if (!raf) raf = requestAnimationFrame(draw);
    };
    w.addEventListener('click', onClick);
    return () => { w.removeEventListener('click', onClick); ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [color, reduce]);

  return (
    <div ref={wrap} className={`relative ${className || ''}`}>
      {children}
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 z-20" />
    </div>
  );
};
