import React, { useState } from 'react';
import { Plus, Trash, Spinner, CaretLeft, CaretRight } from '@phosphor-icons/react';

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

/* ---------------- câmpul din formular ---------------- */

interface FieldProps {
  urls: string[];
  onChange: (next: string[]) => void;
  /** id-ul pe care îl arată eticheta; formularul îl folosește ca să mute focusul */
  id?: string;
}

export const RequestPhotosField: React.FC<FieldProps> = ({ urls, onChange, id = 'sos-photos' }) => {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const room = MAX_REQUEST_PHOTOS - urls.length;

  const handleFiles = async (files: File[]) => {
    setError(null);

    /* Omul poate alege zece poze deodată din galerie. Luăm câte încap și îi
       spunem pe loc, ca să nu creadă că s-au urcat toate. */
    const chosen = files.slice(0, room);
    const ignored = files.length - chosen.length;
    if (ignored > 0) {
      setError(
        MAX_REQUEST_PHOTOS === urls.length + chosen.length && chosen.length > 0
          ? `Am luat primele ${chosen.length}. Șase poze sunt de ajuns.`
          : 'Ai deja șase poze. Scoate una dacă vrei să pui alta.',
      );
    }
    if (chosen.length === 0) return;

    /* Una câte una, nu toate deodată: pe o conexiune de telefon șase încărcări
       paralele se sufocă între ele și niciuna nu ajunge. Micșorarea o face
       `uploadSignedMedia` — vine dintr-un singur loc pentru tot situl. */
    const added: string[] = [];
    let failure: string | null = null;
    for (const file of chosen) {
      setBusy(b => b + 1);
      const result = await uploadSignedMedia(file, 'image');
      setBusy(b => b - 1);
      if (result.url) added.push(result.url);
      else if (!failure) failure = clientErrorText(result.reason || 'network');
    }

    if (added.length > 0) onChange([...urls, ...added]);
    /* Dacă una singură a picat din șase, mesajul ăsta ar acoperi vestea bună.
       Îl arătăm doar când chiar n-a intrat nimic, ori când e singura poză. */
    if (failure && added.length === 0) setError(failure);
    else if (failure) setError(`O poză n-a intrat. ${failure}`);
  };

  return (
    <div className="sf-field">
      <label htmlFor={id} className="sf-field__label">
        Poze cu problema <span className="rqp__optional">(opțional)</span>
      </label>
      <p className="rqp__hint">
        Arată ce s-a stricat. Eroul știe din poză ce scule să ia și cât durează.
      </p>

      <ul className="rqp__grid" aria-label="Pozele atașate cererii">
        {urls.map((url, i) => (
          <li key={url} className="rqp__cell">
            <img
              src={thumb(url, 260, { square: true })}
              alt={`Poza ${i + 1}`}
              loading="lazy"
              decoding="async"
            />
            <button
              type="button"
              className="rqp__drop"
              onClick={() => {
                onChange(urls.filter((_, k) => k !== i));
                setError(null);
              }}
              aria-label={`Scoate poza ${i + 1}`}
            >
              <Trash size={15} weight="bold" aria-hidden="true" />
            </button>
          </li>
        ))}

        {busy > 0 && (
          <li className="rqp__cell rqp__cell--busy" aria-live="polite">
            <Spinner size={22} weight="bold" className="rqp__spin" aria-hidden="true" />
            <span>Se încarcă…</span>
          </li>
        )}

        {room > 0 && (
          <li className="rqp__cell rqp__cell--add">
            <label className="rqp__add">
              <input
                id={id}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={e => {
                  /* Copia se face ÎNAINTE de golire, și e obligatorie: `files`
                     e o listă vie legată de câmp, iar golirea lui o golește și
                     pe ea — cu referința păstrată, `handleFiles` primea zero
                     poze și nu se urca nimic. */
                  const picked = e.target.files;
                  const files: File[] = [];
                  for (let i = 0; i < (picked ? picked.length : 0); i++) files.push(picked[i]);
                  // golim câmpul: altfel aceeași poză aleasă a doua oară nu
                  // declanșează `change` și pare că s-a blocat
                  e.target.value = '';
                  if (files.length) handleFiles(files);
                }}
              />
              <Plus size={20} weight="bold" aria-hidden="true" />
              <span>Adaugă</span>
            </label>
          </li>
        )}
      </ul>

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
