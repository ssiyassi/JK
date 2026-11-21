// What the shop needs from a payment gateway (DOKU, Duitku). Framework-free.

// 'duitku-sandbox' = Duitku's test system, only for the test accounts in SANDBOX_TEST_EMAILS (no real money).
export type GatewayName = 'doku' | 'duitku' | 'duitku-sandbox';

/** E-wallets whose app the payment page opens directly (instead of QRIS). */
export type WalletChannel = 'OVO' | 'SHOPEEPAY' | 'DANA';

/** Which gateway pays which e-wallet: OVO and ShopeePay on Duitku, DANA on DOKU; the sandbox lane has all three. */
const GATEWAY_WALLETS: Record<GatewayName, readonly WalletChannel[]> = {
  doku: ['DANA'],
  duitku: ['OVO', 'SHOPEEPAY'],
  'duitku-sandbox': ['OVO', 'SHOPEEPAY', 'DANA'],
};

export function gatewayPaysWallet(gateway: GatewayName, wallet: WalletChannel): boolean {
  return GATEWAY_WALLETS[gateway].includes(wallet);
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface CheckoutRequest {
  invoiceNumber: string;
  amount: number;
  description: string;
  customer: { id: string; name: string; email: string; phone: string };
  /** Shop order page; the gateway sends the customer back here (with ?from=<gateway name>). */
  returnUrl: string;
  /** Shop origin + path prefix, e.g. https://jentiskitchen.id; the gateway's server-to-server call goes below it. */
  shopUrl: string;
  dueMinutes: number;
  /** Only this e-wallet on the gateway's page; not set = whatever the gateway offers (QRIS on DOKU). */
  channel?: WalletChannel;
}

export interface PaymentGateway {
  name: GatewayName;
  /** Shown in the admin, e.g. "DOKU". */
  label: string;
  /** Shown to customers: what they can pay with on the gateway's page (Bahasa Indonesia). */
  methodsText: string;
  /** Opens a hosted payment page. */
  createCheckout(req: CheckoutRequest, now: number): Promise<{ url: string; expiresAt: number }>;
  /** Latest status of an invoice ('SUCCESS' = paid), or null if the gateway does not know it (yet). */
  checkStatus(invoiceNumber: string, now: number): Promise<{ status: string; amount: number } | null>;
}
