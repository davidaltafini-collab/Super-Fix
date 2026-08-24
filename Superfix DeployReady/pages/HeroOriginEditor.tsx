import React, { useEffect, useMemo, useRef, useState } from 'react';
import { thumb } from '../lib/img';
import { Skel, SkeletonPage } from '../components/Loader';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowUpRight, ArrowLeft, FloppyDisk, Plus, Trash, Wrench, Images, Eye, EyeSlash, Trophy,
} from '@phosphor-icons/react';

import {
  getOriginDraft, peekOriginDraft, saveOriginDraft, OriginDraft,
  getMyPortfolio, peekMyPortfolio, retractPortfolioItem, MyPortfolioItem,
} from '../services/dataService';
import { uploadSignedMedia, uploadErrorText } from '../services/mediaUpload';
import { useToast } from '../components/Toast';

import './hero-origin.css';
import '../components/form.css';

/* ============================================================
   Editorul pentru „Cine e sub costum".

   Nu e un formular. Eroul scrie DIRECT în cadrele pe care le vor vedea
   clienții: aceleași panouri de bandă desenată, aceleași casete de legendă,
   doar că textul e editabil. Vede pagina construindu-se pe măsură ce scrie.

   Întrebări, nu casete goale. O casetă goală cu „spune-ne povestea ta" rămâne
   goală la aproape toată lumea; la o întrebare concretă răspunde oricine.

   Intrare pe două căi: erou logat, sau butonul din email cu `?token=`. A doua
   e motivul pentru care pagina asta e separată de portal — zero pași până la
   scris.
   ============================================================ */

interface Prompt {
  key: keyof OriginDraft;
  caption: string;
  help: string;
  span: 'wide' | 'big' | 'small';
  tone: 'red' | 'calm';
  rows: number;
  max: number;
}

const PROMPTS: Prompt[] = [
  { key: 'originStory', caption: 'Cum a început tot', help: 'Cum ai ajuns să faci meseria asta?', span: 'wide', tone: 'red', rows: 5, max: 800 },
  { key: 'hardestMission', caption: 'Cea mai grea misiune', help: 'O lucrare care ți-a dat bătăi de cap.', span: 'big', tone: 'red', rows: 5, max: 800 },
  { key: 'favoriteTool', caption: 'Nu pleci de acasă fără', help: 'O singură unealtă.', span: 'small', tone: 'calm', rows: 2, max: 80 },
  { key: 'neverDoes', caption: 'Ce nu faci niciodată', help: 'Regula ta, pe care n-o încalci la nicio lucrare.', span: 'big', tone: 'calm', rows: 5, max: 800 },
  { key: 'team', caption: 'Ții cu', help: 'Echipa favorită.', span: 'small', tone: 'red', rows: 2, max: 80 },
  { key: 'petPeeve', caption: 'Ce te scoate din sărite', help: 'La meseria asta, ce te enervează cel mai tare?', span: 'wide', tone: 'calm', rows: 4, max: 800 },
];

const MAX_ARSENAL = 8;

export const HeroOriginEditor: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const toast = useToast();

  /* Ce am citit o data ramane in memoria sesiunii: daca te intorci pe pagina,
     apare pe loc si doar se reimprospateaza pe tacute. */
  const known = peekOriginDraft(token);
  const [draft, setDraft] = useState<OriginDraft | null>(() => known ?? null);
  const [loading, setLoading] = useState(() => !known);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  /* Aceeasi informatie ca `dirty`, dar citibila dintr-un raspuns care a plecat
     inainte ca omul sa inceapa sa scrie. Fara ea, reimprospatarea din fundal ar
     putea ateriza peste un text pe jumatate tastat. */
  const dirtyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await getOriginDraft(token);
      if (!alive) return;
      if (!dirtyRef.current) setDraft(data ?? {});
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]);

  /* Portofoliul cere sesiune de erou (Bearer) — nu merge pe calea cu token din
     email, deci secțiunea de mai jos apare doar cand esti logat direct. */
  const [portfolio, setPortfolio] = useState<MyPortfolioItem[]>(() => (!token ? peekMyPortfolio() ?? [] : []));
  const [retracting, setRetracting] = useState<string | null>(null);

  useEffect(() => {
    if (token) return;
    let alive = true;
    (async () => {
      const items = await getMyPortfolio();
      if (alive) setPortfolio(items);
    })();
    return () => { alive = false; };
  }, [token]);

  const retract = async (id: string) => {
    setRetracting(id);
    const ok = await retractPortfolioItem(id);
    setRetracting(null);
    if (!ok) { toast.error('Nu s-a putut ascunde din portofoliu. Mai încearcă o dată.'); return; }
    setPortfolio(prev => prev.map(p => (p.id === id ? { ...p, reviewStatus: 'REMOVED' } : p)));
    toast.success('Ascunsă din portofoliul public.');
  };

  const set = <K extends keyof OriginDraft>(key: K, value: OriginDraft[K]) => {
    setDraft(prev => ({ ...(prev ?? {}), [key]: value }));
    dirtyRef.current = true;
    setDirty(true);
  };

  /* Câte întrebări au răspuns. Arătăm progresul ca să se vadă că merge și
     parțial: trei răspunsuri fac deja o pagină decentă. */
  const answered = useMemo(
    () => PROMPTS.filter(p => String(draft?.[p.key] ?? '').trim() !== '').length,
    [draft],
  );

  const arsenal = draft?.arsenal ?? [];

  const handleUpload = async (file: File) => {
    if (arsenal.length >= MAX_ARSENAL) {
      toast.info(`Opt poze sunt de ajuns pentru un arsenal.`);
      return;
    }
    setUploading(true);
    const result = await uploadSignedMedia(file, 'image', token ? { originToken: token } : {});
    setUploading(false);
    if (!result.url) {
      toast.error(uploadErrorText(result.reason || 'network', 'image'));
      return;
    }
    set('arsenal', [...arsenal, result.url]);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const result = await saveOriginDraft(
      {
        yearsActive: draft.yearsActive ?? null,
        originStory: draft.originStory ?? '',
        hardestMission: draft.hardestMission ?? '',
        neverDoes: draft.neverDoes ?? '',
        favoriteTool: draft.favoriteTool ?? '',
        team: draft.team ?? '',
        petPeeve: draft.petPeeve ?? '',
        arsenal,
        proudMissionId: draft.proudMissionId ?? null,
      },
      token,
    );
    setSaving(false);
    if (result.ok) {
      dirtyRef.current = false;
      setDirty(false);
      toast.success('Povestea ta e salvată.');
    } else {
      toast.error(result.message || 'Nu s-a salvat. Mai încearcă o dată.');
    }
  };

  if (loading) {
    return (
      <SkeletonPage className="pb-8 font-sans md:pb-20">
        <header className="mx-auto max-w-5xl px-5 pt-28 sm:px-6">
          <Skel className="h-5 w-36" />
          <Skel className="mt-7 h-11 w-80 sm:h-14" />
          <Skel className="mt-5 h-5 w-full max-w-xl" />
        </header>

        <main className="mx-auto max-w-5xl space-y-8 px-5 py-12 sm:px-6">
          {[0, 1, 2].map(i => (
            <section key={i} className="sf-glass rounded-[28px] p-6 sm:p-7">
              <Skel className="h-6 w-56" />
              <Skel className="mt-3 h-4 w-3/4" />
              <Skel className="mt-5 h-28 w-full rounded-2xl" />
            </section>
          ))}
        </main>
      </SkeletonPage>
    );
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-32 text-center sm:px-6">
        <h1 className="font-heading text-3xl font-bold text-graphite">Linkul nu mai e valabil</h1>
        <p className="mt-4 text-graphite-soft">
          Intră în portal cu numele de cod și parola, și găsești pagina acolo.
        </p>
        <Link
          to="/portal"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-graphite px-7 font-heading font-semibold text-white transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
        >
          Intră în portal
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-8 font-sans text-graphite md:pb-20">
      <Helmet>
        <title>Cine e sub costum | Superfix</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="mx-auto max-w-5xl px-5 pt-28 sm:px-6">
        {!token && (
          <Link
            to="/portal"
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
          >
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            Înapoi în portal
          </Link>
        )}

        <p className="font-heading text-sm font-semibold uppercase tracking-[0.18em] text-super-red">
          Doar pentru tine
        </p>
        <h1 className="mt-3 font-heading text-[2.2rem] font-bold leading-[1.06] text-graphite sm:text-5xl">
          Cine e sub costum?
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-graphite-soft">
          Clienții văd deja ce știi să faci. Aici te văd pe tine. Răspunde doar la
          întrebările care îți plac, sari peste restul. Trei răspunsuri fac deja o
          pagină bună.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <span className="sf-clay rounded-full px-4 py-2 font-heading text-sm font-semibold text-graphite">
            {answered} din {PROMPTS.length} răspunsuri
          </span>
          {draft.slug && (
            <Link
              to={`/hero/${draft.slug}/origine`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-super-red underline underline-offset-4"
            >
              Vezi cum arată pentru clienți
              <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-6">
        {/* Anii de meserie: singura cifră de pe pagină, deci stă separat de povești */}
        <div className="sf-glass mb-10 flex flex-wrap items-center gap-4 rounded-[24px] p-6">
          <label htmlFor="years" className="font-heading text-lg font-medium text-graphite">
            De câți ani faci meseria?
          </label>
          <input
            id="years"
            type="number"
            min={0}
            max={70}
            inputMode="numeric"
            className="sf-field__input w-28"
            value={draft.yearsActive ?? ''}
            onChange={e => set('yearsActive', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>

        {/* Aceleași panouri ca pe pagina publică, doar că se poate scrie în ele */}
        <div className="origin-grid">
          {PROMPTS.map(prompt => {
            const value = String(draft[prompt.key] ?? '');
            return (
              <div key={String(prompt.key)} className={`origin-cell origin-cell--${prompt.span}`}>
                <article className="origin-panel" data-tone={prompt.tone}>
                  <span className="origin-panel__caption">{prompt.caption}</span>

                  <label htmlFor={`p-${String(prompt.key)}`} className="sr-only">
                    {prompt.caption}
                  </label>
                  <textarea
                    id={`p-${String(prompt.key)}`}
                    rows={prompt.rows}
                    maxLength={prompt.max}
                    placeholder={prompt.help}
                    className="origin-panel__input"
                    value={value}
                    onChange={e => set(prompt.key, e.target.value as OriginDraft[typeof prompt.key])}
                  />

                  <p className="origin-panel__count">
                    {value.length > 0 ? `${value.length} / ${prompt.max}` : prompt.help}
                  </p>
                </article>
              </div>
            );
          })}
        </div>

        {/* ARSENALUL */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-graphite">
            <Wrench size={24} weight="duotone" className="text-super-red" aria-hidden="true" />
            Arsenalul
          </h2>
          <p className="mt-2 text-graphite-soft">
            Uneltele, duba, atelierul. Partea pe care oamenii o răsfoiesc cel mai mult.
          </p>

          <div className="origin-arsenal mt-6">
            {arsenal.map((url, i) => (
              <div key={url + i} className="origin-arsenal__shot relative">
                {/* 480px = dublul latimii reale (240px), pentru ecrane retina */}
                <img src={thumb(url, 480)} alt="" loading="lazy" decoding="async" />
                <button
                  type="button"
                  onClick={() => set('arsenal', arsenal.filter((_, k) => k !== i))}
                  aria-label="Scoate poza din arsenal"
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-graphite/70 text-white backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
                >
                  <Trash size={16} weight="bold" />
                </button>
              </div>
            ))}

            {arsenal.length < MAX_ARSENAL && (
              <label className="origin-arsenal__add">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleUpload(file);
                  }}
                />
                <Plus size={26} weight="bold" aria-hidden="true" />
                <span>{uploading ? 'Se încarcă…' : 'Adaugă o poză'}</span>
              </label>
            )}
          </div>
        </section>

        {/* MISIUNEA DE CARE E MÂNDRU */}
        {draft.missions && draft.missions.length > 0 && (
          <section className="mt-14">
            <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-graphite">
              <Trophy size={24} weight="duotone" className="text-super-red" aria-hidden="true" />
              Misiunea de care ești mândru
            </h2>
            <p className="mt-2 text-graphite-soft">
              Alege o singură lucrare — cea mai bună dovadă a muncii tale. Apare într-o
              secțiune specială pe pagina ta publică, separat de restul portofoliului.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {draft.missions.map(m => {
                const picked = draft.proudMissionId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="origin-pick cursor-pointer appearance-none border-0 bg-transparent p-0 text-left"
                    data-picked={picked}
                    onClick={() => set('proudMissionId', picked ? null : m.id)}
                  >
                    <img
                      src={thumb(m.afterUrl || m.beforeUrl, 480, { square: true })}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span>{m.title || 'Misiune'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* PORTOFOLIUL PUBLIC */}
        {!token && draft.missions && draft.missions.length > 0 && (
          <section className="mt-14">
            <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-graphite">
              <Images size={24} weight="duotone" className="text-super-red" aria-hidden="true" />
              Portofoliul tău public
            </h2>
            <p className="mt-2 text-graphite-soft">
              Alege ce lucrări apar pe profilul tău. O lucrare nouă intră în portofoliu doar
              dacă bifezi consimțământul chiar la finalizarea misiunii — cele de mai jos fără
              acel pas rămân nepublicate.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {draft.missions.map(m => {
                const item = portfolio.find(p => p.missionId === m.id);
                const visible = item?.reviewStatus === 'APPROVED' || item?.reviewStatus === 'PENDING_REVIEW';
                const removed = item?.reviewStatus === 'REMOVED';
                const isBusy = retracting === item?.id;
                return (
                  <div key={m.id} className="origin-pick" data-picked={visible}>
                    <img
                      src={thumb(m.afterUrl || m.beforeUrl, 480, { square: true })}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span>{m.title || 'Misiune'}</span>
                    {visible ? (
                      <button
                        type="button"
                        onClick={() => item && retract(item.id)}
                        disabled={isBusy}
                        className="origin-pick__toggle"
                      >
                        <Eye size={14} weight="bold" aria-hidden="true" />
                        {isBusy ? 'Se ascunde…' : 'Vizibilă — ascunde'}
                      </button>
                    ) : (
                      <div className="origin-pick__toggle" data-muted="true">
                        <EyeSlash size={14} weight="bold" aria-hidden="true" />
                        {removed ? 'Ascunsă' : 'Nepublicată'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Bara de salvare: andocată, ca pilul de pe profil */}
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
    </div>
  );
};

export default HeroOriginEditor;
