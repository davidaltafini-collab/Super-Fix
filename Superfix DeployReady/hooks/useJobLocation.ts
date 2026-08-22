import { useEffect, useState } from 'react';
import { geocodeAddress, GeoPoint } from '../lib/geo';

export interface ResolvedJobLocation {
  coords: GeoPoint | null;
  /** true = derivat din adresă prin geocodare, nu GPS-ul exact al clientului */
  approx: boolean;
  loading: boolean;
  hasAddress: boolean;
}

/**
 * Rezolvă locația unei misiuni pentru afișare: hartă, ETA, navigație.
 *
 * Preferă coordonatele exacte. Dacă lipsesc — misiuni în care clientul a scris
 * doar adresa — geocodează adresa în browser, cu cache. Fără asta, harta ar
 * rămâne stinsă pentru o bună parte din misiuni.
 *
 * Portul web al `SuperfixApp/src/hooks/useJobLocation.ts`.
 */
export function useJobLocation(job: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}): ResolvedJobLocation {
  const hasExact = typeof job.lat === 'number' && typeof job.lng === 'number';
  const hasAddress = Boolean(job.address && job.address.trim());

  const [state, setState] = useState<ResolvedJobLocation>({
    coords: hasExact ? { lat: job.lat as number, lng: job.lng as number } : null,
    approx: false,
    loading: !hasExact && hasAddress,
    hasAddress,
  });

  useEffect(() => {
    let alive = true;

    if (hasExact) {
      setState({
        coords: { lat: job.lat as number, lng: job.lng as number },
        approx: false,
        loading: false,
        hasAddress,
      });
      return;
    }
    if (!hasAddress) {
      setState({ coords: null, approx: false, loading: false, hasAddress: false });
      return;
    }

    setState(s => ({ ...s, loading: true }));
    geocodeAddress(job.address as string).then(coords => {
      if (!alive) return;
      setState({ coords, approx: Boolean(coords), loading: false, hasAddress: true });
    });

    return () => { alive = false; };
  }, [job.lat, job.lng, job.address, hasExact, hasAddress]);

  return state;
}
