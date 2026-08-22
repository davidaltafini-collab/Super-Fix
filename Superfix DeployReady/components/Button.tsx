import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import GlassSurface from './GlassSurface';

/* ============================================================
   GlassButton — buton liquid glass (GlassSurface + tenta de brand).
   Sticla reala (filtru SVG cu refractie), nu blur CSS aproximativ.
   Press feedback scale(0.97) — instant, tactil.
   ============================================================ */
type GlassTone = 'red' | 'neutral' | 'dark';

const TONES: Record<GlassTone, { tint: string; text: string; ring: string }> = {
  red: { tint: 'rgba(225,55,70,0.72)', text: '#FFFFFF', ring: 'rgba(225,55,70,0.35)' },
  neutral: { tint: 'rgba(255,255,255,0.55)', text: '#2E333B', ring: 'rgba(97,99,104,0.25)' },
  dark: { tint: 'rgba(46,51,59,0.78)', text: '#FFFFFF', ring: 'rgba(46,51,59,0.35)' },
};

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: GlassTone;
  full?: boolean;
  children: React.ReactNode;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  tone = 'neutral',
  full = false,
  children,
  className = '',
  style,
  disabled,
  ...rest
}) => {
  const t = TONES[tone];
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{ color: t.text, boxShadow: `0 14px 30px -14px ${t.ring}`, ...style }}
      className={`group relative isolate inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3
        font-heading font-semibold transition-all duration-200 ease-out
        hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]
        disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0
        ${full ? 'w-full' : ''} ${className}`}
    >
      <GlassSurface
        className="pointer-events-none absolute inset-0 -z-10"
        width="100%"
        height="100%"
        borderRadius={999}
        backgroundOpacity={0.6}
        saturation={1.7}
        blur={12}
        displace={0.4}
        distortionScale={-70}
        redOffset={2}
        greenOffset={4}
        blueOffset={8}
        brightness={58}
        style={{ backgroundColor: t.tint, ['--glass-blur' as string]: '7px' }}
      />
      {children}
    </button>
  );
};

/* ============================================================
   GlassLink — același buton, dar care duce undeva.

   Un `<button>` pus înăuntrul unui `<a>` e HTML nevalid: conținut interactiv
   într-un alt conținut interactiv. Browserele îl desenează, dar cititoarele de
   ecran anunță două comenzi acolo unde e una singură, iar tastatura se oprește
   de două ori. Aici e un singur element, cu aceeași înfățișare.
   ============================================================ */
type GlassLinkProps = {
  tone?: GlassTone;
  full?: boolean;
  children: React.ReactNode;
  className?: string;
} & ({ to: string; href?: undefined } | { href: string; to?: undefined });

export const GlassLink: React.FC<GlassLinkProps> = ({
  tone = 'neutral', full = false, children, className = '', ...rest
}) => {
  const t = TONES[tone];
  const shared = {
    style: { color: t.text, boxShadow: `0 14px 30px -14px ${t.ring}` },
    className: `group relative isolate inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3
      font-heading font-semibold transition-all duration-200 ease-out
      hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]
      ${full ? 'w-full' : ''} ${className}`,
  };
  const inside = (
    <>
      <GlassSurface
        className="pointer-events-none absolute inset-0 -z-10"
        width="100%"
        height="100%"
        borderRadius={999}
        backgroundOpacity={0.6}
        saturation={1.7}
        blur={12}
        displace={0.4}
        distortionScale={-70}
        redOffset={2}
        greenOffset={4}
        blueOffset={8}
        brightness={58}
        style={{ backgroundColor: t.tint, ['--glass-blur' as string]: '7px' }}
      />
      {children}
    </>
  );

  return 'to' in rest && rest.to
    ? <Link to={rest.to} {...shared}>{inside}</Link>
    : <a href={(rest as { href: string }).href} {...shared}>{inside}</a>;
};

/* ============================================================
   Pill3D — buton CTA principal, chunky 3D pill (ref. poza David).
   Strat de bază mai închis + față mai deschisă = relief/bevel.
   Rotire = 0 intenționat ("stay straighter" — drept pe orizontală).
   ============================================================ */
type Pill3DProps = {
  children: React.ReactNode;
  className?: string;
} & ({ to: string } & Omit<LinkProps, 'to' | 'className'> | { href: string; to?: undefined });

export const Pill3D: React.FC<Pill3DProps> = ({ children, className = '', ...rest }) => {
  const face =
    'relative flex items-center justify-center gap-2 rounded-full bg-super-red text-white font-heading font-semibold text-lg px-8 py-4 ' +
    'transition-transform duration-150 ease-out-expo -translate-y-1.5 group-hover:-translate-y-2 group-active:translate-y-0';

  const inner = (
    <span className="group relative inline-block rounded-full">
      {/* stratul de bază (mai închis) = adâncimea 3D */}
      <span className="absolute inset-0 rounded-full bg-super-red-dark" aria-hidden="true" />
      <span className={`${face} ${className}`}>{children}</span>
    </span>
  );

  if ('to' in rest && rest.to) {
    const { to, ...linkRest } = rest as { to: string } & Omit<LinkProps, 'to' | 'className'>;
    return (
      <Link to={to} className="inline-block" {...linkRest}>
        {inner}
      </Link>
    );
  }
  const { href } = rest as { href: string };
  return (
    <a href={href} className="inline-block">
      {inner}
    </a>
  );
};

/* ============================================================
   NeuButton — neumorphism (cod David, buttoncode), adaptat la brand.
   Pill (rounded-full), umbră soft dublă, hover -> inset + accent.
   `tone` alege paleta: light (cloud/graphite, original) sau red
   (super-red/alb) — același design neumorphic, doar recolorat.
   ============================================================ */
type NeuTone = 'light' | 'red';

const NEU_TONES: Record<NeuTone, { base: string; text: string; shadow: string; hover: string }> = {
  light: {
    base: 'bg-cloud',
    text: 'text-graphite hover:text-super-red',
    shadow: 'shadow-[-5px_-5px_10px_rgba(255,255,255,0.9),5px_5px_10px_rgba(46,51,59,0.22)]',
    hover: 'hover:shadow-[-1px_-1px_5px_rgba(255,255,255,0.7),1px_1px_5px_rgba(46,51,59,0.25),inset_-2px_-2px_5px_rgba(255,255,255,0.9),inset_2px_2px_4px_rgba(46,51,59,0.2)]',
  },
  red: {
    base: 'bg-super-red',
    text: 'text-white hover:text-white',
    shadow: 'shadow-[-5px_-5px_10px_rgba(255,110,120,0.5),5px_5px_10px_rgba(120,15,25,0.45)]',
    hover: 'hover:shadow-[-1px_-1px_5px_rgba(255,110,120,0.4),1px_1px_5px_rgba(120,15,25,0.5),inset_-2px_-2px_5px_rgba(255,140,150,0.5),inset_2px_2px_4px_rgba(120,15,25,0.45)]',
  },
};

type NeuButtonProps = {
  tone?: NeuTone;
  children: React.ReactNode;
  className?: string;
} & ({ href: string; to?: undefined } | { to: string; href?: undefined });

export const NeuButton: React.FC<NeuButtonProps> = ({ tone = 'light', children, className = '', ...rest }) => {
  const t = NEU_TONES[tone];
  const classes = `inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full
    font-heading font-semibold text-lg ${t.text} ${t.base}
    ${t.shadow} transition-all duration-200 ${t.hover} ${className}`;

  if ('to' in rest && rest.to) {
    return <Link to={rest.to} className={classes}>{children}</Link>;
  }
  return (
    <a href={(rest as { href: string }).href} className={classes}>
      {children}
    </a>
  );
};
