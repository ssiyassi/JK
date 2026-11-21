// Duitku POP client (hosted payment page). Framework-free; uses node:crypto (nodejs_compat) and fetch only.
// Docs: docs.duitku.com → POP → Create Invoice, Callback, Check Transaction.
import { createHash } from 'node:crypto';
import type { FetchLike, PaymentGateway } from './gateway.ts';

export interface DuitkuConfig {
  merchantCode: string;
  apiKey: string;
  production: boolean;
  /** Duitku sandbox used next to the live gateways for test accounts only (gateway name 'duitku-sandbox'). */
  sandboxLane?: boolean;
}

/** Where Duitku sends payment results, below the shop URL. */
export const DUITKU_CALLBACK_PATH = '/api/payments/duitku/callback';

export class DuitkuError extends Error {}

/** Duitku paymentMethod codes (docs.duitku.com/pop/en, "Payment Method"): OV = OVO, SA = ShopeePay Apps, DA = DANA. */
const DUITKU_CHANNEL_CODES = { OVO: 'OV', SHOPEEPAY: 'SA', DANA: 'DA' } as const;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const md5 = (s: string) => createHash('md5').update(s).digest('hex');

function urls(cfg: DuitkuConfig) {
  return cfg.production
    ? { invoice: 'https://api-prod.duitku.com/api/merchant/createInvoice', status: 'https://passport.duitku.com/webapi/api/merchant/transactionStatus' }
    : { invoice: 'https://api-sandbox.duitku.com/api/merchant/createInvoice', status: 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus' };
}

function parse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Duitku statusCode / resultCode: 00 paid, 01 pending, 02 failed or cancelled. */
function statusName(code: unknown): string {
  return code === '00' ? 'SUCCESS' : code === '01' ? 'PENDING' : code === '02' ? 'FAILED' : `CODE ${String(code)}`;
}

export function duitkuGateway(cfg: DuitkuConfig, fetchImpl: FetchLike): PaymentGateway {
  const { invoice, status } = urls(cfg);
  return {
    name: cfg.sandboxLane ? 'duitku-sandbox' : 'duitku',
    label: cfg.sandboxLane ? 'Duitku (Sandbox)' : 'Duitku',
    methodsText: 'QRIS, e-wallet, virtual account bank, atau kartu kredit',

    async createCheckout(req, now) {
      const timestamp = String(now);
      const name = req.customer.name.trim() || '-';
      const body = JSON.stringify({
        paymentAmount: req.amount,
        merchantOrderId: req.invoiceNumber,
        productDetails: req.description.slice(0, 255),
        email: req.customer.email,
        phoneNumber: req.customer.phone,
        customerVaName: name.slice(0, 20),
        // One line for the whole order: the sum must equal the amount, which a discount line could break.
        itemDetails: [{ name: req.description.slice(0, 50), price: req.amount, quantity: 1 }],
        customerDetail: { firstName: name.slice(0, 50), email: req.customer.email, phoneNumber: req.customer.phone },
        callbackUrl: req.shopUrl + DUITKU_CALLBACK_PATH,
        returnUrl: req.returnUrl,
        expiryPeriod: req.dueMinutes,
        // "OV" opens Duitku's page directly on OVO (the customer types their OVO number there); "SA" on ShopeePay Apps.
        ...(req.channel ? { paymentMethod: DUITKU_CHANNEL_CODES[req.channel] } : {}),
      });
      const response = await fetchImpl(invoice, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-duitku-merchantcode': cfg.merchantCode,
          'x-duitku-timestamp': timestamp,
          'x-duitku-signature': sha256(cfg.merchantCode + timestamp + cfg.apiKey),
        },
        body,
      });
      const text = await response.text();
      const data = parse(text);
      if (!response.ok || data.statusCode !== '00' || typeof data.paymentUrl !== 'string') {
        throw new DuitkuError(`Duitku invoice failed (${response.status}): ${text.slice(0, 300)}`);
      }
      return { url: data.paymentUrl as string, expiresAt: now + req.dueMinutes * 60000 };
    },

    async checkStatus(invoiceNumber) {
      const response = await fetchImpl(status, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantCode: cfg.merchantCode,
          merchantOrderId: invoiceNumber,
          signature: md5(cfg.merchantCode + invoiceNumber + cfg.apiKey),
        }),
      });
      const text = await response.text();
      // Also 404 while the customer has not picked a payment method on the Duitku page yet.
      if (response.status === 404) return null;
      if (!response.ok) throw new DuitkuError(`Duitku status failed (${response.status}): ${text.slice(0, 300)}`);
      const data = parse(text);
      if (typeof data.statusCode !== 'string') return null;
      return { status: statusName(data.statusCode), amount: Number(data.amount) };
    },
  };
}

/**
 * Reads and checks a Duitku callback (form-encoded POST). The signature is md5(merchantCode + amount +
 * merchantOrderId + apiKey) over the values exactly as sent. Returns null if it is not a genuine callback.
 */
export function verifyCallback(cfg: DuitkuConfig, rawBody: string): { invoiceNumber: string; status: string; amount: number; reference: string } | null {
  const p = new URLSearchParams(rawBody);
  const merchantCode = p.get('merchantCode') ?? '';
  const amount = p.get('amount') ?? '';
  const invoiceNumber = p.get('merchantOrderId') ?? '';
  const signature = (p.get('signature') ?? '').toLowerCase();
  if (merchantCode !== cfg.merchantCode || !amount || !invoiceNumber || !signature) return null;
  const expected = md5(merchantCode + amount + invoiceNumber + cfg.apiKey);
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  return { invoiceNumber, status: statusName(p.get('resultCode')), amount: Number(amount), reference: p.get('reference') ?? '' };
}
