import { Hero, ServiceRequest, Review } from '../types';
import { API_URL } from '../config/api';
import { CacheKey, cacheClear, cacheDrop, cacheGet, cacheSet, dedupe } from './cache';

// === AICI E SCHIMBAREA CRITICĂ ===
// Acum va citi link-ul din .env (https://super-fix.ro/api) când ești pe server,
// și va folosi localhost doar când lucrezi tu acasă.

const getAuthHeader = () => {
    const token = localStorage.getItem('superfix_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

/* Sesiunea sta in localStorage, care se citeste SINCRON. Paginile o pot afla la
   primul render, nu intr-un `useEffect` de dupa desenare — altfel portalul apuca
   sa afiseze o data ecranul de login unui om deja logat. */
export const hasHeroSession = (): boolean =>
    Boolean(localStorage.getItem('superfix_token')) &&
    localStorage.getItem('superfix_role') === 'HERO';

export const currentHeroId = (): string | null => localStorage.getItem('superfix_hero_id');

// === AUTH ===
export const loginUser = async (username: string, password: string) => {
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('superfix_token', data.token);
            localStorage.setItem('superfix_role', 'ADMIN');
            cacheClear(); // alt cont, alte date
            return true;
        }
        return false;
    } catch (e) { return false; }
};

export const logoutUser = () => {
    const token = localStorage.getItem('superfix_token');
    localStorage.removeItem('superfix_token');
    localStorage.removeItem('superfix_role');
    localStorage.removeItem('superfix_hero_id');
    cacheClear();
    if (token) {
        fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            keepalive: true,
        }).catch(() => undefined);
    }
};

export const loginHero = async (username: string, password: string) => {
    try {
        const res = await fetch(`${API_URL}/auth/hero-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('superfix_token', data.token);
            localStorage.setItem('superfix_role', 'HERO');
            cacheClear(); // alt cont, alte date
            return true;
        }
        return false;
    } catch (e) { return false; }
};
export const logout = logoutUser;

// === ADMIN: APPLICATIONS ===
export const getApplications = async () => {
    try {
        const res = await fetch(`${API_URL}/admin/applications`, { headers: getAuthHeader() });
        return res.ok ? await res.json() : [];
    } catch { return []; }
};

export const deleteApplication = async (id: string) => {
    try {
        const res = await fetch(`${API_URL}/admin/applications/${id}`, { 
            method: 'DELETE', headers: getAuthHeader() 
        });
        return res.ok;
    } catch { return false; }
};

// === ADMIN: HERO MANAGEMENT ===
export type SaveHeroResult = { ok: boolean; error?: string };

const readSaveHeroError = async (res: Response): Promise<string> => {
    const payload = await res.json().catch(() => ({}));
    return payload?.message || payload?.error || `Eroare HTTP ${res.status}`;
};

export const updateHero = async (id: string, data: Partial<Hero>): Promise<SaveHeroResult> => {
    try {
        const res = await fetch(`${API_URL}/heroes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(data)
        });
        if (res.ok) return { ok: true };
        return { ok: false, error: await readSaveHeroError(res) };
    } catch { return { ok: false, error: 'Eroare de conexiune.' }; }
};

export const deleteHero = async (id: string) => {
    try {
        const res = await fetch(`${API_URL}/heroes/${id}`, { 
            method: 'DELETE', headers: getAuthHeader() 
        });
        return res.ok;
    } catch { return false; }
};

// === DATA ===
export const getAllRequests = async (): Promise<ServiceRequest[]> => {
    try {
        const res = await fetch(`${API_URL}/request`, { headers: getAuthHeader() });
        return res.ok ? await res.json() : [];
    } catch { return []; }
};

export const getHeroes = (): Promise<Hero[]> => dedupe(CacheKey.heroes, async () => {
    try {
        const res = await fetch(`${API_URL}/heroes`);
        if (!res.ok) return cacheGet<Hero[]>(CacheKey.heroes) ?? [];
        return cacheSet(CacheKey.heroes, await res.json() as Hero[]);
    } catch { return cacheGet<Hero[]>(CacheKey.heroes) ?? []; }
});

/** Ce stim deja, fara sa asteptam reteaua. Pentru primul render. */
export const peekHeroes = (): Hero[] | undefined => cacheGet(CacheKey.heroes);

/* ATENȚIE la rută: `/heroes/:id` caută STRICT după id (UUID) și dă 404 pe slug.
   `/heroes/slug/:x` acceptă și slug, și id, și e singura care întoarce profilul
   complet, cu portofoliu și cu povestea de origine. Pentru pagini publice se
   folosește asta, nu cealaltă. */
export const getHeroBySlug = (slug: string): Promise<Hero | undefined> =>
  dedupe(CacheKey.heroBySlug(slug), async () => {
    try {
        const res = await fetch(`${API_URL}/heroes/slug/${encodeURIComponent(slug)}`);
        if (!res.ok) return undefined;
        return cacheSet(CacheKey.heroBySlug(slug), await res.json() as Hero);
    } catch { return cacheGet<Hero>(CacheKey.heroBySlug(slug)); }
  });

export const peekHeroBySlug = (slug: string): Hero | undefined =>
    cacheGet(CacheKey.heroBySlug(slug));

/** Doar cu id real (UUID), de ex. cel din tokenul eroului logat. */
export const getHeroById = (id: string): Promise<Hero | undefined> =>
  dedupe(CacheKey.heroById(id), async () => {
    try {
        const res = await fetch(`${API_URL}/heroes/${id}`);
        if (!res.ok) return cacheGet<Hero>(CacheKey.heroById(id));
        return cacheSet(CacheKey.heroById(id), await res.json() as Hero);
    } catch { return cacheGet<Hero>(CacheKey.heroById(id)); }
  });

export const peekHeroById = (id: string | null): Hero | undefined =>
    id ? cacheGet(CacheKey.heroById(id)) : undefined;

export const createServiceRequest = async (request: ServiceRequest): Promise<boolean> => {
    try {
        const res = await fetch(`${API_URL}/request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(request.clientNonce || request.id ? { 'Idempotency-Key': String(request.clientNonce || request.id) } : {}),
            },
            body: JSON.stringify(request)
        });
        return res.ok;
    } catch { return false; }
};

export const createHero = async (hero: Hero): Promise<SaveHeroResult> => {
    try {
        const res = await fetch(`${API_URL}/heroes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(hero)
        });
        if (res.ok) return { ok: true };
        return { ok: false, error: await readSaveHeroError(res) };
    } catch { return { ok: false, error: 'Eroare de conexiune.' }; }
};

// DASHBOARD
export const getMyMissions = (): Promise<ServiceRequest[]> => dedupe(CacheKey.missions, async () => {
    try {
        const res = await fetch(`${API_URL}/hero/my-missions`, { headers: getAuthHeader() });
        // Cade reteaua: pastram ce aveam. Inainte se intorcea [], adica portalul
        // se golea si scria "Nicio urgenta" unui erou care avea misiuni.
        if (!res.ok) return cacheGet<ServiceRequest[]>(CacheKey.missions) ?? [];
        return cacheSet(CacheKey.missions, await res.json() as ServiceRequest[]);
    } catch { return cacheGet<ServiceRequest[]>(CacheKey.missions) ?? []; }
});

export const peekMyMissions = (): ServiceRequest[] | undefined => cacheGet(CacheKey.missions);

export const peekMission = (id?: string): ServiceRequest | undefined =>
    id ? peekMyMissions()?.find(m => m.id === id) : undefined;

export const updateMissionStatus = async (id: string, status: string, photo: string | null) => {
    try {
        const res = await fetch(`${API_URL}/missions/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ status, photo })
        });
        if (res.ok) cacheDrop(CacheKey.missions); // s-a schimbat ceva: nu mai servim vechiul
        return res.ok;
    } catch { return false; }
};

export const addReview = async (heroId: string, review: any) => {
    try {
        const res = await fetch(`${API_URL}/reviews`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ heroId, ...review })
        });
        return res.ok;
    } catch { return false; }
};

/* === "CINE E SUB COSTUM" ===
   Un singur endpoint, două căi de intrare: eroul logat (Bearer din localStorage)
   sau eroul venit din butonul de email (?token=). A doua e cea importantă:
   fără ea, omul ar trebui să se logheze ca să-și scrie povestea, și n-o mai face. */

export interface OriginDraft {
  alias?: string;
  slug?: string;
  yearsActive?: number | null;
  originStory?: string;
  hardestMission?: string;
  neverDoes?: string;
  favoriteTool?: string;
  team?: string;
  petPeeve?: string;
  arsenal?: string[];
  proudMissionId?: string | null;
  missions?: { id: string; title?: string; beforeUrl?: string; afterUrl?: string }[];
}

export const getOriginDraft = (token?: string | null): Promise<OriginDraft | null> =>
  dedupe(CacheKey.origin(token), async () => {
    try {
      const url = token
        ? `${API_URL}/hero/origin?token=${encodeURIComponent(token)}`
        : `${API_URL}/hero/origin`;
      const res = await fetch(url, { headers: { ...(token ? {} : getAuthHeader()) } });
      if (!res.ok) return null;
      return cacheSet(CacheKey.origin(token), await res.json() as OriginDraft);
    } catch { return cacheGet<OriginDraft>(CacheKey.origin(token)) ?? null; }
  });

export const peekOriginDraft = (token?: string | null): OriginDraft | undefined =>
  cacheGet(CacheKey.origin(token));

export interface SaveResult {
  ok: boolean;
  /** mesajul serverului, deja în română; folosit ca atare în notificare */
  message?: string;
}

const readMessage = async (res: Response): Promise<string | undefined> => {
  try {
    const body = await res.json();
    return typeof body?.message === 'string' ? body.message : undefined;
  } catch { return undefined; }
};

export const saveOriginDraft = async (
  data: Partial<OriginDraft>,
  token?: string | null,
): Promise<SaveResult> => {
  try {
    const res = await fetch(`${API_URL}/hero/origin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? {} : getAuthHeader()) },
      body: JSON.stringify(token ? { ...data, token } : data),
    });
    if (res.ok) cacheDrop(CacheKey.origin(token)); // ce am salvat inlocuieste ce stiam
    return res.ok ? { ok: true } : { ok: false, message: await readMessage(res) };
  } catch { return { ok: false }; }
};

/* === DATELE DE BAZĂ ALE EROULUI ===
   Se salvează direct: nu există coadă de aprobare. Serverul validează pe loc
   și întoarce mesaje gata scrise în română când ceva nu e bun. */

export interface HeroBasics {
  alias?: string;
  description?: string;
  hourlyRate?: number;
  actionAreas?: string[];
  avatarUrl?: string;
  videoUrl?: string;
}

export const getMyBasics = (): Promise<{ current: HeroBasics } | null> =>
  dedupe(CacheKey.basics, async () => {
    try {
      const res = await fetch(`${API_URL}/hero/basics`, { headers: { ...getAuthHeader() } });
      if (!res.ok) return null;
      return cacheSet(CacheKey.basics, await res.json() as { current: HeroBasics });
    } catch { return cacheGet<{ current: HeroBasics }>(CacheKey.basics) ?? null; }
  });

export const peekMyBasics = (): { current: HeroBasics } | undefined => cacheGet(CacheKey.basics);

export const submitBasicsUpdate = async (data: HeroBasics): Promise<SaveResult> => {
  try {
    const res = await fetch(`${API_URL}/hero/basics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      // datele de baza se vad si pe profilul public: si ala trebuie recitit
      cacheDrop(CacheKey.basics);
      cacheDrop('hero');
    }
    return res.ok ? { ok: true } : { ok: false, message: await readMessage(res) };
  } catch { return { ok: false }; }
};
