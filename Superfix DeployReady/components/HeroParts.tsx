import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Certificate, Files, MapPin, Receipt, ShieldCheck, Toolbox, UsersThree, MoonStars } from '@phosphor-icons/react';

import { Lightbox } from './Lightbox';
import { RomaniaMap } from './RomaniaMap';
import { Skel } from './Loader';
import { thumb, full } from '../lib/img';
import { getCountyName, COUNTIES } from '../lib/counties';
import { formatKm, kmText, rateText, zoneCircle, type PublicZone } from '../lib/place';
import { answersFromLabel } from '../lib/signal';
import type { VerifiedStats } from '../services/dataService';
import type { Hero, HeroPapers } from '../types';

import './hero-parts.css';

const ZoneMap = lazy(() => import('./Map').then(m => ({ default: m.ZoneMap })));

/* ============================================================
   Piesele paginii eroului, ca în aplicație
   (`SuperfixApp/src/components/profile/*`): aceleași panouri, în aceeași
   ordine, cu aceleași cuvinte și aceleași cifre. Aspectul rămâne al sitului.
   ============================================================ */

/* ---------------- textul scris de om, nu de server ---------------- */

/** Ce pune serverul la contul făcut prin invitație: nu e scris de om, deci nu apare. */
export const ownDescription = (text?: string | null) => (text && text.trim() !== 'Profil în curs de completare.' ? text : '');
/** Ce punea serverul la aprobare: nu e o superputere de arătat. */
export const ownPowers = (text?: string | null) => (text && text.trim() !== 'Experiență verificată' ? text : '');

/** Sculele vechi (doar poza) și cele noi (nume + poză), în aceeași formă. */
export const arsenalList = (items: Hero['arsenal']) =>
  (items ?? [])
    .map(item => (typeof item === 'string' ? { name: '', photoUrl: item } : { name: item?.name ?? '', photoUrl: item?.photoUrl ?? null }))
    .filter(item => item.name.trim() || item.photoUrl);

/* ---------------- secțiunea: numele deasupra chenarului ---------------- */

/**
 * O secțiune a profilului: numele (și rândul de sub el) stă DEASUPRA chenarului, ca la „Jurnal de
 * recenzii” (David, 31.10: „toate numele secțiunii în afară”). `panel={false}`: conținutul își are
 * singur chenarele.
 */
export const ProfileSection: React.FC<{
  title: string;
  icon: React.ElementType;
  weight?: 'duotone' | 'fill' | 'bold';
  iconClass?: string;
  sub?: string;
  action?: React.ReactNode;
  panel?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ title, icon: Icon, weight = 'duotone', iconClass = 'text-super-red', sub, action, panel = true, className, children }) => (
  <section className={className}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-heading text-xl font-medium text-graphite md:text-2xl">
          <Icon size={22} weight={weight} className={iconClass} aria-hidden="true" />
          {title}
        </h2>
        {sub && <p className="mt-1 text-sm text-graphite-soft">{sub}</p>}
      </div>
      {action}
    </div>
    {panel ? <div className="sf-glass rounded-[28px] p-6 md:p-7">{children}</div> : children}
  </section>
);

/* ---------------- semnalul ---------------- */

/** „La datorie acum”, sau „Răspunde mâine de la 07:00” cât e în pauză. */
export const SignalChip: React.FC<{ offUntil?: string | null; className?: string }> = ({ offUntil, className }) => {
  const label = answersFromLabel(offUntil);
  return (
    <span className={`hp-signal ${label ? 'hp-signal--off' : ''} ${className || ''}`}>
      {label ? <MoonStars size={14} weight="fill" aria-hidden="true" /> : <span className="hp-signal__dot" aria-hidden="true" />}
      {label ?? 'La datorie acum'}
    </span>
  );
};

/* ---------------- Fix-o-metrul ---------------- */

const START = 150;
const SWEEP = 240;
const STOPS: [number, [number, number, number]][] = [
  [0, [225, 55, 69]], [45, [240, 122, 42]], [65, [238, 181, 44]], [80, [122, 184, 64]], [92, [31, 164, 99]],
];

/** Culoarea scorului, ca în aplicație: roșu jos, portocaliu, galben, verde sus. */
function trustColor(value: number) {
  const v = Math.min(100, Math.max(0, value));
  let i = 0;
  while (i < STOPS.length - 1 && v > STOPS[i + 1][0]) i++;
  const [from, a] = STOPS[i];
  const [to, b] = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const t = to === from ? 1 : Math.min(1, (v - from) / (to - from));
  return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * t)).join(',')})`;
}

const G = { width: 196, height: 136, cx: 98, cy: 90, r: 72, stroke: 13, tip: 9, tipStroke: 3.5, digits: 38 };
const at = (deg: number, r = G.r) => {
  const a = (deg * Math.PI) / 180;
  return { x: G.cx + r * Math.cos(a), y: G.cy + r * Math.sin(a) };
};

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Vitezometrul: arcul se umple până la scor când omul îl vede, iar cifra urcă odată cu el. */
const TrustGauge: React.FC<{ value: number }> = ({ value }) => {
  const ref = useRef<SVGSVGElement>(null);
  const target = Math.min(100, Math.max(0, value)) / 100;
  const [progress, setProgress] = useState(() => (reduced() ? target : 0));

  useEffect(() => {
    if (reduced()) { setProgress(target); return; }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setProgress(target); return; }
    let raf = 0;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 950);
        setProgress(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { rootMargin: '0px 0px -12% 0px' });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, [target]);

  const from = at(START);
  const to = at(START + SWEEP);
  const arc = `M ${from.x} ${from.y} A ${G.r} ${G.r} 0 1 1 ${to.x} ${to.y}`;
  const length = (G.r * SWEEP * Math.PI) / 180;
  const color = trustColor(value);
  const tip = at(START + SWEEP * progress);

  return (
    <svg ref={ref} width={G.width} height={G.height} viewBox={`0 0 ${G.width} ${G.height}`} role="img" aria-label={`Fix-o-metru: ${Math.round(value)} din 100`}>
      {Array.from({ length: 11 }, (_, i) => {
        const angle = START + (SWEEP * i) / 10;
        const a = at(angle, G.r + G.stroke / 2 + 3);
        const b = at(angle, G.r + G.stroke / 2 + (i % 5 === 0 ? 8 : 5));
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#B3BAC4" strokeWidth={1.3} strokeLinecap="round" />;
      })}
      <path d={arc} stroke="rgba(46,51,59,0.12)" strokeWidth={G.stroke} strokeLinecap="round" fill="none" />
      {progress > 0.005 && (
        <>
          <path d={arc} stroke={color} strokeWidth={G.stroke} strokeLinecap="round" fill="none" strokeDasharray={`${length * progress} ${length}`} />
          <circle cx={tip.x} cy={tip.y} r={G.tip} fill="#fff" stroke={color} strokeWidth={G.tipStroke} />
        </>
      )}
      <text x={G.cx} y={G.cy + G.digits * 0.35} textAnchor="middle" className="hp-gauge__digits" fontSize={G.digits}>
        {Math.round(progress * 100)}
      </text>
    </svg>
  );
};

/** „25 min”, „3 h”, „2 zile”: cât durează de obicei până acceptă. */
function responseLabel(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / (24 * 60));
  return days === 1 ? '1 zi' : `${days} zile`;
}

/**
 * Fix-o-metrul și, sub el, „Verificat de Superfix”: cifre din lucrările reale. Doar cifrele care
 * există (fără „–”, fără „0 lucrări”); fără niciuna, rămâne doar cadranul.
 */
export const VerifiedMeter: React.FC<{ trust: number; stats: VerifiedStats | null }> = ({ trust, stats }) => {
  const cells = stats
    ? [
        stats.missionsCompleted > 0
          ? { value: String(stats.missionsCompleted), label: stats.missionsCompleted === 1 ? 'lucrare finalizată' : 'lucrări finalizate' }
          : null,
        stats.hoursPerDay != null && stats.hoursPerDay > 0
          ? { value: `${stats.hoursPerDay.toFixed(1).replace('.', ',').replace(',0', '')} h`, label: 'pe zi la lucru' }
          : null,
        stats.responseMinutes != null ? { value: responseLabel(stats.responseMinutes), label: 'timp de răspuns' } : null,
      ].filter((cell): cell is { value: string; label: string } => !!cell)
    : [];
  return (
    <div className="sf-glass hp-meter rounded-[28px]">
      <TrustGauge value={stats?.trustFactor ?? trust} />
      <div className="hp-meter__label">Fix-o-metru</div>
      {cells.length > 0 && (
        <>
          <div className="hp-meter__rule" />
          <div className="hp-meter__kicker">Verificat de Superfix</div>
          <div className="hp-meter__cells">
            {cells.map(cell => (
              <div key={cell.label}>
                <div className="hp-meter__value">{cell.value}</div>
                <div className="hp-meter__cell-label">{cell.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ---------------- echipa ---------------- */

/** „X lucrează în echipa…”: omul trimite la echipa lui. */
export const TeamLink: React.FC<{ team: NonNullable<Hero['memberOf']>; alias: string }> = ({ team, alias }) => (
  <div className="sf-glass hp-team rounded-[24px]">
    <span className="hp-team__photo">
      {team.avatarUrl ? <img src={thumb(team.avatarUrl, 140, { square: true })} alt="" /> : <UsersThree size={26} weight="duotone" aria-hidden="true" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="hp-team__kicker">{team.role === 'OWNER' ? `${alias} conduce echipa` : `${alias} lucrează în echipa`}</span>
      <span className="hp-team__name">{team.name}</span>
    </span>
  </div>
);

/* ---------------- cu ce lucrează ---------------- */

/**
 * „Cu ce lucrează”: sculele, cu poza și numele lor. Un raft de înălțime fixă (o poză mare și două
 * mici, „+N” pe ultima); atinse, se răsfoiesc mari. Sculele fără poză stau dedesubt, ca nume.
 */
export const GearPanel: React.FC<{ items: Hero['arsenal']; alias: string }> = ({ items, alias }) => {
  const gear = arsenalList(items);
  const [shot, setShot] = useState<{ index: number; origin: DOMRect | null } | null>(null);
  const [allNames, setAllNames] = useState(false);
  if (!gear.length) return null;
  const photos = gear.filter(item => item.photoUrl) as { name: string; photoUrl: string }[];
  const names = gear.filter(item => !item.photoUrl && item.name.trim()).map(item => item.name.trim());
  const shownNames = allNames ? names : names.slice(0, 8);
  const shown = photos.slice(0, 3);
  const extra = photos.length - shown.length;

  return (
    <ProfileSection title="Cu ce lucrează" icon={Toolbox} sub={`Sculele cu care vine ${alias} la tine.`}>
      {shown.length > 0 && (
        <div className="hp-gear" data-count={shown.length}>
          {shown.map((item, i) => (
            <button
              key={item.photoUrl + i}
              type="button"
              className="hp-gear__shot"
              onClick={e => setShot({ index: i === 2 && extra > 0 ? 2 : i, origin: e.currentTarget.getBoundingClientRect() })}
              aria-label={i === 2 && extra > 0 ? `Vezi toate sculele: încă ${extra}` : `Vezi poza: ${item.name || 'unealta'}`}
            >
              <img src={thumb(item.photoUrl, i === 0 ? 900 : 420)} alt="" loading="lazy" decoding="async" />
              {i === 2 && extra > 0 ? (
                <span className="hp-gear__more"><strong>+{extra}</strong>{extra === 1 ? 'încă una' : 'încă'}</span>
              ) : item.name.trim() ? (
                <span className="hp-gear__caption">{item.name}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {names.length > 0 && (
        <ul className={`hp-gear__names ${shown.length ? 'mt-4' : ''}`}>
          {shownNames.map(name => <li key={name}>{name}</li>)}
          {names.length > shownNames.length && (
            <li><button type="button" onClick={() => setAllNames(true)}>+{names.length - shownNames.length}</button></li>
          )}
        </ul>
      )}
      <Lightbox open={!!shot} onClose={() => setShot(null)} originRect={shot?.origin ?? null} label={`Cu ce lucrează ${alias}`}>
        {shot && (
          <div className="hp-gear__stage">
            <img src={full(photos[shot.index].photoUrl)} alt={photos[shot.index].name || 'Cu ce lucrează'} />
            {photos.length > 1 && (
              <div className="hp-gear__pager">
                {photos.map((item, i) => (
                  <button key={item.photoUrl + i} type="button" data-on={i === shot.index} onClick={e => { e.stopPropagation(); setShot(s => (s ? { ...s, index: i } : s)); }} aria-label={`Poza ${i + 1}`} />
                ))}
              </div>
            )}
            {photos[shot.index].name && <p className="hp-gear__title">{photos[shot.index].name}</p>}
          </div>
        )}
      </Lightbox>
    </ProfileSection>
  );
};

/* ---------------- acte ---------------- */

const INVOICE_LABEL: Record<string, string> = { COMPANY: 'Factură de firmă', PFA: 'Factură de PFA', NONE: 'Fără factură' };
const AUTH_LABEL: Record<string, string> = {
  ANRE: 'ANRE', ISCIR: 'ISCIR', GAZE: 'ANRE gaze', FGAZ: 'F-gaz', RAR: 'RAR', CALIFICARE: 'Calificare', INALTIME: 'Lucru la înălțime', ALTELE: 'Altă autorizație',
};
const AUTH_LONG: Record<string, string> = {
  ANRE: 'Autorizație ANRE (electrician)', ISCIR: 'Autorizație ISCIR', GAZE: 'Autorizație ANRE pentru gaze', FGAZ: 'Certificat F-gaz (aer condiționat)',
  RAR: 'Autorizație RAR (service auto)', CALIFICARE: 'Certificat de calificare', INALTIME: 'Lucru la înălțime', ALTELE: 'Altă autorizație',
};
const warrantyLabel = (months: number) =>
  months % 12 === 0 ? `Garanție ${months / 12 === 1 ? '1 an' : `${months / 12} ani`}` : `Garanție ${months === 1 ? '1 lună' : `${months} luni`}`;

type PaperCard = { key: string; kind: 'invoice' | 'warranty' | 'auth'; title: string; sub: string | null; long: string; url: string | null };

/** Actele, ca în aplicație (`paperCards`): factura, garanția, autorizațiile. */
function paperCards(papers: HeroPapers | null | undefined): PaperCard[] {
  if (!papers) return [];
  const photos = papers.photos ?? {};
  const cards: PaperCard[] = [];
  if (papers.invoice) {
    cards.push({
      key: 'invoice', kind: 'invoice',
      title: papers.invoice === 'NONE' ? 'Fără factură' : 'Factură',
      sub: papers.invoice === 'COMPANY' ? 'De firmă' : papers.invoice === 'PFA' ? 'De PFA' : null,
      long: INVOICE_LABEL[papers.invoice] ?? 'Factură',
      url: papers.invoice === 'NONE' ? null : photos.invoice ?? null,
    });
  }
  if (papers.warrantyMonths) {
    const label = warrantyLabel(papers.warrantyMonths);
    cards.push({ key: 'warranty', kind: 'warranty', title: 'Garanție', sub: label.replace('Garanție ', ''), long: label, url: photos.warranty ?? null });
  } else if (papers.warrantyMonths === 0) {
    cards.push({ key: 'warranty', kind: 'warranty', title: 'Fără garanție', sub: null, long: 'Nu dau garanție scrisă pentru lucrare.', url: null });
  }
  for (const auth of papers.authorizations ?? []) {
    const other = auth === 'ALTELE' && papers.authOther?.trim() ? papers.authOther.trim() : null;
    cards.push({
      key: `auth-${auth}`, kind: 'auth',
      title: other ?? AUTH_LABEL[auth] ?? auth,
      sub: null,
      long: other ?? AUTH_LONG[auth] ?? auth,
      url: photos.auth?.[auth]?.url ?? null,
    });
  }
  return cards;
}

const KIND_ICON = { invoice: Receipt, warranty: ShieldCheck, auth: Certificate };

/** „Acte”: fiecare act e o miniatură pe care o atingi, ca o hârtie; fără poză, o plăcuță cu iconița. */
export const PapersPanel: React.FC<{ papers: HeroPapers | null | undefined; alias: string }> = ({ papers, alias }) => {
  const [open, setOpen] = useState<{ card: PaperCard; origin: DOMRect } | null>(null);
  const cards = paperCards(papers);
  const note = papers?.note?.trim();
  if (!cards.length && !note) return null;
  return (
    <ProfileSection title="Acte" icon={Files} sub={`Declarate de ${alias}.`}>
      {cards.length > 0 && (
        <div className="hp-papers">
          {cards.map(card => {
            const Glyph = KIND_ICON[card.kind];
            const body = (
              <>
                {card.url ? (
                  <span className="hp-paper__thumb"><img src={thumb(card.url, 360)} alt="" loading="lazy" decoding="async" /></span>
                ) : (
                  <span className="hp-paper__blank"><span><Glyph size={22} weight="duotone" aria-hidden="true" /></span></span>
                )}
                <span className="hp-paper__title">{card.title}</span>
                {card.sub && <span className="hp-paper__sub">{card.sub}</span>}
              </>
            );
            return card.url ? (
              <button key={card.key} type="button" className="hp-paper" onClick={e => setOpen({ card, origin: e.currentTarget.getBoundingClientRect() })} aria-label={`Deschide ${card.long}`}>
                {body}
              </button>
            ) : (
              <div key={card.key} className="hp-paper" aria-label={card.long}>{body}</div>
            );
          })}
        </div>
      )}
      {note && <p className={`hp-papers__note ${cards.length ? 'mt-5' : ''}`}>„{note}”</p>}
      <Lightbox open={!!open} onClose={() => setOpen(null)} originRect={open?.origin ?? null} label={open?.card.long ?? 'Act'}>
        {open?.card.url && (
          <div className="hp-gear__stage">
            <img src={full(open.card.url)} alt={open.card.long} />
            <p className="hp-gear__title">{open.card.long}<br /><small>Declarat de {alias}</small></p>
          </div>
        )}
      </Lightbox>
    </ProfileSection>
  );
};

/* ---------------- arie de acoperire ---------------- */

/**
 * „Arie de acoperire”: zona REALĂ pe hartă — cercul, nu județele colorate. Sub hartă un rând: cât de
 * departe merge și județele atinse; cu inelul portocaliu, legenda celor două culori. „Toată România”
 * = harta țării plină. Profil fără zonă (vechi): harta județelor, ca până acum.
 */
export const CoveragePanel: React.FC<{ zone: PublicZone | null; areas: string[] }> = ({ zone, areas }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [zone]);

  if (!zone && !areas.length) return null;
  const names = areas.map(getCountyName).filter(Boolean);
  const counties = names.length > 4 ? `${names.slice(0, 3).join(', ')} și încă ${names.length - 3}` : names.join(', ');
  const circle = zoneCircle(zone);
  const ring = circle?.travelKm && circle.travelRatePerKm ? { km: circle.travelKm, rate: circle.travelRatePerKm } : null;
  const caption = zone?.nationwide
    ? 'Oriunde în țară'
    : circle
      ? `Până la ${formatKm(circle.radiusKm)} de sediu${counties ? ` · ${counties}` : ''}`
      : counties;
  const ringCaption = ring ? `Încă ${kmText(Math.round(ring.km))}, cu ${rateText(ring.rate)} de drum` : '';

  return (
    <ProfileSection title="Arie de acoperire" icon={MapPin} iconClass="text-spark">
      {circle ? (
        <div ref={mapRef}>
          {near ? (
            <Suspense fallback={<Skel className="block h-[196px] w-full rounded-[20px]" />}>
              <ZoneMap lat={circle.lat} lng={circle.lng} radiusKm={circle.radiusKm} travelKm={ring?.km} label={`Zona de lucru: ${caption}${ringCaption ? `. ${ringCaption}` : ''}`} />
            </Suspense>
          ) : (
            <Skel className="block h-[196px] w-full rounded-[20px]" />
          )}
        </div>
      ) : (
        <div className="pointer-events-none mx-auto w-full max-w-md rounded-[20px] bg-white/50 p-3">
          <RomaniaMap value={zone?.nationwide ? COUNTIES.map(c => c.code) : areas} />
        </div>
      )}
      {ring ? (
        <div className="hp-legend">
          <p><span className="hp-legend__dot hp-legend__dot--green" />{caption}</p>
          <p><span className="hp-legend__dot hp-legend__dot--orange" />{ringCaption}</p>
        </div>
      ) : caption ? (
        <p className="hp-coverage__caption">{caption}</p>
      ) : null}
    </ProfileSection>
  );
};
