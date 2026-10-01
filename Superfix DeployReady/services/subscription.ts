import { API_URL } from '../config/api';

/* Plata pe lucrări. Cardul verificat cu 0 lei este condiția de listare; sumele
   lunii se calculează și se încasează de server după închiderea lunii. */

export const FALLBACK_PRICES: BillingPrices = {
  tier1Bani: 2500,
  tier2Bani: 5000,
  busyFrom: 11,
  teamMemberBani: 1500,
};

export interface BillingPrices {
  tier1Bani: number;
  tier2Bani: number;
  busyFrom: number;
  teamMemberBani: number;
}

export type SubscriptionStatus =
  | 'NONE'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'ACTION_REQUIRED'
  | 'PAYMENT_REVIEW'
  | 'CANCELLED';

export type MonthReason = 'NO_JOBS' | 'FREE' | 'EXEMPT' | 'DUE';
export type MonthStatus = 'NOTHING_DUE' | 'DUE' | 'PAID' | 'FAILED' | 'REVERSED' | 'WAIVED';

export interface BillingMonth {
  id?: string;
  month: string;
  jobs: number;
  freeJobs: number;
  teamJobs: number;
  teamMembers: number;
  tierBani: number;
  teamBani: number;
  totalBani: number;
  reason: MonthReason;
  status?: MonthStatus;
  retryCount?: number;
  nextRetryAt?: string | null;
  paidAt?: string | null;
  closesAt?: string;
}

export interface PriceStep {
  beforeBani: number;
  afterBani: number;
  nth: number;
}

export interface SubscriptionState {
  status: SubscriptionStatus;
  listed: boolean;
  archived: boolean;
  teamOnly: boolean;
  hasCard: boolean;
  cardMask: string | null;
  needsConsent: boolean;
  cardIssue: 'DUPLICATE' | null;
  exempt: boolean;
  prices: BillingPrices;
  current: BillingMonth | null;
  nextJobStep: PriceStep | null;
  free: { from: string; until: string; active: boolean } | null;
  team: { verifiedMembers: number } | null;
  unpaid: BillingMonth[];
  history: BillingMonth[];
  code: { kind: 'promo' | 'referral' | 'recruiter'; months: number; status: string } | null;
  canApplyCode: boolean;
  termsVersion: string;
  // Câmpuri vechi, păstrate în contract cât timp serverul le mai trimite.
  subscriptionEndsAt?: string | null;
  nextChargeAt?: string | null;
  cancelAtPeriodEnd?: false;
  priceBani?: number | null;
  currency?: string | null;
  interval?: string | null;
}

const OFFLINE: SubscriptionState = {
  status: 'NONE', listed: false, archived: true, teamOnly: false,
  hasCard: false, cardMask: null, needsConsent: false, cardIssue: null,
  exempt: false, prices: FALLBACK_PRICES, current: null, nextJobStep: null,
  free: null, team: null, unpaid: [], history: [], code: null,
  canApplyCode: false, termsVersion: '',
};

const authHeaders = () => {
  try {
    const token = localStorage.getItem('superfix_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
};

async function call(path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
}

export async function getSubscriptionStatus(): Promise<SubscriptionState> {
  try {
    const response = await call('/subscription/status', { cache: 'no-store' });
    if (!response.ok) return OFFLINE;
    const data = await response.json();
    return {
      ...OFFLINE, ...data,
      prices: data?.prices || FALLBACK_PRICES,
      unpaid: Array.isArray(data?.unpaid) ? data.unpaid : [],
      history: Array.isArray(data?.history) ? data.history : [],
    };
  } catch { return OFFLINE; }
}

export type PaymentOutcome = 'PENDING' | 'PAID' | 'DECLINED' | 'CANCELLED' | 'ACTION_REQUIRED' | 'REVIEW' | 'REVERSED';

export interface PaymentAttemptResult {
  found: boolean;
  outcome?: PaymentOutcome;
  type?: string;
  amountBani?: number;
  orderId?: string;
}

export async function getPaymentAttempt(orderId?: string | null): Promise<PaymentAttemptResult> {
  try {
    const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : '';
    const response = await call(`/subscription/attempt${query}`, { cache: 'no-store' });
    if (!response.ok) return { found: false };
    const data = await response.json();
    return data?.found ? data : { found: false };
  } catch { return { found: false }; }
}

const CARD_CHANGE_FLAG = 'superfix:card-change';

export function markCardChange(on: boolean) {
  try {
    if (on) sessionStorage.setItem(CARD_CHANGE_FLAG, '1');
    else sessionStorage.removeItem(CARD_CHANGE_FLAG);
  } catch { /* pagina poate funcționa și fără sessionStorage */ }
}

export function isCardChange() {
  try { return sessionStorage.getItem(CARD_CHANGE_FLAG) === '1'; } catch { return false; }
}

export interface CheckoutOutcome {
  url?: string;
  orderId?: string;
  message?: string;
  notReady?: boolean;
  termsChanged?: boolean;
}

/** Deschide verificarea de card cu 0 lei. Fluxul one-off nu mai există. */
export async function startCheckout(termsVersion: string | null | undefined): Promise<CheckoutOutcome> {
  const version = (termsVersion || '').trim();
  if (!version) return { message: 'Condițiile comerciale nu s-au încărcat. Reîncarcă pagina și încearcă din nou.' };
  try {
    const response = await call('/subscription/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termsAccepted: true, termsVersion: version }),
    });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (response.status === 409 && data?.error === 'TERMS_CHANGED') {
      return { termsChanged: true, message: 'Condițiile s-au actualizat. Recitește acordul și confirmă din nou.' };
    }
    if (response.status === 503) return { notReady: true, message: 'Verificarea cardului nu este disponibilă momentan.' };
    if (!response.ok) return { message: String(data?.message || data?.error || 'N-am putut deschide verificarea cardului.') };
    return {
      url: typeof data?.paymentUrl === 'string' ? data.paymentUrl : undefined,
      orderId: typeof data?.orderId === 'string' ? data.orderId : undefined,
    };
  } catch { return { message: 'N-am putut deschide verificarea cardului. Verifică internetul și mai încearcă.' }; }
}

export async function applyPromoCode(code: string): Promise<{ success: boolean; kind?: 'promo' | 'referral' | 'recruiter'; months?: number; message?: string }> {
  try {
    const response = await call('/subscription/apply-promo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    return {
      success: response.ok && !!data?.success,
      kind: data?.kind as 'promo' | 'referral' | 'recruiter' | undefined,
      months: typeof data?.months === 'number' ? data.months : undefined,
      message: typeof (data?.message || data?.error) === 'string' ? String(data.message || data.error) : undefined,
    };
  } catch { return { success: false, message: 'N-am putut verifica codul acum. Mai încearcă o dată.' }; }
}

/** „Reia plata”: cere acum restanța de pe cardul verificat. */
export async function payOutstanding(): Promise<{ ok: boolean; pending?: boolean; nothingDue?: boolean; error?: string; message?: string }> {
  try {
    const response = await call('/subscription/reactivate', { method: 'POST' });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) return {
      ok: false,
      error: typeof data?.error === 'string' ? data.error : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
    };
    return { ok: true, pending: !!data?.pending, nothingDue: !!data?.nothingDue };
  } catch { return { ok: false, message: 'N-am putut porni plata. Verifică internetul și mai încearcă.' }; }
}

const MONTHS_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

export const monthLabel = (key: string, now = new Date()) => {
  const [year, month] = key.split('-').map(Number);
  const name = MONTHS_RO[(month || 1) - 1] || key;
  return year === now.getFullYear() ? name : `${name} ${year}`;
};

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const leiLabel = (bani: number) => {
  const lei = bani / 100;
  return `${Number.isInteger(lei) ? lei : lei.toFixed(2).replace('.', ',')} lei`;
};

export const jobsLabel = (count: number) => {
  if (count === 1) return '1 lucrare';
  const of = count % 100 === 0 || count % 100 >= 20 ? ' de' : '';
  return `${count}${of} lucrări`;
};

export const dayLabel = (iso?: string | null, now = new Date()) => {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString('ro-RO', {
    day: 'numeric', month: 'long',
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
};

export const onDate = dayLabel;
export const money = (bani?: number | null) => leiLabel(bani ?? 0);
