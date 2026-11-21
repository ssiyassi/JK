// DOKU Checkout (non-SNAP) client. Framework-free; uses Web Crypto and fetch only.
// Docs: developers.doku.com → DOKU Checkout → Backend integration; Signature component (non-SNAP);
// Check Status API (non-SNAP); HTTP Notification.
import type { FetchLike, PaymentGateway } from './gateway.ts';

export type { FetchLike };

export interface DokuConfig {
  clientId: string;
  secretKey: string;
  baseUrl: string; // https://api-sandbox.doku.com or https://api.doku.com
}

function toBase64(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

/** Base64 SHA-256 of the exact body text (the "Digest" component). */
export async function dokuDigest(body: string): Promise<string> {
  return toBase64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
}

/**
 * "HMACSHA256=" + base64(HMAC-SHA256(secretKey, components)), where components are, one per line and with no
 * trailing newline: Client-Id, Request-Id, Request-Timestamp, Request-Target and (POST only) Digest.
 */
export async function dokuSignature(
  secretKey: string,
  p: { clientId: string; requestId: string; timestamp: string; target: string; body?: string },
): Promise<string> {
  const lines = [`Client-Id:${p.clientId}`, `Request-Id:${p.requestId}`, `Request-Timestamp:${p.timestamp}`, `Request-Target:${p.target}`];
  if (p.body !== undefined) lines.push(`Digest:${await dokuDigest(p.body)}`);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(lines.join('\n')));
  return `HMACSHA256=${toBase64(mac)}`;
}

/** UTC ISO 8601 without milliseconds, e.g. 2026-10-13T07:05:00Z. */
export function dokuTimestamp(now: number): string {
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function headersFor(cfg: DokuConfig, target: string, now: number, body?: string) {
  const requestId = crypto.randomUUID();
  const timestamp = dokuTimestamp(now);
  return {
    'Client-Id': cfg.clientId,
    'Request-Id': requestId,
    'Request-Timestamp': timestamp,
    Signature: await dokuSignature(cfg.secretKey, { clientId: cfg.clientId, requestId, timestamp, target, body }),
  };
}

/** DOKU's expired_date "yyyyMMddHHmmss" is Jakarta time (UTC+7). */
export function parseDokuExpiry(value: unknown): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value ?? ''));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 7 * 3600 * 1000;
}

export interface DokuCheckoutRequest {
  invoiceNumber: string;
  amount: number;
  description: string;
  customer: { id: string; name: string; email: string; phone: string };
  callbackUrl: string;
  notificationUrl: string;
  dueMinutes: number;
  /** DOKU codes of the payment methods to offer, e.g. CREDIT_CARD, QRIS. Empty = everything enabled for the account. */
  methods: readonly string[];
}

export class DokuError extends Error {}

/** DOKU only accepts a-z A-Z 0-9 . - / + , = _ : ' @ % ( ) and spaces in text fields; other characters become spaces. */
export function dokuText(value: string, max: number): string {
  const cleaned = value.replace(/[^a-zA-Z0-9.\-\/+,=_:'@%() ]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || '-').slice(0, max);
}

export async function createCheckout(
  cfg: DokuConfig,
  req: DokuCheckoutRequest,
  now: number,
  fetchImpl: FetchLike,
): Promise<{ url: string; expiresAt: number }> {
  const target = '/checkout/v1/payment';
  const body = JSON.stringify({
    order: {
      amount: req.amount,
      invoice_number: req.invoiceNumber,
      currency: 'IDR',
      callback_url: req.callbackUrl,
      callback_url_result: req.callbackUrl,
      auto_redirect: true,
      language: 'ID',
      // One line for the whole order: the sum must equal the amount, which a discount line could break.
      line_items: [{ id: req.invoiceNumber, name: dokuText(req.description, 255), price: req.amount, quantity: 1 }],
    },
    payment: { payment_due_date: req.dueMinutes, ...(req.methods.length ? { payment_method_types: [...req.methods] } : {}) },
    customer: {
      id: req.customer.id.slice(0, 50),
      name: dokuText(req.customer.name, 255),
      email: req.customer.email.slice(0, 128),
      phone: req.customer.phone.slice(0, 16),
      country: 'ID',
    },
    additional_info: { override_notification_url: req.notificationUrl },
  });
  const response = await fetchImpl(cfg.baseUrl + target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await headersFor(cfg, target, now, body)) },
    body,
  });
  const text = await response.text();
  let data: Record<string, any> = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* handled below */
  }
  const url = data?.response?.payment?.url;
  if (!response.ok || typeof url !== 'string') {
    throw new DokuError(`DOKU checkout failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const expiresAt = parseDokuExpiry(data.response.payment.expired_date) ?? now + req.dueMinutes * 60000;
  return { url, expiresAt };
}

/** Asks DOKU for the latest status of an invoice. Returns null if DOKU does not know it (yet). */
export async function checkStatus(
  cfg: DokuConfig,
  invoiceNumber: string,
  now: number,
  fetchImpl: FetchLike,
): Promise<{ status: string; amount: number } | null> {
  const target = `/orders/v1/status/${encodeURIComponent(invoiceNumber)}`;
  const response = await fetchImpl(cfg.baseUrl + target, { method: 'GET', headers: await headersFor(cfg, target, now) });
  const text = await response.text();
  if (response.status === 404) return null;
  if (!response.ok) throw new DokuError(`DOKU status failed (${response.status}): ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const status = data?.transaction?.status;
  if (typeof status !== 'string') return null;
  return { status, amount: Number(data?.order?.amount) };
}

/**
 * Checks that a notification really comes from DOKU: recomputes the signature over the raw body with our secret key.
 * `target` is the path of our notification URL as DOKU called it.
 */
export async function verifyNotification(
  cfg: DokuConfig,
  headers: { get(name: string): string | null },
  rawBody: string,
  target: string,
): Promise<boolean> {
  const clientId = headers.get('client-id');
  const requestId = headers.get('request-id');
  const timestamp = headers.get('request-timestamp');
  const signature = headers.get('signature');
  if (!clientId || !requestId || !timestamp || !signature || clientId !== cfg.clientId) return false;
  const expected = await dokuSignature(cfg.secretKey, { clientId, requestId, timestamp, target, body: rawBody });
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** Where DOKU sends payment notifications, below the shop URL. */
export const DOKU_NOTIFY_PATH = '/api/payments/doku/notify';

/**
 * Payment methods offered on the DOKU page. Codes from DOKU's supported-methods list. QRIS only for now: it is the only
 * channel DOKU has activated in production; add 'CREDIT_CARD' (and update methodsText) once cards are approved.
 */
export const DOKU_METHODS = ['QRIS'] as const;
/** DOKU code for DANA (DOKU Checkout supported-methods list); activated by DOKU on 2026-11-17. */
const DOKU_DANA = ['EMONEY_DANA'] as const;

export function dokuGateway(cfg: DokuConfig, fetchImpl: FetchLike): PaymentGateway {
  return {
    name: 'doku',
    label: 'DOKU',
    methodsText: 'QRIS (semua e-wallet dan m-banking)',
    createCheckout: (req, now) =>
      createCheckout(
        cfg,
        {
          invoiceNumber: req.invoiceNumber,
          amount: req.amount,
          description: req.description,
          customer: req.customer,
          callbackUrl: req.returnUrl,
          notificationUrl: req.shopUrl + DOKU_NOTIFY_PATH,
          dueMinutes: req.dueMinutes,
          methods: req.channel === 'DANA' ? DOKU_DANA : DOKU_METHODS,
        },
        now,
        fetchImpl,
      ),
    checkStatus: (invoiceNumber, now) => checkStatus(cfg, invoiceNumber, now, fetchImpl),
  };
}
