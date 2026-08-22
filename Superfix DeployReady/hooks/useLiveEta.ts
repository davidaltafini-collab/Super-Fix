import { useEffect, useRef, useState } from 'react';
import { GeoPoint, RouteETA, haversineKm, routeETA } from '../lib/geo';

/* ============================================================
   Cât mai am până acolo — calculat singur, și recalculat cât conduci.

   Era la buton: apăsai „Cât fac până la client?" și afla. Dar întrebarea asta o
   are omul în cap din secunda în care deschide misiunea, deci n-avea de ce să
   ceară un clic. Iar odată pornit la drum, un număr calculat acum zece minute e
   mai rău decât niciunul.

   Poziția se urmărește cu `watchPosition`, nu cu un cronometru: browserul ne
   anunță când chiar s-a mișcat telefonul. Un `setInterval` la un minut ar cere
   coordonate și când omul stă pe loc, ceea ce doar consumă baterie.

   Rutarea, în schimb, NU se recalculează la fiecare mișcare: serverul e public
   și limitat. Se recalculează dacă s-a mișcat cel puțin ~120 m sau dacă a trecut
   un minut. Într-o mașină, 120 m înseamnă câteva secunde, deci numărul rămâne
   viu; într-o intersecție, nu se cere nimic degeaba.
   ============================================================ */

/** cât trebuie să se miște ca să merite o rutare nouă */
const MOVED_KM = 0.12;
/** cât de vechi are voie să fie un calcul, chiar dacă stă pe loc */
const STALE_MS = 60_000;

export type EtaStatus = 'locating' | 'ready' | 'off';

export interface LiveEta {
  eta: RouteETA | null;
  status: EtaStatus;
}

export function useLiveEta(target: GeoPoint | null): LiveEta {
  const [eta, setEta] = useState<RouteETA | null>(null);
  const [status, setStatus] = useState<EtaStatus>('locating');

  /** ultima poziție pentru care chiar am cerut un drum */
  const lastRouted = useRef<{ point: GeoPoint; at: number } | null>(null);
  /** o singură rutare pe rând: pozițiile vin în rafală când pornește GPS-ul */
  const inFlight = useRef(false);

  const lat = target?.lat;
  const lng = target?.lng;

  useEffect(() => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('off');
      return;
    }

    let alive = true;
    lastRouted.current = null;

    const recompute = async (point: GeoPoint) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const result = await routeETA(point, { lat, lng });
      inFlight.current = false;
      if (!alive) return;

      lastRouted.current = { point, at: Date.now() };
      setEta(result);
      setStatus('ready');
    };

    const watch = navigator.geolocation.watchPosition(
      position => {
        if (!alive) return;
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        const last = lastRouted.current;

        if (last) {
          const moved = haversineKm(last.point, point);
          if (moved < MOVED_KM && Date.now() - last.at < STALE_MS) return;
        }

        recompute(point);
      },
      () => {
        if (!alive) return;
        // dacă avem deja un număr, îl păstrăm: mai bine unul vechi decât gol
        setStatus(prev => (prev === 'ready' ? prev : 'off'));
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );

    return () => {
      alive = false;
      navigator.geolocation.clearWatch(watch);
    };
  }, [lat, lng]);

  return { eta, status };
}
