import { API_URL } from '../config/api';
import { shrinkImage } from '../lib/shrink';

/* ============================================================
   Urcarea unei poze sau a unui clip.

   Funcția asta întorcea `null` pentru absolut orice: fișier prea mare, format
   neacceptat, link de invitație expirat, prea multe încercări, Cloudinary picat.
   Cine o chema n-avea cum să deosebească între ele, așa că peste tot pe sit
   scria același lucru — „n-a ajuns pe server, mai încearcă o dată".

   Pentru un meseriaș care deschide linkul de echipare a patra zi, sfatul ăla nu
   are cum să funcționeze niciodată: linkul e mort, nu semnalul. Încearcă de
   cinci ori și renunță.

   Acum se întoarce și motivul. Textele stau în `uploadErrorText`, ca toate
   paginile să spună la fel.
   ============================================================ */

export type UploadFailure =
  /** peste limita serverului: 10MB la poze, 50MB la clipuri */
  | 'too-big'
  /** format pe care serverul nu-l semnează */
  | 'wrong-type'
  /** invitația de echipare ori linkul „cine e sub costum" nu mai e valid */
  | 'link-expired'
  /** n-are dreptul să urce: sesiune lipsă sau expirată */
  | 'not-allowed'
  /** limita de 20 de urcări pe oră */
  | 'too-many'
  /** orice altceva: rețea, Cloudinary, server */
  | 'network';

/**
 * Rezultatul, ca pereche adresă/motiv — nu ca uniune cu discriminant.
 *
 * `{ ok: true, url } | { ok: false, reason }` s-ar fi citit mai frumos, dar
 * `tsconfig` n-are `strict`, iar fără `strictNullChecks` TypeScript nu îngustează
 * uniunile după un boolean: în ramura de eroare `reason` pur și simplu nu există
 * pentru compilator. Forma asta merge oriunde, fără să atingem configurația.
 */
export interface UploadResult {
  /** adresa fișierului urcat; `null` dacă n-a mers */
  url: string | null;
  /** de ce n-a mers; `null` când a mers */
  reason: UploadFailure | null;
}

const ok = (url: string): UploadResult => ({ url, reason: null });
const fail = (reason: UploadFailure): UploadResult => ({ url: null, reason });

const MAX_BYTES = { image: 10 * 1024 * 1024, video: 50 * 1024 * 1024 } as const;

const ALLOWED = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
} as const;

/**
 * Ce se arată omului.
 *
 * Regula: mesajul spune ce poate face el, nu ce s-a stricat la noi. „N-a ajuns
 * pe server" și „prea multe cereri într-o oră" sunt adevărate, dar nu-i dau
 * nimic de făcut — doar îl fac să se simtă vinovat pentru o limită pe care nici
 * n-o știa. Unde nu are ce repara, cerem răbdare și ne asumăm noi.
 *
 * Un singur loc, ca să nu se contrazică paginile între ele.
 */
export function uploadErrorText(reason: UploadFailure, kind: 'image' | 'video' = 'image') {
  const thing = kind === 'video' ? 'Clipul' : 'Poza';
  switch (reason) {
    // astea două chiar se rezolvă din mâna lui, deci merită spuse pe față
    case 'too-big':
      return `${thing} e mai ${kind === 'video' ? 'lung' : 'mare'} decât putem primi. Alege ${
        kind === 'video' ? 'unul mai scurt' : 'una mai mică'
      }.`;
    case 'wrong-type':
      return kind === 'video'
        ? 'Formatul clipului nu merge la noi. Încearcă un mp4 sau un mov.'
        : 'Formatul pozei nu merge la noi. Încearcă un jpg sau un png.';
    case 'link-expired':
      return 'Linkul pe care ai intrat nu mai e bun. Cere-ne altul și îl trimitem pe loc.';
    case 'not-allowed':
      return 'Trebuie să intri din nou în cont ca să continui.';
    // aici n-are ce face; nu-i explicăm limitele noastre
    case 'too-many':
      return `${thing} n-a intrat acum. Mai încearcă peste câteva minute.`;
    default:
      return `${thing} n-a intrat acum. Mai încearcă o dată.`;
  }
}

export async function uploadSignedMedia(
  file: File,
  kind: 'image' | 'video',
  options: { onboardingToken?: string; originToken?: string; maxEdge?: number } = {},
): Promise<UploadResult> {
  /* Pozele se micșorează aici, nu în fiecare pagină: e singurul loc prin care
     trec toate șase. Un iPhone dă 4–6MB, din care pe sit se folosesc cel mult
     1600 de pixeli pe latura mare. Vezi `lib/shrink.ts`.

     Verificarea de mărime vine DUPĂ, ca o poză de 14MB care se micșorează la
     300KB să treacă — până acum era refuzată degeaba. */
  const prepared = kind === 'image'
    ? await shrinkImage(file, options.maxEdge ? { maxEdge: options.maxEdge } : {})
    : file;

  if (prepared.size > MAX_BYTES[kind]) return fail('too-big');
  if (!(ALLOWED[kind] as readonly string[]).includes(prepared.type.toLowerCase())) {
    return fail('wrong-type');
  }

  let token: string | null = null;
  try {
    token = localStorage.getItem('superfix_token');
  } catch {
    /* browser cu stocarea blocată: mergem mai departe fără sesiune */
  }

  let signed: Response;
  try {
    signed = await fetch(`${API_URL}/media/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      // originToken: eroul venit din linkul de email „Cine e sub costum" n-are
      // sesiune, dar are voie să urce poze de arsenal. Serverul îl acceptă explicit.
      body: JSON.stringify({
        kind,
        onboardingToken: options.onboardingToken,
        originToken: options.originToken,
      }),
    });
  } catch {
    return fail('network');
  }

  if (!signed.ok) {
    if (signed.status === 429) return fail('too-many');
    const payload = await signed.json().catch(() => ({} as any));
    const code = String(payload?.error || '');
    /* Serverul deosebește un link mort de o sesiune lipsă, iar diferența
       contează: unul se rezolvă cerând alt link, celălalt intrând în cont. */
    if (code === 'ONBOARDING_TOKEN_INVALID' || code === 'ORIGIN_TOKEN_INVALID') {
      return fail('link-expired');
    }
    if (signed.status === 401 || signed.status === 403) return fail('not-allowed');
    return fail('network');
  }

  const config = await signed.json().catch(() => null);
  if (!config) return fail('network');

  const data = new FormData();
  data.append('file', prepared);
  Object.entries(config.params || {}).forEach(([key, value]) => data.append(key, String(value)));
  data.append('api_key', String(config.apiKey));
  data.append('signature', String(config.signature));

  let uploaded: Response;
  try {
    uploaded = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/${config.resourceType}/upload`,
      { method: 'POST', body: data },
    );
  } catch {
    return fail('network');
  }

  const payload = await uploaded.json().catch(() => ({} as any));
  const secureUrl = typeof payload.secure_url === 'string' ? payload.secure_url : '';
  // adresa trebuie să vină chiar din contul nostru, altfel n-o salvăm nicăieri
  if (!uploaded.ok || !secureUrl.startsWith(`https://res.cloudinary.com/${config.cloudName}/`)) {
    return fail('network');
  }
  return ok(secureUrl);
}
