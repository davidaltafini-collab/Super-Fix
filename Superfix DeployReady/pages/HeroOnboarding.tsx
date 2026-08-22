import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Camera, CheckCircle, Lock, MapTrifold, ListBullets, Trash, VideoCamera,
  PaperPlaneTilt, ShieldCheck, Play, CaretUp, ClockCounterClockwise, EnvelopeSimple,
} from '@phosphor-icons/react';

import { RomaniaMap } from '../components/RomaniaMap';
import { Field, FieldArea, FieldPassword } from '../components/Field';
import { GlassButton, GlassLink } from '../components/Button';
import { API_URL } from '../config/api';
import { LEGAL } from '../config/legal';
import { uploadSignedMedia, uploadErrorText } from '../services/mediaUpload';
import { readVideoFacts, videoComplaint } from '../lib/shrink';
import { PhotoCropper } from '../components/PhotoCropper';
import { thumb } from '../lib/img';
import {
  checkAll, first, required, minLength, maxLength, strongPassword, sameAs,
  firstBad, focusField,
} from '../lib/validate';

import './onboarding.css';

/* ============================================================
   Echiparea profilului.

   E primul ecran pe care îl vede un meseriaș aprobat, iar de el depinde cât de
   complet ajunge profilul lui pe sit. De asta pașii sunt numerotați și se vede
   cât mai e: cine se oprește la jumătate trebuie să știe unde a rămas.

   Un lucru care se strica înainte fără să se vadă: tariful trecea prin
   `parseInt(e.target.value)`, iar la câmp golit ieșea `NaN` — care pleca așa
   spre server. Acum câmpul rămâne text până la trimitere.
   ============================================================ */

/* ============================================================
   Ciorna.

   Linkul de echipare ține 72 de ore. Cine îl deschide mai târziu descoperă că a
   murit abia când apasă ceva — și, fără asta, pierde tot ce a completat, inclusiv
   un clip de 40MB urcat pe date mobile. Ce a fost urcat deja e pe Cloudinary, deci
   adresele rămân bune și cu un link nou.

   Parola nu se salvează niciodată. Restul e ce ar fi scris oricum public pe
   profilul lui.
   ============================================================ */
const MAX_VIDEO_SIZE_MB = 50;

const DRAFT_KEY = 'superfix_onboarding_draft';
const DRAFT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type Draft = {
  at: number;
  alias: string;
  description: string;
  hourlyRate: string;
  areas: string[];
  avatarUrl: string;
  videoUrl: string;
};

const readDraft = (): Draft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!draft?.at || Date.now() - draft.at > DRAFT_MAX_AGE) return null;
    return draft;
  } catch {
    return null;
  }
};

const writeDraft = (draft: Omit<Draft, 'at'>) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, at: Date.now() }));
  } catch {
    /* stocare blocată sau plină: mergem mai departe, doar că nu ținem minte */
  }
};

const dropDraft = () => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nimic de făcut */
  }
};

const ALL_COUNTIES = [
  'AB', 'AR', 'AG', 'BC', 'BH', 'BN', 'BT', 'BV', 'BR', 'BZ', 'CS', 'CL',
  'CJ', 'CT', 'CV', 'DB', 'DJ', 'GL', 'GR', 'GJ', 'HR', 'HD', 'IL', 'IS',
  'IF', 'MM', 'MH', 'MS', 'NT', 'OT', 'PH', 'SM', 'SJ', 'SB', 'SV', 'TR',
  'TM', 'TL', 'VS', 'VL', 'VN', 'B',
];

const COUNTY_NAMES: Record<string, string> = {
  AB: 'Alba', AR: 'Arad', AG: 'Argeș', BC: 'Bacău', BH: 'Bihor',
  BN: 'Bistrița-Năsăud', BT: 'Botoșani', BV: 'Brașov', BR: 'Brăila',
  BZ: 'Buzău', CS: 'Caraș-Severin', CL: 'Călărași', CJ: 'Cluj',
  CT: 'Constanța', CV: 'Covasna', DB: 'Dâmbovița', DJ: 'Dolj',
  GL: 'Galați', GR: 'Giurgiu', GJ: 'Gorj', HR: 'Harghita',
  HD: 'Hunedoara', IL: 'Ialomița', IS: 'Iași', IF: 'Ilfov',
  MM: 'Maramureș', MH: 'Mehedinți', MS: 'Mureș', NT: 'Neamț',
  OT: 'Olt', PH: 'Prahova', SM: 'Satu Mare', SJ: 'Sălaj',
  SB: 'Sibiu', SV: 'Suceava', TR: 'Teleorman', TM: 'Timiș',
  TL: 'Tulcea', VS: 'Vaslui', VL: 'Vâlcea', VN: 'Vrancea',
  B: 'București',
};

const Step: React.FC<{ no: number; title: string; done: boolean; children?: React.ReactNode }> = ({
  no, title, done, children,
}) => (
  <div className="onb-step" data-done={done ? 'true' : 'false'}>
    <span className="onb-step__no" aria-hidden="true">{done ? '✓' : no}</span>
    <div>
      <h2 className="onb-step__title">{title}</h2>
      {children && <p className="mt-1 text-sm leading-relaxed text-graphite-soft">{children}</p>}
    </div>
  </div>
);

const HeroOnboarding: React.FC = () => {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');

  const [form, setForm] = useState({
    alias: '',
    password: '',
    confirm: '',
    description: '',
    hourlyRate: '100',
  });
  const [areas, setAreas] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [uploading, setUploading] = useState<'avatar' | 'video' | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [sent, setSent] = useState(false);
  const [asList, setAsList] = useState(false);
  // poza aleasă, înainte de decupaj
  const [toCrop, setToCrop] = useState<File | null>(null);
  // linkul a murit între timp; nu mai are rost să completeze mai departe
  const [linkDead, setLinkDead] = useState(false);
  /* Clipul pornește închis. Un `<iframe>` de YouTube trage peste un megabyte de
     script înainte să apese cineva pe el, iar aici e primul lucru din pagină:
     ar întârzia tocmai formularul pentru care a venit omul. Se încarcă la
     apăsare. */
  const [guideOpen, setGuideOpen] = useState(false);

  /* Ce a apucat să scrie data trecută. Se citește o singură dată, la montare. */
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setForm(current => ({
      ...current,
      alias: draft.alias || current.alias,
      description: draft.description || current.description,
      hourlyRate: draft.hourlyRate || current.hourlyRate,
    }));
    if (draft.areas?.length) setAreas(draft.areas);
    if (draft.avatarUrl) setAvatarUrl(draft.avatarUrl);
    if (draft.videoUrl) setVideoUrl(draft.videoUrl);
  }, []);

  /* Și se scrie la fiecare schimbare. Parola nu intră niciodată aici. */
  useEffect(() => {
    if (sent) return;
    writeDraft({
      alias: form.alias,
      description: form.description,
      hourlyRate: form.hourlyRate,
      areas,
      avatarUrl,
      videoUrl,
    });
  }, [form.alias, form.description, form.hourlyRate, areas, avatarUrl, videoUrl, sent]);

  const set = (key: keyof typeof form, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    if (errors[key]) setErrors(current => ({ ...current, [key]: undefined }));
    setServerError('');
  };

  /* Ce e gata și ce nu — pentru numerele stinse și pentru bara de sus. */
  const doneSteps = {
    one: form.alias.trim().length >= 2 && form.password.length >= 10 && form.confirm === form.password,
    two: Boolean(avatarUrl),
    three: form.description.trim().length >= 10 && Number(form.hourlyRate) >= 20,
    four: areas.length > 0,
  };
  const progress = useMemo(() => {
    const values = Object.values(doneSteps);
    return Math.round((values.filter(Boolean).length / values.length) * 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneSteps.one, doneSteps.two, doneSteps.three, doneSteps.four]);

  const upload = async (file: File, kind: 'avatar' | 'video') => {
    /* Clipul se măsoară înainte, ca să nu urce degeaba de pe date mobile. */
    if (kind === 'video') {
      const complaint = videoComplaint(await readVideoFacts(file));
      if (complaint) { setServerError(complaint); return; }
    }

    setUploading(kind);
    setServerError('');
    const result = await uploadSignedMedia(file, kind === 'video' ? 'video' : 'image', {
      onboardingToken: inviteToken || undefined,
    });
    setUploading(null);

    if (!result.url) {
      /* Linkul mort nu e o eroare de câmp: nimic din ce mai face aici n-o să
         meargă, deci îl scoatem din formular acum, nu după ce completează tot. */
      if (result.reason === 'link-expired') { setLinkDead(true); return; }
      setServerError(uploadErrorText(result.reason || 'network', kind === 'video' ? 'video' : 'image'));
      return;
    }
    if (kind === 'video') setVideoUrl(result.url);
    else setAvatarUrl(result.url);
  };

  const toggleArea = (code: string) =>
    setAreas(current => (current.includes(code) ? current.filter(c => c !== code) : [...current, code]));

  const allSelected = areas.length === ALL_COUNTIES.length;
  const toggleAll = () => setAreas(allSelected ? [] : [...ALL_COUNTIES]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteToken) return;
    setServerError('');

    const found = checkAll(form, {
      alias: first(
        required('Orice erou are un nume. Al tău care e?'),
        minLength(2, 'Prea scurt. Mai adaugă o literă.'),
        maxLength(40, 'Peste 40 de caractere nu încape pe profil.'),
      ),
      password: first(required('Alege o parolă pentru contul tău.'), strongPassword()),
      confirm: first(
        required('Mai scrie parola o dată.'),
        sameAs(() => form.password, 'Cele două nu sunt la fel. Verifică-le.'),
      ),
      description: first(
        required('Spune în două rânduri ce faci. Asta citește clientul întâi.'),
        minLength(10, 'Încă puțin — două rânduri sunt de ajuns.'),
        maxLength(600, 'Peste 600 de caractere nu încape.'),
      ),
      hourlyRate: value => {
        const rate = Number(value);
        if (!value.trim()) return 'Scrie un tarif orientativ.';
        if (!Number.isFinite(rate) || rate < 20) return 'Tariful pare prea mic. Mai uită-te la el.';
        if (rate > 5000) return 'Tariful pare prea mare. Verifică-l o dată.';
        return undefined;
      },
    });

    if (areas.length === 0) {
      found.areas = 'Alege măcar un județ, altfel nu-ți ajunge nicio misiune.';
    }

    if (Object.keys(found).length > 0) {
      setErrors(found);
      const worst = firstBad(['alias', 'password', 'confirm', 'description', 'hourlyRate'], found);
      if (worst) focusField(`onb-${String(worst)}`);
      else document.getElementById('onb-areas')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/auth/hero-onboarding/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          password: form.password,
          alias: form.alias.trim(),
          description: form.description.trim(),
          hourlyRate: Number(form.hourlyRate),
          actionAreas: areas,
          avatarUrl,
          videoUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && typeof data.token === 'string') {
        dropDraft();
        setSent(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (data.error === 'INVITE_INVALID') {
        setLinkDead(true);
      } else {
        setServerError(data.message || 'Nu s-a salvat. Verifică datele și mai încearcă.');
      }
    } catch {
      setServerError('Nu ținem legătura cu serverul. Dă un refresh și încearcă din nou.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- fără link valid ---------------- */
  if (!inviteToken) {
    return (
      <div className="pb-20 font-sans text-graphite">
        <Helmet>
          <title>Echipare profil | Superfix</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <main className="mx-auto max-w-md px-5 pt-32 sm:px-6">
          <section className="sf-glass rounded-[28px] p-7 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-graphite/8 text-graphite">
              <ShieldCheck size={30} weight="duotone" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">Pagina asta e cu invitație</h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              Se deschide doar din linkul primit pe email, după ce dosarul tău a fost
              aprobat. Linkul e bun 72 de ore și o singură dată — dacă a trecut de
              atât sau l-ai folosit deja, scrie-ne și îți trimitem altul pe loc.
            </p>
            <a
              href={`mailto:${LEGAL.supportEmail}?subject=${encodeURIComponent('Am nevoie de un link nou de echipare')}`}
              className="mt-4 inline-block font-semibold text-graphite underline decoration-super-red/45 underline-offset-4"
            >
              {LEGAL.supportEmail}
            </a>
            <div className="mt-7">
              <GlassButton type="button" tone="dark" full onClick={() => { window.location.href = '/'; }}>
                Înapoi acasă
              </GlassButton>
            </div>
          </section>
        </main>
      </div>
    );
  }

  /* ---------------- linkul a murit ---------------- */
  if (linkDead) {
    const subject = encodeURIComponent('Am nevoie de un link nou de echipare');
    const body = encodeURIComponent(
      `Salut, linkul meu de echipare nu mai merge.${form.alias.trim() ? `

Nume de erou: ${form.alias.trim()}` : ''}`,
    );
    return (
      <div className="pb-20 font-sans text-graphite">
        <Helmet>
          <title>Link expirat | Superfix</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <main className="mx-auto max-w-md px-5 pt-32 sm:px-6">
          <section className="sf-glass rounded-[28px] p-7 text-center" aria-live="assertive">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-graphite/8 text-graphite">
              <ClockCounterClockwise size={30} weight="duotone" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">Linkul nu mai e bun</h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              Ține 72 de ore și se folosește o singură dată. Scrie-ne și îți trimitem
              altul pe loc — durează un minut.
            </p>
            {/* Cel mai important rând de aici: că nu și-a pierdut munca. */}
            <p className="mt-4 rounded-2xl bg-white/60 p-3.5 text-sm leading-relaxed text-graphite">
              Tot ce ai completat rămâne salvat pe telefonul ăsta. Când intri pe linkul
              nou, te așteaptă acolo — inclusiv poza și clipul.
            </p>
            <div className="mt-7">
              <GlassLink
                href={`mailto:${LEGAL.supportEmail}?subject=${subject}&body=${body}`}
                tone="red"
                full
              >
                <EnvelopeSimple size={19} weight="fill" aria-hidden="true" />
                Cere-mi un link nou
              </GlassLink>
            </div>
          </section>
        </main>
      </div>
    );
  }

  /* ---------------- trimis ---------------- */
  if (sent) {
    return (
      <div className="pb-20 font-sans text-graphite">
        <Helmet>
          <title>Profil trimis | Superfix</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <main className="mx-auto max-w-md px-5 pt-32 sm:px-6">
          <section className="sf-glass rounded-[28px] p-7 text-center" aria-live="polite">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-super-red/12 text-super-red">
              <CheckCircle size={30} weight="fill" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-heading text-2xl font-bold text-graphite">Profilul e gata</h1>
            <p className="mt-3 leading-relaxed text-graphite-soft">
              <strong className="text-graphite">{form.alias.trim()}</strong> e salvat cu tot ce ai
              completat. A mai rămas un singur pas.
            </p>
            {/* Adevărul, spus pe față. `archived` e `true` la creare și numai
                modulul de facturare îl face `false` — nicio verificare de om nu
                intervine după onboarding, și niciun email nu vine de la sine.
                Textul de dinainte promitea exact asta și lăsa oameni să aștepte
                degeaba. Vezi `server/prisma/schema.prisma:82` și `server/billing.ts`. */}
            <p className="mt-4 rounded-2xl bg-white/60 p-4 text-left text-sm leading-relaxed text-graphite">
              <strong>Ca să apari în căutări, activează listarea din portal.</strong> Până
              atunci profilul există, dar nu-l vede niciun client. Dacă ai un cod de invitație
              sau de recruiter, se aplică singur la activare.
            </p>
            <div className="mt-7 flex flex-col gap-3">
              {/* Pasul care chiar urmează. Trimiterea în portal îl lăsa să caute
                  singur de ce nu apare nicăieri. */}
              <GlassButton type="button" tone="red" full onClick={() => { window.location.href = '/abonament'; }}>
                Activează listarea
              </GlassButton>
              <Link
                to="/"
                className="text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
              >
                Înapoi acasă
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  /* ---------------- formularul ---------------- */
  return (
    <div className="pb-20 font-sans text-graphite">
      <Helmet>
        <title>Echipare profil | Superfix</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="mx-auto max-w-2xl px-5 pt-28 sm:px-6">
        <h1 className="font-heading text-[2.2rem] font-bold uppercase leading-[1.04] text-graphite sm:text-5xl">
          Echipare
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-graphite-soft">
          Patru pași și profilul tău e pe sit. Poți schimba orice mai târziu, din portal.
        </p>

        <div className="mt-7">
          <div className="onb-bar">
            <div className="onb-bar__fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-sm font-semibold text-graphite-soft">
            <span className="tabular-nums">{progress}%</span> completat
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 sm:px-6">
        {/* clipul de îndrumare */}
        <section className="sf-glass mt-8 rounded-[28px] p-5 sm:p-6">
          <button
            type="button"
            onClick={() => setGuideOpen(open => !open)}
            aria-expanded={guideOpen}
            className="flex w-full items-center gap-3.5 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-super-red/12 text-super-red">
              {guideOpen ? <CaretUp size={19} weight="bold" /> : <Play size={19} weight="fill" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="onb-step__title block">Cum arată un profil bun</span>
              <span className="mt-0.5 block text-sm text-graphite-soft">
                {guideOpen ? 'Ascunde clipul' : 'Un minut de uitat înainte să începi. Merită.'}
              </span>
            </span>
          </button>

          {guideOpen && (
            <div className="onb-tutorial mt-5">
              <iframe
                src="https://www.youtube.com/embed/qlgBAqtwgcI?autoplay=1"
                title="Cum îți faci profilul pe Superfix"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </section>

        <form onSubmit={submit} noValidate className="mt-6 space-y-6">
          {/* ---------- 1 ---------- */}
          <section className="sf-glass space-y-5 rounded-[28px] p-6 sm:p-7">
            <Step no={1} title="Numele și parola" done={doneSteps.one}>
              Numele de erou e cel pe care îl văd clienții. Parola e a ta, pentru portal.
            </Step>

            <Field
              id="onb-alias"
              label="Numele tău de erou"
              placeholder="Ion Fulger"
              maxLength={40}
              autoComplete="nickname"
              value={form.alias}
              error={errors.alias}
              onChange={e => set('alias', e.target.value)}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FieldPassword
                id="onb-password"
                label="Parolă"
                autoComplete="new-password"
                maxLength={128}
                hint="Minimum 10 caractere, cu literă mare, mică și cifră."
                value={form.password}
                error={errors.password}
                onChange={e => set('password', e.target.value)}
              />
              <FieldPassword
                id="onb-confirm"
                label="Încă o dată"
                autoComplete="new-password"
                maxLength={128}
                value={form.confirm}
                error={errors.confirm}
                onChange={e => set('confirm', e.target.value)}
              />
            </div>
          </section>

          {/* ---------- 2 ---------- */}
          <section className="sf-glass rounded-[28px] p-6 sm:p-7">
            <Step no={2} title="Cum arăți" done={doneSteps.two}>
              Lumea are încredere în cine poate vedea. Poza e obligatorie, clipul ajută mult.
            </Step>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="sf-field__label">Poză de profil</p>
                {avatarUrl ? (
                  <div className="relative overflow-hidden rounded-[20px] bg-cloud">
                    <img
                      src={thumb(avatarUrl, 700, { square: true })}
                      alt=""
                      className="block aspect-square w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('')}
                      aria-label="Scoate poza"
                      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-graphite/70 text-white backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
                    >
                      <Trash size={16} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <label className="sf-drop">
                    {/* Poza de profil nu pleacă direct: trece prin decupaj, ca să
                        iasă pătrată și cu fața în cerc. Vezi `PhotoCropper`. */}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) setToCrop(f);
                      }}
                    />
                    <Camera size={26} weight="duotone" aria-hidden="true" />
                    <span>{uploading === 'avatar' ? 'Se încarcă…' : 'Adaugă poza'}</span>
                  </label>
                )}
              </div>

              <div>
                <p className="sf-field__label">Clip de prezentare</p>
                {videoUrl ? (
                  <div className="relative overflow-hidden rounded-[20px] bg-graphite">
                    <video src={videoUrl} controls preload="metadata" className="block aspect-square w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setVideoUrl('')}
                      aria-label="Scoate clipul"
                      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-graphite/70 text-white backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
                    >
                      <Trash size={16} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <label className="sf-drop">
                    <input
                      type="file"
                      accept="video/*"
                      className="sr-only"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) upload(f, 'video');
                      }}
                    />
                    <VideoCamera size={26} weight="duotone" aria-hidden="true" />
                    <span>{uploading === 'video' ? 'Se încarcă…' : 'Adaugă clipul'}</span>
                  </label>
                )}
                <p className="mt-2 text-[0.8125rem] text-graphite-soft">
                  Treizeci de secunde ajung. Maximum {MAX_VIDEO_SIZE_MB}MB.
                </p>
              </div>
            </div>
          </section>

          {/* ---------- 3 ---------- */}
          <section className="sf-glass space-y-5 rounded-[28px] p-6 sm:p-7">
            <Step no={3} title="Ce faci și cu cât" done={doneSteps.three}>
              Scrie cum ai spune unui vecin. Fără cuvinte mari.
            </Step>

            <FieldArea
              id="onb-description"
              label="Despre tine"
              rows={5}
              counter={600}
              maxLength={600}
              placeholder="Lucrez de 12 ani în Timișoara, mai ales la centrale și instalații sanitare. Vin cu sculele mele și las curat în urmă."
              value={form.description}
              error={errors.description}
              onChange={e => set('description', e.target.value)}
            />

            <Field
              id="onb-hourlyRate"
              label="Tarif orientativ pe oră"
              type="text"
              inputMode="numeric"
              className="max-w-[14rem] [&_input]:tabular-nums"
              hint="În lei. E doar un punct de plecare — prețul final îl stabilești tu cu clientul."
              value={form.hourlyRate}
              error={errors.hourlyRate}
              onChange={e => set('hourlyRate', e.target.value.replace(/[^\d]/g, ''))}
            />
          </section>

          {/* ---------- 4 ---------- */}
          <section id="onb-areas" className="sf-glass rounded-[28px] p-6 sm:p-7">
            <Step no={4} title="Unde lucrezi" done={doneSteps.four}>
              Alege județele în care te deplasezi. Primești misiuni doar de acolo.
            </Step>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button type="button" className="onb-county" aria-pressed={allSelected} onClick={toggleAll}>
                {allSelected ? 'Scoate tot' : 'Toată țara'}
              </button>
              <button
                type="button"
                className="onb-county"
                onClick={() => setAsList(v => !v)}
                aria-pressed={asList}
              >
                {asList ? <MapTrifold size={15} weight="bold" /> : <ListBullets size={15} weight="bold" />}
                {asList ? 'Pe hartă' : 'Ca listă'}
              </button>
              <span className="text-sm font-semibold text-graphite-soft">
                <span className="tabular-nums text-graphite">{areas.length}</span> din {ALL_COUNTIES.length}
              </span>
            </div>

            <div className="mt-5">
              {asList ? (
                <div className="sf-scroll max-h-[22rem] overflow-y-auto pr-1" data-fade="bottom">
                  <div className="flex flex-wrap gap-2">
                    {ALL_COUNTIES.map(code => (
                      <button
                        key={code}
                        type="button"
                        className="onb-county"
                        aria-pressed={areas.includes(code)}
                        onClick={() => toggleArea(code)}
                      >
                        {code}
                        <span className="onb-county__name">{COUNTY_NAMES[code]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-[32rem]">
                  <RomaniaMap value={areas} onToggle={toggleArea} />
                </div>
              )}
            </div>

            {errors.areas && <p className="sf-field__error" role="status">{errors.areas}</p>}
          </section>

          {serverError && (
            <p className="rounded-2xl bg-super-red/8 p-4 text-sm font-semibold leading-relaxed text-super-red-dark" role="alert">
              {serverError}
            </p>
          )}

          <GlassButton type="submit" tone="red" full disabled={busy} className="min-h-14 text-xl">
            <PaperPlaneTilt size={20} weight="fill" aria-hidden="true" />
            {busy ? 'Se trimite…' : 'Trimite profilul'}
          </GlassButton>

          {/* Cele 72 de ore sunt scrise și în email; aici contează mai mult, pentru
              că omul poate reveni la formular peste câteva zile crezând că îl
              așteaptă. `createOnboardingInvite` din backend le impune. */}
          <p className="flex items-center justify-center gap-2 text-center text-[0.8125rem] text-graphite-soft">
            <Lock size={14} weight="fill" aria-hidden="true" />
            Linkul e doar al tău, ține 72 de ore și se folosește o singură dată.
          </p>
        </form>
      </main>

      {toCrop && (
        <PhotoCropper
          file={toCrop}
          title="Așază poza de profil"
          onCancel={() => setToCrop(null)}
          onDone={cropped => { setToCrop(null); upload(cropped, 'avatar'); }}
        />
      )}
    </div>
  );
};

export default HeroOnboarding;
