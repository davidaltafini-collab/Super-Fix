import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, useSpring, useReducedMotion } from 'framer-motion';
import { Reveal, BlurIn, Magnetic, Tilt, ClickSpark, EASE_OUT } from '../components/motion';
import { Pill3D, NeuButton } from '../components/Button';
import { getHeroes, peekHeroes } from '../services/dataService';
import { thumb } from '../lib/img';
import { Hero } from '../types';
import {
  Lightning, Drop, Wrench, PaintRoller, Hammer, Key,
  MagnifyingGlass, PaperPlaneTilt, CheckCircle,
  SealCheck, MapPin, SlidersHorizontal, ChatCircleText,
  ArrowRight, Star, ShieldCheck,
} from '@phosphor-icons/react';

const DEFAULT_AVATAR = 'https://super-fix.ro/revizie.png';

/* ============================================================
   SUPERFIX HOME — v3 "Supererou Disney" + motion avansat
   Claymorphism + micro-interactions (Emil Kowalski) + concepte
   React Bits (BlurText, TiltedCard, Magnet, ClickSpark).
   ============================================================ */

const fine = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

type Chip = 'red' | 'spark';
const chipClass: Record<Chip, string> = {
  red: 'bg-super-red/12 text-super-red',
  spark: 'bg-spark/14 text-spark',
};

const TRADES = [
  { name: 'Electrician', desc: 'Tablouri, prize, avarii, iluminat', Icon: Lightning, chip: 'spark' as Chip },
  { name: 'Instalator', desc: 'Țevi, centrale, scurgeri, sanitare', Icon: Drop, chip: 'spark' as Chip },
  { name: 'Mecanic', desc: 'Auto la domiciliu, diagnoză', Icon: Wrench, chip: 'red' as Chip },
  { name: 'Zugrav', desc: 'Vopsit, glet, finisaje', Icon: PaintRoller, chip: 'red' as Chip },
  { name: 'Tâmplar', desc: 'Mobilă, uși, reparații lemn', Icon: Hammer, chip: 'red' as Chip },
  { name: 'Lăcătuș', desc: 'Uși blocate, yale, urgențe', Icon: Key, chip: 'spark' as Chip },
];

const STEPS = [
  { n: 1, title: 'Alegi eroul', desc: 'Vezi poze reale, meserii și recenzii. Tu decizi cine îți rezolvă problema.', Icon: MagnifyingGlass, chip: 'red' as Chip, raised: false },
  { n: 2, title: 'Lansezi semnalul', desc: 'Un formular scurt sau un telefon direct. Eroul potrivit răspunde rapid.', Icon: PaperPlaneTilt, chip: 'spark' as Chip, raised: true },
  { n: 3, title: 'Misiune gata', desc: 'Problema rezolvată. Plătești corect și lași o recenzie pentru comunitate.', Icon: CheckCircle, chip: 'red' as Chip, raised: false },
];

const WHY = [
  { k: 'Eroi verificați', v: 'Fiecare erou are profil real, meserie clară și recenzii de la clienți.', Icon: SealCheck, chip: 'red' as Chip },
  { k: 'Local, în zona ta', v: 'Vezi meseriași care lucrează exact în județul și orașul tău.', Icon: MapPin, chip: 'spark' as Chip },
  { k: 'Alegi tu', v: 'Compari tarife și profiluri, alegi singur. Fără intermediari care decid pentru tine.', Icon: SlidersHorizontal, chip: 'spark' as Chip },
  { k: 'Vorbești direct', v: 'Discuți direct cu eroul. Fără cozi, fără call-center, fără bătăi de cap.', Icon: ChatCircleText, chip: 'red' as Chip },
];

// hero headline: word-stagger blur reveal
const HeroTitle: React.FC = () => {
  const reduce = useReducedMotion();
  const words: { t: string; red?: boolean }[] = [
    { t: 'Eroi' }, { t: 'pentru' }, { t: 'orice', red: true }, { t: 'reparație.', red: true },
  ];
  const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } };
  const word = {
    hidden: { opacity: 0, y: '0.4em', filter: 'blur(10px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE_OUT } },
  };
  return (
    <motion.h1
      variants={container}
      initial={reduce ? false : 'hidden'}
      animate="show"
      className="font-heading font-bold leading-[1.02] tracking-tight text-graphite text-[2.7rem] sm:text-6xl md:text-[4.1rem]"
    >
      {words.map((w, i) => (
        <motion.span key={i} variants={reduce ? undefined : word} className={`inline-block mr-[0.28em] ${w.red ? 'text-super-red' : ''}`}>
          {w.t}
        </motion.span>
      ))}
    </motion.h1>
  );
};

// mascot with mouse-parallax + idle float
const HeroMascot: React.FC<{ mx: any; my: any }> = ({ mx, my }) => (
  <motion.div style={{ x: mx, y: my }} className="relative">
    <div className="absolute inset-0 -z-10 m-auto w-[78%] h-[78%] rounded-full bg-spark/25 blur-2xl" aria-hidden="true" />
    <div className="animate-float">
      <img
        src="/mascot.png"
        alt="Superfix, robotul erou meseriaș"
        className="relative w-auto max-h-[42dvh] md:max-h-[74dvh] drop-shadow-[0_34px_44px_rgba(46,51,59,0.4)]"
      />
    </div>
    <div className="mx-auto mt-1 w-40 md:w-56 h-4 rounded-[100%] bg-graphite/25 blur-md" aria-hidden="true" />
  </motion.div>
);

export const Home: React.FC = () => {
  const reduce = useReducedMotion();
  const mx = useSpring(0, { stiffness: 60, damping: 16, mass: 0.4 });
  const my = useSpring(0, { stiffness: 60, damping: 16, mass: 0.4 });

  // Banda de eroi de pe homepage: cei mai de încredere din listă, nu meserii generice.
  const [heroes, setHeroes] = useState<Hero[]>(() => peekHeroes() ?? []);
  useEffect(() => { getHeroes().then(setHeroes); }, []);
  const topHeroes = useMemo(
    () => [...heroes].sort((a, b) => b.trustFactor - a.trustFactor),
    [heroes],
  );
  /* Banda trebuie sa umple ecranul de doua ori (pentru bucla -50% fara sarituri).
     Cu doar 2-3 eroi in baza, o singura trecere e prea ingusta si se vede un gol
     in animatie — asa ca repetam lista pana avem destule carduri, apoi se reia. */
  const marqueeHeroes = useMemo(() => {
    if (topHeroes.length === 0) return [];
    const MIN_ITEMS = 14;
    const repeats = Math.max(1, Math.ceil(MIN_ITEMS / topHeroes.length));
    return Array.from({ length: repeats }, () => topHeroes).flat();
  }, [topHeroes]);

  const onHeroMove = (e: React.MouseEvent) => {
    if (reduce || !fine()) return;
    mx.set((e.clientX / window.innerWidth - 0.5) * 34);
    my.set((e.clientY / window.innerHeight - 0.5) * 24);
  };
  const onHeroLeave = () => { mx.set(0); my.set(0); };

  const heroCopy = {
    hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.45 } },
  };
  const heroItem = {
    hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
  };

  return (
    <div className="text-graphite font-sans overflow-x-hidden">
      <Helmet>
        <title>Superfix - Găsește Meșteri și Eroi Locali în România</title>
        <meta name="description" content="Platforma unde găsești rapid instalatori, electricieni și meșteri verificați în zona ta. Alege eroul potrivit pentru problema ta." />
        <meta property="og:title" content="Superfix - Meșteri Locali Gata de Acțiune" />
        <meta property="og:description" content="Ai nevoie de un erou? Găsește meseriași verificați în zona ta." />
        <link rel="canonical" href="https://superfix.ro/" />
      </Helmet>

      <style>{`
        @keyframes sf-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .sf-marquee { display: flex; width: max-content; animation: sf-marquee 34s linear infinite; }
        .sf-marquee-wrap:hover .sf-marquee { animation-play-state: paused; }
        .sf-dots { background-image: radial-gradient(rgba(46,51,59,0.07) 1.5px, transparent 1.6px); background-size: 26px 26px; }
        /* Frosted glass cards (spre gri) — se disting clar de fundal */
        .sf-glass {
          background: linear-gradient(150deg, rgba(255,255,255,0.60), rgba(203,213,228,0.42));
          -webkit-backdrop-filter: blur(16px) saturate(155%);
          backdrop-filter: blur(16px) saturate(155%);
          border: 1px solid rgba(255,255,255,0.72);
          box-shadow: 0 22px 46px -20px rgba(46,51,59,0.45), 0 4px 12px -6px rgba(46,51,59,0.16), inset 0 1px 0 rgba(255,255,255,0.9);
        }
        @media (prefers-reduced-transparency: reduce) {
          .sf-glass { background: #e9edf5; -webkit-backdrop-filter: none; backdrop-filter: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-marquee, .animate-float, .animate-float-slow { animation: none !important; }
        }
      `}</style>

      {/* ============ 1. HERO ============ */}
      <section className="relative overflow-hidden" onMouseMove={onHeroMove} onMouseLeave={onHeroLeave}>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-cloud to-cloud" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 sf-dots opacity-60" aria-hidden="true" />
        <div className="absolute -top-24 right-0 w-[38rem] h-[38rem] rounded-full bg-spark/20 blur-3xl -z-10 animate-float-slow" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-24 w-[34rem] h-[34rem] rounded-full bg-super-red/10 blur-3xl -z-10" aria-hidden="true" />

        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-28 pb-14 md:pb-16 min-h-[100dvh] grid md:grid-cols-2 gap-8 md:gap-6 items-center">
          <motion.div variants={heroCopy} initial={reduce ? false : 'hidden'} animate="show" className="text-center md:text-left order-2 md:order-1">
            <motion.span variants={reduce ? undefined : heroItem} className="inline-flex items-center gap-2 bg-white text-graphite font-heading font-semibold text-sm px-4 py-2 rounded-full shadow-clay-sm">
              <SealCheck size={18} weight="fill" className="text-super-red" aria-hidden="true" />
              Meseriași verificați din zona ta
            </motion.span>

            <div className="mt-6"><HeroTitle /></div>

            <motion.p variants={reduce ? undefined : heroItem} className="mt-5 mx-auto md:mx-0 max-w-md text-lg md:text-xl text-graphite-soft">
              Electricieni, instalatori și mecanici verificați, gata să-ți salveze ziua. Alegi tu eroul potrivit.
            </motion.p>

            <motion.div variants={reduce ? undefined : heroItem} className="mt-8 flex flex-col sm:flex-row items-center gap-3 justify-center md:justify-start">
              <Magnetic className="w-full max-w-xs sm:w-auto sm:max-w-none">
                <ClickSpark color="#F5C518">
                  <NeuButton to="/heroes" tone="red" className="w-full sm:w-auto">
                    Găsește un erou
                    <ArrowRight size={20} weight="bold" aria-hidden="true" />
                  </NeuButton>
                </ClickSpark>
              </Magnetic>
              <NeuButton href="#cum-functioneaza" className="w-full max-w-xs sm:w-auto">Cum funcționează</NeuButton>
            </motion.div>
          </motion.div>

          <div className="order-1 md:order-2 flex justify-center md:justify-end">
            <HeroMascot mx={mx} my={my} />
          </div>
        </div>
      </section>

      {/* ============ 2. MARQUEE EROI (cei mai de încredere din listă, în buclă continuă) ============ */}
      <div className="py-5 bg-white/60 overflow-hidden sf-marquee-wrap" role="presentation">
        <div className="sf-marquee">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center gap-3 pr-3 shrink-0" aria-hidden={dup === 1}>
              {marqueeHeroes.map((h, i) => (
                <Link
                  key={`${dup}-${h.id}-${i}`}
                  to={`/hero/${h.slug || h.id}`}
                  className="group inline-flex items-center gap-3 bg-white pl-2 pr-5 py-2 rounded-full shadow-clay-sm whitespace-nowrap transition-transform hover:-translate-y-0.5"
                >
                  <img
                    src={thumb(h.avatarUrl || DEFAULT_AVATAR, 96, { square: true })}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                  <span className="flex flex-col items-start leading-tight text-left">
                    <span className="font-heading font-semibold text-graphite text-sm">{h.alias}</span>
                    <span className="flex items-center gap-1 text-xs text-graphite-soft">
                      {h.category}
                      <ShieldCheck size={13} weight="fill" className="text-emerald-600" aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              ))}
              {topHeroes.length === 0 && TRADES.concat(TRADES.slice(0, 1)).map((t, i) => (
                <span key={`fallback-${dup}-${i}`} className="inline-flex items-center gap-2 bg-white text-graphite font-heading font-medium px-5 py-2.5 rounded-full shadow-clay-sm whitespace-nowrap">
                  <t.Icon size={22} weight="duotone" className={t.chip === 'red' ? 'text-super-red' : 'text-spark'} aria-hidden="true" />
                  {t.name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ============ 3. PUTERILE (tilt cards -> /heroes) ============ */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <Reveal>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h2 className="font-heading font-bold text-4xl md:text-5xl text-graphite">
                  Alege după <BlurIn text="putere" className="text-super-red" />
                </h2>
                <p className="mt-4 text-lg text-graphite-soft max-w-md">Orice meserie, un erou pregătit pentru ea.</p>
              </div>
              <Link to="/heroes" className="group inline-flex items-center gap-1.5 font-heading font-semibold text-super-red">
                Vezi toți eroii <ArrowRight size={20} weight="bold" className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>

          <div className="mt-12 grid grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {TRADES.map((t, i) => (
              <Reveal key={t.name} delay={i * 70} bounce>
                <Tilt max={10} className="h-full rounded-[28px]">
                  <Link
                    to="/heroes"
                    className="group flex flex-col h-full sf-glass rounded-[28px] p-6 md:p-7"
                  >
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-clay-sm bg-white ${t.chip === 'red' ? 'text-super-red' : 'text-spark'}`}>
                      <t.Icon size={34} weight="duotone" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 font-heading font-semibold text-xl md:text-2xl text-graphite">{t.name}</h3>
                    <p className="mt-2 text-sm md:text-base text-graphite-soft flex-grow">{t.desc}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 font-heading font-semibold text-sm text-super-red opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                      Vezi eroii <ArrowRight size={16} weight="bold" aria-hidden="true" />
                    </span>
                  </Link>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 4. CUM FUNCȚIONEAZĂ ============ */}
      <section id="cum-functioneaza" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <Reveal className="text-center">
            <h2 className="font-heading font-bold text-4xl md:text-5xl text-graphite">
              Cum <BlurIn text="funcționează" className="text-super-red" />
            </h2>
            <p className="mt-4 text-lg text-graphite-soft max-w-md mx-auto">Trei pași și problema ta e rezolvată.</p>
          </Reveal>

          <div className="mt-14 grid md:grid-cols-3 gap-6 md:gap-7">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 100} bounce className={s.raised ? 'md:-translate-y-6' : ''}>
                <Tilt max={7} className="h-full rounded-[28px]">
                  <div className="h-full sf-glass rounded-[28px] p-8 text-center">
                    <div className="relative mx-auto w-20 h-20">
                      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-clay-sm ${chipClass[s.chip]}`}>
                        <s.Icon size={38} weight="duotone" aria-hidden="true" />
                      </div>
                      <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-graphite text-white font-heading font-semibold text-sm flex items-center justify-center shadow-clay-sm">
                        {s.n}
                      </span>
                    </div>
                    <h3 className="mt-6 font-heading font-semibold text-2xl text-graphite">{s.title}</h3>
                    <p className="mt-3 text-graphite-soft leading-relaxed">{s.desc}</p>
                  </div>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 5. DE CE SUPERFIX ============ */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <Reveal className="text-center">
            <h2 className="font-heading font-bold text-4xl md:text-5xl text-graphite">
              De ce <BlurIn text="Superfix" className="text-super-red" />
            </h2>
          </Reveal>
          <div className="mt-14 grid sm:grid-cols-2 gap-6">
            {WHY.map((w, i) => (
              <Reveal key={w.k} delay={i * 80} bounce>
                <div className="h-full sf-glass rounded-[28px] p-7 flex gap-5">
                  <div className={`shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center shadow-clay-sm ${chipClass[w.chip]}`}>
                    <w.Icon size={34} weight="duotone" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-2xl text-graphite">{w.k}</h3>
                    <p className="mt-2 text-graphite-soft leading-relaxed">{w.v}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 6. CTA MESERIAȘI -> /register ============ */}
      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden bg-graphite text-white rounded-[36px] shadow-clay-dark px-7 py-12 md:p-16 grid md:grid-cols-2 gap-8 items-center">
              <div className="absolute -top-20 -right-16 w-80 h-80 rounded-full bg-spark/20 blur-3xl" aria-hidden="true" />
              <div className="relative text-center md:text-left">
                <h2 className="font-heading font-bold text-3xl md:text-5xl leading-tight">
                  Ești meseriaș <span className="text-spark-soft">cu puteri</span>?
                </h2>
                <p className="mt-5 text-lg md:text-xl text-white/80 max-w-md mx-auto md:mx-0">
                  Intră în echipă și lasă orașul să te găsească. Profilul tău, clienții tăi, regulile tale.
                </p>
                <div className="mt-8 flex items-center gap-4 justify-center md:justify-start">
                  <Magnetic>
                    <ClickSpark color="#F5C518">
                      <Pill3D to="/register">
                        Înscrie-te în echipă
                        <ArrowRight size={20} weight="bold" aria-hidden="true" />
                      </Pill3D>
                    </ClickSpark>
                  </Magnetic>
                  <span className="hidden sm:inline-flex items-center gap-1 text-white/70 font-semibold">
                    <Star size={18} weight="fill" className="text-comic-yellow" aria-hidden="true" /> gratuit la start
                  </span>
                </div>
              </div>
              <div className="relative flex justify-center md:justify-end">
                <div className="animate-float">
                  <img src="/mascot.png" alt="" aria-hidden="true" className="w-auto max-h-64 md:max-h-80 drop-shadow-[0_26px_36px_rgba(0,0,0,0.5)]" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
};
