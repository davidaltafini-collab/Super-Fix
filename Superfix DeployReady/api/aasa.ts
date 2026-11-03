/* ============================================================
   apple-app-site-association: linkurile de pe super-fix.ro pe care le deschide
   direct aplicația de pe iPhone (rewrite în vercel.json; Apple îl ia prin
   CDN-ul lui, la instalare și din când în când).

   `/register` (invitația unui coleg, `?ref=COD`) intră abia când în App Store e
   1.0.4: aplicațiile de dinainte deschid înscrierea fără cod, iar site-ul îl
   arată și îl copiază. Restul e fix: o eroare a magazinului nu atinge linkurile
   care merg deja (`/hero/*`, onboarding).
   ============================================================ */
import { READS_LINK_FROM, atLeast, storeVersions } from './_store';

export const config = { runtime: 'edge' };

const APP_IDS = [
  '9B56F9MNDY.superfix.app',
  '9B56F9MNDY.superfix.app.preview',
  '9B56F9MNDY.ro.superfix.app',
  '9B56F9MNDY.ro.superfix.app.preview',
];

const COMPONENTS: Record<string, unknown>[] = [
  { '/': '/app' },
  { '/': '/app/*' },
  { '/': '/hero/*' },
  { '/': '/onboarding', '?': { token: '?*' } },
  { '/': '/cine-e-sub-costum', '?': { token: '?*' } },
];

export default async function handler(): Promise<Response> {
  let register = false;
  try {
    register = atLeast((await storeVersions()).ios, READS_LINK_FROM);
  } catch {
    /* fără magazin: lista fixă */
  }
  const components = register ? [...COMPONENTS, { '/': '/register' }] : COMPONENTS;
  const body = { applinks: { details: [{ appIDs: APP_IDS, components }] } };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': register ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=600, s-maxage=900',
    },
  });
}
