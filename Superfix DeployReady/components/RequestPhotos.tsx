import React, { useState } from 'react';
import { Camera, Spinner, CaretLeft, CaretRight, X } from '@phosphor-icons/react';

import { uploadSignedMedia, uploadErrorText, UploadFailure } from '../services/mediaUpload';
import { thumb, full } from '../lib/img';
import { Lightbox } from './Lightbox';

import './request-photos.css';

/* ============================================================
   Pozele pe care clientul le trimite odată cu cererea.

   Un om care cheamă un meseriaș nu știe cum se numește piesa care s-a rupt. Știe
   să arate. O poză cu robinetul care picură scutește două telefoane și îi spune
   eroului ce scule să pună în dubă înainte să plece.

   Aici sunt amândouă capetele: câmpul din formular, prin care se urcă, și fâșia
   de miniaturi, prin care se văd — în portal, în detaliul misiunii și în admin.
   Stau în același fișier fiindcă se schimbă împreună: dacă mâine se ridică
   limita de la șase, o singură constantă se mută.
   ============================================================ */

/** Cât acceptă serverul. Peste atât, restul sunt ignorate acolo — deci le oprim aici. */
export const MAX_REQUEST_PHOTOS = 6;

/* Textele de eroare ale sitului sunt scrise pentru eroi, care au cont. Aici e
   un om care cere ajutor și n-a avut niciodată unul: „intră din nou în cont" și
   „cere-ne alt link" nu-i spun nimic ce poate face. Îi spunem singurul lucru
   care chiar îl scoate din impas — trimite cererea fără poze. */
const clientErrorText = (reason: UploadFailure) =>
  reason === 'not-allowed' || reason === 'link-expired'
    ? 'Nu putem primi poze chiar acum. Trimite cererea fără ele — eroul te sună și îi arăți la fața locului.'
    : uploadErrorText(reason, 'image');

/* ---------------- pozele din formular, prinse cu clipsul ---------------- */

/** O poză din formular: `preview` se vede pe loc, `url` vine după urcare (gol cât se urcă). */
export interface ClipPhoto {
  key: string;
  preview: string;
  url: string;
}

interface ClipsProps {
  photos: ClipPhoto[];
  onChange: React.Dispatch<React.SetStateAction<ClipPhoto[]>>;
  /** „eroul” sau „echipa”: cine le vede */
  who?: string;
  /** id-ul câmpului de fișier, ca formularul să poată muta focusul */
  id?: string;
}

let clipSeq = 0;

/**
 * Pozele problemei, ca în aplicație (`PhotoClip`): fiecare poză e prinsă cu un clips metalic,
 * înclinată două grade, și apare pe loc, cât se urcă. Se scoate cu ×. Până la șase, cât primește
 * serverul. Urcarea e aceeași ca peste tot pe site (`uploadSignedMedia`, scopul `request`).
 */
export const RequestPhotoClips: React.FC<ClipsProps> = ({ photos, onChange, who = 'eroul', id = 'sos-photos' }) => {
  const [error, setError] = useState<string | null>(null);
  const room = MAX_REQUEST_PHOTOS - photos.length;
  const Who = who.charAt(0).toUpperCase() + who.slice(1);

  const handleFiles = async (files: File[]) => {
    setError(null);
    const chosen = files.slice(0, Math.max(0, room));
    if (files.length > chosen.length) {
      setError(chosen.length > 0 ? `Am luat primele ${chosen.length}. Șase poze sunt de ajuns.` : 'Ai deja șase poze. Scoate una dacă vrei să pui alta.');
    }
    if (chosen.length === 0) return;

    const fresh = chosen.map(file => ({ key: `c${(clipSeq += 1)}`, preview: URL.createObjectURL(file), url: '', file }));
    onChange(list => [...list, ...fresh.map(({ file, ...item }) => item)].slice(0, MAX_REQUEST_PHOTOS));

    /* Una câte una: pe o conexiune de telefon șase încărcări paralele se sufocă între ele. */
    let failure: string | null = null;
    let failed = 0;
    for (const item of fresh) {
      const result = await uploadSignedMedia(item.file, 'image', { purpose: 'request' });
      if (result.url) {
        onChange(list => list.map(photo => (photo.key === item.key ? { ...photo, url: result.url as string } : photo)));
      } else {
        failed += 1;
        if (!failure) failure = clientErrorText(result.reason || 'network');
        onChange(list => list.filter(photo => photo.key !== item.key));
        URL.revokeObjectURL(item.preview);
      }
    }
    if (failure) setError(failed === fresh.length ? failure : `O poză n-a intrat. ${failure}`);
  };

  const remove = (key: string) => {
    onChange(list => {
      const gone = list.find(photo => photo.key === key);
      if (gone?.preview.startsWith('blob:')) URL.revokeObjectURL(gone.preview);
      return list.filter(photo => photo.key !== key);
    });
    setError(null);
  };

  const addTile = (label: string) => (
    <label className="rqc__slot">
      <input
        id={id}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={e => {
          /* Copia se face ÎNAINTE de golire: `files` e o listă vie legată de câmp. */
          const picked = e.target.files;
          const files: File[] = [];
          for (let i = 0; i < (picked ? picked.length : 0); i++) files.push(picked[i]);
          e.target.value = '';
          if (files.length) handleFiles(files);
        }}
      />
      <span className="rqc__frame rqc__frame--empty">
        <Camera size={22} weight="duotone" aria-hidden="true" />
        <span>{label}</span>
      </span>
      <span className="rqc__clip" aria-hidden="true" />
    </label>
  );

  return (
    <div className="rqc">
      {photos.length === 0 ? (
        <div className="rqc__intro">
          {addTile('Fă o poză')}
          <div className="rqc__text">
            <strong>Adaugă poze (opțional)</strong>
            <span>{`Din poze, ${who} știe ce scule și ce piese să ia. Până la ${MAX_REQUEST_PHOTOS}.`}</span>
          </div>
        </div>
      ) : (
        <>
          <ul className="rqc__row" aria-label="Pozele atașate cererii">
            {photos.map((photo, i) => (
              <li key={photo.key} className="rqc__slot">
                <span className="rqc__frame">
                  <img src={photo.preview} alt={`Poza ${i + 1}`} decoding="async" />
                  {!photo.url && (
                    <span className="rqc__busy" aria-label="Se încarcă">
                      <Spinner size={22} weight="bold" className="rqp__spin" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="rqc__clip" aria-hidden="true" />
                <button type="button" className="rqc__remove" onClick={() => remove(photo.key)} aria-label={`Scoate poza ${i + 1}`}>
                  <X size={12} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
            {room > 0 && <li className="rqc__more">{addTile('Mai pune una')}</li>}
          </ul>
          <p className="rqc__caption">
            {photos.length === 1
              ? `${Who} o vede înainte să accepte și știe cu ce să vină.`
              : `${Who} le vede pe toate înainte să accepte.`}
          </p>
        </>
      )}
      {error && <p className="sf-field__error">{error}</p>}
    </div>
  );
};

/* ---------------- fâșia de miniaturi, pentru citit ---------------- */

interface StripProps {
  urls?: string[] | null;
  /** cine e în poze, pentru cititoarele de ecran */
  who?: string;
  className?: string;
}

export const RequestPhotoStrip: React.FC<StripProps> = ({ urls, who, className }) => {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [origin, setOrigin] = useState<DOMRect | null>(null);

  const list = (urls || []).filter(Boolean);
  if (list.length === 0) return null;

  const label = who ? `Poză trimisă de ${who}` : 'Poză trimisă de client';
  const step = (delta: number) =>
    setOpenAt(at => (at === null ? at : (at + delta + list.length) % list.length));

  return (
    <>
      <ul className={`rqp__strip${className ? ' ' + className : ''}`}>
        {list.map((url, i) => (
          <li key={url}>
            <button
              type="button"
              className="rqp__shot"
              onClick={e => {
                setOrigin(e.currentTarget.getBoundingClientRect());
                setOpenAt(i);
              }}
              aria-label={`${label} ${i + 1} din ${list.length}. Apasă ca s-o vezi mare.`}
            >
              <img
                src={thumb(url, 320, { square: true })}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </button>
          </li>
        ))}
      </ul>

      <Lightbox
        open={openAt !== null}
        onClose={() => setOpenAt(null)}
        originRect={origin}
        label={label}
      >
        <div className="rqp__stage">
          <img src={full(list[openAt ?? 0])} alt={`${label} ${(openAt ?? 0) + 1}`} />

          {/* Cu o singură poză, săgețile ar fi două butoane care nu duc nicăieri. */}
          {list.length > 1 && (
            <>
              <button
                type="button"
                className="rqp__arrow rqp__arrow--prev"
                onClick={e => { e.stopPropagation(); step(-1); }}
                aria-label="Poza dinainte"
              >
                <CaretLeft size={20} weight="bold" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="rqp__arrow rqp__arrow--next"
                onClick={e => { e.stopPropagation(); step(1); }}
                aria-label="Poza următoare"
              >
                <CaretRight size={20} weight="bold" aria-hidden="true" />
              </button>
              <span className="rqp__count">{(openAt ?? 0) + 1} / {list.length}</span>
            </>
          )}
        </div>
      </Lightbox>
    </>
  );
};
