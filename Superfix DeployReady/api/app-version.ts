/* ============================================================
   Aplicația din magazinul fiecărui telefon citește singură linkul de pe site?
   `{ ios, android }`: `true` de când versiunea din App Store / Google Play e cel
   puțin 1.0.4 (vezi `_store.ts`). O citește foaia „Continuă în aplicație”
   (`components/OpenInApp.tsx`); până răspunde, rămâne pe drumul vechi.

   Același răspuns pentru toți: stă 15 minute în CDN-ul Vercel, deci magazinele
   sunt întrebate de câteva ori pe oră, nu la fiecare vizitator.
   ============================================================ */
import { READS_LINK_FROM, atLeast, storeVersions } from './_store';

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  const { ios, android } = await storeVersions();
  const body = { ios: atLeast(ios, READS_LINK_FROM), android: atLeast(android, READS_LINK_FROM) };
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Un răspuns „nu știm” (magazinul n-a răspuns) nu ține pagina pe drumul vechi o zi întreagă.
      'Cache-Control':
        ios === null || android === null
          ? 'public, max-age=60, s-maxage=60'
          : 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400',
    },
  });
}
