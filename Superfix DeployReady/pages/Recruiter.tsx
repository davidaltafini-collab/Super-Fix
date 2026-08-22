import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { API_URL } from '../config/api';
import { Reveal } from '../components/motion';
import { GlassButton } from '../components/Button';
import { Field, FieldPassword } from '../components/Field';
import {
  checkAll, first, required, minLength, maxLength, email as emailCheck,
  phoneRo, normalizePhone, ibanRo, strongPassword, firstBad, focusField,
} from '../lib/validate';
import {
  UserPlus, SealCheck, CurrencyCircleDollar, Copy, SignOut,
  Users, Percent, Receipt, Bank, ShieldCheck, LinkSimple,
} from '@phosphor-icons/react';

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

/* Regulile formularului de cerere. IBAN-ul e verificat cu cheia de control,
   nu doar cu forma: un `pattern` din HTML trece și un IBAN cu o cifră greșită,
   iar acolo nu se întoarce nicio eroare — doar banii nu ajung niciodată. */
const APPLY_RULES = {
  name: first(
    required('Cum te cheamă? Fără nume nu putem verifica pe nimeni.'),
    minLength(2, 'Scrie numele întreg.'),
    maxLength(120),
  ),
  email: first(required('Pe email îți răspundem.'), emailCheck()),
  phone: first(required('Lasă-ne un număr la care te găsim.'), phoneRo()),
  iban: first(required('Fără IBAN n-avem unde trimite comisionul.'), ibanRo()),
  password: first(required('Alege o parolă pentru contul tău.'), strongPassword()),
};

const APPLY_ORDER = ['name', 'email', 'phone', 'iban', 'password'] as const;

const LOGIN_RULES = {
  email: first(required('Scrie emailul contului.'), emailCheck()),
  password: required('Scrie parola.'),
};

const commissionLabels: Record<string, string> = {
  ACCRUED: 'În verificare',
  APPROVED: 'Aprobat pentru plată',
  PAID: 'Plătit',
  REVERSED: 'Anulat',
};

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
  // erorile de câmp stau separat de eroarea venită de la server
  const [applyFields, setApplyFields] = useState<Partial<Record<string, string>>>({});
  const [loginFields, setLoginFields] = useState<Partial<Record<string, string>>>({});
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

    const found = checkAll(applyForm, APPLY_RULES);
    if (Object.keys(found).length > 0) {
      setApplyFields(found);
      const worst = firstBad([...APPLY_ORDER], found);
      if (worst) focusField(`recruiter-${String(worst)}`);
      return;
    }
    setApplyFields({});

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
            phone: normalizePhone(applyForm.phone),
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

    const found = checkAll(loginForm, LOGIN_RULES);
    if (Object.keys(found).length > 0) {
      setLoginFields(found);
      const worst = firstBad(['email', 'password'], found);
      if (worst) focusField(`recruiter-login-${String(worst)}`);
      return;
    }
    setLoginFields({});

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

  /** Scrie într-un câmp și șterge eroarea lui: reproșul nu are voie să rămână
      pe ecran cât timp omul tocmai îl repară. */
  const setApply = (key: keyof typeof emptyApplyForm, value: string) => {
    setApplyForm(current => ({ ...current, [key]: value }));
    if (applyFields[key]) setApplyFields(current => ({ ...current, [key]: undefined }));
  };

  const setLogin = (key: 'email' | 'password', value: string) => {
    setLoginForm(current => ({ ...current, [key]: value }));
    if (loginFields[key]) setLoginFields(current => ({ ...current, [key]: undefined }));
  };

  const shareUrl = dashboard
    ? `${window.location.origin}/register?recruiter=${encodeURIComponent(dashboard.code)}`
    : '';

  return (
    <div className="font-sans text-graphite">
      <Helmet>
        <title>Program recruiteri | Superfix</title>
        <meta
          name="description"
          content="Aplică în programul de recruiteri Superfix, distribuie codul personal și urmărește comisioanele din cont."
        />
      </Helmet>

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-24 right-0 -z-10 h-[32rem] w-[32rem] rounded-full bg-spark/15 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-40 -left-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-super-red/10 blur-3xl" aria-hidden="true" />

        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-5 pb-10 pt-28 sm:px-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:pb-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-heading font-semibold text-graphite shadow-clay-sm">
              <UserPlus size={18} weight="fill" className="text-super-red" aria-hidden="true" />
              Program recruiteri
            </span>

            <h1 className="mt-6 font-heading text-[2.4rem] font-bold leading-[1.1] text-graphite sm:text-5xl md:text-6xl">
              Construiește rețeaua <span className="text-super-red">Superfix</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg text-graphite-soft md:text-xl">
              Aplică, primește codul personal după verificare și urmărește comisioanele într-un singur loc.
            </p>
          </div>

          <div className="hidden justify-center md:flex">
            <div className="relative">
              <div className="absolute inset-0 -z-10 m-auto h-[70%] w-[70%] rounded-full bg-spark/20 blur-2xl" aria-hidden="true" />
              <img
                src="/mascot.png"
                alt=""
                aria-hidden="true"
                width={377}
                height={712}
                className="animate-float w-auto max-h-[38vh] drop-shadow-[0_28px_38px_rgba(46,51,59,0.35)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============ CUM FUNCȚIONEAZĂ ============ */}
      <section className="mx-auto max-w-6xl px-5 pb-4 sm:px-6">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { Icon: UserPlus, t: 'Aplici', d: 'Completezi cererea cu datele tale și IBAN-ul pentru încasări.' },
            { Icon: SealCheck, t: 'Echipa verifică', d: 'Codul tău personal devine activ după aprobarea echipei Superfix.' },
            { Icon: CurrencyCircleDollar, t: 'Câștigi comision', d: 'Comisionul se calculează pentru plățile eligibile confirmate.' },
          ].map((s, i) => (
            <Reveal key={s.t} delay={i * 90} bounce>
              <div className="sf-glass h-full rounded-[28px] p-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 text-super-red shadow-clay-sm">
                  <s.Icon size={30} weight="duotone" aria-hidden="true" />
                </div>
                <h2 className="mt-5 font-heading text-xl font-medium text-graphite">{s.t}</h2>
                <p className="mt-2 text-graphite-soft">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 md:py-14">
        {sessionLoading ? (
          <div className="sf-glass mx-auto max-w-2xl rounded-[28px] p-8" aria-live="polite">
            <p className="font-heading text-2xl font-medium text-graphite">Se verifică sesiunea</p>
            <div className="mt-5 h-3 w-full animate-pulse rounded-full bg-graphite/10" />
            <div className="mt-3 h-3 w-2/3 animate-pulse rounded-full bg-graphite/10" />
          </div>
        ) : dashboard ? (
          <section aria-labelledby="recruiter-dashboard-title">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-super-red/12 px-3 py-1.5 text-sm font-heading font-semibold text-super-red">
                  <ShieldCheck size={16} weight="fill" aria-hidden="true" />
                  Cont recruiter activ
                </span>
                <h2 id="recruiter-dashboard-title" className="mt-3 font-heading text-4xl font-bold text-graphite">
                  Salut, {dashboard.name}
                </h2>
                <p className="mt-2 text-graphite-soft">{dashboard.email}</p>
              </div>
              <GlassButton type="button" tone="neutral" onClick={handleLogout}>
                <SignOut size={18} weight="bold" aria-hidden="true" />
                Deconectare
              </GlassButton>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="relative overflow-hidden rounded-[28px] bg-graphite p-6 text-white shadow-clay-dark">
                <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-spark/20 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <p className="inline-flex items-center gap-2 text-sm font-heading font-semibold text-spark-soft">
                    <LinkSimple size={16} weight="bold" aria-hidden="true" />
                    Codul tău personal
                  </p>
                  <p className="mt-3 break-all font-mono text-3xl font-black">{dashboard.code}</p>

                  <label htmlFor="recruiter-share-url" className="mt-6 block text-sm font-semibold text-white/80">
                    Link de înscriere
                  </label>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                    <input
                      id="recruiter-share-url"
                      readOnly
                      value={shareUrl}
                      onFocus={event => event.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 font-mono text-sm text-white outline-none transition-all focus:border-white/40 focus:bg-white/15 focus:ring-4 focus:ring-white/15"
                    />
                    <GlassButton type="button" tone="red" onClick={handleCopyLink} className="whitespace-nowrap">
                      <Copy size={18} weight="bold" aria-hidden="true" />
                      Copiază linkul
                    </GlassButton>
                  </div>
                  <p className="mt-2 min-h-5 text-sm font-semibold text-spark-soft" aria-live="polite">{copyStatus}</p>
                </div>
              </div>

              <div className="sf-glass rounded-[28px] p-6">
                <h3 className="font-heading text-2xl font-medium text-graphite">Situația contului</h3>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
                  <div>
                    <dt className="flex items-center gap-1.5 text-sm text-graphite-soft">
                      <Users size={16} weight="duotone" className="text-super-red" aria-hidden="true" />
                      Eroi atribuiți
                    </dt>
                    <dd className="mt-1 font-heading text-3xl font-semibold text-graphite">{dashboard.heroes}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-sm text-graphite-soft">
                      <Percent size={16} weight="duotone" className="text-spark" aria-hidden="true" />
                      Comision
                    </dt>
                    <dd className="mt-1 font-heading text-3xl font-semibold text-graphite">{dashboard.commissionPercent}%</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-sm text-graphite-soft">
                      <Receipt size={16} weight="duotone" className="text-spark" aria-hidden="true" />
                      Facturi eligibile per erou
                    </dt>
                    <dd className="mt-1 font-heading text-3xl font-semibold text-graphite">{dashboard.invoiceLimit}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-sm text-graphite-soft">
                      <Bank size={16} weight="duotone" className="text-super-red" aria-hidden="true" />
                      IBAN pentru plată
                    </dt>
                    <dd className="mt-2 font-mono text-base font-bold text-graphite">{dashboard.ibanMask}</dd>
                  </div>
                </dl>
                <p className="mt-6 rounded-2xl bg-white/50 p-3 text-sm leading-relaxed text-graphite-soft">
                  IBAN-ul complet nu este stocat în acest browser. Aici este afișată doar forma mascată primită de la server.
                </p>
              </div>
            </div>

            <div className="sf-glass mt-8 rounded-[28px] p-6 md:p-8">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-heading text-2xl font-medium text-graphite">
                    <CurrencyCircleDollar size={26} weight="duotone" className="text-super-red" aria-hidden="true" />
                    Comisioane
                  </h3>
                  <p className="mt-1 text-sm text-graphite-soft">Sumele sunt generate numai din plăți confirmate.</p>
                </div>
                <p className="font-heading text-3xl font-bold text-super-red">{formatMoney.format(commissionSummary.totalBani / 100)}</p>
              </div>

              {commissionSummary.rows.length === 0 ? (
                <div className="mt-6 rounded-2xl bg-white/60 p-5 text-graphite-soft">
                  Nu există încă comisioane. Ele apar după ce eroii atribuiți achită plăți eligibile.
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-separate border-spacing-y-2 text-left">
                    <thead>
                      <tr className="text-sm text-graphite-soft">
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-3 py-3 font-semibold">Plăți</th>
                        <th className="px-3 py-3 text-right font-semibold">Valoare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissionSummary.rows.map(group => (
                        <tr key={group.status} className="rounded-2xl bg-white/50">
                          <td className="rounded-l-2xl px-3 py-4 font-semibold text-graphite">{commissionLabels[group.status] || group.status}</td>
                          <td className="px-3 py-4 text-graphite-soft">{group.count}</td>
                          <td className="rounded-r-2xl px-3 py-4 text-right font-mono font-bold text-graphite">{formatMoney.format(group.amountBani / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="sf-glass mx-auto max-w-3xl overflow-hidden rounded-[32px]" aria-labelledby="recruiter-form-title">
            <div className="grid grid-cols-2 gap-2 p-2" role="tablist" aria-label="Acces program recruiteri">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'apply'}
                onClick={() => {
                  setMode('apply');
                  setLoginError('');
                }}
                className={`min-h-14 rounded-full px-5 py-3 font-heading text-base font-semibold leading-tight transition-all duration-200 ${mode === 'apply' ? 'bg-super-red text-white shadow-clay-red' : 'text-graphite hover:bg-white/60'}`}
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
                className={`min-h-14 rounded-full px-5 py-3 font-heading text-base font-semibold leading-tight transition-all duration-200 ${mode === 'login' ? 'bg-graphite text-white shadow-clay-dark' : 'text-graphite hover:bg-white/60'}`}
              >
                Intră în cont
              </button>
            </div>

            <div className="p-6 md:p-10">
              {mode === 'apply' ? (
                <form onSubmit={handleApply} noValidate>
                  <h2 id="recruiter-form-title" className="font-heading text-3xl font-bold text-graphite">Cerere recruiter</h2>
                  <p className="mt-2 max-w-2xl text-graphite-soft">Datele sunt verificate de echipa Superfix înainte ca linkul tău să devină activ.</p>

                  <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <Field
                      id="recruiter-name"
                      label="Nume complet"
                      className="md:col-span-2"
                      autoComplete="name"
                      maxLength={120}
                      placeholder="Andrei Popescu"
                      value={applyForm.name}
                      error={applyFields.name}
                      onChange={event => setApply('name', event.target.value)}
                    />
                    <Field
                      id="recruiter-email"
                      label="Email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="andrei@exemplu.ro"
                      value={applyForm.email}
                      error={applyFields.email}
                      onChange={event => setApply('email', event.target.value)}
                    />
                    <Field
                      id="recruiter-phone"
                      label="Telefon"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="0744 123 456"
                      value={applyForm.phone}
                      error={applyFields.phone}
                      onChange={event => setApply('phone', event.target.value)}
                    />
                    <Field
                      id="recruiter-iban"
                      label="IBAN pentru încasări"
                      className="md:col-span-2 [&_input]:font-mono [&_input]:uppercase"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="RO49AAAA1B31007593840000"
                      hint="Merge direct la server. Nu îl ținem în browser."
                      value={applyForm.iban}
                      error={applyFields.iban}
                      onChange={event => setApply('iban', event.target.value.replace(/\s+/g, '').toUpperCase())}
                    />
                    <FieldPassword
                      id="recruiter-password"
                      label="Parolă"
                      className="md:col-span-2"
                      autoComplete="new-password"
                      maxLength={128}
                      hint="Minimum 10 caractere, cu literă mare, literă mică și cifră."
                      value={applyForm.password}
                      error={applyFields.password}
                      onChange={event => setApply('password', event.target.value)}
                    />
                  </div>

                  {applyError && <p className="mt-5 rounded-2xl bg-red-50 p-4 font-semibold text-red-800 ring-1 ring-red-200" role="alert">{applyError}</p>}
                  {applySuccess && <p className="mt-5 rounded-2xl bg-green-50 p-4 font-semibold text-green-800 ring-1 ring-green-200" role="status">{applySuccess}</p>}

                  <GlassButton type="submit" tone="red" full disabled={applyLoading} className="mt-7 min-h-14 text-xl">
                    {applyLoading ? 'Se trimite cererea…' : 'Trimite cererea'}
                  </GlassButton>
                </form>
              ) : (
                <form onSubmit={handleLogin} noValidate>
                  <h2 id="recruiter-form-title" className="font-heading text-3xl font-bold text-graphite">Cont recruiter</h2>
                  <p className="mt-2 text-graphite-soft">Autentificarea devine disponibilă după aprobarea cererii în admin.</p>

                  <div className="mt-7 space-y-5">
                    <Field
                      id="recruiter-login-email"
                      label="Email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={loginForm.email}
                      error={loginFields.email}
                      onChange={event => setLogin('email', event.target.value)}
                    />
                    <FieldPassword
                      id="recruiter-login-password"
                      label="Parolă"
                      autoComplete="current-password"
                      value={loginForm.password}
                      error={loginFields.password}
                      onChange={event => setLogin('password', event.target.value)}
                    />
                  </div>

                  {loginError && <p className="mt-5 rounded-2xl bg-red-50 p-4 font-semibold text-red-800 ring-1 ring-red-200" role="alert">{loginError}</p>}

                  <GlassButton type="submit" tone="dark" full disabled={loginLoading} className="mt-7 min-h-14 text-xl">
                    {loginLoading ? 'Se verifică…' : 'Intră în cont'}
                  </GlassButton>
                  <a href="/reset-password?role=RECRUITER" className="mt-4 block text-center font-semibold text-graphite-soft underline decoration-super-red/40 underline-offset-4 transition-colors hover:text-super-red">
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
