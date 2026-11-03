/* ============================================================
   Ce versiune a aplicației e acum în magazine (App Store, Google Play).

   De la 1.0.4 aplicația proaspăt instalată citește singură linkul de pe site
   (invitația, codul de recruiter, echipa): Android prin Install Referrer,
   iPhone din linkul copiat. Site-ul trece singur pe drumul ăsta când versiunea
   apare în magazinul telefonului, fără să aștepte pe cineva să schimbe ceva.

   App Store dă versiunea prin API-ul public de căutare; Google Play doar în
   pagina aplicației. Orice eroare = „nu știm” (`null`) = drumul vechi, sigur.
   ============================================================ */

const APP_STORE_LOOKUP = 'https://itunes.apple.com/lookup?id=6819299663&country=ro';
const PLAY_PAGE = 'https://play.google.com/store/apps/details?id=superfix.app&hl=ro&gl=RO';
const TIMEOUT_MS = 4000;

/** Prima versiune care citește linkul la prima pornire (modulul `superfix-link` din aplicație). */
export const READS_LINK_FROM = '1.0.4';

const fetchText = async (url: string): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const VERSION = /^\d+(\.\d+){1,3}$/;

const iosVersion = async (): Promise<string | null> => {
  try {
    const version = JSON.parse((await fetchText(APP_STORE_LOOKUP)) || '{}')?.results?.[0]?.version;
    return typeof version === 'string' && VERSION.test(version) ? version : null;
  } catch {
    return null;
  }
};

/* În pagina din Play versiunea stă o singură dată ca `[[["1.0.3"]]` (datele „Despre aplicație”). */
const androidVersion = async (): Promise<string | null> =>
  /\[\[\["(\d+(?:\.\d+){1,3})"\]\]/.exec((await fetchText(PLAY_PAGE)) || '')?.[1] ?? null;

export const storeVersions = async () => {
  const [ios, android] = await Promise.all([iosVersion(), androidVersion()]);
  return { ios, android };
};

/** `a` ≥ `b` pe bucăți numerice; o versiune necunoscută nu ajunge. */
export const atLeast = (a: string | null, b: string) => {
  if (!a) return false;
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return true;
};
