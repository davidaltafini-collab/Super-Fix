import { API_URL } from '../config/api';

/* ============================================================
   Abonamentul de listare.

   Oglindă a `SuperfixApp/src/services/subscription.ts`, ca web-ul și aplicația
   să se poarte identic pe același API. Contractul e descris în
   `SuperfixApp/PAYMENTS.md`; documentul acela are prioritate față de orice
   presupunere de aici.

   Ce trebuie știut înainte de a atinge fișierul ăsta:

   - **Datele cardului nu trec niciodată prin noi.** Se introduc exclusiv în
     checkout-ul găzduit NETOPIA. Noi primim un `paymentUrl` și trimitem omul
     acolo; înapoi vine un token criptat, o mască și niște amprente. PAN și CVV
     nu ajung nici în browser, nici pe serverul nostru.
   - **Redirectul din browser nu e adevărul.** Sursa de adevăr e IPN-ul verificat
     de server. Un om care se întoarce pe pagina de rezultat poate ajunge acolo
     înaintea IPN-ului, deci pagina aia trebuie să știe să aștepte.
   - **Prețul vine de la server**, nu din frontend. `priceBani` din `/status` e
     singura cifră în care avem voie să ne încredem.
   ============================================================ */

/** Stările, exact cele din `SuperfixApp/src/config/billing.ts`. */
export type SubscriptionStatus =
  /** fără card — profilul există, dar nu-l vede niciun client */
  | 'NONE'
  /** an gratuit activ, prin cod promoțional sau invitație calificată */
  | 'FREE'
  /** abonament plătit */
  | 'ACTIVE'
  /** o plată a eșuat; mai e o perioadă de grație */
  | 'PAST_DUE'
  /** banca cere o nouă autentificare 3-D Secure */
  | 'ACTION_REQUIRED'
  /** răspuns incert de la procesator; nu se retrimite automat, ca să nu taxăm de două ori */
  | 'PAYMENT_REVIEW'
  /** anulat — profilul e arhivat */
  | 'CANCELLED';

export interface SubscriptionState {
  status: SubscriptionStatus;
  /** `true` = profilul nu apare în căutări. Ăsta e steagul care contează. */
  archived: boolean;
  subscriptionEndsAt?: string | null;
  nextChargeAt?: string | null;
  cancelAtPeriodEnd: boolean;
  hasCard: boolean;
  cardMask?: string | null;
  priceBani?: number | null;
  currency?: string | null;
  interval?: string | null;
  /** versiunea condițiilor comerciale; fără ea nu se poate porni checkout-ul */
  termsVersion?: string | null;
}

const OFFLINE: SubscriptionState = {
  status: 'NONE',
  archived: true,
  cancelAtPeriodEnd: false,
  hasCard: false,
};

const authHeaders = () => {
  try {
    const token = localStorage.getItem('superfix_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

async function call(path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
  });
}

export async function getSubscriptionStatus(): Promise<SubscriptionState> {
  try {
    const response = await call('/subscription/status');
    if (!response.ok) return OFFLINE;
    const data = await response.json();
    // `cancelAtPeriodEnd` trebuie să fie boolean sigur: pe el se schimbă tot textul
    return { ...data, cancelAtPeriodEnd: data?.cancelAtPeriodEnd === true };
  } catch {
    return OFFLINE;
  }
}

export interface CheckoutOutcome {
  /** adresa checkout-ului găzduit; acolo se duce omul */
  url?: string;
  /** ce se arată dacă n-a mers */
  message?: string;
  /** plățile nu sunt încă pornite pe server — nu e vina lui, deci nu-l punem să repare */
  notReady?: boolean;
  /** condițiile s-au schimbat între încărcarea paginii și apăsare */
  termsChanged?: boolean;
}

/**
 * Pornește plata.
 *
 * `termsVersion` vine din `/status` și se trimite înapoi ca dovadă de
 * consimțământ. Serverul refuză cu `409 TERMS_CHANGED` dacă între timp s-a
 * schimbat — pagina trebuie reîncărcată, nu insistat.
 *
 * `autoRenew` alege fluxul: `true` (implicit) validează cardul și-l salvează
 * pentru reînnoirea lunară; `false` ia o singură lună acum, fără card salvat și
 * fără nicio taxare viitoare.
 */
export async function startCheckout(
  termsVersion: string | null | undefined,
  autoRenew = true,
): Promise<CheckoutOutcome> {
  const version = (termsVersion || '').trim();
  if (!version) {
    return { message: 'Condițiile comerciale nu s-au încărcat. Reîncarcă pagina și încearcă din nou.' };
  }

  try {
    const response = await call('/subscription/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termsAccepted: true, termsVersion: version, autoRenew }),
    });
    const data = await response.json().catch(() => ({} as any));

    if (response.status === 409 && data?.error === 'TERMS_CHANGED') {
      return { termsChanged: true, message: 'Condițiile s-au actualizat. Reîncarcă pagina și confirmă din nou.' };
    }
    /* Bridge-ul găzduit nu e încă pornit (vezi „Blocaje reale" din PAYMENTS.md).
       E o problemă de-a noastră, nu a lui: nu-i explicăm POS-uri. */
    if (response.status === 503) {
      return { notReady: true, message: 'Plățile nu sunt încă deschise. Revino în scurt timp.' };
    }
    if (!response.ok) {
      return { message: data?.message || 'N-am putut deschide plata acum. Mai încearcă o dată.' };
    }
    return { url: data?.paymentUrl || undefined };
  } catch {
    return { message: 'N-am putut deschide plata acum. Verifică semnalul și mai încearcă.' };
  }
}

export async function applyPromoCode(code: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await call('/subscription/apply-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
    const data = await response.json().catch(() => ({} as any));
    return { ok: response.ok && !!data?.success, message: data?.message || data?.error };
  } catch {
    return { ok: false, message: 'N-am putut verifica codul acum. Mai încearcă o dată.' };
  }
}

/** Oprește reînnoirea. Profilul rămâne listat până la finalul perioadei plătite. */
export async function cancelSubscription(): Promise<boolean> {
  try {
    return (await call('/subscription/cancel', { method: 'POST' })).ok;
  } catch {
    return false;
  }
}

/** Repornește reînnoirea. Poate cere o nouă trecere prin checkout. */
export async function reactivateSubscription(): Promise<{ ok: boolean; url?: string }> {
  try {
    const response = await call('/subscription/reactivate', { method: 'POST' });
    if (!response.ok) return { ok: false };
    const data = await response.json().catch(() => ({} as any));
    return { ok: true, url: data?.paymentUrl };
  } catch {
    return { ok: false };
  }
}

/* ---------------- ajutoare de afișare ---------------- */

export function money(bani?: number | null, currency = 'RON') {
  const value = (bani ?? 0) / 100;
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function onDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}
