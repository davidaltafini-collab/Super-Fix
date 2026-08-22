import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ServiceRequest, Hero } from '../types';
import {
  getMyMissions, updateMissionStatus, loginHero, logoutUser, getHeroById,
  peekMyMissions, peekHeroById, hasHeroSession, currentHeroId,
} from '../services/dataService';
import { Skel, SkeletonPage } from '../components/Loader';
import { searchMissions } from '../lib/search';
import { getCurrentLocation, haversineKm, routeMatrix, GeoPoint, Leg } from '../lib/geo';
import { CameraCapture } from '../components/CameraCapture';
import { uploadSignedMedia, uploadErrorText } from '../services/mediaUpload';
import { useToast } from '../components/Toast';
import { getSubscriptionStatus } from '../services/subscription';
import { Sheet } from '../components/Sheet';
import {
  ShieldCheck, Target, Phone, Camera, CheckCircle, Info, SignOut,
  UserCircle, MaskHappy, ArrowUpRight, ChatCircleText,
  MagnifyingGlass, X, Crosshair, EyeSlash, CaretRight,
} from '@phosphor-icons/react';

import './portal.css';
import '../components/form.css';

/** Cuvântul de stare de pe card. Scurt: ce urmează scrie oricum pe buton. */
const STATE_WORD: Record<string, string> = {
  PENDING: 'Semnal nou',
  ACCEPTED: 'Acceptată',
  IN_PROGRESS: 'În lucru',
  COMPLETED: 'Terminată',
  REJECTED: 'Refuzată',
  CANCELLED: 'Anulată',
};

/* Filtrele de jos. Tonul e același cu al barei de acțiune de pe cardurile pe
   care le arată, ca filtrul și rezultatul să se recunoască între ele. */
const CHIPS = [
  { key: 'ALL', label: 'Toate', tone: '' },
  { key: 'PENDING', label: 'Noi', tone: 'pending' },
  { key: 'ACCEPTED', label: 'Acceptate', tone: 'accepted' },
  { key: 'IN_PROGRESS', label: 'În lucru', tone: 'progress' },
  { key: 'COMPLETED', label: 'Terminate', tone: 'done' },
  { key: 'CLOSED', label: 'Închise', tone: '' },
] as const;

type ChipKey = (typeof CHIPS)[number]['key'];

const inChip = (status: string, chip: ChipKey) =>
  chip === 'ALL' ? true
  : chip === 'CLOSED' ? status === 'REJECTED' || status === 'CANCELLED'
  : status === chip;

/* Cât de mult cere atenție. Cererile noi sus, închisele jos — asta e ordinea în
   care se uită omul, nu ordinea cronologică. */
const URGENCY: Record<string, number> = {
  PENDING: 0, IN_PROGRESS: 1, ACCEPTED: 2, COMPLETED: 3, REJECTED: 4, CANCELLED: 4,
};

/* În română, numerele de la 20 în sus cer „de": 2 ore, dar 21 DE ore.
   Fără regula asta, textul sună a traducere automată. */
const plural = (n: number, one: string, few: string) => {
  if (n === 1) return `${n} ${one}`;
  const r = n % 100;
  return r >= 20 || r === 0 ? `${n} de ${few}` : `${n} ${few}`;
};

/**
 * De când e trimisă cererea — cu „acum" scris, nu subînțeles.
 *
 * Pe card sunt două durate una lângă alta: cât faci până acolo și de când
 * așteaptă omul. Scrise amândouă „12 min", se confundă. „acum" e cuvântul care
 * le desparte, și costă trei litere.
 */
const sentAgo = (value: string | Date) => {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'chiar acum';
  if (mins < 60) return `acum ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `acum ${plural(hours, 'oră', 'ore')}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `acum ${plural(days, 'zi', 'zile')}`;
  // peste o săptămână, „acum 12 zile" nu mai ajută pe nimeni: vrea data
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
};

/** Inițialele clientului, pentru discul din card. */
const initials = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');


export const HeroPortal: React.FC = () => {
  const navigate = useNavigate();
  /* Sesiunea si datele deja stiute se citesc SINCRON, la primul render.

     Inainte, `isAuthenticated` pornea `false` iar `checkAuth` rula intr-un
     `useEffect` — adica dupa desenare. Rezultatul: primul cadru pe care il vedea
     un erou logat era ecranul de login. Nu astepta nimic, doar efectul nu apucase
     sa ruleze. */
  const [isAuthenticated, setIsAuthenticated] = useState(hasHeroSession);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Date Erou
  const toast = useToast();
  /* Listarea. Nu blocăm nimic pe ea și nu arătăm nimic până nu știm sigur:
     un banner „nu apari în căutări" fulgerat greșit unui erou activ e mai rău
     decât lipsa lui. De asta pornește `false`. */
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!hasHeroSession()) return;
    let alive = true;
    getSubscriptionStatus().then(state => {
      if (alive) setHidden(state.archived === true);
    });
    return () => { alive = false; };
  }, []);

  const [currentHero, setCurrentHero] = useState<Hero | null>(
    () => peekHeroById(currentHeroId()) ?? null,
  );
  const [missions, setMissions] = useState<ServiceRequest[]>(() => peekMyMissions() ?? []);
  // schelet doar cand chiar n-avem nimic de aratat
  const [loading, setLoading] = useState(() => !peekMyMissions());
  const [chip, setChip] = useState<ChipKey>('ALL');
  const [query, setQuery] = useState('');
  /* Locația eroului. Se cere din start, pentru că fără ea jumătate din card e
     gol — dar numai dacă nu a refuzat-o deja o dată. */
  const [here, setHere] = useState<GeoPoint | null>(null);
  const [geo, setGeo] = useState<'idle' | 'asking' | 'ok' | 'off'>('idle');
  /** Timp și distanță pe drum, pe id de misiune. */
  const [legs, setLegs] = useState<Record<string, Leg>>({});
  const [nearestFirst, setNearestFirst] = useState(false);

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [currentMissionId, setCurrentMissionId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'START' | 'FINISH'>('START');

  // === NEW: Modal Info State ===
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('superfix_token');
    const role = localStorage.getItem('superfix_role');

    if (token && role === 'HERO') {
        setIsAuthenticated(true);
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const payload = JSON.parse(jsonPayload);

            if (typeof payload.sub === 'string' && payload.sub) {
                localStorage.setItem('superfix_hero_id', payload.sub);
                refreshData(payload.sub);
            } else {
                throw new Error('Tokenul nu conține identitatea eroului.');
            }
        } catch (e) {
            console.error("Eroare decodare token", e);
            logoutUser();
            setIsAuthenticated(false);
        }
    } else {
        setIsAuthenticated(false);
    }
  };

  const refreshData = async (id: string) => {
      // Cele doua cereri nu depind una de alta. Puse in serie faceau ~340ms;
      // in paralel, cat cea mai lenta dintre ele.
      // Iar scheletul apare doar daca ecranul e gol: dupa ce accepti o misiune
      // lista trebuie sa ramana pe loc cat se reimprospateaza, nu sa clipeasca.
      setLoading(missions.length === 0);

      const [heroData, missionsData] = await Promise.all([
        getHeroById(id),
        getMyMissions(),
      ]);

      if (heroData) setCurrentHero(heroData);
      setMissions(missionsData);
      setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await loginHero(usernameInput, passwordInput);

    if (success) {
        await checkAuth();
        setUsernameInput('');
        setPasswordInput('');
    } else {
        toast.error('Date incorecte. Verifică numele de cod și parola.');
    }
  };

  /* Locația, cerută la intrarea în portal.

     Întrebăm întâi Permissions API: dacă omul a refuzat deja o dată, nu-l mai
     hărțuim la fiecare vizită. Dacă a acceptat, nici nu se mai vede vreun
     dialog — coordonatele vin direct. */
  useEffect(() => {
    if (!isAuthenticated || here) return;
    let alive = true;

    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (perm?.state === 'denied') { setGeo('off'); return; }
      } catch { /* Safari mai vechi n-are Permissions API: întrebăm direct */ }

      if (!alive) return;
      setGeo('asking');
      const result = await getCurrentLocation();
      if (!alive) return;

      if (result.ok) {
        setHere({ lat: result.location.lat, lng: result.location.lng });
        setGeo('ok');
      } else {
        setGeo('off');
      }
    })();

    return () => { alive = false; };
  }, [isAuthenticated, here]);

  /* Cheia se schimbă doar când se schimbă chiar coordonatele misiunilor. Fără
     ea, orice reîmprospătare a listei ar porni o rutare nouă, degeaba. */
  const routable = useMemo(
    () => missions.filter(m => typeof m.lat === 'number' && typeof m.lng === 'number'),
    [missions],
  );
  const routableKey = routable.map(m => `${m.id}:${m.lat},${m.lng}`).join('|');

  /* Timpii de mers, într-o singură cerere pentru toată lista. Vezi `routeMatrix`:
     câte o rutare de misiune ar însemna zece cereri către un server public. */
  useEffect(() => {
    if (!here || !routable.length) return;
    let alive = true;

    routeMatrix(here, routable.map(m => ({ lat: m.lat as number, lng: m.lng as number })))
      .then(rows => {
        if (!alive) return;
        const next: Record<string, Leg> = {};
        rows.forEach((leg, i) => { next[routable[i].id] = leg; });
        setLegs(next);
      });

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here?.lat, here?.lng, routableKey]);

  const handleStatusChange = async (id: string, newStatus: string) => {
      if (newStatus === 'IN_PROGRESS') {
          setCurrentMissionId(id);
          setCameraMode('START');
          setShowCamera(true);
          return;
      }
      if (newStatus === 'COMPLETED') {
          setCurrentMissionId(id);
          setCameraMode('FINISH');
          setShowCamera(true);
          return;
      }

      const success = await updateMissionStatus(id, newStatus, null);
      if (!success) toast.error('Statusul misiunii nu a putut fi actualizat. Reîncearcă.');
      if (currentHero) refreshData(currentHero.id);
  };

  const handlePhotoCapture = async (base64Image: string) => {
      if (!currentMissionId || !currentHero) return;

      const blob = await (await fetch(base64Image)).blob();
      const file = new File([blob], `mission-${currentMissionId}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const shot = await uploadSignedMedia(file, 'image');
      if (!shot.url) {
          toast.error(uploadErrorText(shot.reason || 'network', 'image'));
          return;
      }
      const photoUrl = shot.url;
      const newStatus = cameraMode === 'START' ? 'IN_PROGRESS' : 'COMPLETED';
      const success = await updateMissionStatus(currentMissionId, newStatus, photoUrl);
      if (!success) {
          toast.error('Poza s-a încărcat, dar statusul misiunii nu s-a actualizat. Reîncearcă.');
          return;
      }

      setShowCamera(false);
      setCurrentMissionId(null);
      refreshData(currentHero.id);
  };

  const activeMissions = missions.filter(m => ['PENDING', 'ACCEPTED', 'IN_PROGRESS'].includes(m.status));

  /* Distanța, în kilometri.

     Cea de pe drum, dacă rutarea a răspuns. Până atunci, linia dreaptă — ca să
     apară un număr instantaneu, nu o gaură care se umple după o secundă. */
  const kmTo = (m: ServiceRequest): number | null => {
    const leg = legs[m.id];
    if (leg) return leg.distanceKm;
    if (here && typeof m.lat === 'number' && typeof m.lng === 'number') {
      return haversineKm(here, { lat: m.lat, lng: m.lng });
    }
    return null;
  };

  const showKm = (km: number) =>
    `${(km < 10 ? km.toFixed(1) : Math.round(km).toString()).replace('.', ',')} km`;

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of CHIPS) out[c.key] = missions.filter(m => inChip(m.status, c.key)).length;
    return out;
  }, [missions]);

  /* Întâi filtrul, apoi căutarea în ce a rămas. Se compun: „terminate" din chips
     plus „boiler" scris în bară înseamnă boilerele terminate. */
  const { results: shown, understood } = useMemo(() => {
    const pool = missions
      .filter(m => inChip(m.status, chip))
      .sort((a, b) => {
        /* „Cele mai apropiate" bate ordinea obișnuită: dacă omul a apăsat pe
           sortarea după distanță, aia vrea să vadă, nu urgențele. Misiunile
           fără coordonate se duc la coadă. */
        if (nearestFirst) {
          const da = kmTo(a) ?? Infinity;
          const db = kmTo(b) ?? Infinity;
          if (da !== db) return da - db;
        }
        const u = (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9);
        return u !== 0 ? u : new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    return searchMissions(pool, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions, chip, query, nearestFirst, legs, here]);

  const searching = Boolean(understood.terms.length || understood.when || understood.status);

  const askHere = async () => {
    setGeo('asking');
    const result = await getCurrentLocation();
    if (result.ok) {
      setHere({ lat: result.location.lat, lng: result.location.lng });
      setGeo('ok');
    } else {
      setGeo('off');
      toast.error('N-am putut lua locația ta. Verifică permisiunea din browser.');
    }
  };


  // === ECRAN LOGIN ===
  if (!isAuthenticated) return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5 py-24">
      <div className="sf-glass w-full max-w-sm rounded-[28px] p-8">
        <div className="text-center">
          <span className="sf-clay inline-flex h-14 w-14 items-center justify-center rounded-2xl text-super-red">
            <ShieldCheck size={26} weight="duotone" aria-hidden="true" />
          </span>
          <h1 className="mt-5 font-heading text-3xl font-bold text-graphite">Acces eroi</h1>
          <p className="mt-2 text-sm text-graphite-soft">Numele de cod și parola ta.</p>
        </div>

        <form onSubmit={handleLogin} noValidate className="mt-7 space-y-4">
          <div className="sf-field">
            <label htmlFor="hero-user" className="sf-field__label">Nume de cod</label>
            <input
              id="hero-user"
              type="text"
              autoComplete="username"
              className="sf-field__input"
              placeholder="Ex: SuperMeseriaș"
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
            />
          </div>

          <div className="sf-field">
            <label htmlFor="hero-pass" className="sf-field__label">Parolă secretă</label>
            <input
              id="hero-pass"
              type="password"
              autoComplete="current-password"
              className="sf-field__input"
              placeholder="••••••"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-graphite font-heading font-semibold text-white shadow-[0_14px_30px_-14px_rgba(46,51,59,0.9)] transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
          >
            Intră în bază
          </button>
        </form>

        <Link
          to="/reset-password?role=HERO"
          className="mt-4 block text-center text-sm font-semibold text-graphite-soft underline underline-offset-4 hover:text-graphite"
        >
          Ai uitat parola?
        </Link>

        <div className="mt-7 border-t border-graphite/10 pt-6 text-center">
          <p className="text-sm text-graphite-soft">Ești meseriaș și n-ai încă un cont?</p>
          <Link
            to="/register"
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-graphite/15 bg-white/80 px-5 font-heading text-sm font-semibold text-graphite transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
          >
            Vino în echipa Superfix
          </Link>
        </div>
      </div>
    </div>
  );

  // === DASHBOARD EROU ===

  return (
    <div className="pb-8 font-sans text-graphite md:pb-20">
      <header className="mx-auto max-w-4xl px-5 pt-28 sm:px-6">
        {/* Cât timp `archived` e adevărat, profilul nu apare în nicio căutare —
            iar până acum nimic din sit nu i-o spunea. E primul lucru din portal,
            dinaintea oricărei misiuni, pentru că fără el nu vine nicio misiune. */}
        {hidden && (
          <Link
            to="/abonament"
            className="mb-4 flex items-center gap-3 rounded-[22px] border border-super-red/20 bg-super-red/8 p-4 transition-colors hover:bg-super-red/12"
          >
            <EyeSlash size={22} weight="duotone" className="shrink-0 text-super-red-dark" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-base leading-tight text-super-red-dark">
                Nu apari încă în căutări
              </span>
              <span className="mt-0.5 block text-sm leading-snug text-graphite-soft">
                Profilul e gata, dar listarea nu e activă. Apasă ca s-o pornești.
              </span>
            </span>
            <CaretRight size={18} weight="bold" className="shrink-0 text-super-red-dark" aria-hidden="true" />
          </Link>
        )}

        <div className="sf-glass rounded-[28px] p-6 sm:p-7">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-heading text-xs font-semibold uppercase tracking-[0.18em] text-super-red">
                Conectat la rețea
              </p>
              <h1 className="mt-2 truncate font-heading text-3xl font-bold text-graphite sm:text-4xl">
                Salut, {currentHero?.alias || 'eroule'}
              </h1>
            </div>

            <div className="flex shrink-0 gap-3">
              <div className="sf-clay rounded-2xl px-5 py-3 text-center">
                <div className="font-heading text-2xl font-bold leading-none text-graphite">
                  {currentHero?.trustFactor ?? 50}%
                </div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-graphite-soft">
                  Fix-o-metru
                </div>
              </div>
              <div className="sf-clay rounded-2xl px-5 py-3 text-center">
                <div className="font-heading text-2xl font-bold leading-none text-graphite">
                  {currentHero?.missionsCompleted ?? 0}
                </div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-graphite-soft">
                  Misiuni
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5 border-t border-graphite/10 pt-5">
            <Link to="/portal/profil" className="portal-link">
              <UserCircle size={17} weight="duotone" aria-hidden="true" />
              Datele mele
            </Link>
            <Link to="/cine-e-sub-costum" className="portal-link">
              <MaskHappy size={17} weight="duotone" aria-hidden="true" />
              Cine e sub costum
            </Link>
            {currentHero?.slug && (
              <Link to={`/hero/${currentHero.slug}`} className="portal-link">
                <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
                Vezi profilul public
              </Link>
            )}
            <button type="button" onClick={() => setShowInfoModal(true)} className="portal-link">
              <Info size={17} weight="duotone" aria-hidden="true" />
              Cum funcționează
            </button>
            <button
              type="button"
              onClick={() => { logoutUser(); setIsAuthenticated(false); }}
              className="portal-link portal-link--out"
            >
              <SignOut size={17} weight="bold" aria-hidden="true" />
              Deconectare
            </button>
          </div>
        </div>

        {/* mesajul de la cartierul general: se schimbă după cum e ziua */}
        <div className="mt-5 flex items-start gap-3 rounded-[22px] bg-white/55 p-5 backdrop-blur-md">
          <ChatCircleText size={22} weight="duotone" className="mt-0.5 shrink-0 text-spark" aria-hidden="true" />
          <p className="text-graphite-soft">
            {activeMissions.length > 0
              ? 'Ai cetățeni care așteaptă. Un răspuns rapid îți crește Fix-o-metrul.'
              : 'Liniște pe frecvențe. Profită de pauză și mai adaugă o poză în arsenal.'}
          </p>
        </div>

      </header>

      <main className="mx-auto max-w-4xl space-y-7 px-5 py-10 sm:px-6">
        {/* Scheletul e conturul cardului de misiune, nu un dreptunghi: acelasi
            colt, aceeasi bara rosie, aceleasi randuri. Cand vin datele, textul
            aterizeaza fix unde era desenul — pagina nu mai sare. */}
        {loading && (
          <SkeletonPage className="space-y-7">
            {[0, 1].map(i => (
              <article key={i} className="mission-card overflow-hidden rounded-[28px]">
                <div className="flex items-center justify-between gap-3 px-6 pt-6 md:px-7">
                  <Skel className="h-7 w-32" />
                  <Skel className="h-4 w-24" />
                </div>

                <div className="mx-6 mt-5 flex gap-4 md:mx-7">
                  <span className="w-1 shrink-0 rounded-full bg-super-red/25" aria-hidden="true" />
                  <div className="flex-1 space-y-2.5">
                    <Skel className="h-5 w-full" />
                    <Skel className="h-5 w-3/5" />
                  </div>
                </div>

                <Skel className="mx-6 mt-4 h-4 w-2/5 md:mx-7" />

                <div className="mx-6 mt-6 flex flex-wrap items-center gap-4 border-t border-graphite/10 pt-5 md:mx-7">
                  <Skel className="h-6 w-36" />
                  <Skel className="h-9 w-44 rounded-full" />
                </div>

                <Skel className="mx-6 mt-5 h-5 w-32 md:mx-7" />

                <div className="px-6 pb-6 pt-6 md:px-7">
                  <Skel className="h-12 w-full rounded-2xl" />
                </div>
              </article>
            ))}
          </SkeletonPage>
        )}

        {!loading && shown.length === 0 && (
          <div className="sf-glass rounded-[28px] p-12 text-center">
            <span className="sf-clay inline-flex h-16 w-16 items-center justify-center rounded-2xl text-graphite-soft">
              <Target size={30} weight="duotone" aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-heading text-2xl font-bold text-graphite">
              {searching ? 'Nimic pe frecvența asta' : 'Liniște deocamdată'}
            </h3>
            <p className="mt-2 text-graphite-soft">
              {searching
                ? 'Nicio misiune nu se potrivește cu ce ai căutat.'
                : 'Când îți intră o cerere, apare aici.'}
            </p>
            {/* Ieșirea din filtru trebuie să fie la un buton distanță: altfel omul
                crede că i-au dispărut misiunile. */}
            {(searching || chip !== 'ALL') && (
              <button
                type="button"
                onClick={() => { setQuery(''); setChip('ALL'); }}
                className="portal-link mt-6"
              >
                Arată toate misiunile
              </button>
            )}
          </div>
        )}

        {!loading && shown.map(mission => {
          const km = kmTo(mission);
          const leg = legs[mission.id];
          const closed = ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(mission.status);

          return (
            <article key={mission.id} className="mcard" data-status={mission.status}>
              {/* Toată partea de sus e un singur link. Pe telefon, o țintă cât
                  jumătate de card bate un „vezi misiunea" de 13px. */}
              <Link to={`/portal/misiune/${mission.id}`} state={{ mission }} className="mcard__face">
                <div className="mcard__head">
                  {/* Cât ai de mers și cât faci: astea două decid dacă iei
                      lucrarea. Dacă n-avem coordonate de la client, locul rămâne
                      gol — un „12 min" singur aici s-ar citi tot ca timp de mers,
                      deși ar fi vechimea cererii. */}
                  {km !== null && (
                    <div className="mcard__lead">
                      <span className="mcard__big">{showKm(km)}</span>
                      {leg && (
                        <span className={`mcard__small${leg.approx ? ' mcard__approx' : ''}`}>
                          {leg.approx ? '~' : ''}{leg.durationMin} min
                        </span>
                      )}
                    </div>
                  )}
                  <span className="mcard__state">
                    <span className="mcard__word">
                      <span className="mcard__pip" aria-hidden="true" />
                      {STATE_WORD[mission.status] || mission.status}
                    </span>
                    <span className="mcard__age">{sentAgo(mission.date)}</span>
                  </span>
                </div>

                {mission.address && <p className="mcard__addr">{mission.address}</p>}

                <div className="mcard__quote">
                  <span className="mcard__mark" aria-hidden="true">„</span>
                  <p className="mcard__words">{mission.description}</p>
                </div>
              </Link>

              <div className="mcard__who">
                <span className="mcard__disc" aria-hidden="true">{initials(mission.clientName)}</span>
                <span className="mcard__person">{mission.clientName}</span>
                <a href={`tel:${mission.clientPhone}`} className="mcard__tel">
                  <Phone size={15} weight="fill" aria-hidden="true" />
                  {mission.clientPhone}
                </a>
              </div>

              {/* Roșu = decide acum. Singura bară roșie din listă. */}
              {mission.status === 'PENDING' && (
                <>
                  <button
                    type="button"
                    className="mcard__bar"
                    onClick={() => handleStatusChange(mission.id, 'ACCEPTED')}
                  >
                    <span className="mcard__fill">
                      <span className="mcard__label">
                        <CheckCircle size={18} weight="fill" aria-hidden="true" />
                        Preiau misiunea
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mcard__refuse"
                    onClick={() => handleStatusChange(mission.id, 'REJECTED')}
                  >
                    Nu pot acum
                  </button>
                </>
              )}

              {/* Albastru = pornește. */}
              {mission.status === 'ACCEPTED' && (
                <button
                  type="button"
                  className="mcard__bar"
                  onClick={() => handleStatusChange(mission.id, 'IN_PROGRESS')}
                >
                  <span className="mcard__fill">
                    <span className="mcard__label">
                      <Camera size={19} weight="fill" aria-hidden="true" />
                      Am ajuns, încep lucrarea
                    </span>
                  </span>
                </button>
              )}

              {/* Verde = încheie. */}
              {mission.status === 'IN_PROGRESS' && (
                <button
                  type="button"
                  className="mcard__bar"
                  onClick={() => handleStatusChange(mission.id, 'COMPLETED')}
                >
                  <span className="mcard__fill">
                    <span className="mcard__label">
                      <Camera size={19} weight="fill" aria-hidden="true" />
                      Am terminat, poza finală
                    </span>
                  </span>
                </button>
              )}

              {/* Închisă: nu mai e nimic de apăsat, doar de citit. */}
              {closed && (
                <p className="mcard__done">
                  {mission.status === 'COMPLETED' && (
                    <CheckCircle size={15} weight="fill" aria-hidden="true" />
                  )}
                  {STATE_WORD[mission.status]} · {new Date(mission.date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })}
                </p>
              )}
            </article>
          );
        })}

        {/* Bara de jos: caută și filtrează, acolo unde ajunge degetul mare. */}
        {!loading && (
          <div className="portal-dock">
            <div className="portal-dock__inner">
              <div className="portal-search">
                <MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={'Caută: nume, adresă, „săptămâna trecută"…'}
                  aria-label="Caută în misiuni"
                />
                {query && (
                  <button
                    type="button"
                    className="portal-search__clear"
                    onClick={() => setQuery('')}
                    aria-label="Șterge căutarea"
                  >
                    <X size={16} weight="bold" />
                  </button>
                )}
                {/* Distanțele apar oricum, din start. Butonul face altceva:
                    aduce în față lucrările de lângă tine. */}
                <button
                  type="button"
                  className="portal-search__here"
                  data-on={nearestFirst ? 'true' : 'false'}
                  onClick={() => (here ? setNearestFirst(v => !v) : askHere())}
                  disabled={geo === 'asking'}
                  title={here ? 'Cele mai apropiate întâi' : 'Pornește locația ca să vezi distanțele'}
                  aria-label={here ? 'Cele mai apropiate întâi' : 'Pornește locația ca să vezi distanțele'}
                  aria-pressed={nearestFirst}
                >
                  <Crosshair size={18} weight={nearestFirst ? 'fill' : 'bold'} />
                </button>
              </div>

              {/* Ce a înțeles căutarea, scris pe față. Fără asta, o listă filtrată
                  pe „săptămâna trecută" pare că a pierdut misiuni fără motiv. */}
              {searching && (
                <div className="portal-read">
                  <span>Caut</span>
                  {understood.terms.map((term, i) => (
                    <span key={`${term}-${i}`} className="portal-read__chip">{term}</span>
                  ))}
                  {understood.when && <span className="portal-read__chip">{understood.when.label}</span>}
                  {understood.status && <span className="portal-read__chip">{understood.statusLabel}</span>}
                  <span>· {shown.length === 1 ? '1 rezultat' : `${shown.length} rezultate`}</span>
                </div>
              )}

              <div className="portal-chips" role="tablist" aria-label="Filtrează misiunile">
                {CHIPS.filter(c => c.key === 'ALL' || counts[c.key] > 0).map(c => (
                  <button
                    key={c.key}
                    type="button"
                    role="tab"
                    aria-selected={chip === c.key}
                    data-active={chip === c.key}
                    data-tone={c.tone}
                    className="portal-chip"
                    onClick={() => setChip(c.key)}
                  >
                    {c.label}
                    <span className="portal-chip__n">{counts[c.key]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {showCamera && (
        <CameraCapture
          onCapture={handlePhotoCapture}
          onClose={() => setShowCamera(false)}
          mode={cameraMode}
        />
      )}

      <Sheet
        open={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title="Cum funcționează"
        subtitle="Fix-o-metrul, punctele și de ce contează pozele."
      >
        <div className="space-y-6 pb-2">
          <section>
            <h3 className="font-heading text-lg font-semibold text-graphite">Fix-o-metrul</h3>
            <p className="mt-2 leading-relaxed text-graphite-soft">
              E reputația ta. Cu cât scorul e mai mare, cu atât apari mai sus în lista de eroi
              când clienții caută meseriași. Mai sus în listă înseamnă mai mulți clienți.
            </p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
              <h4 className="font-heading font-semibold text-emerald-900">Cum câștigi puncte</h4>
              <ul className="mt-3 space-y-1.5 text-sm text-emerald-900/80">
                <li><strong>+5</strong> misiune finalizată cu poze înainte și după</li>
                <li><strong>+2</strong> recenzie de cinci stele</li>
              </ul>
            </section>
            <section className="rounded-2xl bg-super-red/5 p-5 ring-1 ring-super-red/20">
              <h4 className="font-heading font-semibold text-super-red-dark">Cum pierzi puncte</h4>
              <ul className="mt-3 space-y-1.5 text-sm text-graphite-soft">
                <li><strong>-1</strong> refuzi o misiune alocată</li>
                <li><strong>-2</strong> recenzie de o stea</li>
              </ul>
            </section>
          </div>

          <section className="rounded-2xl bg-white/60 p-5">
            <h3 className="font-heading text-lg font-semibold text-graphite">De ce contează pozele</h3>
            <p className="mt-2 leading-relaxed text-graphite-soft">
              Nu sunt obligatorii, dar sunt dovada muncii tale. Fără ele, sistemul nu poate valida
              complet misiunea și Fix-o-metrul crește mai încet. Sunt și singurele poze care ajung
              în dosarul tău public, acolo unde le văd clienții următori.
            </p>
          </section>
        </div>
      </Sheet>
    </div>
  );
};
