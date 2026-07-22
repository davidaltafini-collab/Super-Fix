import { Hero, ServiceRequest, Review } from '../types';
import { API_URL } from '../config/api';

// === AICI E SCHIMBAREA CRITICĂ ===
// Acum va citi link-ul din .env (https://super-fix.ro/api) când ești pe server,
// și va folosi localhost doar când lucrezi tu acasă.

const getAuthHeader = () => {
    const token = localStorage.getItem('superfix_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

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
            return true;
        }
        return false;
    } catch (e) { return false; }
};

export const logoutUser = () => {
    const token = localStorage.getItem('superfix_token');
    localStorage.removeItem('superfix_token');
    localStorage.removeItem('superfix_role');
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
export const updateHero = async (id: string, data: Partial<Hero>) => {
    try {
        const res = await fetch(`${API_URL}/heroes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(data)
        });
        return res.ok;
    } catch { return false; }
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

export const getHeroes = async (): Promise<Hero[]> => {
    try {
        const res = await fetch(`${API_URL}/heroes`);
        return res.ok ? await res.json() : [];
    } catch { return []; }
};

export const getHeroById = async (id: string): Promise<Hero | undefined> => {
    try {
        const res = await fetch(`${API_URL}/heroes/${id}`);
        return res.ok ? await res.json() : undefined;
    } catch { return undefined; }
};

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

export const createHero = async (hero: Hero): Promise<boolean> => {
    try {
        const res = await fetch(`${API_URL}/heroes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(hero)
        });
        return res.ok;
    } catch { return false; }
};

// DASHBOARD
export const getMyMissions = async (): Promise<ServiceRequest[]> => {
    try {
        const res = await fetch(`${API_URL}/hero/my-missions`, { headers: getAuthHeader() });
        return res.ok ? await res.json() : [];
    } catch { return []; }
};

export const updateMissionStatus = async (id: string, status: string, photo: string | null) => {
    try {
        const res = await fetch(`${API_URL}/missions/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ status, photo })
        });
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
