import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navLinkClass = (path: string) => `
    block px-4 py-2 mt-2 text-sm font-bold uppercase tracking-wider rounded-md md:mt-0 md:ml-4 
    border-2 border-transparent hover:border-black hover:bg-comic-yellow hover:text-black hover:comic-shadow
    transition-all duration-200
    ${location.pathname === path ? 'bg-super-red text-white border-black comic-shadow transform -rotate-1' : 'text-super-blue'}
  `;

  return (
    <nav className="bg-white border-b-4 border-black sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="bg-super-red text-white font-heading text-3xl px-3 py-1 transform -skew-x-12 border-4 border-black group-hover:scale-110 transition-transform duration-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              SUPERFIX
            </div>
          </Link>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-black border-2 border-black p-1 rounded hover:bg-super-gold comic-shadow transition-all active:translate-y-1 active:shadow-none"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex md:items-center">
            <Link to="/" className={navLinkClass('/')}>Acasă</Link>
            <Link to="/heroes" className={navLinkClass('/heroes')}>Găsește Eroul</Link>
            {/* === FIX: Ruta corectă este /portal, nu /hero-portal === */}
            <Link to="/portal" className={navLinkClass('/portal')}>PORTAL EROI</Link>
            <Link to="/admin" className={navLinkClass('/admin')}>Admin HQ</Link>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {isOpen && (
          <div className="md:hidden pb-4 border-t-2 border-dashed border-gray-300 mt-2 pt-2 animate-slide-up">
            <Link to="/" onClick={() => setIsOpen(false)} className={navLinkClass('/')}>Acasă</Link>
            <Link to="/heroes" onClick={() => setIsOpen(false)} className={navLinkClass('/heroes')}>Găsește Eroul</Link>
            {/* === FIX: Ruta corectă este /portal === */}
            <Link to="/portal" onClick={() => setIsOpen(false)} className={navLinkClass('/portal')}>PORTAL EROI</Link>
            <Link to="/admin" onClick={() => setIsOpen(false)} className={navLinkClass('/admin')}>Admin HQ</Link>
          </div>
        )}
      </div>
    </nav>
  );
};