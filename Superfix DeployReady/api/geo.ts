/* ============================================================
   Poziția aproximativă a vizitatorului, după IP.

   Lista de eroi pornește ordonată „lângă mine" (FRONTEND-HANDOFF A15) fără să
   ceară permisiunea de locație: Vercel pune la fiecare cerere antetele cu
   poziția aproximativă a IP-ului, iar ele se pot citi doar pe server — de-asta
   funcția. Omul care vrea precizie apasă „Aproape de mine", care cere locația
   exactă, ca până acum.

   Doar pentru România (în afara ei `near` n-are sens pentru server), rotunjit
   la 2 zecimale (~1 km). Fără antete sau în afara țării: `null`, iar lista vine
   în ordinea obișnuită.
   ============================================================ */

export const config = { runtime: 'edge' };

const round2 = (value: number) => Math.round(value * 100) / 100;

export default function handler(request: Request): Response {
  const headers = request.headers;
  const rawLat = headers.get('x-vercel-ip-latitude');
  const rawLng = headers.get('x-vercel-ip-longitude');
  const lat = Number(rawLat);
  const lng = Number(rawLng);

  const known =
    headers.get('x-vercel-ip-country') === 'RO' &&
    rawLat !== null && rawLng !== null &&
    Number.isFinite(lat) && Number.isFinite(lng);

  const body = known ? { lat: round2(lat), lng: round2(lng) } : { lat: null, lng: null };

  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Răspunsul e al unui singur om: nu stă în niciun cache.
      'Cache-Control': 'private, no-store',
    },
  });
}
