import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, FloppyDisk, Camera, VideoCamera, MapPin, Trash,
} from '@phosphor-icons/react';

import { getMyBasics, peekMyBasics, submitBasicsUpdate, HeroBasics as Basics } from '../services/dataService';
import { Skel, SkeletonPage } from '../components/Loader';
import { thumb } from '../lib/img';
import { uploadSignedMedia, uploadErrorText } from '../services/mediaUpload';
import { readVideoFacts, videoComplaint } from '../lib/shrink';
import { RomaniaMap } from '../components/RomaniaMap';
import { PhotoCropper } from '../components/PhotoCropper';
import { useToast } from '../components/Toast';

import './portal.css';
import '../components/form.css';

/* ============================================================
   Datele de bază ale eroului: poza, clipul, descrierea, tariful, zonele.

   Se salvează direct, fără coadă de aprobare: backendul validează pe loc
   (alias 2–40, descriere 10–600, tarif întreg ≥20, minim un județ, media doar
   din uploadul propriu) și scrie în profil. `pending` vine mereu null.
   ============================================================ */

const ALL_COUNTIES = [
  'AB', 'AR', 'AG', 'BC', 'BH', 'BN', 'BT', 'BV', 'BR', 'BZ', 'CS', 'CL',
  'CJ', 'CT', 'CV', 'DB', 'DJ', 'GL', 'GR', 'GJ', 'HR', 'HD', 'IL', 'IS',
  'IF', 'MM', 'MH', 'MS', 'NT', 'OT', 'PH', 'SM', 'SJ', 'SB', 'SV', 'TR',
  'TM', 'TL', 'VS', 'VL', 'VN', 'B',
];

export const HeroBasics: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  // acelasi principiu ca in restul portalului: arata ce stii, verifica in fundal
  const known = peekMyBasics()?.current;
  const [form, setForm] = useState<Basics | null>(() => known ?? null);
  const [loading, setLoading] = useState(() => !known);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | 'video' | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false); // ca reimprospatarea sa nu cada peste ce tastezi
  const [errors, setErrors] = useState<Record<string, string>>({});
  // poza aleasă, înainte de decupaj
  const [toCrop, setToCrop] = useState<File | null>(null);

  useEffect(() => {
    const role = localStorage.getItem('superfix_role');
    if (role !== 'HERO') { navigate('/portal'); return; }

    let alive = true;
    (async () => {
      const data = await getMyBasics();
      if (!alive) return;
      if (!dirtyRef.current) setForm(data?.current ?? {});
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [navigate]);

  const set = <K extends keyof Basics>(key: K, value: Basics[K]) => {
    setForm(prev => ({ ...(prev ?? {}), [key]: value }));
    dirtyRef.current = true;
    setDirty(true);
    if (errors[key as string]) {
      setErrors(prev => { const n = { ...prev }; delete n[key as string]; return n; });
    }
  };

  const areas = form?.actionAreas ?? [];
  const allSelected = areas.length === ALL_COUNTIES.length;

  const toggleArea = (code: string) => {
    set('actionAreas', areas.includes(code) ? areas.filter(c => c !== code) : [...areas, code]);
  };

  /* Verificarea de mărime nu se mai face aici: `uploadSignedMedia` o are pe a ei,
     cu aceleași limite ca serverul, și întoarce motivul. Două locuri care spun
     același lucru ajung mai devreme sau mai târziu să nu-l mai spună la fel. */
  const upload = async (file: File, field: 'avatarUrl' | 'videoUrl') => {
    const isVideo = field === 'videoUrl';
    const kind = isVideo ? 'video' : 'image';

    /* La clip, măsurăm întâi. Altfel omul arde zeci de megaocteți din abonament
       ca să afle abia la capăt că e prea lung. */
    if (isVideo) {
      const complaint = videoComplaint(await readVideoFacts(file));
      if (complaint) { toast.error(complaint); return; }
    }

    setUploading(isVideo ? 'video' : 'avatar');
    const result = await uploadSignedMedia(file, kind);
    setUploading(null);
    if (!result.url) {
      toast.error(uploadErrorText(result.reason || 'network', kind));
      return;
    }
    set(field, result.url);
  };

  const save = async () => {
    if (!form) return;

    const next: Record<string, string> = {};
    if (!String(form.alias ?? '').trim()) next.alias = 'Fără nume de erou, nu te găsește nimeni.';
    if (!String(form.description ?? '').trim()) next.description = 'Spune în două rânduri ce faci.';
    const rate = Number(form.hourlyRate ?? 0);
    if (!rate || rate < 20) next.hourlyRate = 'Tariful pare prea mic. Verifică-l.';
    if (areas.length === 0) next.actionAreas = 'Alege măcar un județ, altfel nu apari în căutări.';

    if (Object.keys(next).length > 0) {
      setErrors(next);
      const first = ['alias', 'description', 'hourlyRate'].find(k => next[k]);
      if (first) document.getElementById(`b-${first}`)?.focus();
      return;
    }

    setSaving(true);
    const result = await submitBasicsUpdate({
      alias: form.alias,
      description: form.description,
      hourlyRate: rate,
      actionAreas: areas,
      avatarUrl: form.avatarUrl,
      videoUrl: form.videoUrl,
    });
    setSaving(false);

    if (result.ok) {
      dirtyRef.current = false;
      setDirty(false);
      toast.success('Salvat. Se vede deja pe profilul tău.');
    } else {
      // serverul are mesaje proprii, mai exacte decât orice ghicim noi aici
      toast.error(result.message || 'Nu s-a salvat. Mai încearcă o dată.');
    }
  };

  if (loading) {
    return (
      <SkeletonPage className="pb-8 font-sans md:pb-20">
        <header className="mx-auto max-w-3xl px-5 pt-28 sm:px-6">
          <Skel className="h-5 w-36" />
          <Skel className="mt-7 h-10 w-64 sm:h-12" />
          <Skel className="mt-5 h-5 w-full max-w-xl" />
          <Skel className="mt-2.5 h-5 w-2/3" />
        </header>

        <main className="mx-auto max-w-3xl space-y-6 px-5 py-10 sm:px-6">
          {/* poza si clipul */}
          <section className="sf-glass rounded-[28px] p-6 sm:p-7">
            <Skel className="h-6 w-40" />
            <Skel className="mt-3 h-4 w-3/4" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <Skel className="h-4 w-28" />
                <Skel className="mt-2 aspect-square w-full rounded-[20px]" />
              </div>
              <div>
                <Skel className="h-4 w-28" />
                <Skel className="mt-2 aspect-square w-full rounded-[20px]" />
              </div>
            </div>
          </section>

          {/* cine esti pe teren */}
          <section className="sf-glass space-y-5 rounded-[28px] p-6 sm:p-7">
            <Skel className="h-6 w-48" />
            <div>
              <Skel className="h-4 w-24" />
              <Skel className="mt-2 h-12 w-full rounded-2xl" />
            </div>
            <div>
              <Skel className="h-4 w-32" />
              <Skel className="mt-2 h-28 w-full rounded-2xl" />
            </div>
            <div>
              <Skel className="h-4 w-28" />
              <Skel className="mt-2 h-12 w-full rounded-2xl" />
            </div>
          </section>

          {/* zonele de actiune */}
          <section className="sf-glass rounded-[28px] p-6 sm:p-7">
            <Skel className="h-6 w-52" />
            <div className="mt-5 flex flex-wrap gap-2.5">
              {['w-24', 'w-32', 'w-20', 'w-28', 'w-24'].map((w, i) => (
                <Skel key={i} className={`h-9 ${w}`} />
              ))}
            </div>
          </section>
        </main>
      </SkeletonPage>
    );
  }

  return (
    <div className="pb-8 font-sans text-graphite md:pb-20">
      <Helmet>
        <title>Datele mele | Superfix</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="mx-auto max-w-3xl px-5 pt-28 sm:px-6">
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi în portal
        </Link>

        <h1 className="mt-7 font-heading text-[2.2rem] font-bold leading-[1.06] text-graphite sm:text-5xl">
          Datele mele
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-graphite-soft">
          Cu astea te găsesc clienții. Ce salvezi aici apare imediat pe profilul tău
          public.
        </p>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-10 sm:px-6">
        {/* POZA ȘI CLIPUL */}
        <section className="sf-glass rounded-[28px] p-6 sm:p-7">
          <h2 className="font-heading text-xl font-medium text-graphite">Poza și clipul</h2>
          <p className="mt-2 text-sm text-graphite-soft">
            Poza e primul lucru pe care îl vede clientul. Clipul e al doilea.
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="sf-field__label">Poză de profil</p>
              {form?.avatarUrl ? (
                <div className="relative overflow-hidden rounded-[20px] bg-cloud">
                  <img
                    src={thumb(form.avatarUrl, 700, { square: true })}
                    alt=""
                    className="block aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => set('avatarUrl', '')}
                    aria-label="Scoate poza"
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-graphite/70 text-white backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
                  >
                    <Trash size={16} weight="bold" />
                  </button>
                </div>
              ) : (
                <label className="sf-drop">
                  {/* Poza de profil trece întâi prin decupaj: aceeași poză apare
                      pe sit și pătrată, și rotundă. Vezi `PhotoCropper`. */}
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
              {form?.videoUrl ? (
                <div className="relative overflow-hidden rounded-[20px] bg-graphite">
                  <video src={form.videoUrl} controls preload="metadata" className="block aspect-square w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => set('videoUrl', '')}
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
                      if (f) upload(f, 'videoUrl');
                    }}
                  />
                  <VideoCamera size={26} weight="duotone" aria-hidden="true" />
                  <span>{uploading === 'video' ? 'Se încarcă…' : 'Adaugă clipul'}</span>
                </label>
              )}
            </div>
          </div>
        </section>

        {/* IDENTITATE */}
        <section className="sf-glass space-y-5 rounded-[28px] p-6 sm:p-7">
          <h2 className="font-heading text-xl font-medium text-graphite">Cine ești pe teren</h2>

          <div className="sf-field">
            <label htmlFor="b-alias" className="sf-field__label">Nume de erou</label>
            <input
              id="b-alias"
              type="text"
              className="sf-field__input"
              placeholder="Ex: Petrică Iscusitul"
              value={form?.alias ?? ''}
              aria-invalid={Boolean(errors.alias)}
              aria-describedby={errors.alias ? 'b-alias-error' : undefined}
              onChange={e => set('alias', e.target.value)}
            />
            {errors.alias && <p id="b-alias-error" className="sf-field__error">{errors.alias}</p>}
          </div>

          <div className="sf-field">
            <label htmlFor="b-description" className="sf-field__label">Descriere</label>
            <textarea
              id="b-description"
              rows={4}
              maxLength={600}
              className="sf-field__input"
              placeholder="Ce faci, de câți ani, cu ce te ocupi cel mai des."
              value={form?.description ?? ''}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'b-description-error' : undefined}
              onChange={e => set('description', e.target.value)}
            />
            {errors.description && (
              <p id="b-description-error" className="sf-field__error">{errors.description}</p>
            )}
          </div>

          <div className="sf-field">
            <label htmlFor="b-hourlyRate" className="sf-field__label">Tarif pe oră (lei)</label>
            <input
              id="b-hourlyRate"
              type="number"
              min={20}
              inputMode="numeric"
              className="sf-field__input w-40"
              value={form?.hourlyRate ?? ''}
              aria-invalid={Boolean(errors.hourlyRate)}
              aria-describedby={errors.hourlyRate ? 'b-hourlyRate-error' : undefined}
              onChange={e => set('hourlyRate', e.target.value === '' ? undefined : Number(e.target.value))}
            />
            {errors.hourlyRate && (
              <p id="b-hourlyRate-error" className="sf-field__error">{errors.hourlyRate}</p>
            )}
          </div>
        </section>

        {/* ZONE */}
        <section className="sf-glass rounded-[28px] p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-xl font-medium text-graphite">
                <MapPin size={22} weight="duotone" className="text-super-red" aria-hidden="true" />
                Unde te deplasezi
              </h2>
              <p className="mt-2 text-sm text-graphite-soft">
                {areas.length} din {ALL_COUNTIES.length} județe alese.
              </p>
            </div>
            <button
              type="button"
              onClick={() => set('actionAreas', allSelected ? [] : [...ALL_COUNTIES])}
              className="portal-link"
            >
              {allSelected ? 'Deselectează tot' : 'Toată țara'}
            </button>
          </div>

          {errors.actionAreas && <p className="sf-field__error">{errors.actionAreas}</p>}

          <div className="mt-6 overflow-hidden rounded-[20px] bg-white/50 p-3">
            <RomaniaMap value={areas} onToggle={toggleArea} />
          </div>
        </section>
      </main>

      {/* bara de salvare, ca peste tot pe site */}
      <div
        className="sticky bottom-0 z-40 px-3 pb-3 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="sf-glass mx-auto flex max-w-xl items-center gap-3 rounded-full p-2 pl-5">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-graphite-soft">
            {dirty ? 'Ai schimbări nesalvate' : 'Totul e salvat'}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-super-red px-6 py-3.5 font-heading text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(225,55,70,0.9)] transition-all active:scale-[0.97] disabled:opacity-40 sm:hover:-translate-y-0.5"
          >
            <FloppyDisk size={18} weight="fill" aria-hidden="true" />
            {saving ? 'Se salvează…' : 'Salvează'}
          </button>
        </div>
      </div>

      {toCrop && (
        <PhotoCropper
          file={toCrop}
          title="Așază poza de profil"
          onCancel={() => setToCrop(null)}
          onDone={cropped => { setToCrop(null); upload(cropped, 'avatarUrl'); }}
        />
      )}
    </div>
  );
};

export default HeroBasics;
