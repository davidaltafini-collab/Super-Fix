import React from 'react';
import { Link } from 'react-router-dom';
import NTPLogo from 'ntp-logo-react';
import { LEGAL, legalIdentityParts } from '../config/legal';
import {
  House, MagnifyingGlass, UserPlus, Handshake, IdentificationBadge,
  FileText, ShieldCheck, Cookie, Scales, EnvelopeSimple, Heart,
} from '@phosphor-icons/react';

const navLinks = [
  { to: '/', label: 'Acasă', Icon: House },
  { to: '/heroes', label: 'Găsește erou', Icon: MagnifyingGlass },
  { to: '/register', label: 'Devino erou', Icon: UserPlus },
  { to: '/recruiter', label: 'Program recruiteri', Icon: Handshake },
  { to: '/portal', label: 'Portal eroi', Icon: IdentificationBadge },
];

const legalLinks = [
  { to: '/terms', label: 'Termeni și condiții', Icon: FileText },
  { to: '/terms#livrarea-serviciului', label: 'Livrarea serviciului', Icon: FileText },
  { to: '/terms#anularea-abonamentului', label: 'Anularea abonamentului', Icon: FileText },
  { to: '/withdrawal', label: 'Retragere din contract', Icon: Scales },
  { to: '/privacy', label: 'Confidențialitate', Icon: ShieldCheck },
  { to: '/cookies', label: 'Politica de cookies', Icon: Cookie },
  { to: '/gdpr', label: 'GDPR, drepturile tale', Icon: ShieldCheck },
];

const colHeading = 'font-heading text-sm tracking-wide text-white/50 mb-5';
const linkRow =
  'group flex items-center gap-2.5 text-white/75 hover:text-white transition-colors duration-200';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="site-footer" style={{ backgroundColor: '#2E333B' }} className="relative scroll-mt-6 overflow-hidden text-white mt-auto pt-16 pb-8">
      <div className="absolute -top-24 -left-16 w-72 h-72 rounded-full bg-spark/10 blur-3xl pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-6xl mx-auto px-5 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-14">

          {/* 1. BRAND */}
          <div className="flex flex-col gap-4">
            <img src="/logo.svg" alt="Superfix" className="h-11 w-auto" />
            <p className="text-white/65 leading-relaxed">
              Conectăm eroi locali cu probleme casnice urgente. Simplu, rapid și de încredere.
            </p>
            <div className="text-xs text-white/45 bg-white/5 rounded-2xl p-4 space-y-1">
              <p className="font-heading text-white/70 tracking-wide">{LEGAL.name}</p>
              {legalIdentityParts.map((part) => <p key={part}>{part}</p>)}
            </div>
          </div>

          {/* 2. NAVIGARE */}
          <div>
            <h3 className={colHeading}>NAVIGARE</h3>
            <ul className="space-y-3.5">
              {navLinks.map(({ to, label, Icon }) => (
                <li key={to}>
                  <Link to={to} className={linkRow}>
                    <Icon size={17} weight="bold" className="text-spark shrink-0" aria-hidden="true" />
                    <span className="group-hover:translate-x-0.5 transition-transform duration-200">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 3. LEGAL & SUPORT */}
          <div>
            <h3 className={colHeading}>INFORMAȚII LEGALE</h3>
            <ul className="space-y-3.5">
              {legalLinks.map(({ to, label, Icon }) => (
                <li key={to}>
                  <Link to={to} className={linkRow}>
                    <Icon size={17} weight="bold" className="text-spark shrink-0" aria-hidden="true" />
                    <span className="group-hover:translate-x-0.5 transition-transform duration-200">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${LEGAL.supportEmail}`}
              className="mt-6 inline-flex items-center gap-2 bg-white/8 hover:bg-white/14 rounded-full px-4 py-2.5 text-sm font-heading text-white transition-colors duration-200"
            >
              <EnvelopeSimple size={16} weight="bold" className="text-super-red" aria-hidden="true" />
              {LEGAL.supportEmail}
            </a>
          </div>

          {/* 4. SOLUȚIONARE LITIGII */}
          <div>
            <h3 className={colHeading}>SOLUȚIONARE LITIGII</h3>
            <a
              href="https://reclamatiisal.anpc.ro/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Depune o cerere SAL la ANPC (se deschide într-o filă nouă)"
              className="inline-flex rounded-[18px] transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.98]"
            >
              <img
                src="/uploads/sal-anpc.png"
                width="201"
                height="50"
                alt="Soluționarea Alternativă a Litigiilor — ANPC"
                className="h-[50px] w-[201px] max-w-full object-contain"
              />
            </a>
            <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
              <Scales size={15} aria-hidden="true" />
              Cererile SAL se depun pe platforma oficială ANPC
            </div>

            <div className="mt-7">
              <h3 className="font-heading text-xs tracking-wide text-white/50 mb-3">PLĂȚI SECURIZATE</h3>
              <div className="h-12 w-full max-w-[250px]">
                <NTPLogo color="#9c9c9c" version="orizontal" secret="168597" />
              </div>
            </div>
          </div>
        </div>

        {/* COPYRIGHT */}
        <div className="border-t border-white/10 pt-7 flex flex-col md:flex-row justify-between items-center gap-3 text-sm text-white/45">
          <p>© {currentYear} <span className="text-white/70">{LEGAL.name}</span>. Toate drepturile rezervate.</p>
          <span className="inline-flex items-center gap-1.5">
            Făcut cu <Heart size={14} weight="fill" className="text-super-red" aria-hidden="true" /> în București
          </span>
        </div>
      </div>
    </footer>
  );
};
