import React from 'react';
import { GlassButton } from './Button';
import { Field } from './Field';
import { requestEmailCode, verifyEmailCode, loginWithGoogle, ClientAuthResult } from '../services/dataService';

/* ============================================================
   Login client: Google sau cod pe email (CONT-FANTOMA.md §6).
   Apple lipsește intenționat — are nevoie de un cont plătit Apple Developer
   Program și de un Services ID configurat acolo, nu doar de o cheie citită
   din mediu ca Google. Vine într-o rundă separată, când există acel cont.

   Serverul poate răspunde 409 PHONE_REQUIRED când identitatea (emailul de la
   Google, sau cel verificat prin cod) nu nimerește niciun cont existent —
   nu e o poartă înaintea cererii, e ultimul pas al unei conectări pe care
   omul a ales-o (identity.ts, linkIdentity). De-aia există pasul de telefon
   aici, la fel pentru amândouă metodele.
   ============================================================ */

type ClientInfo = NonNullable<ClientAuthResult['client']>;
type Step = 'landing' | 'choose' | 'email' | 'code' | 'phone';

// Client ID-ul Google NU e secret — e făcut să stea în JS-ul de client (de-aia
// verificarea reală se face cu tokenul semnat, nu cu ID-ul ăsta). Valoarea de
// mai jos e cea dată de user pe 30 aug 2026; `VITE_GOOGLE_CLIENT_ID`, dacă e
// setat la build (ex. în Vercel), o suprascrie.
const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '800332298261-eekua42dm73lcbflsf9i69hr4nh2069t.apps.googleusercontent.com';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^07\d{8}$/;

declare global {
  interface Window {
    google?: any;
  }
}

const BackLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="self-start text-[0.8125rem] font-semibold text-graphite-soft underline underline-offset-2">
    {children}
  </button>
);

export const ClientAuthPanel: React.FC<{ onSuccess: (client: ClientInfo) => void; onSkip: () => void }> = ({ onSuccess, onSkip }) => {
  const [step, setStep] = React.useState<Step>('landing');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const googleIdTokenRef = React.useRef<string | null>(null);
  const googleBtnRef = React.useRef<HTMLDivElement | null>(null);

  const finish = (result: ClientAuthResult): boolean => {
    if (result.ok && result.client) {
      onSuccess(result.client);
      return true;
    }
    if (result.error === 'PHONE_REQUIRED') {
      setStep('phone');
      setError('');
      return false;
    }
    setError(result.message || 'Nu am reușit. Încearcă din nou.');
    return false;
  };

  const handleGoogleCredential = React.useCallback(async (resp: { credential: string }) => {
    googleIdTokenRef.current = resp.credential;
    setBusy(true);
    setError('');
    const res = await loginWithGoogle(resp.credential);
    setBusy(false);
    finish(res);
  }, []);

  // Butonul oficial Google, randat direct de biblioteca lor — nu-l desenăm
  // noi (garanția de brand a lui Google, plus recunoaștere instant).
  React.useEffect(() => {
    if (!GOOGLE_CLIENT_ID || step !== 'choose') return;
    let cancelled = false;
    let intervalId: number | undefined;
    let timeoutId: number | undefined;
    const render = () => {
      if (cancelled || !googleBtnRef.current || !window.google?.accounts?.id) return;
      if (intervalId) clearInterval(intervalId);
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill', width: 260,
      });
    };
    if (window.google?.accounts?.id) render();
    else {
      intervalId = window.setInterval(render, 200);
      timeoutId = window.setTimeout(() => { if (intervalId) clearInterval(intervalId); }, 8000);
    }
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [step, handleGoogleCredential]);

  const handleSendCode = async () => {
    if (!EMAIL_RE.test(email)) { setError('Scrie o adresă de email validă.'); return; }
    setBusy(true); setError('');
    const res = await requestEmailCode(email);
    setBusy(false);
    if (!res.ok) { setError(res.message || 'Nu am putut trimite codul. Încearcă din nou.'); return; }
    setCode('');
    setStep('code');
  };

  const handleVerifyCode = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Codul are 6 cifre.'); return; }
    setBusy(true); setError('');
    const res = await verifyEmailCode(email, code, phone || undefined);
    setBusy(false);
    finish(res);
  };

  const handlePhoneSubmit = async () => {
    if (!PHONE_RE.test(phone)) { setError('Scrie numărul ca 07xxxxxxxx.'); return; }
    setBusy(true); setError('');
    const res = googleIdTokenRef.current
      ? await loginWithGoogle(googleIdTokenRef.current, phone)
      : await verifyEmailCode(email, code, phone);
    setBusy(false);
    finish(res);
  };

  if (step === 'landing') {
    return (
      <div className="flex flex-col gap-2.5">
        <GlassButton type="button" tone="dark" full onClick={() => setStep('choose')}>
          Conectează-te
        </GlassButton>
        <GlassButton type="button" tone="neutral" full onClick={onSkip}>
          Cere ajutor fără cont
        </GlassButton>
      </div>
    );
  }

  if (step === 'choose') {
    return (
      <div className="flex flex-col gap-2.5">
        <BackLink onClick={() => { setStep('landing'); setError(''); }}>Înapoi</BackLink>
        {GOOGLE_CLIENT_ID && (
          <div className="flex flex-col items-center gap-2.5">
            <div ref={googleBtnRef} className="min-h-[44px]" />
            <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-graphite-soft">sau</span>
          </div>
        )}
        <Field
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="nume@exemplu.ro"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error || undefined}
        />
        <GlassButton type="button" tone="dark" full disabled={busy} onClick={handleSendCode}>
          {busy ? 'Se trimite…' : 'Trimite cod pe email'}
        </GlassButton>
      </div>
    );
  }

  if (step === 'code') {
    return (
      <div className="flex flex-col gap-2.5">
        <BackLink onClick={() => { setStep('choose'); setError(''); }}>Înapoi</BackLink>
        <Field
          label={`Codul trimis la ${email}`}
          hint="Valabil 10 minute."
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          error={error || undefined}
        />
        <GlassButton type="button" tone="dark" full disabled={busy} onClick={handleVerifyCode}>
          {busy ? 'Se verifică…' : 'Confirmă codul'}
        </GlassButton>
        <button type="button" disabled={busy} onClick={handleSendCode} className="self-center text-[0.8125rem] font-semibold text-graphite-soft underline underline-offset-2">
          Retrimite codul
        </button>
      </div>
    );
  }

  // step === 'phone'
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[0.8125rem] leading-relaxed text-graphite-soft">
        Mai avem nevoie de numărul tău ca eroul să te poată suna.
      </p>
      <Field
        label="Telefon"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        maxLength={10}
        placeholder="07xxxxxxxx"
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
        error={error || undefined}
      />
      <GlassButton type="button" tone="dark" full disabled={busy} onClick={handlePhoneSubmit}>
        {busy ? 'Se continuă…' : 'Continuă'}
      </GlassButton>
    </div>
  );
};
