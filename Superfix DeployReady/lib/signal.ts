/* ============================================================
   Semnalul meseriașului (la datorie / în pauză), scris pentru oameni.

   Port din `SuperfixApp/src/components/signal/signalTime.ts`: aceleași fraze ca
   în aplicație („Răspunde mâine de la 07:00”, „Pauză până la 07:00”).
   ============================================================ */

const WEEKDAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
/** Spațiul care nu se rupe: „14 oct.” și „la 07:00” rămân pe același rând. */
const NB = ' ';

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayIndex = (d: Date, now: Date) => Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);

/** „azi la 07:00”, „mâine la 07:00”, „joi la 07:00”, „joi, 9 oct., la 07:00”. */
export function whenLabel(d: Date, now: Date, prep: 'la' | 'de la' = 'la'): string {
  const i = dayIndex(d, now);
  const at = `${prep}${NB}${clock(d)}`;
  if (i === 0) return `azi ${at}`;
  if (i === 1) return `mâine ${at}`;
  if (i > 1 && i < 7) return `${WEEKDAYS[d.getDay()]} ${at}`;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}${NB}${MONTHS[d.getMonth()]}, ${at}`;
}

/** Ora de revenire din API, doar cât e în viitor. */
export function offUntilDate(iso: string | null | undefined, now = new Date()): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.getTime() <= now.getTime() ? null : d;
}

/** Pe pagina meseriașului: „Răspunde mâine de la 07:00”. */
export function answersFromLabel(iso: string | null | undefined, now = new Date()): string | null {
  const d = offUntilDate(iso, now);
  return d ? `Răspunde ${whenLabel(d, now, 'de la')}` : null;
}

/** Pe butonul de sunat, cât e în pauză: „Pauză până la 07:00”, „Pauză până mâine”. */
export function pauseLabel(iso: string | null | undefined, now = new Date()): string | null {
  const d = offUntilDate(iso, now);
  if (!d) return null;
  if (d.getTime() - now.getTime() < 86_400_000) return `Pauză până la${NB}${clock(d)}`;
  const i = dayIndex(d, now);
  if (i === 1) return 'Pauză până mâine';
  if (i < 7) return `Pauză până ${WEEKDAYS[d.getDay()]}`;
  return `Pauză până pe ${d.getDate()}${NB}${MONTHS[d.getMonth()]}`;
}

/** Numele mic, pentru frazele scurte („Costel o vede mâine la 07:00”). */
export function firstNameOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.split(/\s+/)[0] : 'Meseriașul';
}
