import React from 'react';
import { Hero } from '../types';
import { Link } from 'react-router-dom';

interface HeroCardProps {
  hero: Hero;
}

export const HeroCard: React.FC<HeroCardProps> = ({ hero }) => {
  return (
    <Link to={`/hero/${hero.id}`} className="block group h-full">
      <div className="bg-white border-4 border-black rounded-xl overflow-hidden comic-shadow-hover relative h-full flex flex-col transition-all duration-300">
        {/* Badge */}
        <div className="absolute top-2 right-2 z-30 bg-comic-yellow text-black border-2 border-black font-heading text-xs px-2 py-1 transform rotate-3 group-hover:rotate-6 transition-transform">
            {hero.category.toUpperCase()}
        </div>

        {/* Image Container */}
        <div className="relative h-64 overflow-hidden bg-super-dark border-b-4 border-black">
           {/* Comic halftone overlay effect */}
          <div className="absolute inset-0 bg-halftone opacity-20 z-10 pointer-events-none"></div>
          <img 
            src={hero.avatarUrl} 
            alt={hero.alias} 
            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110 group-hover:grayscale-0 grayscale-[20%]"
          />
          {/* Comic Action Line Overlay */}
          <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black via-transparent to-transparent z-20"></div>
          
          <div className="absolute bottom-2 left-2 z-30">
             <h3 className="text-white font-heading text-3xl tracking-wide drop-shadow-[2px_2px_0_#E63946]">
                 {hero.alias}
             </h3>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-4 flex-grow flex flex-col justify-between bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]">
          <div>
            <div className="flex justify-between items-center mb-3 border-b-2 border-gray-200 pb-2 border-dashed">
               <div className="flex items-center text-super-gold">
                 <span className="text-xl font-bold mr-1 stroke-black stroke-2">★</span>
                 <span className="font-bold text-black text-lg">{hero.reviews.length > 0 ? (hero.reviews.reduce((a,b) => a + b.rating, 0) / hero.reviews.length).toFixed(1) : 'Nou'}</span>
               </div>
               <div className="bg-gray-100 border-2 border-gray-300 px-2 py-0.5 rounded text-xs font-bold text-gray-600">
                 {hero.missionsCompleted} MISIUNI
               </div>
            </div>
            <p className="text-gray-800 text-sm line-clamp-3 mb-4 font-comic">
              "{hero.description}"
            </p>
          </div>
          
          <div className="mt-auto pt-3 flex justify-between items-center">
             <div>
                <span className="block text-[10px] text-gray-500 uppercase font-bold tracking-widest">TARIF ORAR</span>
                <span className="text-super-red font-heading text-xl">{hero.hourlyRate} RON</span>
             </div>
             <div className="bg-super-blue text-white text-xs font-bold py-2 px-3 rounded border-2 border-black transform group-hover:bg-super-red transition-colors">
               VEZI PROFIL
             </div>
          </div>
        </div>
      </div>
    </Link>
  );
};