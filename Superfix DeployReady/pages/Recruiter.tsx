import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { API_URL } from '../config/api';

const RECRUITER_TOKEN_KEY = 'superfix_recruiter_token';

type RecruiterMode = 'apply' | 'login';

interface RecruiterSession {
  token: string;
}

interface CommissionGroup {
  status: string;
  _sum?: { commissionBani?: number | null };
  _count?: number;
}

interface RecruiterDashboardData {
  name: string;
  email: string;
  code: string;
  ibanMask: string;
  commissionPercent: number;
  invoiceLimit: number;
  heroes: number;
  commissions: CommissionGroup[];
}

interface ApiError extends Error {
  status?: number;
}

const emptyApplyForm = {
  name: '',
  email: '',
  phone: '',
  iban: '',
  password: '',
};

const formatMoney = new Intl.NumberFormat('ro-RO', {
  style: 'currency',
  currency: 'RON',
  minimumFractionDigits: 2,
});

const commissionLabels: Record<string, string> = {
  ACCRUED: 'În verificare',
  APPROVED: 'Aprobat pentru plată',
  PAID: 'Plătit',
  REVERSED: 'Anulat',
};

const inputClassName =
  'w-full border-2 border-black bg-white px-3 py-3 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:bg-yellow-50 focus:ring-4 focus:ring-comic-yellow/50';

async function requestJson<T>(url: string, options: RequestInit, fallbackMessage: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Nu ne-am putut conecta la server. Încearcă din nou.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || fallbackMessage) as ApiError;
    error.status = response.status;
    throw error;
  }

  return payload as T;
}

async function getRecruiterDashboard(token: string): Promise<RecruiterDashboardData> {
  return requestJson<RecruiterDashboardData>(
    `${API_URL}/recruiter/me`,
    { headers: { Authorization: `Bearer ${token}` } },
    'Datele contului nu au putut fi încărcate.',
  );
}

export const Recruiter: React.FC = () => {
  const [mode, setMode] = useState<RecruiterMode>('apply');
  const [applyForm, setApplyForm] = useState(emptyApplyForm);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [applyLoading, setApplyLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [applyError, setApplyError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [applySuccess, setApplySuccess] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [dashboard, setDashboard] = useState<RecruiterDashboardData | null>(null);

  useEffect(() => {
    let active = true;
    const token = sessionStorage.getItem(RECRUITER_TOKEN_KEY);

    if (!token) {
      setSessionLoading(false);
      return () => {
        active = false;
      };
    }

    getRecruiterDashboard(token)
      .then(data => {
        if (active) setDashboard(data);
      })
      .catch((error: ApiError) => {
        if (!active) return;
        if (error.status === 401 || error.status === 403) {
          sessionStorage.removeItem(RECRUITER_TOKEN_KEY);
          setLoginError('Sesiunea a expirat. Intră din nou în cont.');
        } else {
          setLoginError(error.message);
        }
        setMode('login');
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const commissionSummary = useMemo(() => {
    if (!dashboard) return { totalBani: 0, rows: [] as Array<CommissionGroup & { amountBani: number; count: number }> };

    const rows = (dashboard.commissions || []).map(group => ({
      ...group,
      amountBani: Number(group._sum?.commissionBani || 0),
      count: typeof group._count === 'number' ? group._count : 0,
    }));
    const totalBani = rows
      .filter(group => group.status !== 'REVERSED')
      .reduce((sum, group) => sum + group.amountBani, 0);

    return { totalBani, rows };
  }, [dashboard]);

  const handleApply = async (event: React.FormEvent) => {
    event.preventDefault();
    setApplyError('');
    setApplySuccess('');

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/.test(applyForm.password)) {
      setApplyError('Parola trebuie să aibă minimum 10 caractere, o literă mare, una mică și o cifră.');
      return;
    }

    setApplyLoading(true);
    try {
      const result = await requestJson<{ message?: string }>(
        `${API_URL}/recruiters/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: applyForm.name.trim(),
            email: applyForm.email.trim(),
            phone: applyForm.phone.trim(),
            iban: applyForm.iban.trim(),
            password: applyForm.password,
          }),
        },
        'Cererea nu a putut fi trimisă.',
      );

      setApplySuccess(result.message || 'Cererea a fost trimisă și așteaptă verificarea din admin.');
      setApplyForm(emptyApplyForm);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : 'Cererea nu a putut fi trimisă.');
    } finally {
      setApplyLoading(false);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const session = await requestJson<RecruiterSession>(
        `${API_URL}/auth/recruiter-login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: loginForm.email.trim(),
            password: loginForm.password,
          }),
        },
        'Autentificarea nu a reușit.',
      );

      if (!session.token) throw new Error('Serverul nu a întors o sesiune validă.');

      sessionStorage.setItem(RECRUITER_TOKEN_KEY, session.token);
      const data = await getRecruiterDashboard(session.token);
      setDashboard(data);
      setLoginForm(current => ({ ...current, password: '' }));
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 401 || apiError.status === 403) {
        sessionStorage.removeItem(RECRUITER_TOKEN_KEY);
      }
      setLoginForm(current => ({ ...current, password: '' }));
      setLoginError(error instanceof Error ? error.message : 'Autentificarea nu a reușit.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    const token = sessionStorage.getItem(RECRUITER_TOKEN_KEY);
    sessionStorage.removeItem(RECRUITER_TOKEN_KEY);
    if (token) {
      fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => undefined);
    }
    setDashboard(null);
    setCopyStatus('');
    setLoginError('');
    setMode('login');
  };

  const handleCopyLink = async () => {
    if (!dashboard) return;
    const shareUrl = `${window.location.origin}/register?recruiter=${encodeURIComponent(dashboard.code)}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus('Link copiat.');
    } catch {
      setCopyStatus('Selectează linkul și copiază-l manual.');
    }
  };

  const shareUrl = dashboard
    ? `${window.location.origin}/register?recruiter=${encodeURIComponent(dashboard.code)}`
    : '';

  return (
    <div className="min-h-screen bg-[#f4f6fa] bg-dots text-gray-900">
      <Helmet>
        <title>Program recruiteri | Superfix</title>
        <meta
          name="description"
          content="Aplică în programul de recruiteri Superfix, distribuie codul personal și urmărește comisioanele din cont."
        />
      </Helmet>

      <section className="border-b-4 border-black bg-white">
        <div className="container mx-auto grid w-full grid-cols-1 gap-8 px-4 py-10 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)] md:px-6 md:py-14">
          <div className="max-w-3xl">
            <h1 className="font-heading text-4xl uppercase leading-tight text-super-blue md:text-6xl">
              Construiește rețeaua Superfix
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-gray-700">
              Aplică, primește codul personal după verificare și urmărește comisioanele într-un singur loc.
            </p>
          </div>

          <div className="self-end border-l-4 border-super-red pl-5 text-sm leading-relaxed text-gray-700">
            <p className="font-bold text-super-blue">Cum funcționează</p>
            <p className="mt-2">Codul devine activ după aprobarea echipei. Comisionul se calculează doar pentru plățile eligibile confirmate.</p>
          </div>
        </div>
      </section>

      <main className="container mx-auto w-full max-w-5xl px-4 py-10 md:px-6 md:py-14">
        {sessionLoading ? (
          <div className="mx-auto max-w-2xl border-4 border-black bg-white p-8 shadow-[8px_8px_0_#000]" aria-live="polite">
            <p className="font-heading text-2xl text-super-blue">SE VERIFICĂ SESIUNEA</p>
            <div className="mt-5 h-3 w-full animate-pulse bg-gray-200" />
            <div className="mt-3 h-3 w-2/3 animate-pulse bg-gray-200" />
          </div>
        ) : dashboard ? (
          <section aria-labelledby="recruiter-dashboard-title">
            <div className="flex flex-col gap-5 border-b-4 border-black pb-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-super-red">Cont recruiter activ</p>
                <h2 id="recruiter-dashboard-title" className="mt-1 font-heading text-4xl uppercase text-super-blue">
                  Salut, {dashboard.name}
                </h2>
                <p className="mt-2 text-gray-600">{dashboard.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-11 border-2 border-black bg-white px-5 py-2 font-bold text-gray-800 transition-transform hover:bg-gray-100 active:translate-y-px"
              >
                Deconectare
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="border-4 border-black bg-comic-yellow p-6 shadow-[6px_6px_0_#000]">
                <p className="text-sm font-bold uppercase tracking-wider">Codul tău personal</p>
                <p className="mt-2 break-all font-mono text-2xl font-black text-super-blue">{dashboard.code}</p>
                <label htmlFor="recruiter-share-url" className="mt-6 block text-sm font-bold">
                  Link de înscriere
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="recruiter-share-url"
                    readOnly
                    value={shareUrl}
                    onFocus={event => event.currentTarget.select()}
                    className="min-w-0 flex-1 border-2 border-black bg-white px-3 py-2 font-mono text-sm text-gray-800 outline-none focus:ring-4 focus:ring-white/70"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="min-h-11 whitespace-nowrap border-2 border-black bg-super-blue px-5 py-2 font-bold text-white transition-transform hover:bg-blue-950 active:translate-y-px"
                  >
                    Copiază linkul
                  </button>
                </div>
                <p className="mt-2 min-h-5 text-sm font-bold text-super-blue" aria-live="polite">{copyStatus}</p>
              </div>

              <div className="border-4 border-black bg-white p-6">
                <h3 className="font-heading text-2xl uppercase text-super-blue">Situația contului</h3>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
                  <div>
                    <dt className="text-sm text-gray-600">Eroi atribuiți</dt>
                    <dd className="mt-1 font-heading text-3xl">{dashboard.heroes}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600">Comision</dt>
                    <dd className="mt-1 font-heading text-3xl">{dashboard.commissionPercent}%</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600">Facturi eligibile per erou</dt>
                    <dd className="mt-1 font-heading text-3xl">{dashboard.invoiceLimit}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600">IBAN pentru plată</dt>
                    <dd className="mt-2 font-mono text-base font-bold">{dashboard.ibanMask}</dd>
                  </div>
                </dl>
                <p className="mt-6 border-l-4 border-gray-300 pl-3 text-sm leading-relaxed text-gray-600">
                  IBAN-ul complet nu este stocat în acest browser. Aici este afișată doar forma mascată primită de la server.
                </p>
              </div>
            </div>

            <div className="mt-8 border-4 border-black bg-white p-6 md:p-8">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="font-heading text-2xl uppercase text-super-blue">Comisioane</h3>
                  <p className="mt-1 text-sm text-gray-600">Sumele sunt generate numai din plăți confirmate.</p>
                </div>
                <p className="font-heading text-3xl text-super-red">{formatMoney.format(commissionSummary.totalBani / 100)}</p>
              </div>

              {commissionSummary.rows.length === 0 ? (
                <div className="mt-6 border-l-4 border-comic-yellow bg-yellow-50 p-4 text-gray-700">
                  Nu există încă comisioane. Ele apar după ce eroii atribuiți achită plăți eligibile.
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left">
                    <thead>
                      <tr className="border-b-2 border-black text-sm text-gray-600">
                        <th className="px-2 py-3 font-bold">Status</th>
                        <th className="px-2 py-3 font-bold">Plăți</th>
                        <th className="px-2 py-3 text-right font-bold">Valoare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissionSummary.rows.map(group => (
                        <tr key={group.status} className="border-b border-gray-200 last:border-b-0">
                          <td className="px-2 py-4 font-bold">{commissionLabels[group.status] || group.status}</td>
                          <td className="px-2 py-4 text-gray-700">{group.count}</td>
                          <td className="px-2 py-4 text-right font-mono font-bold">{formatMoney.format(group.amountBani / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="mx-auto max-w-3xl border-4 border-black bg-white shadow-[8px_8px_0_#000]" aria-labelledby="recruiter-form-title">
            <div className="grid grid-cols-2 border-b-4 border-black" role="tablist" aria-label="Acces program recruiteri">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'apply'}
                onClick={() => {
                  setMode('apply');
                  setLoginError('');
                }}
                className={`min-h-14 px-4 py-3 font-bold transition-colors ${mode === 'apply' ? 'bg-super-red text-white' : 'bg-white text-super-blue hover:bg-gray-100'}`}
              >
                Aplică în program
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => {
                  setMode('login');
                  setApplyError('');
                }}
                className={`min-h-14 border-l-4 border-black px-4 py-3 font-bold transition-colors ${mode === 'login' ? 'bg-super-blue text-white' : 'bg-white text-super-blue hover:bg-gray-100'}`}
              >
                Intră în cont
              </button>
            </div>

            <div className="p-6 md:p-10">
              {mode === 'apply' ? (
                <form onSubmit={handleApply}>
                  <h2 id="recruiter-form-title" className="font-heading text-3xl uppercase text-super-blue">Cerere recruiter</h2>
                  <p className="mt-2 max-w-2xl text-gray-600">Datele sunt verificate de echipa Superfix înainte ca linkul tău să devină activ.</p>

                  <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label htmlFor="recruiter-name" className="mb-2 block text-sm font-bold">Nume complet</label>
                      <input
                        id="recruiter-name"
                        required
                        minLength={2}
                        maxLength={120}
                        autoComplete="name"
                        className={inputClassName}
                        placeholder="Ex: Andrei Popescu"
                        value={applyForm.name}
                        onChange={event => setApplyForm(current => ({ ...current, name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="recruiter-email" className="mb-2 block text-sm font-bold">Email</label>
                      <input
                        id="recruiter-email"
                        required
                        type="email"
                        autoComplete="email"
                        className={inputClassName}
                        placeholder="andrei@exemplu.ro"
                        value={applyForm.email}
                        onChange={event => setApplyForm(current => ({ ...current, email: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="recruiter-phone" className="mb-2 block text-sm font-bold">Telefon</label>
                      <input
                        id="recruiter-phone"
                        required
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        pattern="07[0-9]{8}"
                        className={inputClassName}
                        placeholder="0712345678"
                        value={applyForm.phone}
                        onChange={event => setApplyForm(current => ({ ...current, phone: event.target.value }))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="recruiter-iban" className="mb-2 block text-sm font-bold">IBAN pentru încasări</label>
                      <input
                        id="recruiter-iban"
                        required
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        pattern="RO[0-9]{2}[A-Za-z0-9]{20}"
                        className={`${inputClassName} font-mono uppercase`}
                        placeholder="RO49AAAA1B31007593840000"
                        value={applyForm.iban}
                        onChange={event => setApplyForm(current => ({ ...current, iban: event.target.value.replace(/\s+/g, '').toUpperCase() }))}
                        aria-describedby="iban-security-note"
                      />
                      <p id="iban-security-note" className="mt-2 text-sm leading-relaxed text-gray-600">
                        IBAN-ul este trimis direct serverului. Nu este salvat în sessionStorage sau localStorage.
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="recruiter-password" className="mb-2 block text-sm font-bold">Parolă</label>
                      <input
                        id="recruiter-password"
                        required
                        type="password"
                        minLength={10}
                        maxLength={128}
                        autoComplete="new-password"
                        className={inputClassName}
                        value={applyForm.password}
                        onChange={event => setApplyForm(current => ({ ...current, password: event.target.value }))}
                        aria-describedby="password-help"
                      />
                      <p id="password-help" className="mt-2 text-sm text-gray-600">Minimum 10 caractere, cu literă mare, literă mică și cifră.</p>
                    </div>
                  </div>

                  {applyError && <p className="mt-5 border-l-4 border-red-600 bg-red-50 p-3 font-bold text-red-800" role="alert">{applyError}</p>}
                  {applySuccess && <p className="mt-5 border-l-4 border-green-600 bg-green-50 p-3 font-bold text-green-800" role="status">{applySuccess}</p>}

                  <button
                    type="submit"
                    disabled={applyLoading}
                    className="mt-7 min-h-14 w-full border-4 border-black bg-super-red px-6 py-3 font-heading text-xl text-white shadow-[5px_5px_0_#000] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[3px_3px_0_#000] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-70"
                  >
                    {applyLoading ? 'SE TRIMITE CEREREA' : 'TRIMITE CEREREA'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLogin}>
                  <h2 id="recruiter-form-title" className="font-heading text-3xl uppercase text-super-blue">Cont recruiter</h2>
                  <p className="mt-2 text-gray-600">Autentificarea devine disponibilă după aprobarea cererii în admin.</p>

                  <div className="mt-7 space-y-5">
                    <div>
                      <label htmlFor="recruiter-login-email" className="mb-2 block text-sm font-bold">Email</label>
                      <input
                        id="recruiter-login-email"
                        required
                        type="email"
                        autoComplete="email"
                        className={inputClassName}
                        value={loginForm.email}
                        onChange={event => setLoginForm(current => ({ ...current, email: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="recruiter-login-password" className="mb-2 block text-sm font-bold">Parolă</label>
                      <input
                        id="recruiter-login-password"
                        required
                        type="password"
                        autoComplete="current-password"
                        className={inputClassName}
                        value={loginForm.password}
                        onChange={event => setLoginForm(current => ({ ...current, password: event.target.value }))}
                      />
                    </div>
                  </div>

                  {loginError && <p className="mt-5 border-l-4 border-red-600 bg-red-50 p-3 font-bold text-red-800" role="alert">{loginError}</p>}

                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="mt-7 min-h-14 w-full border-4 border-black bg-super-blue px-6 py-3 font-heading text-xl text-white shadow-[5px_5px_0_#000] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[3px_3px_0_#000] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-70"
                  >
                    {loginLoading ? 'SE VERIFICĂ' : 'INTRĂ ÎN CONT'}
                  </button>
                  <a href="/reset-password?role=RECRUITER" className="mt-4 block text-center font-bold underline">
                    Ai uitat parola?
                  </a>
                </form>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
