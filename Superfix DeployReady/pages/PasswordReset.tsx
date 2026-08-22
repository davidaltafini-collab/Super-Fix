import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, CheckCircle, Key, PaperPlaneTilt } from '@phosphor-icons/react';

import { API_URL } from '../config/api';
import { Field, FieldPassword, FieldSelect } from '../components/Field';
import { GlassButton } from '../components/Button';
import {
  checkAll, first, required, email as emailCheck, strongPassword, sameAs,
  firstBad, focusField,
} from '../lib/validate';

/* ============================================================
   Recuperarea parolei.

   Pagina are două fețe, alese de link, nu de om: cu `?token=` în adresă ești
   deja verificat și pui parola nouă; fără el, ceri linkul.

   Nu spunem niciodată dacă adresa există sau nu în baza de date. Un mesaj de
   tipul „nu avem contul ăsta" e o unealtă bună pentru cine vrea să afle cine e
   înscris pe sit. De asta răspunsul e același în ambele cazuri.
   ============================================================ */

type Role = 'CLIENT' | 'HERO' | 'RECRUITER';

const ROLE_HOME: Record<Role, string> = {
  CLIENT: '/',
  HERO: '/portal',
  RECRUITER: '/recruiter',
};

export const PasswordReset: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const asked = params.get('role');

  const [role, setRole] = useState<Role>(
    asked === 'HERO' || asked === 'RECRUITER' ? asked : 'CLIENT',
  );
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'sent' | 'changed' | null>(null);
  const [serverError, setServerError] = useState('');

  const set = (key: keyof typeof form, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    if (errors[key]) setErrors(current => ({ ...current, [key]: undefined }));
    setServerError('');
  };

  /* ---------- cererea linkului ---------- */
  const askForLink = async (event: React.FormEvent) => {
    event.preventDefault();

    const found = checkAll(form, {
      email: first(required('Scrie adresa cu care ai contul.'), emailCheck()),
    });
    if (found.email) {
      setErrors(found);
      focusField('pr-email');
      return;
    }

    setBusy(true);
    setServerError('');
    try {
      const response = await fetch(`${API_URL}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), role }),
      });
      if (!response.ok) throw new Error('Cererea n-a ajuns la server.');
      setDone('sent');
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : 'Eroare de conexiune.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------- parola nouă ---------- */
  const saveNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();

    const found = checkAll(form, {
      password: first(required('Scrie parola nouă.'), strongPassword()),
      confirm: first(
        required('Mai scrie-o o dată, să fim siguri.'),
        sameAs(() => form.password, 'Cele două nu sunt la fel. Verifică-le.'),
      ),
    });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const worst = firstBad(['password', 'confirm'], found);
      if (worst) focusField(`pr-${String(worst)}`);
      return;
    }

    setBusy(true);
    setServerError('');
    try {
      const response = await fetch(`${API_URL}/auth/password-reset/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Linkul nu mai e bun. Cere altul, durează un minut.');
      }
      setForm({ email: '', password: '', confirm: '' });
      setDone('changed');
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : 'Eroare de conexiune.');
    } finally {
      setBusy(false);
    }
  };

  const back = ROLE_HOME[role];

  return (
    <div className="pb-20 font-sans text-graphite">
      <Helmet>
        <title>Resetare parolă | Superfix</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <main className="mx-auto max-w-md px-5 pt-28 sm:px-6">
        <Link
          to={back}
          className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi
        </Link>

        <h1 className="mt-7 font-heading text-[2.1rem] font-bold uppercase leading-[1.05] text-graphite sm:text-5xl">
          {token ? 'Parolă nouă' : 'Ai uitat parola?'}
        </h1>
        <p className="mt-4 leading-relaxed text-graphite-soft">
          {token
            ? 'Alege una pe care o ții minte. Când o salvezi, toate sesiunile vechi se închid — și pe telefon, și pe calculator.'
            : 'Se întâmplă. Îți trimitem un link, e bun o oră și o singură dată.'}
        </p>

        {/* ---------------- REUȘIT ---------------- */}
        {done ? (
          <section className="sf-glass mt-8 rounded-[28px] p-7 text-center" aria-live="polite">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-super-red/12 text-super-red">
              <CheckCircle size={30} weight="fill" aria-hidden="true" />
            </span>
            <h2 className="mt-5 font-heading text-xl font-bold text-graphite">
              {done === 'sent' ? 'Am trimis, dacă era unde trebuie' : 'Gata, parola e schimbată'}
            </h2>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              {done === 'sent'
                ? 'Dacă adresa are un cont la noi, linkul e deja pe drum. Verifică și în spam — uneori acolo aterizează.'
                : 'Poți intra în cont cu parola nouă. Sesiunile vechi s-au închis toate.'}
            </p>
            <div className="mt-7">
              <GlassButton type="button" tone="dark" full onClick={() => { window.location.href = back; }}>
                {role === 'CLIENT' ? 'Înapoi acasă' : 'Intră în cont'}
              </GlassButton>
            </div>
          </section>
        ) : token ? (
          /* ---------------- PAROLA NOUĂ ---------------- */
          <form onSubmit={saveNewPassword} noValidate className="sf-glass mt-8 space-y-5 rounded-[28px] p-6 sm:p-7">
            <FieldPassword
              id="pr-password"
              label="Parolă nouă"
              autoComplete="new-password"
              maxLength={128}
              hint="Minimum 10 caractere, cu literă mare, literă mică și cifră."
              value={form.password}
              error={errors.password}
              onChange={e => set('password', e.target.value)}
            />
            <FieldPassword
              id="pr-confirm"
              label="Încă o dată"
              autoComplete="new-password"
              maxLength={128}
              value={form.confirm}
              error={errors.confirm}
              onChange={e => set('confirm', e.target.value)}
            />

            {serverError && (
              <p className="rounded-2xl bg-super-red/8 p-3.5 text-sm font-semibold text-super-red-dark" role="alert">
                {serverError}
              </p>
            )}

            <GlassButton type="submit" tone="red" full disabled={busy} className="min-h-14 text-lg">
              <Key size={19} weight="fill" aria-hidden="true" />
              {busy ? 'Se salvează…' : 'Salvează parola'}
            </GlassButton>
          </form>
        ) : (
          /* ---------------- CEREREA LINKULUI ---------------- */
          <form onSubmit={askForLink} noValidate className="sf-glass mt-8 space-y-5 rounded-[28px] p-6 sm:p-7">
            <FieldSelect
              id="pr-role"
              label="Ce fel de cont ai?"
              value={role}
              onChange={e => setRole(e.target.value as Role)}
            >
              <option value="CLIENT">Cont de client</option>
              <option value="HERO">Cont de erou</option>
              <option value="RECRUITER">Cont de recruiter</option>
            </FieldSelect>

            <Field
              id="pr-email"
              label="Emailul contului"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="ion@exemplu.ro"
              value={form.email}
              error={errors.email}
              onChange={e => set('email', e.target.value)}
            />

            {serverError && (
              <p className="rounded-2xl bg-super-red/8 p-3.5 text-sm font-semibold text-super-red-dark" role="alert">
                {serverError}
              </p>
            )}

            <GlassButton type="submit" tone="red" full disabled={busy} className="min-h-14 text-lg">
              <PaperPlaneTilt size={19} weight="fill" aria-hidden="true" />
              {busy ? 'Se trimite…' : 'Trimite-mi linkul'}
            </GlassButton>
          </form>
        )}
      </main>
    </div>
  );
};
