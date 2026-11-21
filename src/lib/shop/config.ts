// Shop settings read from the Worker environment (wrangler.jsonc vars + secrets). Framework-free.
import { dokuGateway, type DokuConfig } from './doku.ts';
import { duitkuGateway, type DuitkuConfig } from './duitku.ts';
import type { EmailLinks } from './email.ts';
import { gatewayPaysWallet, type FetchLike, type PaymentGateway, type WalletChannel } from './gateway.ts';

export interface ShopEnv {
  DOKU_CLIENT_ID?: string;
  DOKU_SECRET_KEY?: string;
  DOKU_ENV?: string; // 'production' or 'sandbox' (default)
  DUITKU_MERCHANT_CODE?: string;
  DUITKU_API_KEY?: string;
  DUITKU_ENV?: string; // 'production' or 'sandbox' (default)
  /** Gateway for new payments when more than one is configured: 'doku' or 'duitku'. Default: DOKU. */
  PAYMENT_GATEWAY?: string;
  /**
   * Test accounts (e.g. a payment gateway's verification team): comma-separated customer emails whose new payments
   * go to the Duitku sandbox (DUITKU_SANDBOX_MERCHANT_CODE + secret DUITKU_SANDBOX_API_KEY) instead — no real money.
   */
  SANDBOX_TEST_EMAILS?: string;
  DUITKU_SANDBOX_MERCHANT_CODE?: string;
  DUITKU_SANDBOX_API_KEY?: string;
  SHOP_URL?: string;
  ADMIN_URL?: string;
  OWNER_EMAIL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Google Places API (New) key for the address search at checkout (secret). Not set = no search box. */
  GOOGLE_PLACES_API_KEY?: string;
  NEW_CITY_DELIVERY?: string; // "on" = the "Kota" dropdown at checkout (delivery-cities.ts); not set = hidden
}

/** DOKU settings, or null when not configured. */
export function dokuConfigFromEnv(e: ShopEnv): DokuConfig | null {
  if (!e.DOKU_CLIENT_ID || !e.DOKU_SECRET_KEY) return null;
  return {
    clientId: e.DOKU_CLIENT_ID,
    secretKey: e.DOKU_SECRET_KEY,
    baseUrl: e.DOKU_ENV === 'production' ? 'https://api.doku.com' : 'https://api-sandbox.doku.com',
  };
}

/** Duitku settings, or null when not configured. */
export function duitkuConfigFromEnv(e: ShopEnv): DuitkuConfig | null {
  if (!e.DUITKU_MERCHANT_CODE || !e.DUITKU_API_KEY) return null;
  return { merchantCode: e.DUITKU_MERCHANT_CODE, apiKey: e.DUITKU_API_KEY, production: e.DUITKU_ENV === 'production' };
}

/** The Duitku sandbox for test accounts, or null when not configured. */
export function duitkuSandboxConfigFromEnv(e: ShopEnv): DuitkuConfig | null {
  if (!e.DUITKU_SANDBOX_MERCHANT_CODE || !e.DUITKU_SANDBOX_API_KEY) return null;
  return { merchantCode: e.DUITKU_SANDBOX_MERCHANT_CODE, apiKey: e.DUITKU_SANDBOX_API_KEY, production: false, sandboxLane: true };
}

/** Whether this customer email is a test account that pays through the Duitku sandbox. */
export function isSandboxTestEmail(e: ShopEnv, email: string | null | undefined): boolean {
  if (!email || !duitkuSandboxConfigFromEnv(e)) return false;
  const list = (e.SANDBOX_TEST_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/**
 * Every configured gateway, the one for new payments (PAYMENT_GATEWAY) first. The others are still asked about
 * payments already started with them. Empty = no online payment (the shop uses manual bank transfer).
 */
export function paymentGatewaysFromEnv(e: ShopEnv, fetchImpl: FetchLike): PaymentGateway[] {
  const doku = dokuConfigFromEnv(e);
  const duitku = duitkuConfigFromEnv(e);
  const gateways = [...(doku ? [dokuGateway(doku, fetchImpl)] : []), ...(duitku ? [duitkuGateway(duitku, fetchImpl)] : [])];
  gateways.sort((a, b) => Number(b.name === e.PAYMENT_GATEWAY) - Number(a.name === e.PAYMENT_GATEWAY));
  // The test sandbox always comes last: it is only asked about its own invoices and never used for real customers.
  const sandbox = duitkuSandboxConfigFromEnv(e);
  return sandbox ? [...gateways, duitkuGateway(sandbox, fetchImpl)] : gateways;
}

/** The gateway for this customer's new payments: the sandbox for test accounts, else the live one; null = bank transfer. */
export function gatewayForCustomer(e: ShopEnv, email: string | null | undefined, fetchImpl: FetchLike): PaymentGateway | null {
  const all = paymentGatewaysFromEnv(e, fetchImpl);
  if (isSandboxTestEmail(e, email)) return all.find((g) => g.name === 'duitku-sandbox') ?? null;
  return all.find((g) => g.name !== 'duitku-sandbox') ?? null;
}

/**
 * The gateway for an online payment method: QRIS = the live gateway for new payments (PAYMENT_GATEWAY, DOKU); an
 * e-wallet = the gateway that pays it (OVO, ShopeePay: Duitku; DANA: DOKU), null while that gateway is not set up, which
 * hides the option. Test accounts always get the sandbox.
 */
export function gatewayForMethod(e: ShopEnv, method: 'QRIS' | WalletChannel, email: string | null | undefined, fetchImpl: FetchLike): PaymentGateway | null {
  const customerGateway = gatewayForCustomer(e, email, fetchImpl);
  if (method === 'QRIS' || customerGateway?.name === 'duitku-sandbox') return customerGateway;
  return paymentGatewaysFromEnv(e, fetchImpl).find((g) => g.name !== 'duitku-sandbox' && gatewayPaysWallet(g.name, method)) ?? null;
}

export function emailLinksFromEnv(e: ShopEnv): EmailLinks {
  return {
    shopUrl: (e.SHOP_URL || 'https://jentiskitchen.id').replace(/\/$/, ''),
    adminUrl: (e.ADMIN_URL || 'https://admin.jentiskitchen.id').replace(/\/$/, ''),
  };
}
