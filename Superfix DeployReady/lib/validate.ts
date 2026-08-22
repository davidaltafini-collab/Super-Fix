/* ============================================================
   Verificările de formular, într-un singur loc.

   Browserul are validare proprie, dar o afișează într-un balon cu stilul
   sistemului de operare, în engleză, care dispare la primul clic și nu spune
   niciodată de ce. Aici mesajele sunt în română, stau sub câmpul lor și explică
   ce e de făcut.

   Fiecare verificare întoarce `undefined` când e bine și textul erorii când nu.
   Așa se pot pune una după alta fără nicio structură în plus.
   ============================================================ */

export type Check = (value: string) => string | undefined;

/** Prima nemulțumire câștigă: nu are rost să-i spui omului trei lucruri odată. */
export const first =
  (...checks: Check[]): Check =>
  value => {
    for (const check of checks) {
      const complaint = check(value);
      if (complaint) return complaint;
    }
    return undefined;
  };

export const required =
  (message = 'Câmpul ăsta rămâne gol și fără el nu putem merge mai departe.'): Check =>
  value => (value.trim() ? undefined : message);

export const minLength =
  (n: number, message?: string): Check =>
  value =>
    value.trim().length >= n
      ? undefined
      : message ?? `Mai scrie puțin — minimum ${n} caractere.`;

export const maxLength =
  (n: number, message?: string): Check =>
  value =>
    value.trim().length <= n ? undefined : message ?? `E prea lung. Maximum ${n} caractere.`;

/* Nu validăm emailul cu regex-ul „complet" din RFC: are 6000 de caractere,
   respinge adrese valide și acceptă absurdități. Ne uităm la ce se poate greși
   de-adevăratelea — lipsește @, lipsește domeniul, lipsește punctul. */
export const email =
  (message = 'Adresa asta nu arată a email. Mai uită-te o dată la ea.'): Check =>
  value => {
    const v = value.trim();
    if (!v) return undefined;
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v) ? undefined : message;
  };

/**
 * Telefon românesc de mobil.
 *
 * Acceptăm și `+40`, și `0040`, și spațiile sau liniuțele pe care le pune lumea
 * din obișnuință — le curățăm noi, în loc să-l punem pe om să ghicească formatul.
 */
export const phoneRo =
  (message = 'Un număr de mobil are 10 cifre și începe cu 07.'): Check =>
  value => {
    const v = value.trim();
    if (!v) return undefined;
    return /^07\d{8}$/.test(normalizePhone(v)) ? undefined : message;
  };

export const normalizePhone = (value: string) =>
  value
    .replace(/[\s.\-()]/g, '')
    .replace(/^\+40/, '0')
    .replace(/^0040/, '0');

/**
 * IBAN, verificat de-adevăratelea.
 *
 * Un `pattern` din HTML se uită doar la formă: `RO49` plus 20 de semne. Trece
 * și un IBAN cu o cifră greșită — iar acolo nu ajunge nicio eroare înapoi, doar
 * banii nu apar niciodată. Cheia de control (ISO 13616, restul împărțirii la 97)
 * prinde exact greșeala aia: o cifră schimbată sau două inversate.
 */
export const ibanRo =
  (message = 'IBAN-ul nu trece verificarea. O singură cifră greșită și banii nu ajung nicăieri.'): Check =>
  value => {
    const v = value.replace(/\s+/g, '').toUpperCase();
    if (!v) return undefined;
    if (!/^RO\d{2}[A-Z0-9]{20}$/.test(v)) {
      return 'Un IBAN românesc începe cu RO și are 24 de caractere.';
    }
    return mod97(v) === 1 ? undefined : message;
  };

/* Se mută primele 4 caractere la coadă, literele devin numere (A=10 … Z=35), iar
   restul se ia din bucăți — numărul întreg n-ar încăpea într-un `number`. */
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

/** Aceleași cerințe pe care le impune serverul — scrise pe limba omului. */
export const strongPassword =
  (): Check =>
  value => {
    if (!value) return undefined;
    if (value.length < 10) return 'Minimum 10 caractere. Mai adaugă câteva.';
    if (value.length > 128) return 'Peste 128 de caractere nu acceptă serverul.';
    if (!/[a-z]/.test(value)) return 'Mai lipsește o literă mică.';
    if (!/[A-Z]/.test(value)) return 'Mai lipsește o literă mare.';
    if (!/\d/.test(value)) return 'Mai lipsește o cifră.';
    return undefined;
  };

export const sameAs =
  (other: () => string, message = 'Cele două parole nu sunt la fel.'): Check =>
  value => (!value || value === other() ? undefined : message);

/* ============================================================
   Verificarea întregului formular.

   `rules` e un obiect cu aceleași chei ca formularul. Întoarce doar câmpurile
   care au ceva de reproșat, ca să se poată da direct în `setErrors`.
   ============================================================ */
export function checkAll<T extends Record<string, string>>(
  values: T,
  rules: Partial<Record<keyof T, Check>>,
): Partial<Record<keyof T, string>> {
  const found: Partial<Record<keyof T, string>> = {};
  for (const key of Object.keys(rules) as Array<keyof T>) {
    const check = rules[key];
    if (!check) continue;
    const complaint = check(values[key] ?? '');
    if (complaint) found[key] = complaint;
  }
  return found;
}

/**
 * Primul câmp cu probleme, ca să-l putem aduce în fața ochilor.
 *
 * Ordinea contează: `Object.keys` pe erori dă ordinea în care au fost puse, nu
 * ordinea de pe ecran. Așa că mergem după ordinea câmpurilor din formular.
 */
export function firstBad<T extends Record<string, string>>(
  order: Array<keyof T>,
  errors: Partial<Record<keyof T, string>>,
): keyof T | undefined {
  return order.find(key => errors[key]);
}

/** Aduce câmpul în ecran și pune cursorul în el. */
export function focusField(id: string) {
  const node = document.getElementById(id);
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  window.setTimeout(() => (node as HTMLElement).focus({ preventScroll: true }), 220);
}
