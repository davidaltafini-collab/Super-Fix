/* ============================================================
   Ce îi spunem omului când serverul refuză o cerere.

   Trei cazuri care până acum arătau ca orice altă eroare („Date incorecte",
   „Semnalul s-a pierdut"), deși în fiecare omul are altceva de făcut
   (FRONTEND-HANDOFF A3, A4):
   - 429 cu `ACCOUNT_LOCKED`: contul e blocat câteva minute. Mesajul serverului
     are deja minutele; resetarea parolei merge în continuare.
   - 429 fără cod: prea multe cereri de pe aceeași rețea. „Mai încearcă peste X
     minute", cu X din antetul `Retry-After`.
   - 5xx: problema e la noi. Omul poate doar să reîncerce; codul cererii
     (`requestId`) îl dă la suport, ca să găsim cererea exactă în jurnale.
   Pentru restul (400, 401, 404…) paginile își păstrează textul lor: acolo omul
   chiar are ceva de corectat.
   ============================================================ */

export interface ApiFailure {
  status?: number;
  error?: string;
  message?: string;
  requestId?: string;
  /** din `Retry-After`, în secunde */
  retryAfterSec?: number;
}

/** Din răspunsul deja citit; `data` e corpul JSON (sau `{}` dacă n-a fost JSON). */
export function apiFailure(res: Response, data: any): ApiFailure {
  const retry = Number(res.headers.get('Retry-After'));
  const requestId = typeof data?.requestId === 'string' ? data.requestId : res.headers.get('X-Request-Id');
  return {
    status: res.status,
    error: typeof data?.error === 'string' ? data.error : undefined,
    message: typeof data?.message === 'string' ? data.message : undefined,
    requestId: requestId || undefined,
    retryAfterSec: Number.isFinite(retry) && retry > 0 ? retry : undefined,
  };
}

export const isAccountLocked = (failure?: ApiFailure) =>
  failure?.status === 429 && failure.error === 'ACCOUNT_LOCKED';

// „1 minut", „5 minute", „20 de minute"
function minutesText(seconds: number): string {
  const n = Math.max(1, Math.ceil(seconds / 60));
  if (n === 1) return '1 minut';
  const lastTwo = n % 100;
  return `${n} ${lastTwo === 0 || lastTwo >= 20 ? 'de ' : ''}minute`;
}

const waitText = (failure: ApiFailure) =>
  failure.retryAfterSec
    ? `Mai încearcă peste ${minutesText(failure.retryAfterSec)}.`
    : 'Mai încearcă peste câteva minute.';

/**
 * Textul pentru 429 și 5xx; `fallback` pentru orice altceva (inclusiv lipsa
 * conexiunii, când nu există `failure`). La 5xx se adaugă codul pentru suport.
 */
export function failureMessage(failure: ApiFailure | undefined, fallback: string): string {
  if (!failure?.status) return fallback;
  if (failure.status === 429) {
    if (failure.error === 'ACCOUNT_LOCKED') return failure.message || `Contul e blocat temporar. ${waitText(failure)}`;
    return `Prea multe încercări. ${waitText(failure)}`;
  }
  if (failure.status >= 500) {
    const code = failure.requestId ? ` Cod pentru suport: ${failure.requestId}` : '';
    return `A apărut o problemă la noi. Mai încearcă o dată peste câteva momente.${code}`;
  }
  return fallback;
}
