import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  forwardRef,
} from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { collapseOnto, prefersReducedMotion } from '@/lib/flip';

import './mission-viewer.css';
import { thumb, full } from '@/lib/img';
import { lockBodyScroll } from '@/lib/scrollLock';

/* ============================================================
   AnimatedFolder — dosar 3D care se deschide la hover și scoate
   lucrările afară.

   La click pe o lucrare se deschide MissionViewer: un carusel real
   (toate misiunile într-o bandă) peste un fundal blurat. În fiecare
   misiune, poza "Înainte" stă mereu în stânga și "După" mereu în
   dreapta; click pe una o aduce în față, fără să-și schimbe locul.

   Adaptări față de sursa originală: iconițe Phosphor (proiectul are deja
   Phosphor), culorile brandului în loc de tokenii shadcn, dvh în loc de vh.
   ============================================================ */

export interface FolderProject {
  id: string;
  /** poza de copertă arătată pe cardul din dosar */
  image: string;
  title: string;
  beforeUrl?: string | null;
  afterUrl?: string | null;
}

/* ---------------- cardul din dosar ---------------- */

interface ProjectCardProps {
  image: string;
  title: string;
  delay: number;
  isVisible: boolean;
  /** teaser: cardurile ies doar putin, ca sa se vada ca dosarul se deschide */
  peek?: boolean;
  index: number;
  onClick: () => void;
  isSelected: boolean;
}

const ProjectCard = forwardRef<HTMLDivElement, ProjectCardProps>(
  ({ image, title, delay, isVisible, peek, index, onClick, isSelected }, ref) => {
    // doua pozitii de referinta: stivuit in dosar si scos complet afara.
    // Orice stare intermediara (teaserul) e o interpolare intre ele.
    const STACKED = { y: 2, x: [-13, 0, 13], rot: [-7, 0, 7], scale: 0.72 };
    const FANNED = { y: -90, x: [-55, 0, 55], rot: [-12, 0, 12], scale: 1 };

    const f = isVisible ? 1 : peek ? 0.35 : 0;
    const lerp = (a: number, b: number) => a + (b - a) * f;
    const tx = lerp(STACKED.x[index] ?? 0, FANNED.x[index] ?? 0);
    const ty = lerp(STACKED.y, FANNED.y);
    const rot = lerp(STACKED.rot[index] ?? 0, FANNED.rot[index] ?? 0);
    const sc = lerp(STACKED.scale, FANNED.scale);

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={isVisible ? 0 : -1}
        aria-label={`Deschide lucrarea: ${title}`}
        className={cn(
          'absolute h-28 w-20 overflow-hidden rounded-lg shadow-xl',
          'border border-white/60 bg-white',
          'cursor-pointer hover:ring-2 hover:ring-super-red/50',
          isSelected && 'opacity-0',
        )}
        style={{
          transform: `translateY(${ty}px) translateX(${tx}px) rotate(${rot}deg) scale(${sc})`,
          opacity: isSelected ? 0 : 1,
          // Overshoot (1.56) doar la deschiderea completa, unde da saltul viu.
          // Oriunde altundeva ar trece de tinta in jos si cardurile ar iesi prin
          // fundul dosarului, deci folosim o curba care se opreste exact unde trebuie.
          transition: `all ${f === 1 ? 600 : 520}ms ${
            f === 1 ? 'cubic-bezier(0.34, 1.56, 0.64, 1)' : 'cubic-bezier(0.32, 0.72, 0, 1)'
          } ${delay}ms`,
          zIndex: 10 - index,
          left: '-40px',
          top: '-56px',
        }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }
        }}
      >
        <img
          src={thumb(image, 600)}
          alt={title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-graphite/70 to-transparent" />
        <p className="absolute inset-x-1.5 bottom-1.5 truncate text-[10px] font-semibold text-white">
          {title}
        </p>
      </div>
    );
  },
);
ProjectCard.displayName = 'ProjectCard';

/* ---------------- vizualizatorul de misiune ---------------- */

type Shot = 'before' | 'after';

interface MissionViewerProps {
  projects: FolderProject[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onCloseComplete?: () => void;
  /** unde statea cardul apasat, in coordonate de ecran: de acolo porneste animatia */
  originRect?: DOMRect | null;
  /** unde se strange la inchidere: mijlocul dosarului, masurat proaspat */
  collapseTo?: () => DOMRect | null;
}

function MissionViewer({
  projects,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  onCloseComplete,
  originRect,
  collapseTo,
}: MissionViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [front, setFront] = useState<Shot>('after');
  const [dragX, setDragX] = useState(0);
  /** formatul real al fiecarei poze (latime/inaltime), citit dupa ce se incarca */
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);
  /** true dacă degetul chiar a tras: atunci click-ul de la final nu mai schimbă poza din față */
  const movedRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  /** blocul care creste: banda cu poze plus randul cu titlu si sageti */
  const stageRef = useRef<HTMLDivElement>(null);
  const didOpenRef = useRef(false);
  const flipTimer = useRef<number | null>(null);
  /* La inchidere parintele face selectedIndex = null, iar currentIndex cade pe 0.
     Fara asta, banda se intoarce la prima misiune exact in timp ce se strange
     in dosar, si vezi misiunea 1 crescand peste cea pe care erai. */
  const [frozenIndex, setFrozenIndex] = useState<number | null>(null);

  const noteRatio = useCallback((url: string, el: HTMLImageElement | null) => {
    if (!el || !el.naturalWidth || !el.naturalHeight) return;
    const r = el.naturalWidth / el.naturalHeight;
    setRatios((prev) => (prev[url] === r ? prev : { ...prev, [url]: r }));
  }, []);

  // Legat de isOpen, nu de un efect: daca redeschizi inainte sa expire
  // animatia de inchidere, nu apuci sa vezi un frame cu misiunea gresita.
  const index = !isOpen && frozenIndex !== null ? frozenIndex : currentIndex;
  const project = projects[index];
  const hasPrev = index > 0;
  const hasNext = index < projects.length - 1;

  const close = useCallback(() => {
    const el = stageRef.current;
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    // Se strange in DOSAR, nu in cardul de plecare: cardul statea zburat
    // deasupra dosarului, deci se oprea in aer. Masuram proaspat, la inchidere.
    const target = collapseTo?.() ?? originRect ?? null;
    if (el && target && !prefersReducedMotion()) {
      el.style.willChange = 'transform';
      const collapsed = collapseOnto(el, target);
      if (collapsed) {
        // Curba e mai echilibrata decat cea de aterizare (care baga 78% din
        // miscare in primele 40% si lasa o coada lunga). Fade-ul incepe la 100ms
        // si se termina INAINTE de sosire, ca sa nu mai ajunga vizibila si sa
        // dispara brusc un frame mai tarziu.
        el.style.transition =
          'transform 400ms cubic-bezier(0.4,0,0.2,1), opacity 280ms ease 100ms';
        el.style.transform = collapsed;
        el.style.opacity = '0';
      }
    }
    setFrozenIndex(currentIndex);
    setEntered(false);
    onClose();
    setTimeout(() => { setMounted(false); onCloseComplete?.(); }, 420);
  }, [onClose, onCloseComplete, originRect, collapseTo, currentIndex]);

  const go = useCallback((d: -1 | 1) => {
    const next = currentIndex + d;
    if (next < 0 || next > projects.length - 1) return;
    setFront('after'); // fiecare misiune pornește cu rezultatul în față
    onNavigate(next);
  }, [currentIndex, projects.length, onNavigate]);

  useEffect(() => {
    if (!isOpen) return;
    setMounted(true);
    setFrozenIndex(null);
    setFront('after');
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close, go]);

  // Deschiderea: blocul porneste peste cardul din dosar, la marimea lui, apoi
  // creste pana isi ocupa locul din centrul ecranului. useLayoutEffect ca sa
  // punem starea de start inainte ca browserul sa apuce sa deseneze.
  useLayoutEffect(() => {
    if (!isOpen) { didOpenRef.current = false; return; }
    const el = stageRef.current;
    if (!el || didOpenRef.current) return;
    didOpenRef.current = true;

    if (!originRect || prefersReducedMotion()) {
      el.style.transform = '';
      el.style.opacity = '';
      return;
    }
    const collapsed = collapseOnto(el, originRect);
    if (!collapsed) return;

    el.style.willChange = 'transform';
    el.style.transition = 'none';
    el.style.transform = collapsed;
    el.style.opacity = '0';
    void el.offsetWidth; // fortam reflow, altfel browserul comaseaza cele doua stari
    el.style.transition =
      'transform 620ms cubic-bezier(0.22,1,0.36,1), opacity 280ms ease';
    el.style.transform = 'translate(0px, 0px) scale(1)';
    el.style.opacity = '1';

    // Dupa ce s-a asezat, scoatem transform SI will-change: amandoua creeaza
    // un containing block care ar strica backdrop-filter la butoanele dinauntru.
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    flipTimer.current = window.setTimeout(() => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
    }, 660);

    return () => {
      if (flipTimer.current) window.clearTimeout(flipTimer.current);
    };
  }, [isOpen, mounted, originRect]);

  // Blocarea scroll-ului stă în efect separat, care depinde DOAR de isOpen.
  useEffect(() => {
    if (!isOpen) return;
    return lockBodyScroll();
  }, [isOpen]);

  if (!mounted || !project || typeof document === 'undefined') return null;

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientX;
    movedRef.current = false;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    const dx = e.clientX - dragStart.current;
    if (Math.abs(dx) > 8) movedRef.current = true;
    setDragX(dx);
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    const dx = dragX;
    dragStart.current = null;
    setDragging(false);
    setDragX(0);
    const threshold = (trackRef.current?.clientWidth || 400) * 0.18;
    if (dx < -threshold) go(1);
    else if (dx > threshold) go(-1);
    // click-ul vine imediat după pointerup; resetăm abia după ce a trecut
    setTimeout(() => { movedRef.current = false; }, 0);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={project.title}
      onClick={close}
      style={{
        opacity: entered ? 1 : 0,
        // la inchidere fundalul asteapta: altfel se stinge peste animatia de retragere
        transition: entered
          ? 'opacity 320ms cubic-bezier(0.16,1,0.3,1)'
          : 'opacity 240ms ease 140ms',
      }}
    >
      {/* sticlă albă, nu întuneric: pagina din spate se spală spre alb */}
      <div className="absolute inset-0 bg-white/55 backdrop-blur-[8px] backdrop-saturate-125" />

      <button
        onClick={(e) => { e.stopPropagation(); close(); }}
        aria-label="Închide"
        className="absolute right-4 top-4 z-[210] flex h-11 w-11 items-center justify-center rounded-full border border-graphite/10 bg-white/80 text-graphite shadow-lift backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
      >
        <X size={18} weight="bold" />
      </button>

      {/* Blocul care creste din card. transform-origin ramane centrul: math-ul
          din collapseOnto e calculat fata de centru. */}
      <div
        ref={stageRef}
        className="relative z-10 flex w-full max-w-3xl flex-col items-center"
      >
      {/* CAROUSEL REAL: toate misiunile stau într-o bandă; navigarea mută banda,
          nu schimbă conținutul pe loc. Degetul trage banda în timp real.
          Înălțimea benzii e fixă: de ea depind cutiile pozelor, deci procentele
          din interior au față de ce se calcula. */}
      <div
        ref={trackRef}
        className="mission-track relative w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="flex h-full touch-pan-y"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
            transition: dragging ? 'none' : 'transform 480ms cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          {projects.map((p, i) => {
            const isCurrent = i === index;
            const pair: { key: Shot; url: string | null | undefined; label: string; side: 'left' | 'right' }[] = [
              { key: 'before', url: p.beforeUrl, label: 'Înainte', side: 'left' },
              { key: 'after', url: p.afterUrl, label: 'După', side: 'right' },
            ];
            const available = pair.filter(s => s.url);
            const single = available.length === 1;

            return (
              <div key={p.id} className="flex h-full w-full shrink-0 items-center justify-center px-6 py-6">
                {available.map((shot) => {
                  // Poziția NU se schimbă niciodată: Înainte în stânga, După în dreapta.
                  // Click doar aduce poza în față (mai mare, luminoasă); cealaltă
                  // se retrage în spate, dar rămâne pe locul ei.
                  const isFront = single || (isCurrent && shot.key === front);
                  const left = shot.side === 'left';
                  const ratio = ratios[shot.url as string] ?? 0.75;
                  return (
                    <button
                      key={shot.key}
                      type="button"
                      onClick={() => { if (isCurrent && !movedRef.current) setFront(shot.key); }}
                      aria-label={isFront ? `${shot.label} (în față)` : `Adu în față: ${shot.label}`}
                      className={cn(
                        // .mission-shot isi ia latimea din formatul real al pozei
                        // (--r), deci cutia E poza: hitbox exact, umbra continua,
                        // suprapunere constanta indiferent de format.
                        'mission-shot relative shrink-0 rounded-2xl focus:outline-none',
                        single && 'mission-shot--single',
                        !single && (left ? 'mission-shot--left' : 'mission-shot--right'),
                      )}
                      style={{
                        ['--r' as string]: String(ratio),
                        zIndex: isFront ? 20 : 10,
                        transform: `rotate(${single ? 0 : left ? -3 : 3}deg) scale(${isFront ? 1 : 0.9})`,
                        // fara blur pe poza din spate: doar se retrage, se micsoreaza
                        // si se estompeaza spre albul de dedesubt
                        opacity: isFront ? 1 : 0.55,
                        boxShadow: '0 18px 40px -18px rgba(46,51,59,0.55)',
                        transition:
                          'transform 460ms cubic-bezier(0.34,1.56,0.64,1), opacity 320ms ease',
                      } as React.CSSProperties}
                    >
                      {/* poza umple cutia fix, deci nu se taie si nu se deformeaza */}
                      <img
                        src={full(shot.url as string)}
                        alt={`${shot.label}: ${p.title}`}
                        draggable={false}
                        ref={(el) => noteRatio(shot.url as string, el)}
                        onLoad={(e) => noteRatio(shot.url as string, e.currentTarget)}
                        className="h-full w-full rounded-2xl object-cover"
                      />
                      <span
                        className={cn(
                          'absolute inset-x-0 top-full mt-2 text-center font-heading text-[11px] font-semibold tracking-wide',
                          shot.key === 'after' ? 'text-super-red' : 'text-graphite-soft',
                        )}
                      >
                        {shot.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* titlu + navigare între misiuni */}
      <div
        className="relative mt-6 flex w-full items-center justify-between gap-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          opacity: entered ? 1 : 0,
          transform: entered ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 300ms ease 120ms, transform 300ms ease 120ms',
        }}
      >
        <button
          onClick={() => go(-1)}
          disabled={!hasPrev}
          aria-label="Misiunea anterioară"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-graphite/10 bg-white/80 text-graphite shadow-lift backdrop-blur-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-30"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>

        <div className="min-w-0 text-center">
          <h3 className="truncate font-heading text-lg font-semibold text-graphite">{project.title}</h3>
          <p className="mt-0.5 text-xs text-graphite-soft">
            Misiunea {index + 1} din {projects.length}
          </p>
        </div>

        <button
          onClick={() => go(1)}
          disabled={!hasNext}
          aria-label="Misiunea următoare"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-graphite/10 bg-white/80 text-graphite shadow-lift backdrop-blur-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-30"
        >
          <ArrowRight size={18} weight="bold" />
        </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- dosarul ---------------- */

interface AnimatedFolderProps {
  title: string;
  subtitle?: string;
  projects: FolderProject[];
  className?: string;
}

export function AnimatedFolder({ title, subtitle, projects, className }: AnimatedFolderProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hiddenCardId, setHiddenCardId] = useState<string | null>(null);
  /** dreptunghiul cardului apasat, citit inainte sa fie ascuns */
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* Teaser: la prima intrare in ecran cardurile ies putin, apoi se retrag.
     O singura data. Pe telefon nu exista hover, deci fara asta nimeni n-ar
     ghici ca dosarul se deschide. */
  const [peek, setPeek] = useState(false);
  const folderRef = useRef<HTMLDivElement>(null);
  const teaseDone = useRef(false);
  const teaseTimer = useRef<number | null>(null);
  /** fata dosarului: acolo se strange vizualizatorul la inchidere */
  const bodyRef = useRef<HTMLDivElement>(null);

  const collapseTo = useCallback(
    () => bodyRef.current?.getBoundingClientRect() ?? null,
    [],
  );

  const stopTease = useCallback(() => {
    teaseDone.current = true;
    if (teaseTimer.current) { window.clearTimeout(teaseTimer.current); teaseTimer.current = null; }
    setPeek(false);
  }, []);

  useEffect(() => {
    const el = folderRef.current;
    if (!el || teaseDone.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || teaseDone.current) return;
        teaseDone.current = true;
        io.disconnect();
        setPeek(true);
        teaseTimer.current = window.setTimeout(() => setPeek(false), 900);
      },
      /* Se pornea la `threshold: 0.5` — adica in clipa in care jumatate din dosar
         intra in ecran, deci de multe ori cat inca era jos, la marginea de sus a
         privirii, in timp ce omul citea prima parte a profilului. Pana ajungea cu
         ochii acolo, pozele isi terminasera deja iesirea si dosarul arata ca
         oricare altul: semnalul ca se poate deschide se pierdea complet.

         `rootMargin` negativ sus si jos strange zona de declansare la banda din
         mijlocul ecranului: se aprinde abia cand dosarul ajunge sub ochi. */
      { threshold: 0, rootMargin: '-42% 0px -42% 0px' },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (teaseTimer.current) window.clearTimeout(teaseTimer.current);
    };
  }, []);

  // dosarul afișează maxim 3 carduri (limită vizuală), dar vizualizatorul
  // navighează prin TOATE misiunile
  const visible = projects.slice(0, 3);

  return (
    <>
      <div
        className={cn(
          'relative flex cursor-pointer flex-col items-center justify-center',
          'transition-all duration-500 ease-out',
          className,
        )}
        style={{ perspective: '1000px' }}
        ref={folderRef}
        onMouseEnter={() => { stopTease(); setIsHovered(true); }}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => { stopTease(); setIsHovered(true); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsHovered(false); }}
        onClick={() => { stopTease(); setIsHovered(true); }}
      >
        <div className="relative flex items-center justify-center" style={{ height: '150px', width: '200px' }}>
          <div
            className="absolute h-24 w-32 rounded-lg shadow-md"
            style={{
              background: 'linear-gradient(160deg, #4A515D, #363C46)',
              transformOrigin: 'bottom center',
              transform: isHovered ? 'rotateX(-15deg)' : 'rotateX(0deg)',
              transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              zIndex: 10,
            }}
          />
          <div
            className="absolute h-4 w-12 rounded-t-md"
            style={{
              background: '#3A404B',
              top: 'calc(50% - 48px - 12px)',
              left: 'calc(50% - 64px + 16px)',
              transformOrigin: 'bottom center',
              transform: isHovered ? 'rotateX(-25deg) translateY(-2px)' : 'rotateX(0deg)',
              transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              zIndex: 10,
            }}
          />

          <div className="absolute" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20 }}>
            {visible.map((project, index) => (
              <ProjectCard
                key={project.id}
                ref={(el) => { cardRefs.current[index] = el; }}
                image={project.image}
                title={project.title}
                delay={index * 80}
                isVisible={isHovered}
                peek={peek}
                index={index}
                onClick={() => {
                  // citit ACUM, cat cardul e inca la locul lui pe ecran
                  setOriginRect(cardRefs.current[index]?.getBoundingClientRect() ?? null);
                  setSelectedIndex(index);
                  setHiddenCardId(project.id);
                }}
                isSelected={hiddenCardId === project.id}
              />
            ))}
          </div>

          {/* fața dosarului — eticheta e scrisă direct pe ea, nu sub card */}
          <div
            ref={bodyRef}
            className="absolute flex h-24 w-32 flex-col items-center justify-center rounded-lg px-2 text-center shadow-lg"
            style={{
              // sticla rosie, nu vopsea plina: prin ea se ghicesc misiunile din spate
              background: 'linear-gradient(160deg, rgba(232,71,86,0.66), rgba(196,35,53,0.78))',
              backdropFilter: 'blur(5px) saturate(1.25)',
              WebkitBackdropFilter: 'blur(5px) saturate(1.25)',
              border: '1px solid rgba(255,255,255,0.34)',
              top: 'calc(50% - 48px + 4px)',
              transformOrigin: 'bottom center',
              transform: isHovered ? 'rotateX(25deg) translateY(8px)' : 'rotateX(0deg)',
              transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              zIndex: 30,
            }}
          >
            <span
              className="font-heading text-[13px] font-bold leading-tight text-white"
              style={{ textShadow: '0 1px 3px rgba(120,10,20,0.55)' }}
            >
              {title}
            </span>
            <span
              className="mt-1 text-[10px] font-semibold text-white/90"
              style={{ textShadow: '0 1px 3px rgba(120,10,20,0.5)' }}
            >
              {subtitle ?? `${projects.length} ${projects.length === 1 ? 'lucrare' : 'lucrări'}`}
            </span>
          </div>
          <div
            className="pointer-events-none absolute h-24 w-32 overflow-hidden rounded-lg"
            style={{
              top: 'calc(50% - 48px + 4px)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 50%)',
              transformOrigin: 'bottom center',
              transform: isHovered ? 'rotateX(25deg) translateY(8px)' : 'rotateX(0deg)',
              transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              zIndex: 31,
            }}
          />
        </div>

        {/* un singur indiciu, sub dosar — dispare când s-a deschis */}
        <p
          className="mt-1 text-xs text-graphite-soft transition-all duration-300"
          style={{ opacity: isHovered ? 0 : 0.75 }}
        >
          Treci cu mouse-ul ca să deschizi
        </p>
      </div>

      <MissionViewer
        projects={projects}
        currentIndex={selectedIndex ?? 0}
        isOpen={selectedIndex !== null}
        onClose={() => setSelectedIndex(null)}
        onNavigate={(i) => { setSelectedIndex(i); setHiddenCardId(projects[i]?.id || null); }}
        originRect={originRect}
        collapseTo={collapseTo}
        onCloseComplete={() => setHiddenCardId(null)}
      />
    </>
  );
}
