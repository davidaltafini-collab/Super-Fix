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

// === TOKENUL DE DISPOZITIV (cont fantomă) ===
const DEVICE_TOKEN_KEY = 'superfix_device_token';

export const getDeviceToken = (): string | null => {
    try { return localStorage.getItem(DEVICE_TOKEN_KEY); } catch { return null; }
};

export const setDeviceToken = (token: string) => {
    try { localStorage.setItem(DEVICE_TOKEN_KEY, token); } catch { /* ignore */ }
};

export const clearDeviceToken = () => {
    try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }
};

const getDeviceHeader = () => {
    const token = getDeviceToken();
    return token ? { 'X-Device-Token': token } : {};
};

/* O singură dată per dispozitiv: dacă exista deja un token local, nu mai
   lovește reteaua. Nu aruncă niciodată — un `null` aici nu are voie să
   blocheze restul sitului (CONT-FANTOMA.md, Pasul 2). */
export const ensureDeviceToken = async (): Promise<string | null> => {
    const existing = getDeviceToken();
    if (existing) return existing;
    try {
        const res = await fetch(`${API_URL}/device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getDeviceHeader() },
            body: JSON.stringify({ platform: 'web' }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (typeof data?.token !== 'string') return null;
        setDeviceToken(data.token);
        return data.token;
    } catch { return null; }
};

/* Sesiunea sta in localStorage, care se citeste SINCRON. Paginile o pot afla la
   primul render, nu intr-un `useEffect` de dupa desenare — altfel portalul apuca
   sa afiseze o data ecranul de login unui om deja logat. */
export const hasHeroSession = (): boolean =>
    Boolean(localStorage.getItem('superfix_token')) &&
    localStorage.getItem('superfix_role') === 'HERO';

export const currentHeroId = (): string | null => localStorage.getItem('superfix_hero_id');

// === AUTH ===
/* Formă plată, ca `SaveHeroResult` — nu uniune discriminată: proiectul rulează
   cu `strictNullChecks` oprit, unde TS nu restrânge fiabil `ok:true`/`ok:false`
   la două forme diferite (confirmat: `if (result.ok) return; result.error`
   rămâne eroare de tip chiar și izolat, cu acest tsconfig). */
export type LoginResult = {
    ok: boolean;
    totpEnabled?: boolean;
    totpSetupRequired?: boolean;
    adminRole?: string;
    status?: number;
    error?: string;
    message?: string;
};

/* Al doilea factor (CONT-FANTOMA.md §10): `totpCode` lipsă la prima încercare,
   completat la a doua, după ce serverul cere `TOTP_REQUIRED`. Corpul de răspuns
   nu mai e aruncat — `Admin.tsx` are nevoie de `totpSetupRequired` ca să știe
   dacă duce omul pe ecranul de înrolare în loc de panou. */
export const loginUser = async (username: string, password: string, totpCode?: string): Promise<LoginResult> => {
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(totpCode ? { username, password, totpCode } : { username, password })
        });
        const data = await res.json().catch(() => ({} as any));
        if (res.ok) {
            localStorage.setItem('superfix_token', data.token);
            localStorage.setItem('superfix_role', 'ADMIN');
            if (typeof data.adminRole === 'string') localStorage.setItem('superfix_admin_role', data.adminRole);
            else localStorage.removeItem('superfix_admin_role');
            cacheClear(); // alt cont, alte date
            return {
                ok: true,
                totpEnabled: !!data.totpEnabled,
                totpSetupRequired: !!data.totpSetupRequired,
                adminRole: typeof data.adminRole === 'string' ? data.adminRole : undefined,
            };
        }
        return {
            ok: false,
            status: res.status,
            error: typeof data?.error === 'string' ? data.error : undefined,
            message: typeof data?.message === 'string' ? data.message : undefined,
        };
    } catch (e) { return { ok: false }; }
};

export const logoutUser = () => {
    const token = localStorage.getItem('superfix_token');
    localStorage.removeItem('superfix_token');
    localStorage.removeItem('superfix_role');
    localStorage.removeItem('superfix_hero_id');
    localStorage.removeItem('superfix_admin_role');
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

/* === ADMIN: CONTURILE DE ADMIN (trepte SUPER/ADMIN/SUPPORT) ===
   Contract complet în server/admins.ts — rutele verifică deja SUPER pe server,
   aici doar le apelăm. `password`/`password_confirm` din funcțiile de mai jos
   e mereu parola CELUI CARE APASĂ (identitate, nu o repetare a parolei
   contului țintă) — serverul o cere ca să nu poată oricine, de la un laptop
   deschis, să creeze/modifice conturi de admin. */

export interface AdminRoleInfo { label: string; description: string; }

export interface AdminAccount {
    id: string;
    username: string;
    role: 'SUPER' | 'ADMIN' | 'SUPPORT';
    totpEnabled: boolean;
    disabled: boolean;
    createdAt: string;
    lastLoginAt: string | null;
}

const isSessionFatal = (error: unknown) => error === 'SESSION_INVALID' || error === 'ADMIN_DISABLED';

export interface AdminMeResult {
    ok: boolean;
    forceLogout?: boolean;
    adminId?: string;
    adminUsername?: string;
    adminRole?: string;
    totpEnabled?: boolean;
    totpRequired?: boolean;
    roles?: Record<string, AdminRoleInfo>;
    error?: string;
    message?: string;
}

/* Se cheamă la fiecare pornire a panoului cu o sesiune deja în localStorage
   (unde loginUser nu s-a rulat acum) — panoul altfel nu știe treapta. Pe
   sesiune moartă sau cont suspendat, `forceLogout` spune apelantului să
   delogheze, nu doar să arate un ecran stricat. */
export const getAdminMe = async (): Promise<AdminMeResult> => {
    try {
        const res = await fetch(`${API_URL}/admin/me`, { headers: getAuthHeader() });
        const data = await res.json().catch(() => ({} as any));
        if (res.ok) {
            return {
                ok: true,
                adminId: typeof data.id === 'string' ? data.id : undefined,
                adminUsername: typeof data.username === 'string' ? data.username : undefined,
                adminRole: typeof data.role === 'string' ? data.role : undefined,
                totpEnabled: !!data.totpEnabled,
                totpRequired: !!data.totpRequired,
                roles: data.roles,
            };
        }
        return {
            ok: false,
            forceLogout: isSessionFatal(data?.error),
            error: typeof data?.error === 'string' ? data.error : undefined,
            message: typeof data?.message === 'string' ? data.message : undefined,
        };
    } catch { return { ok: false }; }
};

export interface AdminListResult {
    ok: boolean;
    admins?: AdminAccount[];
    roles?: Record<string, AdminRoleInfo>;
    forceLogout?: boolean;
    error?: string;
    message?: string;
}

export const listAdmins = async (): Promise<AdminListResult> => {
    try {
        const res = await fetch(`${API_URL}/admin/admins`, { headers: getAuthHeader() });
        const data = await res.json().catch(() => ({} as any));
        if (res.ok) return { ok: true, admins: data.admins, roles: data.roles };
        return {
            ok: false,
            forceLogout: isSessionFatal(data?.error),
            error: typeof data?.error === 'string' ? data.error : undefined,
            message: typeof data?.message === 'string' ? data.message : undefined,
        };
    } catch { return { ok: false }; }
};

export interface AdminMutationResult {
    ok: boolean;
    admin?: AdminAccount;
    forceLogout?: boolean;
    error?: string;
    message?: string;
    fields?: Record<string, string[] | undefined>;
}

export const createAdmin = async (input: {
    username: string;
    password: string;
    role: 'ADMIN' | 'SUPPORT';
    password_confirm: string; // parola celui care apasă, nu a contului nou
}): Promise<AdminMutationResult> => {
    try {
        const res = await fetch(`${API_URL}/admin/admins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(input),
        });
        const data = await res.json().catch(() => ({} as any));
        if (res.ok) return { ok: true, admin: data as AdminAccount };
        return {
            ok: false,
            forceLogout: isSessionFatal(data?.error),
            error: typeof data?.error === 'string' ? data.error : undefined,
            message: typeof data?.message === 'string' ? data.message : undefined,
            fields: data?.fields,
        };
    } catch { return { ok: false }; }
};

export const patchAdmin = async (
    id: string,
    changes: { role?: 'SUPER' | 'ADMIN' | 'SUPPORT'; disabled?: boolean },
): Promise<AdminMutationResult> => {
    try {
        const res = await fetch(`${API_URL}/admin/admins/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(changes),
        });
        const data = await res.json().catch(() => ({} as any));
        if (res.ok) return { ok: true, admin: data as AdminAccount };
        return {
            ok: false,
            forceLogout: isSessionFatal(data?.error),
            error: typeof data?.error === 'string' ? data.error : undefined,
            message: typeof data?.message === 'string' ? data.message : undefined,
        };
    } catch { return { ok: false }; }
};

export interface AdminSimpleResult { ok: boolean; forceLogout?: boolean; error?: string; message?: string; }

export const resetAdminTotp = async (id: string, password: string): Promise<AdminSimpleResult> => {
    try {
        const res = await fetch(`${API_URL}/admin/admins/${encodeURIComponent(id)}/reset-totp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ password }),
        });
        const data = await res.json().catch(() => ({} as any));
        if (res.ok) return { ok: true };
        return {
            ok: false,
            forceLogout: isSessionFatal(data?.error),
            error: typeof data?.error === 'string' ? data.error : undefined,
            message: typeof data?.message === 'string' ? data.message : undefined,
        };
    } catch { return { ok: false }; }
};

export const setAdminPassword = async (id: string, password: string, newPassword: string): Promise<AdminSimpleResult> => {
    try {
        const res = await fetch(`${API_URL}/admin/admins/${encodeURIComponent(id)}/password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ password, newPassword }),
        });
        const data = await res.json().catch(() => ({} as any));
        if (res.ok) return { ok: true };
        return {
            ok: false,
            forceLogout: isSessionFatal(data?.error),
            error: typeof data?.error === 'string' ? data.error : undefined,
            message: typeof data?.message === 'string' ? data.message : undefined,
        };
    } catch { return { ok: false }; }
};

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
                ...getDeviceHeader(),
                ...(request.clientNonce || request.id ? { 'Idempotency-Key': String(request.clientNonce || request.id) } : {}),
            },
            body: JSON.stringify(request)
        });
        return res.ok;
    } catch { return false; }
};

/* Numărul se cere abia la apăsarea butonului „Sună acum" (CONT-FANTOMA.md §7),
   niciodată la încărcarea listei/paginii — de-asta e o funcție separată, nu
   parte din `getHeroBySlug`/`getHeroById`. Formă plată (nu uniune
   discriminată) ca `SaveHeroResult`/`SaveResult` de mai jos: proiectul are
   `strictNullChecks` oprit, unde TS nu restrânge fiabil o uniune pe `ok`. */
export type HeroPhoneResult = { ok: boolean; phone?: string; error?: string; message?: string; canClaimAccount?: boolean };

export const getHeroPhone = async (id: string): Promise<HeroPhoneResult> => {
    try {
        const res = await fetch(`${API_URL}/heroes/${id}/phone`, {
            headers: { ...getAuthHeader(), ...getDeviceHeader() },
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && typeof body?.phone === 'string') return { ok: true, phone: body.phone };
        return {
            ok: false,
            error: typeof body?.error === 'string' ? body.error : undefined,
            message: typeof body?.message === 'string' ? body.message : undefined,
            canClaimAccount: body?.canClaimAccount === true,
        };
    } catch { return { ok: false }; }
};

// === LOGIN CLIENT: Google / Apple / cod pe email (CONT-FANTOMA.md §6) ===
/* Server-ul poate cere telefonul (409 PHONE_REQUIRED) când identitatea nu
   nimerește niciun cont existent — nu e o poartă înaintea cererii, ci ultimul
   pas al unei conectări pe care omul a ales-o (identity.ts). */
export type ClientAuthResult = {
    ok: boolean;
    status?: number;
    error?: string;
    message?: string;
    client?: { id: string; name: string; email: string | null; phone: string | null };
};

const applyClientSession = (data: any) => {
    localStorage.setItem('superfix_token', data.token);
    localStorage.setItem('superfix_role', 'CLIENT');
    cacheClear();
};

const readClientAuthResponse = async (res: Response): Promise<ClientAuthResult> => {
    const data = await res.json().catch(() => ({} as any));
    if (res.ok) {
        applyClientSession(data);
        return { ok: true, client: data.client };
    }
    return {
        ok: false,
        status: res.status,
        error: typeof data?.error === 'string' ? data.error : undefined,
        message: typeof data?.message === 'string' ? data.message : undefined,
    };
};

export const requestEmailCode = async (email: string): Promise<{ ok: boolean; message?: string }> => {
    try {
        const res = await fetch(`${API_URL}/auth/email-code/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        if (res.ok) return { ok: true };
        const data = await res.json().catch(() => ({} as any));
        return { ok: false, message: typeof data?.message === 'string' ? data.message : undefined };
    } catch { return { ok: false }; }
};

export const verifyEmailCode = async (email: string, code: string, phone?: string): Promise<ClientAuthResult> => {
    try {
        const res = await fetch(`${API_URL}/auth/email-code/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getDeviceHeader() },
            body: JSON.stringify(phone ? { email, code, phone } : { email, code }),
        });
        return await readClientAuthResponse(res);
    } catch { return { ok: false }; }
};

export const loginWithGoogle = async (idToken: string, phone?: string): Promise<ClientAuthResult> => {
    try {
        const res = await fetch(`${API_URL}/auth/oauth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getDeviceHeader() },
            body: JSON.stringify(phone ? { idToken, phone } : { idToken }),
        });
        return await readClientAuthResponse(res);
    } catch { return { ok: false }; }
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

export const updateMissionStatus = async (
    id: string,
    status: string,
    photo: string | null,
    portfolioConsent?: boolean,
) => {
    try {
        const body: Record<string, unknown> = { status, photo };
        if (status === 'COMPLETED' && portfolioConsent) {
            body.publishToPortfolio = true;
            body.portfolioConsentAt = new Date().toISOString();
        }
        const res = await fetch(`${API_URL}/missions/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            cacheDrop(CacheKey.missions); // s-a schimbat ceva: nu mai servim vechiul
            if (status === 'COMPLETED' && portfolioConsent) cacheDrop(CacheKey.myPortfolio);
        }
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

/* === PORTOFOLIUL PUBLIC ===
   Eroul își vede toate lucrările trimise spre portofoliu (orice stare) și poate
   ascunde din vitrina publică pe oricare dintre ele. Publicarea unei lucrări noi
   se întâmplă la finalizarea misiunii (vezi `updateMissionStatus`), cu
   consimțământ explicit — nu există o cale de a republica retroactiv o misiune
   veche, deja finalizată fără consimțământ. */

export interface MyPortfolioItem {
  id: string;
  missionId?: string | null;
  beforeUrl: string;
  afterUrl: string;
  title?: string | null;
  category?: string | null;
  completedAt?: string | null;
  reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REMOVED';
  reviewReason?: string | null;
  createdAt: string;
}

export const getMyPortfolio = (): Promise<MyPortfolioItem[]> =>
  dedupe(CacheKey.myPortfolio, async () => {
    try {
      const res = await fetch(`${API_URL}/hero/portfolio`, { headers: getAuthHeader() });
      if (!res.ok) return cacheGet<MyPortfolioItem[]>(CacheKey.myPortfolio) ?? [];
      return cacheSet(CacheKey.myPortfolio, await res.json() as MyPortfolioItem[]);
    } catch { return cacheGet<MyPortfolioItem[]>(CacheKey.myPortfolio) ?? []; }
  });

export const peekMyPortfolio = (): MyPortfolioItem[] | undefined => cacheGet(CacheKey.myPortfolio);

export const retractPortfolioItem = async (id: string): Promise<boolean> => {
  try {
    const res = await fetch(`${API_URL}/hero/portfolio/${id}/retract`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    if (res.ok) { cacheDrop(CacheKey.myPortfolio); cacheDrop('hero'); }
    return res.ok;
  } catch { return false; }
};

/* Publică o misiune deja finalizată. Acoperă și lucrările vechi (fără item de
   portofoliu), și pe cele retrase anterior de erou. Serverul cere ca misiunea
   să aibă AMBELE poze — de aceea întoarcem motivul, nu doar un bool: „nu merge"
   fără explicație e exact ce nu poate omul repara. */
export const publishPortfolioItem = async (
  missionId: string,
): Promise<{ ok: true; item: MyPortfolioItem } | { ok: false; reason: string }> => {
  try {
    const res = await fetch(`${API_URL}/hero/portfolio/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ missionId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = body?.error === 'PHOTOS_MISSING'
        ? 'Lucrarea n-are și poza de dinainte, și pe cea de după. Fără amândouă nu se poate publica.'
        : body?.message || 'Nu s-a putut publica. Mai încearcă o dată.';
      return { ok: false, reason };
    }
    cacheDrop(CacheKey.myPortfolio); cacheDrop('hero');
    return { ok: true, item: body.item as MyPortfolioItem };
  } catch {
    return { ok: false, reason: 'Nu s-a putut publica. Verifică internetul și mai încearcă.' };
  }
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
