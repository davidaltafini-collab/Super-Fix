import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, CheckCircle, PaperPlaneTilt, Sparkle } from '@phosphor-icons/react';

import { useToast } from '../components/Toast';
import { Field, FieldArea } from '../components/Field';
import { GlassButton } from '../components/Button';
import { JobCategory } from '../types';
import { API_URL } from '../config/api';
import {
  checkAll, first, required, minLength, maxLength, email as emailCheck,
  phoneRo, normalizePhone, firstBad, focusField,
} from '../lib/validate';

import './register.css';

/* ============================================================
   Înscrierea unui erou nou.

   Formularul e scurt, dar înainte nu se vedea nimic din ce iese din el:
   completai șase câmpuri și apăsai un buton. Acum, sus, se completează singură
   legitimația — numele, meseria, inițialele. E chiar ce ajunge pe profilul
   public, deci nu e o animație: e o previzualizare.

   Validarea browserului e scoasă (`noValidate`). Balonul lui apare în limba
   sistemului, adică engleză la aproape toată lumea, dispare la primul clic și
   nu spune care câmp e de vină. Mesajele stau acum sub câmpul lor.
   ============================================================ */

type GrowthCodeType = 'REFERRAL' | 'RECRUITER';

const normalizeGrowthCode = (value: string) =>
  value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

const TRADES = Object.values(JobCategory).filter(t => t !== JobCategory.OTHER);

/** Inițialele, pentru discul din legitimație. */
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');

/** 0744123456 → 0744 123 456. Zece cifre la rând nu se citesc dintr-o privire. */
const prettyPhone = (value: string) => {
  const digits = normalizePhone(value);
  if (!/^0\d{9}$/.test(digits)) return value.trim();
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
};

const FIELD_ORDER = ['name', 'phone', 'email', 'category', 'message'] as const;

export const RegisterHero: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    message: '',
    category: '' as string,
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [otherTrade, setOtherTrade] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const [growthCode, setGrowthCode] = useState('');
  const [detectedType, setDetectedType] = useState<GrowthCodeType | null>(null);
  const [codeError, setCodeError] = useState('');

  const badgeRef = useRef<HTMLDivElement>(null);

  /* ---------- codul din link ---------- */
  useEffect(() => {
    const referral = normalizeGrowthCode(searchParams.get('ref') || '');
    const recruiter = normalizeGrowthCode(searchParams.get('recruiter') || '');

    if (referral && recruiter) {
      setGrowthCode('');
      setDetectedType(null);
      setCodeError('Linkul are două coduri deodată. Lasă-l pe cel pe care vrei să-l folosești.');
      return;
    }

    setGrowthCode(referral || recruiter);
    setDetectedType(referral ? 'REFERRAL' : recruiter ? 'RECRUITER' : null);
    setCodeError('');
  }, [searchParams]);

  /* ---------- legitimația se înclină după deget/cursor ----------
     Doar pe ecrane cu cursor: pe telefon degetul stă chiar peste card și
     mișcarea ar părea o eroare de atingere. */
  useEffect(() => {
    const card = badgeRef.current;
    if (!card) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const move = (event: PointerEvent) => {
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      card.style.setProperty('--tilt-y', `${x * 7}deg`);
      card.style.setProperty('--tilt-x', `${-y * 7}deg`);
    };
    const rest = () => {
      card.style.setProperty('--tilt-y', '0deg');
      card.style.setProperty('--tilt-x', '0deg');
    };

    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', rest);
    return () => {
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerleave', rest);
    };
  }, []);

  const set = (key: keyof typeof form, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    if (errors[key]) setErrors(current => ({ ...current, [key]: undefined }));
  };

  const rules = {
    name: first(
      required('Cum te cheamă? Fără nume nu putem începe.'),
      minLength(3, 'Scrie numele întreg, nu doar o literă.'),
      maxLength(120),
    ),
    phone: first(
      required('Pe telefon te căutăm. Fără el, nu avem cum.'),
      phoneRo(),
    ),
    email: first(
      required('Pe email îți trimitem confirmarea.'),
      emailCheck(),
    ),
    category: required('Alege meseria ta. Fără ea nu te găsește nimeni.'),
    message: maxLength(600, 'Peste 600 de caractere nu încape. Spune-ne pe scurt.'),
  };

  const resolveGrowthCode = async (code: string): Promise<GrowthCodeType> => {
    const response = await fetch(`${API_URL}/growth/code/${encodeURIComponent(code)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.valid || !['REFERRAL', 'RECRUITER'].includes(data.type)) {
      throw new Error(data.message || 'Codul ăsta nu mai e activ. Verifică-l sau lasă câmpul gol.');
    }
    return data.type as GrowthCodeType;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setCodeError('');

    const found = checkAll(form, rules);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const firstKey = firstBad([...FIELD_ORDER], found);
      if (firstKey === 'category') {
        document.getElementById('reg-trades')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else if (firstKey) {
        focusField(`reg-${String(firstKey)}`);
      }
      return;
    }

    setLoading(true);
    try {
      const code = normalizeGrowthCode(growthCode);
      const codePayload: { referralCode?: string; recruiterCode?: string } = {};

      if (code) {
        try {
          const type = await resolveGrowthCode(code);
          if (type === 'REFERRAL') codePayload.referralCode = code;
          else codePayload.recruiterCode = code;
        } catch (reason) {
          setCodeError(reason instanceof Error ? reason.message : 'Codul nu a putut fi verificat.');
          focusField('reg-code');
          return;
        }
      }

      const response = await fetch(`${API_URL}/apply-hero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: normalizePhone(form.phone),
          email: form.email.trim(),
          message: form.message.trim(),
          category: form.category,
          ...codePayload,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setSent(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        toast.error(data.message || data.error || 'Ceva n-a mers. Mai încearcă o dată.');
      }
    } catch {
      toast.error('Nu am ajuns la sediul central. Verifică semnalul și încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  const badgeInitials = useMemo(() => initials(form.name), [form.name]);
  const contactLine = [prettyPhone(form.phone), form.email.trim()].filter(Boolean).join(' · ');

  return (
    <div className="pb-16 font-sans text-graphite">
      <Helmet>
        <title>Devino erou | Superfix</title>
        <meta
          name="description"
          content="Înscrie-te ca meseriaș pe Superfix. Completezi o dată datele, iar echipa te contactează pentru verificare."
        />
      </Helmet>

      <header className="mx-auto max-w-2xl px-5 pt-28 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi acasă
        </Link>

        <h1 className="mt-7 font-heading text-[2.4rem] font-bold uppercase leading-[1.02] text-graphite sm:text-6xl">
          Devino erou
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-graphite-soft">
          Completezi o dată, te sunăm noi. Cât scrii, îți vezi legitimația cum se
          face — exact așa te vede clientul.
        </p>
      </header>

      <main className="mx-auto max-w-2xl px-5 sm:px-6">
        {/* ---------------- LEGITIMAȚIA ---------------- */}
        <div ref={badgeRef} className="badge mt-9">
          <div className="badge__top">
            <img src="/logo.svg" alt="Superfix" className="h-9 w-auto" />
            <span className="badge__kind">Legitimație de erou</span>
          </div>

          <div className="badge__body">
            <span className="badge__disc" data-empty={badgeInitials ? 'false' : 'true'} aria-hidden="true">
              {badgeInitials}
            </span>

            <div className="badge__lines">
              {form.name.trim() ? (
                <p className="badge__name">{form.name.trim()}</p>
              ) : (
                <span className="badge__ghost block h-5 w-40 sm:w-52" aria-hidden="true" />
              )}

              {form.category ? (
                <p className="badge__role">{form.category}</p>
              ) : (
                <span className="badge__ghost mt-2.5 block h-3.5 w-24" aria-hidden="true" />
              )}

              {contactLine ? (
                <p className="badge__contact">{contactLine}</p>
              ) : (
                <span className="badge__ghost mt-2.5 block h-3 w-32 sm:w-44" aria-hidden="true" />
              )}
            </div>
          </div>

          <div className="badge__foot">
            <span className="badge__status" data-live={sent ? 'true' : 'false'}>
              <span className="badge__dot" aria-hidden="true" />
              {sent ? 'În verificare' : 'Nedepusă'}
            </span>
            {growthCode && <span className="badge__code">{normalizeGrowthCode(growthCode)}</span>}
          </div>
        </div>

        {/* ---------------- DUPĂ TRIMITERE ---------------- */}
        {sent ? (
          <section className="sf-glass mt-6 rounded-[28px] p-7 text-center sm:p-9" aria-live="polite">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-super-red/12 text-super-red">
              <CheckCircle size={30} weight="fill" aria-hidden="true" />
            </span>
            <h2 className="mt-5 font-heading text-2xl font-bold text-graphite">Dosarul a plecat</h2>
            <p className="mx-auto mt-3 max-w-md leading-relaxed text-graphite-soft">
              Ți-am trimis confirmarea pe <strong className="text-graphite">{form.email.trim()}</strong>.
              Ne uităm peste el și te sunăm la <strong className="text-graphite">{prettyPhone(form.phone)}</strong>.
              De obicei durează o zi lucrătoare.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <GlassButton type="button" tone="dark" onClick={() => navigate('/heroes')}>
                Vezi ceilalți eroi
              </GlassButton>
              <GlassButton type="button" tone="neutral" onClick={() => navigate('/')}>
                Înapoi acasă
              </GlassButton>
            </div>
          </section>
        ) : (
          /* ---------------- FOAIA ---------------- */
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-8">
            <section className="sf-glass space-y-5 rounded-[28px] p-6 sm:p-7">
              <h2 className="reg-section">Cine ești</h2>

              <Field
                id="reg-name"
                label="Nume complet"
                placeholder="Popescu Ion"
                autoComplete="name"
                maxLength={120}
                value={form.name}
                error={errors.name}
                onChange={e => set('name', e.target.value)}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="reg-phone"
                  label="Telefon"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0744 123 456"
                  value={form.phone}
                  error={errors.phone}
                  onChange={e => set('phone', e.target.value)}
                />
                <Field
                  id="reg-email"
                  label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="ion@exemplu.ro"
                  value={form.email}
                  error={errors.email}
                  onChange={e => set('email', e.target.value)}
                />
              </div>
            </section>

            <section className="sf-glass space-y-5 rounded-[28px] p-6 sm:p-7">
              <h2 className="reg-section">Ce știi să faci</h2>

              <div id="reg-trades">
                <p className="sf-field__label">Meseria ta</p>
                <div className="flex flex-wrap gap-2.5" role="group" aria-label="Meseria ta">
                  {TRADES.map(trade => (
                    <button
                      key={trade}
                      type="button"
                      className="reg-trade"
                      aria-pressed={!otherTrade && form.category === trade}
                      onClick={() => { setOtherTrade(false); set('category', trade); }}
                    >
                      {trade}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="reg-trade"
                    aria-pressed={otherTrade}
                    onClick={() => {
                      setOtherTrade(true);
                      set('category', '');
                      window.setTimeout(() => focusField('reg-other'), 40);
                    }}
                  >
                    <Sparkle size={15} weight="fill" className="mr-1.5" aria-hidden="true" />
                    Altceva
                  </button>
                </div>

                {otherTrade && (
                  <div className="mt-4">
                    <Field
                      id="reg-other"
                      label="Scrie-o tu"
                      placeholder="Montator panouri solare"
                      maxLength={60}
                      value={form.category}
                      error={errors.category}
                      onChange={e => set('category', e.target.value)}
                    />
                  </div>
                )}

                {errors.category && !otherTrade && (
                  <p className="sf-field__error" role="status">{errors.category}</p>
                )}
              </div>

              <FieldArea
                id="reg-message"
                label="De ce vrei să fii erou?"
                hint="Opțional. Două rânduri sunt de ajuns."
                rows={3}
                counter={600}
                maxLength={600}
                placeholder="Lucrez de 12 ani în Timișoara, mai ales la centrale…"
                value={form.message}
                error={errors.message}
                onChange={e => set('message', e.target.value)}
              />
            </section>

            <section className="sf-glass rounded-[28px] p-6 sm:p-7">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="reg-section">Ai un cod?</h2>
                <span className="text-xs font-semibold text-graphite-soft/70">opțional</span>
              </div>

              <div className="mt-5">
                <Field
                  id="reg-code"
                  label="Cod de invitație sau de recruiter"
                  placeholder="ERO-… sau REC-…"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={80}
                  className="[&_input]:font-mono [&_input]:uppercase"
                  value={growthCode}
                  error={codeError}
                  hint={
                    detectedType
                      ? detectedType === 'REFERRAL'
                        ? 'Cod luat din link — te-a invitat un erou.'
                        : 'Cod luat din link — vii de la un recruiter.'
                      : 'Un singur cod de cont. Dacă ai venit dintr-un link, e completat deja.'
                  }
                  onChange={e => {
                    setGrowthCode(e.target.value.toUpperCase());
                    setCodeError('');
                  }}
                />
              </div>
            </section>

            <GlassButton type="submit" tone="red" full disabled={loading} className="min-h-14 text-xl">
              <PaperPlaneTilt size={20} weight="fill" aria-hidden="true" />
              {loading ? 'Se trimite…' : 'Trimite dosarul'}
            </GlassButton>

            <p className="text-center text-[0.8125rem] leading-relaxed text-graphite-soft">
              Trimițând dosarul ești de acord cu{' '}
              <Link to="/terms" className="font-semibold underline decoration-super-red/40 underline-offset-2 hover:text-graphite">termenii</Link>
              {' '}și cu{' '}
              <Link to="/privacy" className="font-semibold underline decoration-super-red/40 underline-offset-2 hover:text-graphite">politica de confidențialitate</Link>.
            </p>
          </form>
        )}
      </main>
    </div>
  );
};
