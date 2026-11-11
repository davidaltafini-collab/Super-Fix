import React, { useCallback, useEffect, useState } from 'react';
import { ArrowsClockwise, Check, Gift, Plus, Ticket, WarningCircle } from '@phosphor-icons/react';
import { API_URL } from '../config/api';
import { BillingMonth, capitalize, dayLabel, jobsLabel, leiLabel, monthLabel, MonthStatus } from '../services/subscription';

class AdminBillingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('superfix_token');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw new AdminBillingError(0, 'Serverul nu răspunde. Verifică internetul și încearcă din nou.');
  }
  if (response.ok) return response.json() as Promise<T>;
  const data = await response.json().catch(() => ({}));
  const message = response.status === 401
    ? 'Sesiunea de administrator a expirat.'
    : data?.message || data?.error || 'Cererea nu a putut fi executată.';
  throw new AdminBillingError(response.status, message);
}

type AdminMonth = BillingMonth & {
  id: string;
  status: MonthStatus;
  billingAccount: { heroId: string; exempt: boolean; hero: { alias: string; slug: string } };
};

type PromoCode = {
  id: string;
  code: string;
  description?: string | null;
  freeMonths: number;
  maxUses?: number | null;
  active: boolean;
  expiresAt?: string | null;
  uses?: number;
  _count?: { redemptions?: number };
};

type GrowthSettings = {
  referralThreshold: number;
  inviteeFreeMonths: number;
  inviterRewardMonths: number;
  inviterRewardMax: number;
  recruiterFreeMonths: number;
  recruiterCommissionBps: number;
  recruiterPaidInvoiceLimit: number;
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const MONTH_STATUS: Record<MonthStatus, { word: string; tone: string }> = {
  NOTHING_DUE: { word: '0 lei', tone: 'off' },
  DUE: { word: 'De plată', tone: 'wait' },
  PAID: { word: 'Plătită', tone: 'live' },
  FAILED: { word: 'Eșuată', tone: 'stop' },
  REVERSED: { word: 'Stornată', tone: 'stop' },
  WAIVED: { word: 'Iertată', tone: 'info' },
};

const WAIVABLE = new Set<MonthStatus>(['DUE', 'FAILED', 'REVERSED']);

export function AdminBillingPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [month, setMonth] = useState(currentMonth);
  const [status, setStatus] = useState('');
  const [months, setMonths] = useState<AdminMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState<string | null>(null);

  const fail = useCallback((reason: unknown) => {
    if (reason instanceof AdminBillingError && reason.status === 401) onSessionExpired();
    setError(reason instanceof Error ? reason.message : 'Ceva n-a mers. Încearcă din nou.');
  }, [onSessionExpired]);

  const loadMonths = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (month) query.set('month', month);
      if (status) query.set('status', status);
      const data = await adminRequest<{ months: AdminMonth[] }>(`/admin/billing/months?${query}`);
      setMonths(Array.isArray(data.months) ? data.months : []);
    } catch (reason) { fail(reason); }
    finally { setLoading(false); }
  }, [fail, month, status]);

  useEffect(() => { void loadMonths(); }, [loadMonths]);

  const waive = async (item: AdminMonth) => {
    const note = window.prompt(`De ce iertăm ${monthLabel(item.month)} pentru ${item.billingAccount.hero.alias}? (minimum 3 caractere)`)?.trim() || '';
    if (note.length < 3) { setError('Iertarea unei luni cere o notă de minimum 3 caractere.'); return; }
    setAction(`waive:${item.id}`);
    setError('');
    try {
      await adminRequest(`/admin/billing/months/${encodeURIComponent(item.id)}/waive`, { method: 'POST', body: JSON.stringify({ note }) });
      await loadMonths();
    } catch (reason) { fail(reason); }
    finally { setAction(null); }
  };

  return (
    <section className="mt-5 space-y-5" aria-labelledby="billing-months-title">
      <div className="adm-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="billing-months-title" className="font-heading text-lg text-graphite">Luni facturate</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-graphite-soft">Lucrările închise, sumele și restanțele meseriașilor.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_12rem_auto]">
            <div><label htmlFor="billing-month" className="adm-label">Luna</label><input id="billing-month" type="month" className="adm-input" value={month} onChange={event => setMonth(event.target.value)} /></div>
            <div><label htmlFor="billing-status" className="adm-label">Starea</label><select id="billing-status" className="adm-input" value={status} onChange={event => setStatus(event.target.value)}><option value="">Toate stările</option>{Object.entries(MONTH_STATUS).map(([key, item]) => <option key={key} value={key}>{item.word}</option>)}</select></div>
            <button type="button" className="adm-btn adm-btn--quiet" onClick={() => void loadMonths()} disabled={loading}><ArrowsClockwise size={15} weight="bold" aria-hidden="true" />{loading ? 'Se încarcă…' : 'Reîmprospătează'}</button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-2xl bg-super-red/8 p-3 text-sm font-semibold text-super-red-dark" role="alert">{error}</p>}

        <div className="adm-scroll mt-5">
          <table className="adm-table">
            <thead><tr><th>Meseriaș</th><th>Luna</th><th>Lucrări</th><th>Echipă</th><th className="text-right">Sumă</th><th>Stare</th><th className="text-right">Acțiune</th></tr></thead>
            <tbody>
              {months.map(item => {
                const state = MONTH_STATUS[item.status] || { word: item.status, tone: 'off' };
                return <tr key={item.id}>
                  <td><strong className="text-graphite">{item.billingAccount.hero.alias}</strong>{item.billingAccount.exempt && <span className="ml-2 text-xs text-graphite-soft">bilet de aur</span>}</td>
                  <td className="whitespace-nowrap">{capitalize(monthLabel(item.month))}</td>
                  <td>{jobsLabel(item.jobs + item.freeJobs)}</td>
                  <td>{item.teamMembers ? `${item.teamMembers} · ${leiLabel(item.teamBani)}` : '—'}</td>
                  <td className="adm-num text-right font-bold text-graphite">{leiLabel(item.totalBani)}</td>
                  <td><span className="adm-state" data-tone={state.tone}>{state.word}</span></td>
                  <td className="text-right">{WAIVABLE.has(item.status) ? <button type="button" className="adm-btn adm-btn--quiet" disabled={!!action} onClick={() => void waive(item)}>{action === `waive:${item.id}` ? 'Se iartă…' : 'Iartă luna'}</button> : '—'}</td>
                </tr>;
              })}
            </tbody>
          </table>
          {!loading && months.length === 0 && <p className="p-8 text-center text-sm text-graphite-soft">Nicio lună nu corespunde filtrelor.</p>}
        </div>
      </div>

    </section>
  );
}

/* Starea unui cod cum o simte meseriașul care îl scrie: oprit, expirat sau epuizat = „Cod invalid”. */
const promoState = (code: PromoCode, now = new Date()): { word: string; tone: string } => {
  if (!code.active) return { word: 'Oprit', tone: 'off' };
  if (code.expiresAt && new Date(code.expiresAt) <= now) return { word: 'Expirat', tone: 'off' };
  if (code.maxUses != null && promoUses(code) >= code.maxUses) return { word: 'Epuizat', tone: 'wait' };
  return { word: 'Activ', tone: 'live' };
};

const promoUses = (code: PromoCode) => code.uses ?? code._count?.redemptions ?? 0;

const monthsLabel = (count: number) => (count === 1 ? 'o lună gratuită' : `${count} luni gratuite`);

const PROMO_ERRORS: Record<string, string> = {
  PROMO_EXISTS: 'Există deja un cod cu numele ăsta. Alege altul.',
  EXPIRY_MUST_BE_FUTURE: 'Data de expirare trebuie să fie în viitor.',
  VALIDATION_ERROR: 'Codul are între 3 și 50 de caractere.',
  NOT_FOUND: 'Codul era deja oprit.',
};

/* Tot ce dă luni gratuite: codurile promo ale echipei (fără comision pentru nimeni) și regulile invitațiilor și ale recruiterilor. */
export function AdminCodesPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [promo, setPromo] = useState({ code: '', description: '', freeMonths: '6', maxUses: '', expiresAt: '' });
  const [settings, setSettings] = useState<GrowthSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<string | null>(null);

  const fail = useCallback((reason: unknown) => {
    if (reason instanceof AdminBillingError && reason.status === 401) onSessionExpired();
    const message = reason instanceof Error ? reason.message : '';
    setError(PROMO_ERRORS[message] || message || 'Ceva n-a mers. Încearcă din nou.');
  }, [onSessionExpired]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [codes, growth] = await Promise.all([
        adminRequest<PromoCode[]>('/admin/promo-codes'),
        adminRequest<GrowthSettings>('/admin/growth/settings'),
      ]);
      setPromos(Array.isArray(codes) ? codes : []);
      setSettings(growth);
    } catch (reason) { fail(reason); }
    finally { setLoading(false); }
  }, [fail]);

  useEffect(() => { void load(); }, [load]);

  const createPromo = async (event: React.FormEvent) => {
    event.preventDefault();
    setAction('promo');
    setError('');
    setNotice('');
    try {
      const created = await adminRequest<PromoCode>('/admin/promo-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: promo.code.trim().toUpperCase(),
          description: promo.description.trim() || undefined,
          freeMonths: Number(promo.freeMonths) || 6,
          maxUses: promo.maxUses ? Number(promo.maxUses) : undefined,
          // Ziua aleasă e ultima în care merge: expiră la miezul nopții de după ea, ora României.
          expiresAt: promo.expiresAt ? new Date(`${promo.expiresAt}T23:59:59`).toISOString() : undefined,
        }),
      });
      setPromo({ code: '', description: '', freeMonths: '6', maxUses: '', expiresAt: '' });
      setNotice(`Codul ${created.code} e gata: ${monthsLabel(created.freeMonths)}.`);
      await load();
    } catch (reason) { fail(reason); }
    finally { setAction(null); }
  };

  const stopPromo = async (code: PromoCode) => {
    if (!window.confirm(`Oprești codul ${code.code}? Cine l-a folosit deja își păstrează lunile; de acum nu mai merge.`)) return;
    setAction(`stop:${code.id}`);
    setError('');
    setNotice('');
    try {
      await adminRequest(`/admin/promo-codes/${encodeURIComponent(code.id)}`, { method: 'DELETE' });
      await load();
    } catch (reason) { fail(reason); }
    finally { setAction(null); }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setAction('settings');
    setError('');
    setNotice('');
    try {
      const saved = await adminRequest<GrowthSettings>('/admin/growth/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setSettings(saved);
      setNotice('Regulile invitațiilor sunt salvate.');
    } catch (reason) { fail(reason); }
    finally { setAction(null); }
  };

  const setSetting = (key: keyof GrowthSettings, value: string) => {
    setSettings(current => current ? { ...current, [key]: Math.max(0, Number(value) || 0) } : current);
  };

  const today = new Date();
  const minExpiry = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <section className="mt-5 space-y-5" aria-labelledby="codes-title">
      <div className="adm-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 id="codes-title" className="font-heading text-lg text-graphite">Coduri</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-graphite-soft">
            Codurile promo dau luni gratuite și nimeni nu primește comision din ele. Meseriașul îl scrie la înscriere
            sau în aplicație, la „Ai un cod?”, înainte să-și verifice cardul. Un singur cod pe cont.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || !!action} className="adm-btn adm-btn--quiet">
          <ArrowsClockwise size={15} weight="bold" aria-hidden="true" />
          {loading ? 'Se încarcă…' : 'Reîmprospătează'}
        </button>
      </div>

      {error && <p className="rounded-2xl bg-super-red/8 p-3 text-sm font-semibold text-super-red-dark" role="alert">{error}</p>}
      {notice && <p className="rounded-2xl bg-white/55 p-3 text-sm font-semibold text-graphite" role="status">{notice}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="adm-card p-5">
          <div className="flex items-center gap-2"><Ticket size={20} weight="fill" className="text-super-red" aria-hidden="true" /><h2 className="font-heading text-lg text-graphite">Cod nou</h2></div>
          <form onSubmit={createPromo} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="promo-code" className="adm-label">Cod</label><input id="promo-code" required minLength={3} maxLength={50} autoComplete="off" spellCheck={false} placeholder="ex. TARGBRASOV" className="adm-input font-mono uppercase" value={promo.code} onChange={event => setPromo({ ...promo, code: event.target.value })} /></div>
            <div><label htmlFor="promo-months" className="adm-label">Luni gratuite</label><input id="promo-months" required type="number" min="1" max="36" className="adm-input" value={promo.freeMonths} onChange={event => setPromo({ ...promo, freeMonths: event.target.value })} /></div>
            <div><label htmlFor="promo-uses" className="adm-label">De câte ori se poate folosi</label><input id="promo-uses" type="number" min="1" className="adm-input" placeholder="Fără limită" value={promo.maxUses} onChange={event => setPromo({ ...promo, maxUses: event.target.value })} /></div>
            <div><label htmlFor="promo-expiry" className="adm-label">Merge până pe</label><input id="promo-expiry" type="date" min={minExpiry} className="adm-input" value={promo.expiresAt} onChange={event => setPromo({ ...promo, expiresAt: event.target.value })} /></div>
            <div className="sm:col-span-2"><label htmlFor="promo-description" className="adm-label">Pentru cine e (doar voi o vedeți)</label><input id="promo-description" maxLength={500} placeholder="ex. meseriașii de la târgul din Brașov" className="adm-input" value={promo.description} onChange={event => setPromo({ ...promo, description: event.target.value })} /></div>
            <button type="submit" className="adm-btn adm-btn--main sm:col-span-2" disabled={!!action}><Plus size={15} weight="bold" aria-hidden="true" />{action === 'promo' ? 'Se creează…' : 'Creează codul'}</button>
          </form>
          <p className="mt-3 flex gap-2 text-xs leading-relaxed text-graphite-soft"><WarningCircle size={16} className="shrink-0" aria-hidden="true" />Termenii promit 6 luni pentru un cod promo. Alt număr e în regulă dacă îl spuneți omului odată cu codul; aplicația i-l arată când îl scrie.</p>
        </div>

        <div className="adm-card p-5">
          <h2 className="font-heading text-lg text-graphite">Codurile promo</h2>
          {loading && promos.length === 0 ? (
            <p className="mt-4 text-sm text-graphite-soft">Se încarcă…</p>
          ) : promos.length === 0 ? (
            <p className="mt-4 text-sm text-graphite-soft">Niciun cod încă. Cel creat aici apare în listă.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {promos.map(code => {
                const state = promoState(code, today);
                const used = promoUses(code);
                const details = [
                  monthsLabel(code.freeMonths),
                  code.maxUses != null ? `${used} din ${code.maxUses} folosiri` : `${used} ${used === 1 ? 'folosire' : 'folosiri'}, fără limită`,
                  code.expiresAt ? `${state.word === 'Expirat' ? 'a expirat' : 'merge până'} ${dayLabel(code.expiresAt, today)}` : '',
                ].filter(Boolean).join(' · ');
                return (
                  <li key={code.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/55 p-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="font-mono text-graphite">{code.code}</strong>
                        <span className="adm-state" data-tone={state.tone}>{state.word}</span>
                      </div>
                      <p className="adm-num mt-1 text-xs text-graphite-soft">{details}</p>
                      {code.description && <p className="mt-0.5 truncate text-xs text-graphite-soft">{code.description}</p>}
                    </div>
                    {code.active && (
                      <button type="button" onClick={() => void stopPromo(code)} disabled={!!action} className="adm-btn adm-btn--quiet shrink-0">
                        {action === `stop:${code.id}` ? 'Se oprește…' : 'Oprește'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="adm-card p-5">
        <div className="flex items-center gap-2"><Gift size={20} weight="fill" className="text-super-red" aria-hidden="true" /><h2 className="font-heading text-lg text-graphite">Invitații și recruiteri</h2></div>
        {settings ? <form onSubmit={saveSettings} className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ['referralThreshold', 'Invitații pentru recompensă'], ['inviteeFreeMonths', 'Luni pentru invitat'],
            ['inviterRewardMonths', 'Luni pentru cel care invită'], ['inviterRewardMax', 'Maximum luni câștigate'],
            ['recruiterFreeMonths', 'Luni prin recruiter'], ['recruiterCommissionBps', 'Comision recruiter (bps)'],
            ['recruiterPaidInvoiceLimit', 'Limită facturi plătite'],
          ] as [keyof GrowthSettings, string][]).map(([key, label]) => <div key={key}><label htmlFor={`growth-${key}`} className="adm-label">{label}</label><input id={`growth-${key}`} type="number" min="0" className="adm-input" value={settings[key]} onChange={event => setSetting(key, event.target.value)} /></div>)}
          <button type="submit" className="adm-btn adm-btn--main sm:col-span-2" disabled={!!action}><Check size={15} weight="bold" aria-hidden="true" />{action === 'settings' ? 'Se salvează…' : 'Salvează setările'}</button>
        </form> : <p className="mt-4 text-sm text-graphite-soft">Se încarcă setările…</p>}
        <p className="mt-3 flex gap-2 text-xs leading-relaxed text-graphite-soft"><WarningCircle size={16} className="shrink-0" aria-hidden="true" />Valorile schimbă regulile pentru codurile folosite de acum încolo.</p>
      </div>
    </section>
  );
}

export function BillingExemptControl({ heroId, initialExempt = false }: { heroId: string; initialExempt?: boolean }) {
  const [exempt, setExempt] = useState(initialExempt);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    void adminRequest<{ exempt: boolean; exemptNote: string | null }>(`/admin/heroes/${encodeURIComponent(heroId)}/billing-exempt`)
      .then(data => { if (alive) { setExempt(data.exempt); setNote(data.exemptNote || ''); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [heroId]);

  const toggle = async () => {
    const next = !exempt;
    if (next && note.trim().length < 3) { setMessage('Scrie o notă scurtă pentru biletul de aur.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const result = await adminRequest<{ exempt: boolean; exemptNote: string | null; waivedMonths?: number }>(`/admin/heroes/${encodeURIComponent(heroId)}/billing-exempt`, {
        method: 'POST', body: JSON.stringify({ exempt: next, note: next ? note.trim() : undefined }),
      });
      setExempt(result.exempt);
      setNote(result.exemptNote || note);
      const waived = result.waivedMonths || 0;
      setMessage(result.exempt
        ? `Biletul de aur este activ.${waived ? ` ${waived === 1 ? 'Luna restantă a fost iertată' : `Cele ${waived} luni restante au fost iertate`}.` : ''}`
        : 'Biletul de aur a fost scos.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Schimbarea nu a reușit.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="adm-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div><p className="adm-label !mb-0">Bilet de aur (nu plătește nimic)</p><p className="mt-1 text-xs leading-relaxed text-graphite-soft">Tot are nevoie de card verificat ca să apară la clienți.</p></div>
        <button type="button" role="switch" aria-checked={exempt} onClick={() => void toggle()} disabled={busy} className={`relative h-11 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-super-red/20 disabled:cursor-wait disabled:opacity-50 ${exempt ? 'bg-emerald-600' : 'bg-graphite/20'}`}>
          <span className={`absolute left-0 top-2 h-7 w-7 rounded-full bg-white shadow transition-transform ${exempt ? 'translate-x-6' : 'translate-x-1'}`} />
          <span className="sr-only">{exempt ? 'Scoate biletul de aur' : 'Acordă bilet de aur'}</span>
        </button>
      </div>
      {!exempt && <div className="mt-3"><label htmlFor={`gold-note-${heroId}`} className="adm-label">Notă scurtă</label><input id={`gold-note-${heroId}`} className="adm-input" maxLength={300} placeholder="De ce îl acordăm" value={note} onChange={event => setNote(event.target.value)} /></div>}
      {message && <p className="mt-2 text-xs font-semibold text-graphite-soft" role="status">{message}</p>}
    </div>
  );
}
