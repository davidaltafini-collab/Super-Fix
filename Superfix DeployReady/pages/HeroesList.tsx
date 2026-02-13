import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Hero, JobCategory } from '../types';
import { getHeroes } from '../services/dataService';
import { RomaniaMap } from '../components/RomaniaMap';

// Lista completă de județe
const COUNTIES = [
  { code: 'B', name: 'București' }, { code: 'AB', name: 'Alba' }, { code: 'AR', name: 'Arad' }, { code: 'AG', name: 'Argeș' }, { code: 'BC', name: 'Bacău' },
  { code: 'BH', name: 'Bihor' }, { code: 'BN', name: 'Bistrița-Năsăud' }, { code: 'BT', name: 'Botoșani' }, { code: 'BR', name: 'Brăila' }, { code: 'BV', name: 'Brașov' },
  { code: 'BZ', name: 'Buzău' }, { code: 'CL', name: 'Călărași' }, { code: 'CS', name: 'Caraș-Severin' }, { code: 'CJ', name: 'Cluj' }, { code: 'CT', name: 'Constanța' },
  { code: 'CV', name: 'Covasna' }, { code: 'DB', name: 'Dâmbovița' }, { code: 'DJ', name: 'Dolj' }, { code: 'GL', name: 'Galați' }, { code: 'GR', name: 'Giurgiu' },
  { code: 'GJ', name: 'Gorj' }, { code: 'HR', name: 'Harghita' }, { code: 'HD', name: 'Hunedoara' }, { code: 'IL', name: 'Ialomița' }, { code: 'IS', name: 'Iași' },
  { code: 'IF', name: 'Ilfov' }, { code: 'MM', name: 'Maramureș' }, { code: 'MH', name: 'Mehedinți' }, { code: 'MS', name: 'Mureș' }, { code: 'NT', name: 'Neamț' },
  { code: 'OT', name: 'Olt' }, { code: 'PH', name: 'Prahova' }, { code: 'SM', name: 'Satu Mare' }, { code: 'SJ', name: 'Sălaj' }, { code: 'SB', name: 'Sibiu' },
  { code: 'SV', name: 'Suceava' }, { code: 'TR', name: 'Teleorman' }, { code: 'TM', name: 'Timiș' }, { code: 'TL', name: 'Tulcea' }, { code: 'VL', name: 'Vâlcea' },
  { code: 'VS', name: 'Vaslui' }, { code: 'VN', name: 'Vrancea' }
].sort((a, b) => a.name.localeCompare(b.name));

const DEFAULT_AVATAR = "https://super-fix.ro/revizie.png"; // sau link-ul pe care l-ai folosit

export const HeroesList: React.FC = () => {
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [loading, setLoading] = useState(true);
  
  // === STATE FILTRE ===
  // Acestea sunt singurele surse de adevăr pentru filtrare.
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCounties, setFilterCounties] = useState<string[]>([]);
  
  // State pentru Dropdown-ul Custom (Brand Identity)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // State pentru categoriile dinamice (Admin + DB + Default)
  const [allCategories, setAllCategories] = useState<string[]>([]);

  // Închide dropdown dacă dai click în afara lui
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const data = await getHeroes();
      setHeroes(data);

      // --- LOGICA CATEGORII COMPLETE ---
      // 1. Categoriile default (Hardcoded)
      const defaultCats = Object.values(JobCategory);
      
      // 2. Categoriile Custom din Admin (LocalStorage)
      const storedCats = localStorage.getItem('superfix_full_categories');
      const customCats = storedCats ? JSON.parse(storedCats) : [];

      // 3. Categoriile existente deja pe eroi (DB)
      const heroCats = data.map(h => h.category);

      // Combinăm totul într-un set unic și sortăm
      const unique = new Set([...defaultCats, ...customCats, ...heroCats]);
      setAllCategories(Array.from(unique).sort());

      setLoading(false);
    };
    fetchData();
  }, []);

  // Funcție toggle județ (Folosită și de hartă și de dropdown)
  const toggleCounty = (code: string) => {
      setFilterCounties(prev => 
          prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
      );
  };

  const getAverageRating = (hero: Hero) => {
      if (!hero.reviews || hero.reviews.length === 0) return 0;
      const sum = hero.reviews.reduce((acc: number, r: any) => acc + r.rating, 0);
      return sum / hero.reviews.length;
  };

  const renderStars = (rating: number) => {
      const rounded = Math.round(rating);
      return (
          <span className="text-yellow-400 text-lg tracking-tighter">
              {'★'.repeat(rounded)}
              <span className="text-gray-300">{'★'.repeat(5 - rounded)}</span>
          </span>
      );
  };

  // === LOGICĂ FILTRARE EROI ===
  // Aceasta doar ASCUNDE eroii, NU modifică starea hărții (filterCounties)
  const filteredHeroes = heroes.filter(hero => {
    // 1. Categorie
    const matchesCategory = filterCategory === 'ALL' || hero.category.toUpperCase() === filterCategory.toUpperCase();
    
    // 2. Căutare
    const matchesSearch = hero.alias.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (hero.realName && hero.realName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // 3. Hartă (Dacă eroul acoperă MĂCAR UNUL din județele selectate)
    // Dacă nu e selectat niciun județ, îi arătăm pe toți.
    const heroAreas = Array.isArray(hero.actionAreas) ? hero.actionAreas : [];
    const matchesMap = filterCounties.length === 0 || 
                       heroAreas.some(area => filterCounties.includes(area));
    
    return matchesCategory && matchesSearch && matchesMap;
  }).sort((a, b) => b.trustFactor - a.trustFactor);

  return (
    <div className="container mx-auto px-4 py-8 min-h-screen relative">
      
      {/* Header */}
      <div className="mb-8 text-center relative z-10">
        <h1 className="font-heading text-4xl md:text-5xl text-super-blue mb-2 uppercase drop-shadow-[2px_2px_0_#000]">
          CARTIERUL GENERAL
        </h1>
        <p className="text-gray-600 font-comic text-lg">Alege specialistul potrivit pentru misiunea ta.</p>
      </div>

      {/* === ZONA SEARCH & FILTRE === */}
      <div className="relative z-30 mb-12 flex flex-col items-center gap-8">
        
        {/* Search Bar */}
        <div className="w-full max-w-xl relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 text-xl">
                🔍
            </div>
            <input 
                type="text"
                placeholder="Caută erou (nume, alias)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border-4 border-black font-comic text-lg shadow-comic focus:outline-none focus:translate-y-1 focus:shadow-none transition-all rounded-none"
            />
        </div>

        {/* --- SECȚIUNE FILTRU GEOGRAFIC (HARTĂ + CONTROALE) --- */}
        <div className="w-full max-w-6xl bg-white border-4 border-black p-4 shadow-comic">
            <div className="flex flex-col-reverse lg:flex-row gap-8 items-start">
                
                {/* Partea Stângă: Harta Interactivă */}
                <div className="w-full lg:w-2/3 border-2 border-dashed border-gray-300 p-2 bg-blue-50/30">
                    <RomaniaMap 
                        key={filterCounties.join(',')}
                        value={filterCounties}
                        onToggle={toggleCounty}
                    />
                </div>

                {/* Partea Dreaptă: Controale */}
                <div className="w-full lg:w-1/3 flex flex-col gap-4">
                    <div className="border-b-4 border-black pb-2 mb-2">
                        <h3 className="font-heading text-xl uppercase text-super-red">
                            📍 FILTRU ZONĂ
                        </h3>
                        <p className="font-comic text-xs text-gray-500">
                            Selectează județele unde ai nevoie de ajutor.
                        </p>
                    </div>

                    {/* === DROPDOWN CUSTOM BRANDED (Se deschide ÎN JOS) === */}
                    <div className="relative" ref={dropdownRef}>
                        <button 
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="w-full bg-white border-4 border-black p-3 flex justify-between items-center font-heading text-sm uppercase shadow-[4px_4px_0_#000] hover:bg-yellow-50 active:translate-y-1 active:shadow-none transition-all"
                        >
                            <span>➕ ADAUGĂ JUDEȚ</span>
                            <span className={`transform transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>▼</span>
                        </button>

                        {/* MENIUL PROPRIU-ZIS (Absolut, sub buton) */}
                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-white border-4 border-black shadow-2xl max-h-60 overflow-y-auto z-50 animate-fade-in">
                                {COUNTIES.map(c => {
                                    const isSelected = filterCounties.includes(c.code);
                                    return (
                                        <div 
                                            key={c.code} 
                                            onClick={() => toggleCounty(c.code)}
                                            className={`p-2 cursor-pointer border-b border-gray-100 flex items-center justify-between hover:bg-yellow-100 font-sans text-sm ${isSelected ? 'bg-yellow-50 font-bold' : ''}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                {/* Checkbox Vizual */}
                                                <div className={`w-4 h-4 border-2 border-black flex items-center justify-center ${isSelected ? 'bg-super-red' : 'bg-white'}`}>
                                                    {isSelected && <span className="text-white text-[10px]">✓</span>}
                                                </div>
                                                <span>{c.name}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ZONA DE ETICHETE (TAG-uri) */}
                    <div className="bg-gray-100 p-4 border-2 border-black min-h-[120px] flex flex-col shadow-inner">
                        <div className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">JUDEȚE SELECTATE:</div>
                        
                        <div className="flex flex-wrap gap-2 mb-2">
                            {filterCounties.length === 0 && (
                                <span className="text-gray-400 italic text-sm py-1">Toată România (Niciun filtru activ)</span>
                            )}
                            {filterCounties.map(code => (
                                <button 
                                    key={code} 
                                    onClick={() => toggleCounty(code)}
                                    className="bg-super-red text-white text-xs font-bold px-3 py-1 border-2 border-black shadow-sm hover:bg-red-700 hover:scale-105 transition-all flex items-center gap-2 group"
                                    title="Elimină județ"
                                >
                                    {COUNTIES.find(c => c.code === code)?.name || code} 
                                    <div className="bg-white text-red-600 w-4 h-4 rounded-full flex items-center justify-center text-[10px] border border-red-600">✕</div>
                                </button>
                            ))}
                        </div>

                        {filterCounties.length > 0 && (
                            <button 
                                onClick={() => setFilterCounties([])} 
                                className="mt-auto self-end text-xs font-bold underline text-gray-600 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                            >
                                🗑️ Resetează Harta
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Butoane Categorii (TOATE, INCLUSIV CELE DIN ADMIN) */}
        <div className="flex flex-wrap justify-center gap-3 w-full max-w-6xl">
            <button 
              onClick={() => setFilterCategory('ALL')}
              className={`px-6 py-2 font-heading text-sm border-2 border-black transition-all shadow-[2px_2px_0_#000] hover:-translate-y-1 hover:shadow-[4px_4px_0_#000]
                ${filterCategory === 'ALL' ? 'bg-super-blue text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            >
              TOȚI EROII
            </button>
            
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-6 py-2 font-heading text-sm border-2 border-black transition-all shadow-[2px_2px_0_#000] hover:-translate-y-1 hover:shadow-[4px_4px_0_#000] uppercase
                  ${filterCategory === cat ? 'bg-super-red text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
              >
                {cat}
              </button>
            ))}
        </div>
      </div>

      {/* === GRID EROI === */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-super-red"></div>
        </div>
      ) : (
        <>
          {filteredHeroes.length === 0 ? (
            <div className="text-center py-20 bg-white border-4 border-black shadow-comic max-w-2xl mx-auto px-4">
              <div className="text-6xl mb-4">🕵️‍♂️</div>
              <h3 className="text-2xl font-heading mb-2">NICIUN EROU GĂSIT</h3>
              <p className="text-gray-500 font-comic">Nu avem eroi care să corespundă criteriilor tale (Categorie + Zonă).</p>
              <button 
                onClick={() => {setFilterCategory('ALL'); setSearchTerm(''); setFilterCounties([])}} 
                className="mt-6 text-white bg-black px-6 py-2 font-heading border-2 border-transparent hover:border-gray-500"
              >
                RESETEAZĂ CĂUTAREA
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 relative z-10">
              {filteredHeroes.map(hero => {
                const avgRating = getAverageRating(hero);
                return (
                  // CARD EROU
                  <Link
                    to={`/hero/${hero.slug || hero.id}`}
                    key={hero.id}
                    className="block bg-white border-4 border-black rounded-xl overflow-hidden shadow-[8px_8px_0_#000] hover:-translate-y-2 hover:shadow-[12px_12px_0_#000] transition-all duration-200 flex flex-col h-full group relative"
                  >
                    {/* Badge Categorie */}
                    <div className="absolute top-4 right-4 z-20">
                        <span className="bg-comic-yellow border-2 border-black px-3 py-1 text-xs font-black uppercase shadow-sm transform rotate-3 inline-block group-hover:rotate-6 transition-transform">
                            {hero.category}
                        </span>
                    </div>

                    {/* Imagine */}
                    <div className="h-64 bg-gray-200 border-b-4 border-black overflow-hidden relative">
                      <img 
                        src={hero.avatarUrl || DEFAULT_AVATAR} 
                        alt={hero.alias} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                      <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>

                    {/* Conținut */}
                    <div className="p-5 flex-grow flex flex-col">
                      
                      <div className="flex justify-between items-start mb-1">
                          <h3 className="font-heading text-2xl truncate pr-2 text-gray-900 group-hover:text-super-red transition-colors">
                              {hero.alias}
                          </h3>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center justify-between mb-4 border-b-2 border-gray-100 pb-3">
                          <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">TRUST</span>
                              <span className="font-heading text-lg text-green-600 flex items-center gap-1">
                                  🛡️ {hero.trustFactor}
                              </span>
                          </div>
                          <div className="flex flex-col items-center px-2 border-l border-r border-gray-100">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">MISIUNI</span>
                              <span className="font-heading text-lg text-blue-600">
                                  {hero.missionsCompleted}
                              </span>
                          </div>
                          <div className="flex flex-col items-end">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">RECENZII</span>
                              <div className="flex items-center gap-1">
                                  {renderStars(avgRating)}
                                  <span className="text-xs font-bold text-gray-500 ml-1">({hero.reviews?.length || 0})</span>
                              </div>
                          </div>
                      </div>

                      {/* Descriere scurtă */}
                      <div className="bg-gray-50 p-3 rounded border border-gray-200 mb-4 flex-grow text-sm italic font-comic text-gray-600 relative">
                        <span className="absolute -top-3 -left-2 text-3xl text-gray-300 leading-none select-none">"</span>
                        {hero.description ? (hero.description.length > 70 ? hero.description.substring(0, 70) + "..." : hero.description) : "Erou gata de acțiune!"}
                      </div>

                      {/* Footer Card */}
                      <div className="mt-auto flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">TARIF ORAR</p>
                          <p className="font-heading text-xl text-super-red">{hero.hourlyRate} RON</p>
                        </div>
                        <div className="bg-black text-white text-xs font-bold px-3 py-1 rounded uppercase tracking-wider group-hover:bg-super-blue transition-colors">
                            VEZI PROFIL →
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};