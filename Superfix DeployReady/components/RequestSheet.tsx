import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  BuildingApartment, CaretRight, Car, CheckCircle, House, MagnifyingGlass, MapPin, MoonStars,
  NavigationArrow, Plus, Prohibit, Spinner,
} from '@phosphor-icons/react';

import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { Skel } from './Loader';
import { AddressAutocomplete } from './AddressAutocomplete';
import { ClipPhoto, RequestPhotoClips } from './RequestPhotos';
import { createServiceRequest } from '../services/dataService';
import { failureMessage } from '../lib/apiError';
import { GeoPoint, geocodeAddress, getCurrentLocation, isLocationError, locationErrorText } from '../lib/geo';
import {
  aboutLeiText, distanceKm, isLocalityOnly, isValidEmail, isValidMobileRo, loadSavedContact, loadSavedPlace,
  loadSearchPlace, parseZone, PublicZone, reachOfZone, zoneCircle, saveSavedContact, saveSavedPlace, saveSearchPlace, shortPlaceName,
} from '../lib/place';
import { firstNameOf, offUntilDate, whenLabel } from '../lib/signal';
import type { ServiceRequest } from '../types';

import './form.css';
import './request.css';

/* Harta (MapLibre) se aduce abia când formularul chiar are ce arăta pe ea. */
const MapPreview = lazy(() => import('./Map').then(m => ({ default: m.MapPreview })));
const MapPicker = lazy(() => import('./Map').then(m => ({ default: m.MapPicker })));

/* ============================================================
   CEREREA — formularul de pe profilul eroului, ca în aplicație
   (`SuperfixApp/src/app/request/[heroId].tsx`).

   Aceeași ordine și aceleași cuvinte: „Cheamă X”, „Ce problemă ai?”, pozele cu
   clipsul, contactul (doar când nu-l știm deja), „Unde e problema” ca un card cu
   harta NOASTRĂ și pinul de brand, chiar deasupra butonului care trimite. Locul
   se schimbă dintr-o atingere pe card, în foaia „Unde e problema?” (căutare,
   „Folosește locația mea”, harta care se mută sub pin, locurile tale).

   În aplicație cererea pleacă glisând; pe site e butonul „Trimite cerere”.
   Cererea trimisă la server e aceeași ca înainte (`createServiceRequest`).
   ============================================================ */

/** De unde vine locul din formular — scris sub hartă, ca omul să știe de ce e acolo. */
type Origin = 'search' | 'gps' | 'profile' | 'picked' | 'picked-gps';

const ORIGIN_NOTE: Record<Origin, string> = {
  search: 'căutat în Eroi',
  gps: 'unde ești acum',
  profile: 'adresa ta salvată',
  picked: 'ales de tine',
  'picked-gps': 'unde ești acum',
};

/** Sub atât, adresa salvată și locul ales sunt aceeași casă. */
const SAME_PLACE_KM = 0.15;

interface KnownPlace {
  key: 'search' | 'profile';
  title: string;
  point: GeoPoint;
  address: string;
}

interface ChosenPlace {
  point: GeoPoint;
  address: string;
  source: 'gps' | 'search' | 'map' | 'known';
  knownKey?: KnownPlace['key'];
}

export interface RequestHero {
  id: string;
  alias: string;
  zone?: unknown;
  offUntil?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** dreptunghiul butonului apăsat: de acolo crește formularul */
  originRect?: DOMRect | null;
  hero: RequestHero;
}

/** Permisiunea de locație e deja dată: poziția se ia fără nicio întrebare (ca `getLocationIfAllowed`). */
async function locationAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return status?.state === 'granted';
  } catch {
    return false;
  }
}

export const RequestSheet: React.FC<Props> = ({ open, onClose, originRect, hero }) => {
  const toast = useToast();
  const alias = hero.alias;
  const zone: PublicZone | null = useMemo(() => parseZone(hero.zone), [hero.zone]);
  const circle = zoneCircle(zone);
  const zoneCenter = circle ? { lat: circle.lat, lng: circle.lng } : null;
  /* Semnalul stins: cererea pleacă acum, iar el o vede la revenire. */
  const offUntil = offUntilDate(hero.offUntil);
  const seesIt = offUntil ? `${firstNameOf(alias)} o vede ${whenLabel(offUntil, new Date(), 'la')}.` : null;

  const [form, setForm] = useState({ name: '', phone: '', email: '', desc: '', address: '' });
  const [coords, setCoords] = useState<GeoPoint | null>(null);
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<ClipPhoto[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sendHint, setSendHint] = useState<string | null>(null);
  const [needContact, setNeedContact] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [origin, setOrigin] = useState<Origin | null>(null);
  const [finding, setFinding] = useState(false);
  const [known, setKnown] = useState<KnownPlace[]>([]);
  const [placeOpen, setPlaceOpen] = useState(false);
  /** Schimbat aici: la trimitere devine noul „Unde” (un singur loc, ca în aplicație). */
  const placeChanged = useRef(false);
  /** Omul a pus singur un loc înainte să se afle cel de pornire: rămâne al lui. */
  const placeSet = useRef(false);
  const started = useRef(false);
  const requestNonce = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

  const reach = reachOfZone(zone, coords);
  const far = reach?.reach === 'far';
  const vague = origin === 'search' && isLocalityOnly(form.address);
  const question = vague ? `Unde anume în ${shortPlaceName(form.address)}?` : null;
  const uploading = photos.filter(photo => !photo.url).length;

  /* Pre-completare la prima deschidere: contactul ținut minte, apoi locul — cel căutat în Eroi,
     poziția (doar dacă locația e deja permisă: pe site nu întrebăm nimic nechemați), adresa salvată. */
  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    const contact = loadSavedContact();
    if (contact) {
      setForm(f => ({ ...f, name: contact.name, phone: contact.phone, email: contact.email }));
      setNeedContact(!(contact.name.trim() && isValidMobileRo(contact.phone) && isValidEmail(contact.email)));
    }
    const search = loadSearchPlace();
    const saved = loadSavedPlace();
    setKnown([
      ...(search?.kind === 'place'
        ? [{ key: 'search' as const, title: `Căutat în Eroi · ${search.label}`, point: { lat: search.lat, lng: search.lng }, address: search.address || search.label }]
        : []),
      ...(saved ? [{ key: 'profile' as const, title: 'Adresa ta salvată', point: { lat: saved.lat, lng: saved.lng }, address: saved.address }] : []),
    ]);
    const savedNear = (point: GeoPoint) => (saved && distanceKm(saved, point) <= SAME_PLACE_KM ? saved : null);

    const apply = (point: GeoPoint, address: string, from: Origin) => {
      if (placeSet.current) return;
      setCoords(point);
      setForm(f => ({ ...f, address }));
      setOrigin(from);
    };

    if (search?.kind === 'place') {
      const point = { lat: search.lat, lng: search.lng };
      const near = savedNear(point);
      apply(near ? { lat: near.lat, lng: near.lng } : point, near ? near.address : search.address || search.label, 'search');
      return;
    }
    setFinding(true);
    void (async () => {
      if (await locationAllowed()) {
        const here = await getCurrentLocation();
        if (!isLocationError(here)) {
          const near = savedNear(here.location);
          if (near) apply({ lat: near.lat, lng: near.lng }, near.address, 'gps');
          else apply({ lat: here.location.lat, lng: here.location.lng }, here.location.address || '', 'gps');
          setFinding(false);
          return;
        }
      }
      if (saved) apply({ lat: saved.lat, lng: saved.lng }, saved.address, 'profile');
      setFinding(false);
    })();
  }, [open]);

  const clearError = (key: string) => {
    if (fieldErrors[key]) setFieldErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  /** Locul ales în foaie. Unul știut își păstrează eticheta; altfel e „ales de tine” sau „unde ești acum”. */
  const pickPlace = (place: ChosenPlace) => {
    setPlaceOpen(false);
    setSendHint(null);
    clearError('address');
    /* Alt bloc, alt etaj: ce era scris era pentru locul de dinainte. */
    if (!coords || distanceKm(coords, place.point) > 0.03) setDetails('');
    setCoords(place.point);
    setForm(f => ({ ...f, address: place.address }));
    setOrigin(place.knownKey === 'search' ? 'search' : place.knownKey === 'profile' ? 'profile' : place.source === 'gps' ? 'picked-gps' : 'picked');
    placeChanged.current = true;
    placeSet.current = true;
  };

  const focusField = (id: string) => window.setTimeout(() => document.getElementById(id)?.focus(), 60);

  const trySend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSendHint(null);
    if (uploading) {
      setSendHint(uploading > 1 ? 'Pozele încă se încarcă. Mai așteaptă câteva secunde.' : 'Poza încă se încarcă. Mai așteaptă câteva secunde.');
      return;
    }
    /* Fără loc nu e o greșeală: se deschide foaia, ca „Alt loc” din aplicație. */
    if (!coords && !form.address.trim()) {
      setSendHint(finding ? 'Mai caut unde ești…' : 'Alege întâi locul.');
      if (!finding) setPlaceOpen(true);
      return;
    }
    if (vague) {
      setPlaceOpen(true);
      return;
    }
    if (far) return;

    const errors: Record<string, string> = {};
    const desc = form.desc.trim();
    if (!desc) errors.desc = 'Ce s-a stricat? Așa știe ce unelte să ia.';
    else if (desc.length < 10) errors.desc = 'Încă două vorbe și știe exact ce-l așteaptă.';
    if (!form.name.trim()) errors.name = 'Eroul vrea să știe pe cine salvează.';
    if (!form.phone.trim()) errors.phone = 'Aici sună eroul când pornește spre tine.';
    else if (!isValidMobileRo(form.phone)) errors.phone = 'Scrie un mobil valid: 07xxxxxxxx.';
    if (!form.email.trim()) errors.email = 'Aici trimitem confirmarea misiunii.';
    else if (!isValidEmail(form.email)) errors.email = 'Parcă lipsește o bucată din adresă.';

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      if (errors.desc) {
        setSendHint('Scrie întâi ce problemă ai.');
        focusField('sos-desc');
      } else {
        setNeedContact(true);
        setSendHint('Completează numele, un mobil valid (07xxxxxxxx) și emailul. Le ținem minte.');
        focusField(errors.name ? 'sos-name' : errors.phone ? 'sos-phone' : 'sos-email');
      }
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const request: ServiceRequest = {
      id: Date.now().toString(),
      heroId: hero.id,
      clientName: form.name.trim(),
      clientEmail: form.email.trim(),
      clientPhone: form.phone.trim(),
      description: desc,
      status: 'PENDING',
      date: new Date().toISOString(),
      clientNonce: requestNonce.current,
      address: form.address.trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      ...(details.trim() ? { addressDetails: details.trim() } : {}),
      /* Adresele vin chiar din răspunsul serverului la urcare. */
      requestPhotos: photos.map(photo => photo.url).filter(Boolean),
    };

    const created = await createServiceRequest(request);
    setSubmitting(false);
    if (!created.ok) {
      if (created.failure?.error === 'OUT_OF_AREA') {
        toast.error(`${alias} nu ajunge până aici. Alege altă adresă sau cheamă pe altcineva mai aproape.`);
        return;
      }
      toast.error(failureMessage(created.failure, 'Cererea nu a fost trimisă. Mai încearcă o dată.'));
      return;
    }

    /* Ținem minte contactul și locul, ca data viitoare să nu le mai scrie (ca profilul din aplicație). */
    saveSavedContact({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() });
    if (coords) saveSavedPlace({ lat: coords.lat, lng: coords.lng, address: form.address.trim() });
    /* Locul schimbat aici devine noul „Unde” din lista de eroi. */
    if (placeChanged.current && coords) {
      saveSearchPlace(
        origin === 'picked-gps'
          ? { kind: 'gps' }
          : { kind: 'place', lat: coords.lat, lng: coords.lng, label: shortPlaceName(form.address), ...(form.address ? { address: form.address } : {}) },
      );
    }
    setNeedContact(false);
    setSuccess(true);
    window.setTimeout(() => {
      onClose();
      toast.success(`Semnal trimis! ${seesIt ?? `A ajuns la ${alias}.`}`);
      window.setTimeout(() => {
        setSuccess(false);
        setForm(f => ({ ...f, desc: '' }));
        setPhotos([]);
        setDetails('');
        placeChanged.current = false;
        requestNonce.current = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      }, 450);
    }, 1600);
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        originRect={originRect}
        title={`Cheamă ${alias}`}
        variant="modal"
        wide
        autoFocus={false}
        footer={success ? undefined : (
          <div className="rq-send">
            {reach?.reach !== 'far' && seesIt ? (
              <p className="rq-line rq-line--night">
                <MoonStars size={15} weight="fill" aria-hidden="true" />
                Cererea pleacă acum. {seesIt}
              </p>
            ) : null}
            {/* `form="sos-form"`: butonul stă în subsol, dar trimite formularul de deasupra. */}
            <button type="submit" form="sos-form" className="rq-btn" disabled={submitting || far} aria-describedby={sendHint ? 'rq-hint' : undefined}>
              {submitting ? (
                <><Spinner size={18} weight="bold" className="rqp__spin" aria-hidden="true" /> Se trimite…</>
              ) : far ? 'Nu ajunge aici' : 'Trimite cerere'}
            </button>
            {sendHint ? (
              <p id="rq-hint" className="rq-hint" role="alert"><span aria-hidden="true" />{sendHint}</p>
            ) : null}
            {/* Nota legală pasivă, ca în aplicație: fără bifă, fără pas în plus. */}
            <p className="rq-legal">
              Apăsând „Trimite cerere” ești de acord cu{' '}
              <a href="/terms" target="_blank" rel="noopener">Termenii și Condițiile</a>.
            </p>
          </div>
        )}
      >
        {success ? (
          <div className="rq-done" role="status">
            <CheckCircle size={56} weight="fill" aria-hidden="true" />
            <strong>Semnal trimis!</strong>
            <span>A ajuns la {alias}.{seesIt ? <><br />{seesIt}</> : null}</span>
          </div>
        ) : (
          <form id="sos-form" onSubmit={trySend} noValidate className="rq-form">
            {/* 1 · PROBLEMA */}
            <div>
              <label htmlFor="sos-desc" className="rq-label">Ce problemă ai?</label>
              <textarea
                id="sos-desc"
                className="sf-field__input rq-input rq-input--area"
                placeholder="Descrie pe scurt ce ai nevoie…"
                maxLength={5000}
                value={form.desc}
                aria-invalid={Boolean(fieldErrors.desc)}
                aria-describedby={fieldErrors.desc ? 'sos-desc-error' : undefined}
                onChange={e => {
                  setForm(f => ({ ...f, desc: e.target.value }));
                  clearError('desc');
                  if (sendHint) setSendHint(null);
                }}
              />
              {fieldErrors.desc && <p id="sos-desc-error" className="sf-field__error">{fieldErrors.desc}</p>}

              {/* O poză spune ce nu știe clientul să scrie: eroul o vede înainte să accepte. */}
              <RequestPhotoClips photos={photos} onChange={setPhotos} />
            </div>

            {/* Contactul: doar dacă nu-l știm deja de la cererea de data trecută. */}
            {needContact ? (
              <div className="rq-contact">
                {([
                  { key: 'name', label: 'Numele tău', placeholder: 'Nume și prenume', type: 'text', auto: 'name', mode: undefined },
                  { key: 'phone', label: 'Telefon', placeholder: '07xxxxxxxx', type: 'tel', auto: 'tel', mode: 'tel' },
                  { key: 'email', label: 'Email', placeholder: 'email@exemplu.ro', type: 'email', auto: 'email', mode: 'email' },
                ] as const).map(field => (
                  <div key={field.key}>
                    <label htmlFor={`sos-${field.key}`} className="rq-label">{field.label}</label>
                    <input
                      id={`sos-${field.key}`}
                      type={field.type}
                      inputMode={field.mode}
                      autoComplete={field.auto}
                      autoCapitalize={field.key === 'email' ? 'none' : undefined}
                      className="sf-field__input rq-input"
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      aria-invalid={Boolean(fieldErrors[field.key])}
                      aria-describedby={fieldErrors[field.key] ? `sos-${field.key}-error` : undefined}
                      onChange={e => {
                        const value = e.target.value;
                        setForm(f => ({ ...f, [field.key]: value }));
                        clearError(field.key);
                      }}
                    />
                    {fieldErrors[field.key] && <p id={`sos-${field.key}-error`} className="sf-field__error">{fieldErrors[field.key]}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rq-known">
                Te sună la <strong>{form.phone}</strong> · {form.name}
                <button type="button" onClick={() => { setNeedContact(true); focusField('sos-name'); }}>Schimbă</button>
              </p>
            )}

            {/* 2 · LOCUL, chiar deasupra butonului: verificarea e chiar gestul de trimitere. */}
            <div>
              <span className="rq-label" id="rq-place-label">Unde e problema</span>
              <PlaceCard
                point={coords}
                address={form.address}
                note={origin ? ORIGIN_NOTE[origin] : undefined}
                question={question}
                loading={finding}
                around={zoneCenter}
                details={details}
                onDetails={setDetails}
                onPress={() => { setSendHint(null); setPlaceOpen(true); }}
              />
              {/* Suma drumului sau „nu ajunge”; în zona lui, nimic (ca în aplicație). */}
              {reach?.reach === 'travel' && reach.fee != null ? (
                <p className="rq-line rq-line--travel">
                  <Car size={15} weight="fill" aria-hidden="true" />
                  {aboutLeiText(reach.fee)} deplasare până aici
                </p>
              ) : far ? (
                <p className="rq-line rq-line--far">
                  <Prohibit size={15} weight="bold" aria-hidden="true" />
                  {alias} nu ajunge până aici. Alege alt loc sau pe altcineva.
                </p>
              ) : null}
            </div>
          </form>
        )}
      </Sheet>

      <PlaceSheet
        open={placeOpen}
        value={coords ? { point: coords, address: form.address } : null}
        known={known}
        hint={question}
        around={zoneCenter}
        onClose={() => setPlaceOpen(false)}
        onPick={pickPlace}
      />
    </>
  );
};

/* ---------------- cardul locului ---------------- */

/**
 * Locul cererii, ca miniatură (ca `PlaceCard` din aplicație): harta nu se mișcă sub deget, e
 * verificarea, nu alegerea. Sub hartă strada, apoi cartierul și de unde vine locul. Atins, se
 * deschide foaia în care se schimbă. Rândul „Bloc, scară, etaj, interfon” se scrie pe loc.
 */
const PlaceCard: React.FC<{
  point: GeoPoint | null;
  address: string;
  note?: string;
  question?: string | null;
  loading?: boolean;
  around?: GeoPoint | null;
  details: string;
  onDetails: (text: string) => void;
  onPress: () => void;
}> = ({ point, address, note, question, loading = false, around, details, onDetails, onPress }) => {
  const [editing, setEditing] = useState(false);
  const [street, ...rest] = address.split(',').map(part => part.trim()).filter(Boolean);
  const title = question || street || (loading ? 'Caut unde ești…' : 'Alege locul');
  const unset = !question && !street && !loading;
  const detail = [question ? null : rest[0], note].filter(Boolean).join(' · ');
  const offerDetails = !!point && !question;

  return (
    <div className="rq-place">
      <button
        type="button"
        className="rq-place__main"
        onClick={onPress}
        aria-labelledby="rq-place-label"
        aria-describedby="rq-place-title"
      >
        {point || (around && !loading) ? (
          <Suspense fallback={<Skel className="block h-[118px] w-full rounded-none" />}>
            <MapPreview point={point} around={point ? null : around} height={118} framed={false} label={point ? `Locul lucrării: ${address}` : 'Zona meseriașului'} />
          </Suspense>
        ) : (
          <span className="rq-place__empty">
            {loading ? <Spinner size={24} weight="bold" className="rqp__spin" aria-hidden="true" /> : <MapPin size={26} weight="duotone" aria-hidden="true" />}
          </span>
        )}
        <span className="rq-place__caption">
          <span className="min-w-0 flex-1">
            <span id="rq-place-title" className="rq-place__title" data-ask={Boolean(question || unset)}>{title}</span>
            {detail && <span className="rq-place__detail">{detail}</span>}
          </span>
          <CaretRight size={15} weight="bold" aria-hidden="true" />
        </span>
      </button>

      {offerDetails ? (
        editing ? (
          <label className="rq-place__row">
            <BuildingApartment size={16} weight="fill" aria-hidden="true" />
            <input
              autoFocus
              value={details}
              onChange={e => onDetails(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setEditing(false); } }}
              placeholder="Bl. M4, sc. 2, et. 3, ap. 12, interfon 12"
              aria-label="Blocul, scara, etajul, apartamentul, interfonul"
              maxLength={160}
            />
          </label>
        ) : (
          <button type="button" className="rq-place__row" onClick={() => setEditing(true)} data-filled={Boolean(details)}>
            {details ? <BuildingApartment size={16} weight="fill" aria-hidden="true" /> : <Plus size={14} weight="bold" aria-hidden="true" />}
            <span>{details || 'Bloc, scară, etaj, interfon'}</span>
          </button>
        )
      ) : null}
    </div>
  );
};

/* ---------------- foaia „Unde e problema?” ---------------- */

/**
 * Schimbarea locului (ca `PlaceSheet` + `LocationPicker` din aplicație): scrii adresa și alegi din
 * listă, „Folosește locația mea”, sau muți harta până pinul e pe casă. Locurile știute se aleg dintr-o
 * atingere; restul se confirmă cu „Aici e problema”.
 */
const PlaceSheet: React.FC<{
  open: boolean;
  value: { point: GeoPoint; address: string } | null;
  known: KnownPlace[];
  hint?: string | null;
  around?: GeoPoint | null;
  onClose: () => void;
  onPick: (place: ChosenPlace) => void;
}> = ({ open, value, known, hint, around, onClose, onPick }) => {
  const [address, setAddress] = useState(value?.address ?? '');
  const [point, setPoint] = useState<GeoPoint | null>(value?.point ?? null);
  const [source, setSource] = useState<ChosenPlace['source']>('map');
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Adresa care ține de pinul de acum: scrisă de noi (listă, GPS, hartă), nu de mână. */
  const settled = useRef(value?.address ?? '');

  // La fiecare deschidere foaia pornește din locul de acum al formularului.
  useEffect(() => {
    if (!open) return;
    setAddress(value?.address ?? '');
    setPoint(value?.point ?? null);
    setSource('map');
    setProblem(null);
    settled.current = value?.address ?? '';
  }, [open]);

  const takeAddress = (text: string) => {
    settled.current = text;
    setAddress(text);
  };

  const others = known.filter(place => !point || distanceKm(place.point, point) > SAME_PLACE_KM);
  const moved = !!point && (!value || distanceKm(value.point, point) > 0.005 || address.trim() !== value.address.trim());

  const locate = async () => {
    setProblem(null);
    setLocating(true);
    const result = await getCurrentLocation();
    setLocating(false);
    if (isLocationError(result)) {
      setProblem(locationErrorText(result.reason));
      return;
    }
    setPoint({ lat: result.location.lat, lng: result.location.lng });
    if (result.location.address) takeAddress(result.location.address);
    setSource('gps');
  };

  const confirm = () => {
    if (!point) return;
    // Neschimbat: doar închidem. Cu o întrebare pusă („Unde anume…”), confirmarea e chiar răspunsul.
    if (!moved && !hint) {
      onClose();
      return;
    }
    onPick({ point, address: address.trim(), source });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={hint || 'Unde e problema?'}
      subtitle="Pune pinul chiar pe casă: acolo vine."
      autoFocus={false}
      footer={
        <button type="button" className="rq-btn" onClick={confirm} disabled={!point}>
          <CheckCircle size={19} weight="fill" aria-hidden="true" />
          Aici e problema
        </button>
      }
    >
      <div className="rq-where">
        <div className="rq-search">
          <MagnifyingGlass size={20} weight="bold" aria-hidden="true" />
          <AddressAutocomplete
            id="rq-where-address"
            placeholder="Stradă, număr, oraș"
            value={address}
            onChange={setAddress}
            onPick={picked => {
              takeAddress(picked.label);
              setPoint({ lat: picked.lat, lng: picked.lng });
              setSource('search');
              setProblem(null);
            }}
            onBlur={e => {
              /* Scrisă de mână și netrecută prin listă: o facem pin, ca omul să vadă unde a nimerit. */
              const text = e.target.value.trim();
              if (text.length < 4 || text === settled.current.trim()) return;
              geocodeAddress(text).then(found => {
                if (!found) {
                  setProblem('N-am găsit adresa. Scrie și orașul, sau mută harta.');
                  return;
                }
                settled.current = text;
                setPoint(found);
                setSource('search');
                setProblem(null);
              });
            }}
          />
        </div>

        <button type="button" onClick={locate} disabled={locating} className="sf-locate">
          <NavigationArrow size={16} weight="fill" aria-hidden="true" />
          {locating ? 'Preiau locația…' : 'Folosește locația mea'}
        </button>
        {problem && <p className="sf-field__error">{problem}</p>}

        {open && (
          <Suspense fallback={<Skel className="block h-[240px] w-full rounded-[20px]" />}>
            <MapPicker
              point={point}
              address={address}
              around={around}
              height={240}
              showExact={!hint || moved}
              onChange={(next, found) => {
                setPoint(next);
                if (found) takeAddress(found);
                setSource('map');
              }}
            />
          </Suspense>
        )}

        {others.length > 0 && (
          <div className="rq-known-places">
            <span className="rq-label">Locurile tale</span>
            {others.map(place => (
              <button
                key={place.key}
                type="button"
                className="rq-known-place"
                onClick={() => onPick({ point: place.point, address: place.address, source: 'known', knownKey: place.key })}
              >
                <span className="rq-known-place__icon" aria-hidden="true">
                  {place.key === 'profile' ? <House size={17} weight="fill" /> : <MagnifyingGlass size={17} weight="bold" />}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="rq-known-place__title">{place.address}</span>
                  <span className="rq-known-place__sub">{place.title}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
};
