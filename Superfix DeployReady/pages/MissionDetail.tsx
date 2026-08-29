import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, Phone, MapPin, NavigationArrow, Camera, CheckCircle, Images, Timer,
} from '@phosphor-icons/react';

import { ServiceRequest } from '../types';
import { getMyMissions, updateMissionStatus, peekMission } from '../services/dataService';
import { Skel, SkeletonPage } from '../components/Loader';
import { thumb } from '../lib/img';
import { uploadSignedMedia, uploadErrorText } from '../services/mediaUpload';
import { useJobLocation } from '../hooks/useJobLocation';
import { useLiveEta } from '../hooks/useLiveEta';
import {
  formatDuration, wazeUrl, wazeSearchUrl, mapsUrl, mapsSearchUrl,
} from '../lib/geo';
import { MapPreview } from '../components/Map';
import { CameraCapture } from '../components/CameraCapture';
import { RequestPhotoStrip } from '../components/RequestPhotos';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

import './portal.css';

/* ============================================================
   Detaliul unei misiuni, pentru erou.

   Oglindește ecranul din aplicație (`SuperfixApp/src/app/mission/[id].tsx`):
   status, client, unde e lucrarea, cât face până acolo, cum ajunge, ce s-a
   stricat, jurnalul foto și acțiunea următoare.

   Locația se rezolvă la fel ca pe telefon: coordonatele exacte dacă există,
   altfel geocodarea adresei. Vezi `useJobLocation`.
   ============================================================ */

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Apel de urgență',
  ACCEPTED: 'Acceptată',
  IN_PROGRESS: 'În desfășurare',
  COMPLETED: 'Îndeplinită',
  REJECTED: 'Refuzată',
  CANCELLED: 'Anulată',
};

export const MissionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const location = useLocation();

  /* Misiunea e aproape mereu deja stiuta: fie a venit odata cu link-ul din
     portal (`state`), fie e in lista incarcata acolo. In cazurile astea pagina
     se deseneaza intreaga din primul cadru — fara schelet, fara asteptare.
     Cererea catre server pleaca oricum, dar in fundal, ca sa prinda o eventuala
     schimbare de status. Scheletul ramane doar pentru intrarea directa pe link
     sau dupa reincarcarea paginii. */
  const handed = (location.state as { mission?: ServiceRequest } | null)?.mission;
  const known = handed && handed.id === id ? handed : peekMission(id);

  const [mission, setMission] = useState<ServiceRequest | null>(() => known ?? null);
  const [loading, setLoading] = useState(() => !known);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'START' | 'FINISH'>('START');
  /* Poza de final e gata, dar misiunea nu s-a închis încă: întrebăm întâi dacă
     lucrarea asta intră în portofoliul public, ca finalizarea și consimțământul
     să plece spre server într-un singur apel. */
  const [portfolioPrompt, setPortfolioPrompt] = useState<{ photoUrl: string } | null>(null);

  const load = async () => {
    const all = await getMyMissions();
    setMission(all.find(m => m.id === id) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (localStorage.getItem('superfix_role') !== 'HERO') { navigate('/portal'); return; }
    // la trecerea de la o misiune la alta, aratam pe loc ce stim despre cea noua
    if (known) { setMission(known); setLoading(false); } else { setLoading(true); }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loc = useJobLocation({
    lat: mission?.lat,
    lng: mission?.lng,
    address: mission?.address,
  });

  const label = useMemo(
    () => mission?.address || mission?.clientName || 'Locația lucrării',
    [mission],
  );

  /* Cât face până la client: se calculează singur cum se deschide misiunea și
     se reface pe drum, pe măsură ce se apropie. Vezi `useLiveEta`. */
  const { eta, status: etaStatus } = useLiveEta(loc.coords);

  const changeStatus = async (next: string) => {
    if (!mission) return;
    if (next === 'IN_PROGRESS' || next === 'COMPLETED') {
      setCameraMode(next === 'IN_PROGRESS' ? 'START' : 'FINISH');
      setShowCamera(true);
      return;
    }
    const ok = await updateMissionStatus(mission.id, next, null);
    if (!ok) { toast.error('Statusul nu s-a schimbat. Reîncearcă.'); return; }
    load();
  };

  const onPhoto = async (base64: string) => {
    if (!mission) return;
    const blob = await (await fetch(base64)).blob();
    const file = new File([blob], `mission-${mission.id}-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const shot = await uploadSignedMedia(file, 'image');
    if (!shot.url) { toast.error(uploadErrorText(shot.reason || 'network', 'image')); return; }
    setShowCamera(false);
    if (cameraMode === 'FINISH') { setPortfolioPrompt({ photoUrl: shot.url }); return; }
    const ok = await updateMissionStatus(mission.id, 'IN_PROGRESS', shot.url);
    if (!ok) { toast.error('Poza s-a încărcat, dar statusul nu s-a actualizat.'); return; }
    load();
  };

  const finishMission = async (publishToPortfolio: boolean) => {
    if (!mission || !portfolioPrompt) return;
    const ok = await updateMissionStatus(mission.id, 'COMPLETED', portfolioPrompt.photoUrl, publishToPortfolio);
    setPortfolioPrompt(null);
    if (!ok) { toast.error('Poza s-a încărcat, dar statusul nu s-a actualizat.'); return; }
    load();
  };

  if (loading) {
    return (
      <SkeletonPage className="pb-8 font-sans md:pb-20">
        <header className="mx-auto max-w-3xl px-5 pt-28 sm:px-6">
          <Skel className="h-5 w-40" />
        </header>

        <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-6">
          {/* cine si ce */}
          <section className="mission-card overflow-hidden rounded-[28px]">
            <div className="flex items-center justify-between gap-3 px-6 pt-6 md:px-7">
              <Skel className="h-7 w-32" />
              <Skel className="h-4 w-28" />
            </div>

            <div className="mx-6 mt-5 flex gap-4 md:mx-7">
              <span className="w-1 shrink-0 rounded-full bg-super-red/25" aria-hidden="true" />
              <div className="flex-1 space-y-2.5">
                <Skel className="h-5 w-full" />
                <Skel className="h-5 w-2/3" />
              </div>
            </div>

            <div className="mx-6 mt-6 flex flex-wrap items-center gap-4 border-t border-graphite/10 pt-5 md:mx-7">
              <Skel className="h-6 w-36" />
              <Skel className="h-9 w-44 rounded-full" />
            </div>

            <div className="px-6 pb-6 pt-6 md:px-7">
              <Skel className="h-12 w-full rounded-2xl" />
            </div>
          </section>

          {/* unde ai de mers */}
          <section className="mission-card overflow-hidden rounded-[28px] p-6 md:p-7">
            <Skel className="h-6 w-48" />
            <Skel className="mt-3 h-4 w-3/5" />
            <Skel className="mt-5 h-[220px] w-full rounded-[20px]" />
            <Skel className="mt-5 h-10 w-56 rounded-full" />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Skel className="h-12 flex-1 rounded-2xl" />
              <Skel className="h-12 flex-1 rounded-2xl" />
            </div>
          </section>
        </main>
      </SkeletonPage>
    );
  }

  if (!mission) {
    return (
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-32 text-center sm:px-6">
        <h1 className="font-heading text-3xl font-bold text-graphite">Misiunea nu a fost găsită</h1>
        <Link to="/portal" className="mt-6 inline-flex text-super-red underline underline-offset-4">
          Înapoi în portal
        </Link>
      </div>
    );
  }

  const navUrl = loc.coords ? wazeUrl(loc.coords) : mission.address ? wazeSearchUrl(mission.address) : null;
  const mapUrl = loc.coords ? mapsUrl(loc.coords) : mission.address ? mapsSearchUrl(mission.address) : null;
  const isActive = ['PENDING', 'ACCEPTED', 'IN_PROGRESS'].includes(mission.status);

  return (
    <div className="pb-8 font-sans text-graphite md:pb-20">
      <Helmet>
        <title>Misiune | Superfix</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="mx-auto max-w-3xl px-5 pt-28 sm:px-6">
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi la misiuni
        </Link>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-6">
        {/* CINE ȘI CE */}
        <section className="mission-card overflow-hidden rounded-[28px]" data-status={mission.status}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 md:px-7">
            <span className="portal-status" data-status={mission.status}>
              <span className="portal-status__dot" aria-hidden="true" />
              {STATUS_LABEL[mission.status] || mission.status}
            </span>
            <span className="mission-card__when">
              {new Date(mission.date).toLocaleString('ro-RO')}
            </span>
          </div>

          <p className="mission-card__call mx-6 mt-5 md:mx-7">{mission.description}</p>

          <div className="mission-card__who mx-6 mt-6 border-t border-graphite/10 pt-5 md:mx-7">
            <span className="mission-card__name">{mission.clientName}</span>
            <a href={`tel:${mission.clientPhone}`} className="mission-card__phone">
              <Phone size={16} weight="fill" aria-hidden="true" />
              {mission.clientPhone}
            </a>
            {mission.clientEmail && (
              <span className="mission-card__email">{mission.clientEmail}</span>
            )}
          </div>

          {isActive && (
            <div className="px-6 pb-6 pt-6 md:px-7">
              {mission.status === 'PENDING' && (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => changeStatus('ACCEPTED')} className="portal-action portal-action--primary flex-1">
                    <CheckCircle size={19} weight="fill" aria-hidden="true" />
                    Accept misiunea
                  </button>
                  <button onClick={() => changeStatus('REJECTED')} className="portal-action portal-action--no flex-1">
                    Refuz
                  </button>
                </div>
              )}
              {mission.status === 'ACCEPTED' && (
                <button onClick={() => changeStatus('IN_PROGRESS')} className="portal-action portal-action--primary w-full">
                  <Camera size={20} weight="fill" aria-hidden="true" />
                  Am ajuns, încep lucrarea
                </button>
              )}
              {mission.status === 'IN_PROGRESS' && (
                <button onClick={() => changeStatus('COMPLETED')} className="portal-action portal-action--primary w-full">
                  <Camera size={20} weight="fill" aria-hidden="true" />
                  Am terminat, poza finală
                </button>
              )}
            </div>
          )}
        </section>

        {/* CE A TRIMIS CLIENTUL */}
        {mission.requestPhotos && mission.requestPhotos.length > 0 && (
          <section className="mission-card overflow-hidden rounded-[28px] p-6 md:p-7">
            <h2 className="flex items-center gap-2 font-heading text-xl font-medium text-graphite">
              <Camera size={22} weight="duotone" className="text-super-red" aria-hidden="true" />
              Ce ți-a trimis clientul
            </h2>
            <p className="mt-2 text-sm text-graphite-soft">
              Pozele făcute de el când a cerut ajutorul. Uită-te înainte să pleci: de
              obicei se vede din ele ce scule îți trebuie.
            </p>
            <RequestPhotoStrip
              urls={mission.requestPhotos}
              who={mission.clientName}
              className="mt-5"
            />
          </section>
        )}

        {/* UNDE */}
        <section className="mission-card overflow-hidden rounded-[28px] p-6 md:p-7">
          <h2 className="flex items-center gap-2 font-heading text-xl font-medium text-graphite">
            <MapPin size={22} weight="duotone" className="text-super-red" aria-hidden="true" />
            Unde ai de mers
          </h2>

          {mission.address && <p className="mt-2 text-graphite-soft">{mission.address}</p>}

          {loc.loading && (
            <p className="mt-4 animate-pulse text-sm text-graphite-soft">Caut locația pe hartă…</p>
          )}

          {!loc.loading && !loc.coords && (
            <p className="mt-4 text-sm text-graphite-soft">
              {loc.hasAddress
                ? 'N-am putut pune adresa pe hartă. Sună clientul ca să confirmi unde vii.'
                : 'Clientul n-a lăsat nicio adresă. Sună-l ca să afli unde e problema.'}
            </p>
          )}

          {loc.coords && (
            <>
              <div className="mt-5">
                <MapPreview point={loc.coords} label={label} height={220} />
              </div>

              {/* Coordonatele derivate din adresă pot cădea pe alt capăt al
                  străzii. Eroul trebuie să știe cât de sigur e punctul. */}
              {loc.approx && (
                <p className="mt-3 text-sm text-graphite-soft">
                  Punctul e găsit după adresă, nu luat de la client. Poate fi la câteva zeci de metri.
                </p>
              )}

              <div className="mt-5">
                {eta && (
                  <div className="flex items-center gap-3 rounded-2xl bg-white/60 p-4">
                    <Timer size={24} weight="duotone" className="shrink-0 text-spark" aria-hidden="true" />
                    <div>
                      <p className="font-heading text-xl font-bold text-graphite">
                        {formatDuration(eta.durationMin)}
                        <span className="ml-2 text-base font-medium text-graphite-soft">· {eta.distanceKm} km</span>
                      </p>
                      <p className="mt-0.5 text-xs text-graphite-soft">
                        {eta.approx
                          ? 'Estimare în linie dreaptă, fără trafic.'
                          : 'Pe drum, fără trafic. Se reface pe măsură ce te apropii.'}
                      </p>
                    </div>
                  </div>
                )}

                {!eta && etaStatus === 'locating' && (
                  <div className="flex items-center gap-3 rounded-2xl bg-white/60 p-4">
                    <Timer size={24} weight="duotone" className="shrink-0 text-graphite-soft/50" aria-hidden="true" />
                    <div className="flex-1">
                      <Skel className="h-5 w-32" />
                      <Skel className="mt-2 h-3 w-44" />
                    </div>
                  </div>
                )}

                {!eta && etaStatus === 'off' && (
                  <p className="text-sm text-graphite-soft">
                    Pornește locația din browser ca să vezi cât ai de mers până acolo.
                  </p>
                )}
              </div>
            </>
          )}

          {(navUrl || mapUrl) && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              {navUrl && (
                <a href={navUrl} target="_blank" rel="noopener noreferrer" className="portal-action portal-action--nav flex-1">
                  <NavigationArrow size={19} weight="fill" aria-hidden="true" />
                  Navighează în Waze
                </a>
              )}
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="portal-action portal-action--no flex-1">
                  <MapPin size={19} weight="fill" aria-hidden="true" />
                  Deschide în Maps
                </a>
              )}
            </div>
          )}
        </section>

        {/* JURNAL FOTO */}
        {(mission.photoBefore || mission.photoAfter) && (
          <section className="mission-card overflow-hidden rounded-[28px] p-6 md:p-7">
            <h2 className="flex items-center gap-2 font-heading text-xl font-medium text-graphite">
              <Images size={22} weight="duotone" className="text-super-red" aria-hidden="true" />
              Jurnalul lucrării
            </h2>
            <p className="mt-2 text-sm text-graphite-soft">
              Pozele astea sunt dovada muncii tale și pot ajunge în dosarul public.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { url: mission.photoBefore, label: 'Înainte' },
                { url: mission.photoAfter, label: 'După' },
              ].filter(x => x.url).map(x => (
                <figure key={x.label}>
                  <img
                    src={thumb(x.url as string, 1000)}
                    loading="lazy"
                    decoding="async"
                    alt={`${x.label}: ${mission.clientName}`}
                    className="block w-full rounded-[20px] shadow-[0_20px_40px_-20px_rgba(46,51,59,0.5)]"
                  />
                  <figcaption className={`mt-2.5 text-center font-heading text-[11px] font-semibold tracking-wide ${
                    x.label === 'După' ? 'text-super-red' : 'text-graphite-soft'
                  }`}>
                    {x.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </main>

      {showCamera && (
        <CameraCapture onCapture={onPhoto} onClose={() => setShowCamera(false)} mode={cameraMode} />
      )}

      <Sheet
        open={!!portfolioPrompt}
        onClose={() => finishMission(false)}
        variant="modal"
        title="Publici lucrarea în portofoliu?"
        subtitle="Poza dinainte și după apare public pe profilul tău, ca exemplu de lucrare."
      >
        <div className="flex flex-col gap-3 pb-4">
          <button
            type="button"
            onClick={() => finishMission(true)}
            className="portal-action portal-action--primary w-full"
          >
            <Images size={19} weight="fill" aria-hidden="true" />
            Da, publică în portofoliu
          </button>
          <button
            type="button"
            onClick={() => finishMission(false)}
            className="portal-action portal-action--no w-full"
          >
            Nu, doar închide misiunea
          </button>
        </div>
      </Sheet>
    </div>
  );
};

export default MissionDetail;
