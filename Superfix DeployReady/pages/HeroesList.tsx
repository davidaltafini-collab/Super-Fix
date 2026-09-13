import React, { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  getHeroCategories, heroSearchQuery, peekHeroSearch, searchHeroes,
  type HeroCategoryCount, type HeroSearchParams, type HeroSearchResult,
} from '../services/dataService';
import { RomaniaMap } from '../components/RomaniaMap';
import { thumb } from '../lib/img';
import { Tilt } from '../components/motion';
import { GlassButton } from '../components/Button';
import { Mascot } from '../components/Mascot';
import {
  getApproxLocation, getCurrentLocation, isLocationError, locationErrorText, peekApproxLocation,
  type GeoPoint,
} from '../lib/geo';
import {
  MagnifyingGlass, MapPin, Plus, CaretDown, Check, X, ArrowCounterClockwise,
  Star, ShieldCheck, Sparkle, Lightning, Drop, Wrench, PaintRoller, Hammer,
  Key, Broom, Toolbox, Users, ArrowRight, Target,
} from '@phosphor-icons/react';

// Iconița pentru fiecare meserie — același limbaj vizual ca pe homepage,
// ca filtrele de aici să se lege de secțiunea "Alege după putere".
const TRADE_ICONS: Record<string, React.ElementType> = {
  ELECTRICIAN: Lightning,
  INSTALATOR: Drop,
  MECANIC: Wrench,
  ZUGRAV: PaintRoller,
  TÂMPLAR: Hammer,
  TAMPLAR: Hammer,
  LĂCĂTUȘ: Key,
  LACATUS: Key,
  CURĂȚENIE: Broom,
  CURATENIE: Broom,
};
const iconForTrade = (name: string): React.ElementType =>
  TRADE_ICONS[name.toUpperCase()] || Toolbox;

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
const COUNTY_CODES = new Set(COUNTIES.map(c => c.code));

/* Eroii vin pe pagini de la server (FRONTEND-HANDOFF A8): la 80.000 de meseriași,
   lista completă înseamnă ~21 MB la fiecare vizită. 24 umple rândurile și pe
   2, și pe 3, și pe 4 coloane. */
const PAGE_SIZE = 24;

/* Ultima listă afișată, cu toate paginile încărcate, doar în memorie. Cine
   deschide un profil și apasă Înapoi găsește aceiași eroi, nu doar prima pagină.
   După câteva minute se cere din nou. */
const LIST_MEMORY_MS = 5 * 60 * 1000;
let lastList: { key: string; at: number; result: HeroSearchResult } | null = null;

const rememberedList = (key: string): HeroSearchResult | undefined =>
  lastList && lastList.key === key && Date.now() - lastList.at < LIST_MEMORY_MS
    ? lastList.result
    : undefined;

/* Filtrele stau în adresă (?meserie=…&judete=…&q=…): Înapoi le păstrează, iar
   o listă filtrată se poate trimite cuiva. */
const readCounties = (value: string | null): string[] =>
  (value || '').split(',').map(c => c.trim().toUpperCase()).filter(c => COUNTY_CODES.has(c));

const DEFAULT_AVATAR = "https://super-fix.ro/revizie.png"; // sau link-ul pe care l-ai folosit

export const HeroesList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // === STATE FILTRE ===
  // Acestea sunt singurele surse de adevăr pentru filtrare. Pornesc din adresă.
  const [filterCategory, setFilterCategory] = useState<string>(() => searchParams.get('meserie') || 'ALL');
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') || '');
  const [filterCounties, setFilterCounties] = useState<string[]>(() => readCounties(searchParams.get('judete')));

  // Textul pleacă la server după o scurtă pauză de tastare, nu la fiecare literă.
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchTerm.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // State pentru Dropdown-ul Custom (Brand Identity)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Harta e închisă implicit — altfel ocupă tot ecranul chiar la intrarea pe pagină.
  // Pe PC devine un panou plutitor ancorat de buton, ca sa nu se mai intinda pe toata latimea.
  const [showMap, setShowMap] = useState(false);
  const mapPanelRef = useRef<HTMLDivElement>(null);

  // Meseriile care au eroi listați, de la server (FRONTEND-HANDOFF A8).
  const [categories, setCategories] = useState<HeroCategoryCount[]>([]);

  // === „LÂNGĂ MINE" ȘI „APROAPE DE MINE" (FRONTEND-HANDOFF A15) ===
  // Ordinea o face serverul. Lista pornește „lângă mine", după poziția
  // aproximativă a IP-ului, fără să ceară permisiunea. Toggle-ul cere locația
  // exactă, ca până acum, și cere ordinea strict după distanță.
  const [approxLoc, setApproxLoc] = useState<GeoPoint | null | undefined>(() => peekApproxLocation());
  const [sortNearby, setSortNearby] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoErrorMsg, setGeoErrorMsg] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<GeoPoint | null>(null);

  const toggleNearby = async () => {
    if (sortNearby) { setSortNearby(false); return; }
    setGeoErrorMsg(null);
    setLocating(true);
    const result = await getCurrentLocation({ withAddress: false });
    setLocating(false);
    if (isLocationError(result)) {
      setGeoErrorMsg(locationErrorText(result.reason));
      return;
    }
    setUserLoc(result.location);
    setSortNearby(true);
  };

  /* Închide panourile deschise dacă atingi oriunde în afara lor.

     Era pe `mousedown`, și de-aia nu se închidea nimic pe telefon: Safari pe iOS
     trimite evenimente de mouse „false" doar pentru elementele pe care le
     consideră apăsabile — o atingere pe fundalul gol al paginii nu producea
     niciun `mousedown`, deci ascultătorul nu se declanșa niciodată. `pointerdown`
     vine de la orice atingere, indiferent unde, și acoperă și mouse-ul. */
  useEffect(() => {
    function handlePointerOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
      if (mapPanelRef.current && !mapPanelRef.current.contains(target)) {
        setShowMap(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerOutside);
    return () => document.removeEventListener('pointerdown', handlePointerOutside);
  }, []);

  // Poziția aproximativă, o dată pe sesiune (vezi lib/geo). Lista o așteaptă,
  // ca eroii să nu apară într-o ordine și să se rearanjeze după o clipă.
  useEffect(() => {
    if (approxLoc !== undefined) return;
    let alive = true;
    getApproxLocation().then(point => { if (alive) setApproxLoc(point); });
    return () => { alive = false; };
  }, [approxLoc]);

  // === LISTA, DE LA SERVER (FRONTEND-HANDOFF A8) ===
  const nearReady = userLoc !== null || approxLoc !== undefined;
  const query: HeroSearchParams = {
    limit: PAGE_SIZE,
    category: filterCategory,
    counties: filterCounties,
    search: debouncedSearch,
    near: userLoc ?? approxLoc ?? null,
    sortByDistance: sortNearby,
  };
  const queryKey = heroSearchQuery(query);
  const knownList = () => rememberedList(queryKey) ?? peekHeroSearch(query);

  const [list, setList] = useState<HeroSearchResult | null>(() => (nearReady ? knownList() ?? null : null));
  // Scheletul apare doar când n-avem nimic de arătat. La o schimbare de filtru
  // rămân pe ecran eroii de dinainte până vine răspunsul.
  const [loading, setLoading] = useState(() => !(nearReady && knownList()));
  const [fetching, setFetching] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!nearReady) return;
    const seq = ++requestSeq.current;
    setLoadingMore(false);
    setMoreError(false);

    const remembered = rememberedList(queryKey);
    if (remembered) {
      // Revenire pe listă: aceleași pagini deja încărcate, fără cerere nouă.
      setList(remembered);
      setLoadError(false);
      setLoading(false);
      setFetching(false);
      return;
    }

    const cached = peekHeroSearch(query);
    if (cached) {
      setList(cached);
      setLoadError(false);
      setLoading(false);
    }
    setFetching(true);

    searchHeroes(query).then(result => {
      // Între timp a pornit o căutare mai nouă: răspunsul ăsta nu mai contează.
      if (seq !== requestSeq.current) return;
      setFetching(false);
      setLoading(false);
      if (!result) {
        // Fără listă completă ca plasă de siguranță (A8): mesaj și „încearcă din nou".
        if (!cached) { setList(null); setLoadError(true); }
        return;
      }
      lastList = { key: queryKey, at: Date.now(), result };
      setList(result);
      setLoadError(false);
    });
  }, [nearReady, queryKey, retryTick]);

  const loadMore = async () => {
    if (!list || !list.hasMore || loadingMore) return;
    const seq = requestSeq.current;
    const current = list;
    setLoadingMore(true);
    setMoreError(false);
    const result = await searchHeroes({ ...query, page: current.page + 1 });
    if (seq !== requestSeq.current) return; // filtrele s-au schimbat între timp
    setLoadingMore(false);
    if (!result) { setMoreError(true); return; }
    // Ordinea e fixă pe server, deci paginile nu se suprapun; filtrul pe id e doar plasă.
    const seen = new Set(current.heroes.map(h => h.id));
    const merged: HeroSearchResult = {
      ...result,
      heroes: [...current.heroes, ...result.heroes.filter(h => !seen.has(h.id))],
    };
    lastList = { key: queryKey, at: Date.now(), result: merged };
    setList(merged);
  };

  // Filtrele în adresă, fără câte o intrare nouă în istoric la fiecare schimbare.
  // Alți parametri din adresă (de ex. utm_*) rămân neatinși.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const put = (key: string, value: string) => { if (value) next.set(key, value); else next.delete(key); };
    put('meserie', filterCategory === 'ALL' ? '' : filterCategory);
    put('judete', filterCounties.join(','));
    put('q', debouncedSearch);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [filterCategory, filterCounties, debouncedSearch]);

  useEffect(() => { getHeroCategories().then(setCategories); }, []);

  // Funcție toggle județ (Folosită și de hartă și de dropdown)
  const toggleCounty = (code: string) => {
      setFilterCounties(prev => 
          prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
      );
  };

  const heroes = list?.heroes ?? [];
  const hasFilters = filterCategory !== 'ALL' || filterCounties.length > 0 || debouncedSearch !== '';
  // „Aproape" pornit, dar serverul n-a putut poziționa niciun erou din pagină.
  const distancesMissing =
    sortNearby && !fetching && heroes.length > 0 && heroes.every(h => h.distanceKm == null);

  // Harta + controalele ei — identice pentru varianta mobil (accordion inline)
  // și varianta desktop (panou plutitor), ca sa nu se scrie de doua ori.
  const mapControls = (
    // Grid (nu flex-col-reverse): ordinea vizuală trebuie să difere de ordinea
    // DOM doar pe unele blocuri, nu să inverseze totul în bloc. Sub `lg`, un
    // singur rând pe coloană — ordinea e cea din JSX: Adaugă județ, Hartă,
    // Județe selectate. Pe desktop, poziționarea explicită (col/row-start)
    // recreează cele două coloane de dinainte (hartă mare stânga, controale
    // stivuite dreapta), indiferent de ordinea DOM.
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 lg:gap-8">
      {/* Adaugă județ — primul pe telefon; sus-dreapta pe desktop */}
      <div className="flex w-full flex-col gap-4 lg:col-start-3 lg:row-start-1">
          <p className="text-sm text-graphite-soft">
              Selectează județele unde ai nevoie de ajutor.
          </p>

          {/* === DROPDOWN CUSTOM BRANDED (Se deschide ÎN JOS) === */}
          <div className="relative" ref={dropdownRef}>
              <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  aria-expanded={isDropdownOpen}
                  className="flex w-full items-center justify-between rounded-full bg-white px-5 py-3 font-heading text-sm font-semibold shadow-clay-sm transition-all duration-200 hover:-translate-y-0.5 hover:text-super-red active:translate-y-0 active:scale-[0.98]"
              >
                  <span className="flex items-center gap-2">
                      <Plus size={16} weight="bold" aria-hidden="true" />
                      Adaugă județ
                  </span>
                  <CaretDown
                      size={16}
                      weight="bold"
                      className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                  />
              </button>

              {/* MENIUL PROPRIU-ZIS (Absolut, sub buton) */}
              {isDropdownOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-[20px] border border-white/70 bg-white/95 p-2 shadow-clay backdrop-blur-xl">
                      {COUNTIES.map(c => {
                          const isSelected = filterCounties.includes(c.code);
                          return (
                              <div
                                  key={c.code}
                                  onClick={() => toggleCounty(c.code)}
                                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${isSelected ? 'bg-super-red/10 font-semibold text-super-red' : 'hover:bg-cloud'}`}
                              >
                                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors ${isSelected ? 'bg-super-red' : 'bg-graphite/10'}`}>
                                      {isSelected && <Check size={11} weight="bold" className="text-white" aria-hidden="true" />}
                                  </div>
                                  <span>{c.name}</span>
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
      </div>

      {/* Hartă — a doua pe telefon; coloana stângă (2/3), peste ambele rânduri pe desktop */}
      <div className="w-full rounded-[24px] bg-white/50 p-3 lg:col-start-1 lg:row-start-1 lg:col-span-2 lg:row-span-2">
          <RomaniaMap
              key={filterCounties.join(',')}
              value={filterCounties}
              onToggle={toggleCounty}
          />
      </div>

      {/* Județe selectate (TAG-uri) — a treia pe telefon; sub dropdown pe desktop */}
      <div className="flex min-h-[120px] w-full flex-col rounded-[20px] bg-white/50 p-4 lg:col-start-3 lg:row-start-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite-soft">Județe selectate</div>

          <div className="mb-2 flex flex-wrap gap-2">
              {filterCounties.length === 0 && (
                  <span className="py-1 text-sm text-graphite-soft">Toată România (niciun filtru activ)</span>
              )}
              {filterCounties.map(code => (
                  <button
                      key={code}
                      onClick={() => toggleCounty(code)}
                      className="group inline-flex items-center gap-2 rounded-full bg-super-red px-3.5 py-1.5 text-xs font-semibold text-white shadow-clay-red transition-transform hover:scale-105 active:scale-95"
                      title="Elimină județ"
                  >
                      {COUNTIES.find(c => c.code === code)?.name || code}
                      <X size={12} weight="bold" aria-hidden="true" />
                  </button>
              ))}
          </div>

          {filterCounties.length > 0 && (
              <button
                  onClick={() => setFilterCounties([])}
                  className="mt-auto inline-flex items-center gap-1.5 self-end rounded-full px-3 py-1.5 text-xs font-semibold text-graphite-soft transition-colors hover:bg-super-red/10 hover:text-super-red"
              >
                  <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" />
                  Resetează harta
              </button>
          )}
      </div>
    </div>
  );

  return (
    <div className="relative mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-28 sm:px-6 font-sans text-graphite">
      {/* Rezultatele unei căutări sau ale unor filtre nu intră în Google
          (FRONTEND-HANDOFF A14): le tratează ca pagini subțiri. Cuvintele se
          prind prin profiluri și prin paginile pe meserie și loc. */}
      {hasFilters && (
        <Helmet>
          <meta name="robots" content="noindex, follow" />
        </Helmet>
      )}

      {/* Header */}
      <div className="relative z-10 mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-heading font-semibold shadow-clay-sm">
          <Users size={18} weight="fill" className="text-super-red" aria-hidden="true" />
          Cartierul general
        </span>
        <h1 className="mt-5 font-heading text-[2.4rem] font-bold leading-[1.1] sm:text-5xl md:text-6xl">
          Alege <span className="text-super-red">eroul</span> potrivit
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-graphite-soft">
          Filtrează după meserie și zonă, apoi vezi profilul complet.
        </p>
      </div>

      {/* === ZONA SEARCH & FILTRE === */}
      <div className="relative z-30 mb-12 flex flex-col items-center gap-6">

        {/* Search Bar */}
        <div className="relative w-full max-w-xl">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5 text-graphite-soft">
                <MagnifyingGlass size={22} weight="bold" aria-hidden="true" />
            </div>
            <input
                type="text"
                placeholder="Caută nume, meserie, oraș..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-full border border-graphite/15 bg-white/85 py-4 pl-14 pr-5 text-base text-graphite shadow-clay-sm outline-none transition-all placeholder:text-graphite-soft/70 focus:border-super-red/40 focus:bg-white focus:ring-4 focus:ring-super-red/15"
            />
        </div>

        {/* --- FILTRU ZONĂ + CEI MAI APROPIAȚI --- */}
        {/* Un singur rând, compact, la fel pe telefon și pe PC — harta se deschide
            într-un panou plutitor ancorat de buton, nu mai împinge pagina în jos. */}
        <div ref={mapPanelRef} className="relative flex flex-nowrap items-center justify-center gap-2 sm:gap-3">
              <button
                  type="button"
                  onClick={() => setShowMap(v => !v)}
                  aria-expanded={showMap}
                  className="sf-glass relative z-40 flex shrink-0 items-center gap-1.5 rounded-full py-2.5 pl-3 pr-2.5 font-heading text-[13px] font-semibold transition-colors hover:bg-white/60 sm:gap-3 sm:py-3 sm:pl-5 sm:pr-4 sm:text-sm"
              >
                  <MapPin size={18} weight="duotone" className="shrink-0 text-super-red" aria-hidden="true" />
                  {/* Pe telefon cele doua butoane trebuie sa incapa pe acelasi rand,
                      deci textul lung ramane doar unde e loc pentru el. */}
                  <span className="hidden sm:inline">Filtru zonă</span>
                  <span className="sm:hidden">Zonă</span>
                  <span className="hidden h-4 w-px bg-graphite/15 sm:block" aria-hidden="true" />
                  <span className="flex items-center gap-1.5 font-normal text-graphite-soft sm:gap-2">
                      <span className="hidden sm:inline">
                          {filterCounties.length === 0
                              ? 'Toată România'
                              : `${filterCounties.length} ${filterCounties.length === 1 ? 'județ' : 'județe'}`}
                      </span>
                      {filterCounties.length > 0 && (
                          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-super-red px-1 text-[10px] font-bold text-white sm:hidden">
                              {filterCounties.length}
                          </span>
                      )}
                      <CaretDown
                          size={15}
                          weight="bold"
                          className={`shrink-0 transition-transform duration-200 ${showMap ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                      />
                  </span>
              </button>

              {/* Toggle: sortează după cei mai apropiați de tine (geolocalizare) */}
              <button
                  type="button"
                  onClick={toggleNearby}
                  disabled={locating}
                  aria-pressed={sortNearby}
                  title="Sortează după cei mai apropiați de tine"
                  className="sf-glass relative z-40 inline-flex shrink-0 items-center gap-1.5 rounded-full py-2 pl-3 pr-1.5 font-heading text-[13px] font-semibold text-graphite-soft transition-colors hover:text-super-red disabled:cursor-wait disabled:opacity-70 sm:gap-2 sm:pl-3.5 sm:pr-2 sm:text-sm"
              >
                  <Target size={16} weight={sortNearby ? 'fill' : 'regular'} className={`shrink-0 ${sortNearby ? 'text-super-red' : ''}`} aria-hidden="true" />
                  <span className="hidden sm:inline">{locating ? 'Te localizez…' : 'Aproape de mine'}</span>
                  <span className="sm:hidden">{locating ? 'Caut…' : 'Aproape'}</span>
                  <span
                      aria-hidden="true"
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${sortNearby ? 'bg-super-red' : 'bg-graphite/20'}`}
                  >
                      <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${sortNearby ? 'translate-x-[18px]' : 'translate-x-1'}`}
                      />
                  </span>
              </button>

              {/* Inchiderea la atingere in afara nu se mai bazeaza pe un
                  ascultator pe document: acolo orice element care opreste
                  propagarea, sau orice zona care nu produce evenimentul, lasa
                  panoul deschis. Aici e o suprafata reala pe tot ecranul, sub
                  panou si sub butoane — orice atingere care nu nimereste panoul
                  nimereste in ea, si atunci se inchide. */}
              {showMap && (
                  <div
                      className="fixed inset-0 z-30"
                      aria-hidden="true"
                      onPointerDown={() => { setShowMap(false); setIsDropdownOpen(false); }}
                  />
              )}

              <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${showMap ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} absolute left-1/2 top-full z-40 mt-3 w-[92vw] -translate-x-1/2 sm:left-0 sm:w-[720px] sm:max-w-[80vw] sm:translate-x-0`}>
                <div className="overflow-hidden">
                  {/* px-7/pb-14, nu p-6 uniform: umbra lui .sf-glass (0 22px 46px -20px)
                      are nevoie de ~48px jos și ~28px pe laterale ca să se stingă complet
                      înainte să lovească marginea overflow-hidden de mai sus — cu doar
                      24px se tăia brusc, fără să apuce să se disipe. */}
                  <div className="px-7 pt-6 pb-14">
                    <div className="sf-glass overflow-hidden rounded-[28px] shadow-clay">
                      <div className="max-h-[75vh] overflow-y-auto p-5 sm:p-6">
                        {mapControls}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
        </div>
        {sortNearby && fetching && (
            <p className="-mt-4 text-center text-xs text-graphite-soft">Calculez distanțele…</p>
        )}

        {/* Locația a venit, dar serverul n-a putut poziționa niciun erou (de ex.
            o locație din afara țării). Omul n-are ce repara, deci nu-i cerem
            nimic — îi spunem doar ce vede pe ecran, ca să nu creadă că filtrul e stricat. */}
        {distancesMissing && (
            <p className="-mt-4 max-w-sm text-center text-xs text-graphite-soft">
                Ți-am luat locația, dar distanțele n-au putut fi calculate acum. Lista rămâne în ordinea obișnuită.
            </p>
        )}

        {geoErrorMsg && (
            <p className="-mt-4 max-w-sm text-center text-xs text-super-red">{geoErrorMsg}</p>
        )}

        {/* Butoane Categorii (TOATE, INCLUSIV CELE DIN ADMIN) */}
        <div className="flex w-full max-w-6xl flex-wrap justify-center gap-2.5">
            <button
              onClick={() => setFilterCategory('ALL')}
              aria-pressed={filterCategory === 'ALL'}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-heading text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]
                ${filterCategory === 'ALL' ? 'bg-graphite text-white shadow-clay-dark' : 'bg-white/80 text-graphite shadow-clay-sm hover:text-super-red'}`}
            >
              <Sparkle size={17} weight={filterCategory === 'ALL' ? 'fill' : 'duotone'} aria-hidden="true" />
              Toți eroii
            </button>

            {categories.map(({ category }) => {
              // Valoarea pleacă la server exact cum vine; afișată fără spațiile de la capete.
              const label = category.trim();
              const Icon = iconForTrade(label);
              const active = filterCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setFilterCategory(category)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-heading text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]
                    ${active ? 'bg-super-red text-white shadow-clay-red' : 'bg-white/80 text-graphite shadow-clay-sm hover:text-super-red'}`}
                >
                  <Icon size={17} weight={active ? 'fill' : 'duotone'} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
        </div>

        {/* Contor rezultate */}
        {!loading && list && (
          <p className="text-sm font-semibold text-graphite-soft" aria-live="polite">
            {list.total === 0
              ? 'Niciun erou găsit'
              : `${list.total.toLocaleString('ro-RO')} ${list.total === 1 ? 'erou disponibil' : 'eroi disponibili'}`}
          </p>
        )}
      </div>

      {/* === GRID EROI === */}
      {loading ? (
        // Schelete în forma cardului final (nu spinner generic) — pagina nu "sare" la încărcare.
        <div className="relative z-10 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:grid-cols-4" aria-live="polite" aria-busy="true">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="sf-glass overflow-hidden rounded-[20px] sm:rounded-[28px]">
              <div className="aspect-square animate-pulse bg-graphite/10 sm:aspect-auto sm:h-60" />
              <div className="p-3 sm:p-5">
                <div className="h-5 w-2/3 animate-pulse rounded-full bg-graphite/10" />
                <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-graphite/10" />
                <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-graphite/10" />
                <div className="mt-5 h-8 w-1/2 animate-pulse rounded-full bg-graphite/10" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {loadError ? (
            <div className="sf-glass mx-auto max-w-2xl rounded-[32px] px-6 py-14 text-center">
              <Mascot
                className="mx-auto mb-6 w-auto max-h-44 opacity-90"
                shadow="drop-shadow-[0_18px_26px_rgba(46,51,59,0.3)]"
              />
              <h3 className="font-heading text-2xl font-bold">Lista nu s-a încărcat</h3>
              <p className="mx-auto mt-3 max-w-sm text-graphite-soft">
                Verifică conexiunea la internet și încearcă din nou.
              </p>
              <div className="mt-7 flex justify-center">
                <GlassButton
                  type="button"
                  tone="red"
                  onClick={() => { setLoadError(false); setLoading(true); setRetryTick(t => t + 1); }}
                >
                  <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
                  Încearcă din nou
                </GlassButton>
              </div>
            </div>
          ) : heroes.length === 0 ? (
            <div className="sf-glass mx-auto max-w-2xl rounded-[32px] px-6 py-14 text-center">
              <Mascot
                className="mx-auto mb-6 w-auto max-h-44 opacity-90"
                shadow="drop-shadow-[0_18px_26px_rgba(46,51,59,0.3)]"
              />
              <h3 className="font-heading text-2xl font-bold">Niciun erou pe potrivă</h3>
              <p className="mx-auto mt-3 max-w-sm text-graphite-soft">
                Nu găsim eroi pentru meseria și zona alese. Încearcă alt județ sau altă meserie.
              </p>
              <div className="mt-7 flex justify-center">
                <GlassButton
                  type="button"
                  tone="red"
                  onClick={() => { setFilterCategory('ALL'); setSearchTerm(''); setFilterCounties([]); }}
                >
                  <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
                  Resetează căutarea
                </GlassButton>
              </div>
            </div>
          ) : (
            <div className="relative z-10 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:grid-cols-4">
              {heroes.map(hero => {
                const avgRating = hero.ratingAvg ?? 0; // calculată pe server (A9)
                const TradeIcon = iconForTrade(hero.category);
                return (
                  // CARD EROU — tilt 3D + glare la hover (doar pe pointer fin, vezi componenta Tilt)
                  <Tilt key={hero.id} max={8} className="h-full rounded-[20px] sm:rounded-[28px]">
                    <Link
                      to={`/hero/${hero.slug || hero.id}`}
                      className="group sf-glass relative flex h-full flex-col overflow-hidden rounded-[20px] transition-shadow duration-300 sm:rounded-[28px]"
                    >
                      {/* Cât de departe e, odată ce știm unde ești.

                          Fără asta, „Aproape de mine" nu producea NIMIC vizibil:
                          singurul lui efect era ordinea din listă, iar eroii de
                          acum au toți același oraș, deci ordinea rămânea
                          identică. Adică mergea, dar arăta exact ca și cum nu
                          merge. Distanța scrisă pe card e dovada că locația a
                          fost preluată și folosită, indiferent de ordine. */}
                      {sortNearby && hero.distanceKm != null && (
                        <div className="absolute left-2 top-2 z-20 sm:left-4 sm:top-4">
                            <span className="inline-flex items-center gap-1 rounded-full bg-super-red px-2 py-1 font-heading text-[9px] font-semibold text-white shadow-clay-red sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs">
                                <Target size={12} weight="fill" aria-hidden="true" />
                                {/* De la server, în km întregi, minim 1 (A15). */}
                                {`${hero.distanceKm} km`}
                            </span>
                        </div>
                      )}

                      {/* Badge Categorie */}
                      <div className="absolute right-2 top-2 z-20 sm:right-4 sm:top-4">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[9px] font-heading font-semibold text-graphite shadow-clay-sm backdrop-blur-md sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs">
                              <TradeIcon size={12} weight="fill" className="text-super-red" aria-hidden="true" />
                              {hero.category}
                          </span>
                      </div>

                      {/* Imagine — patrat, ca sa respecte safe-space-ul circular din cropper-ul de poza profil */}
                      <div className="relative aspect-square overflow-hidden bg-cloud sm:aspect-auto sm:h-60">
                        <img
                          src={thumb(hero.avatarUrl || DEFAULT_AVATAR, 640, { square: true })}
                          alt={hero.alias}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-graphite/70 to-transparent" />
                        <h3 className="absolute bottom-2 left-2.5 right-2.5 truncate font-heading text-base font-bold sf-thicken text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] sm:bottom-3 sm:left-4 sm:right-4 sm:text-2xl">
                            {hero.alias}
                        </h3>
                      </div>

                      {/* Conținut */}
                      <div className="flex flex-grow flex-col p-3 sm:p-5">

                        {/* Stats */}
                        <div className="flex items-center justify-between gap-1 rounded-xl bg-white/55 px-2 py-1.5 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2.5">
                            <div className="flex flex-col items-center">
                                <span className="flex items-center gap-1 font-heading text-xs sf-thicken text-graphite sm:text-base">
                                    <ShieldCheck size={13} weight="fill" className="text-emerald-600" aria-hidden="true" />
                                    {hero.trustFactor}
                                </span>
                                <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-wide text-graphite-soft sm:text-[10px]">
                                    <span className="sm:hidden">Încr.</span>
                                    <span className="hidden sm:inline">Încredere</span>
                                </span>
                            </div>
                            <div className="h-7 w-px bg-graphite/10 sm:h-8" aria-hidden="true" />
                            <div className="flex flex-col items-center">
                                <span className="font-heading text-xs sf-thicken text-graphite sm:text-base">{hero.missionsCompleted}</span>
                                <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-wide text-graphite-soft sm:text-[10px]">Misiuni</span>
                            </div>
                            <div className="h-7 w-px bg-graphite/10 sm:h-8" aria-hidden="true" />
                            <div className="flex flex-col items-center">
                                <span className="flex items-center gap-1 font-heading text-xs sf-thicken text-graphite sm:text-base">
                                    <Star size={13} weight="fill" className="text-comic-yellow" aria-hidden="true" />
                                    {avgRating > 0 ? avgRating.toFixed(1) : '–'}
                                </span>
                                <span className="mt-0.5 whitespace-nowrap text-[8px] font-extrabold uppercase tracking-wide text-graphite-soft sm:text-[10px]">
                                    {hero.reviewCount ?? 0} rec.
                                </span>
                            </div>
                        </div>

                        {/* Descriere scurtă */}
                        <p className="mt-2.5 flex-grow text-xs leading-snug text-graphite-soft sm:mt-4 sm:text-sm sm:leading-relaxed">
                          {hero.description ? (hero.description.length > 80 ? hero.description.substring(0, 80) + "…" : hero.description) : "Erou gata de acțiune."}
                        </p>

                        {/* Footer Card */}
                        <div className="mt-3 flex items-end justify-between gap-1.5 sm:mt-5">
                          <div>
                            <p className="text-[8px] font-semibold uppercase tracking-wide text-graphite-soft sm:text-[10px]">Tarif orar</p>
                            <p className="font-heading text-base font-bold text-super-red sm:text-xl">{hero.hourlyRate} RON</p>
                          </div>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-graphite px-2.5 py-1.5 text-[10px] font-heading font-semibold text-white transition-all duration-200 group-hover:bg-super-red sm:gap-1.5 sm:px-4 sm:py-2 sm:text-xs sm:group-hover:gap-2.5">
                              <span className="sm:hidden">Profil</span>
                              <span className="hidden sm:inline">Vezi profil</span>
                              <ArrowRight size={12} weight="bold" aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </Tilt>
                );
              })}
            </div>
          )}

          {/* Pagina următoare, la cerere. Nu se încarcă singură la derulare: la
              zeci de mii de eroi, subsolul cu linkurile legale n-ar mai putea fi
              atins niciodată. */}
          {!loadError && list?.hasMore && (
            <div className="relative z-10 mt-10 flex flex-col items-center gap-3">
              {moreError && (
                <p className="text-center text-sm text-super-red">Următorii eroi nu s-au încărcat. Încearcă din nou.</p>
              )}
              <GlassButton type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Se încarcă…' : 'Arată mai mulți eroi'}
              </GlassButton>
            </div>
          )}
        </>
      )}
    </div>
  );
};