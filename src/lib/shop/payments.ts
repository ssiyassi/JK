// Website order payments through a hosted payment page (DOKU or Duitku). Framework-free so it can be tested.
import { AppError, type D1Database } from '../core/d1.ts';
import { setPaymentPaid } from '../core/orders.ts';
import type { Customer } from './customers.ts';
import type { EmailLinks } from './email.ts';
import { gatewayPaysWallet, type GatewayName, type PaymentGateway, type WalletChannel } from './gateway.ts';
import { isWalletMethod, type ShopOrder } from './orders.ts';

/** Gateway of test accounts (Duitku sandbox, no real money); their orders are kept out of the admin. */
export const TEST_GATEWAY: GatewayName = 'duitku-sandbox';

/** Whether an order was paid through, or opened a payment with, the test sandbox. */
export async function isTestOrder(db: D1Database, orderRowId: string): Promise<boolean> {
  return Boolean(
    await db.prepare('SELECT 1 FROM shop_payments WHERE orderRowId = ? AND gateway = ?').bind(orderRowId, TEST_GATEWAY).first(),
  );
}

/** How long a payment page stays open. Unpaid orders keep their stock reserved meanwhile. */
export const PAYMENT_DUE_MINUTES = 120;
/** OVO link: time to type the OVO number plus Duitku's 60 seconds to approve in the app. */
export const OVO_DUE_MINUTES = 3;
const REUSE_MARGIN_MS = 10 * 60 * 1000; // don't hand out a link that expires within 10 minutes

export interface PaymentRow {
  invoiceNumber: string;
  gateway: GatewayName;
  orderRowId: string;
  amount: number;
  paymentUrl: string;
  expiresAt: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED'; // FAILED: e.g. an OVO attempt that was declined; the next try gets a new link
  /** The e-wallet the page opens on; null = the gateway's normal page (QRIS on DOKU). */
  channel: WalletChannel | null;
  createdAt: number;
}

function mapPayment(r: Record<string, unknown>): PaymentRow {
  return {
    invoiceNumber: String(r.invoiceNumber),
    gateway: r.gateway as GatewayName,
    orderRowId: String(r.orderRowId),
    amount: Number(r.amount),
    paymentUrl: String(r.paymentUrl),
    expiresAt: Number(r.expiresAt),
    status: r.status as PaymentRow['status'],
    channel: (r.channel as WalletChannel | null | undefined) ?? null,
    createdAt: Number(r.createdAt),
  };
}

export async function listPayments(db: D1Database, orderRowId: string): Promise<PaymentRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM shop_payments WHERE orderRowId = ? ORDER BY createdAt DESC')
    .bind(orderRowId)
    .all<Record<string, unknown>>();
  return results.map(mapPayment);
}

/**
 * Who pays, as told to the gateway: the account for signed-in orders; for guest orders the name and phone from the
 * delivery details and the typed email (gateways require an email, so a guest without one gets the shop's no-reply
 * address).
 */
export function payerFor(order: ShopOrder, account: Customer | null, links: EmailLinks): { id: string; name: string; email: string; phone: string } {
  if (account && !order.guestKey) return { id: account.id, name: account.name, email: account.email, phone: account.phone };
  const host = new URL(links.shopUrl).hostname.replace(/^www\./, '');
  return {
    id: order.customerId || `guest-${order.orderId}`,
    name: order.recipientName,
    email: order.contactEmail ?? `noreply@${host}`,
    phone: order.recipientPhone,
  };
}

/**
 * The payment page for an unpaid order: the current link if it is still valid (and from the same gateway), otherwise
 * a new one.
 * Invoice numbers are JK + order number (+ R2, R3 … for later links), letters and digits only.
 */
export async function paymentLinkFor(
  db: D1Database,
  gateway: PaymentGateway,
  order: ShopOrder,
  customer: Customer | null, // the signed-in customer; null for a guest
  links: EmailLinks,
  now: number,
  opts: { qris?: boolean } = {}, // the owner's QRIS button: always the normal QRIS page, whatever the customer picked
): Promise<string> {
  if (order.orderStatus !== 'ACTIVE') throw new AppError(409, 'Pesanan ini sudah dibatalkan');
  if (order.paymentStatus === 'PAID') throw new AppError(409, 'Pesanan ini sudah dibayar');

  // The page opens on the chosen e-wallet when this gateway pays it; otherwise (QRIS, owner's QRIS button) the normal page.
  const wallet = !opts.qris && isWalletMethod(order.paymentMethod) && gatewayPaysWallet(gateway.name, order.paymentMethod) ? order.paymentMethod : null;
  const existing = await listPayments(db, order.orderRowId);
  // An open link is reused only for the same e-wallet: switching OVO → ShopeePay (both Duitku) needs a new page.
  const reusable = existing.find(
    (p) => p.gateway === gateway.name && p.channel === wallet && p.status === 'PENDING' && p.amount === order.total && p.expiresAt > now + REUSE_MARGIN_MS,
  );
  if (reusable) return reusable.paymentUrl;

  const invoiceNumber = `JK${order.orderId}${existing.length ? `R${existing.length + 1}` : ''}`;
  const { url, expiresAt } = await gateway.createCheckout(
    {
      invoiceNumber,
      amount: order.total,
      description: `Jentis Kitchen pesanan ${order.orderId}`,
      customer: payerFor(order, customer, links),
      returnUrl: `${links.shopUrl}/orders/${order.orderRowId}?from=${gateway.name}`,
      shopUrl: links.shopUrl,
      dueMinutes: wallet === 'OVO' ? OVO_DUE_MINUTES : PAYMENT_DUE_MINUTES,
      ...(wallet ? { channel: wallet } : {}),
    },
    now,
  );
  await db
    .prepare(
      `INSERT INTO shop_payments (invoiceNumber, gateway, orderRowId, amount, paymentUrl, expiresAt, status, paidAt, createdAt, channel)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL, ?, ?)`,
    )
    .bind(invoiceNumber, gateway.name, order.orderRowId, order.total, url, expiresAt, now, wallet)
    .run();
  return url;
}

export type GatewayResult =
  | { kind: 'paid'; orderRowId: string } // newly marked as paid
  | { kind: 'already-paid'; orderRowId: string }
  | { kind: 'ignored'; reason: string };

/**
 * Applies a payment result reported by the gateway (notification or status check). Only SUCCESS for a known invoice with
 * exactly the expected amount marks the order PAID. Safe to repeat. With `gateway`, the invoice must have been opened with
 * that gateway (so the test sandbox can never mark a real invoice paid).
 */
export async function applyGatewayResult(
  db: D1Database,
  invoiceNumber: string,
  status: string,
  amount: number,
  now: number,
  gateway?: GatewayName,
): Promise<GatewayResult> {
  if (status !== 'SUCCESS') return { kind: 'ignored', reason: `status ${status}` };
  const row = await db.prepare('SELECT * FROM shop_payments WHERE invoiceNumber = ?').bind(invoiceNumber).first<Record<string, unknown>>();
  if (!row) return { kind: 'ignored', reason: 'unknown invoice' };
  const payment = mapPayment(row);
  if (gateway && payment.gateway !== gateway) return { kind: 'ignored', reason: `invoice belongs to ${payment.gateway}, not ${gateway}` };
  if (amount !== payment.amount) return { kind: 'ignored', reason: `amount ${amount} != expected ${payment.amount}` };

  const claim = await db
    .prepare(`UPDATE shop_payments SET status = 'SUCCESS', paidAt = ? WHERE invoiceNumber = ? AND status IN ('PENDING', 'FAILED')`)
    .bind(now, invoiceNumber)
    .run();
  if (!claim.meta.changes) return { kind: 'already-paid', orderRowId: payment.orderRowId };
  // Money was received, so the order is marked paid even if it was cancelled meanwhile (the admin shows both).
  // Sandbox test payments (no real money) never take stock or reach the admin order list.
  await setPaymentPaid(db, payment.orderRowId, { takeStock: payment.gateway !== TEST_GATEWAY });
  return { kind: 'paid', orderRowId: payment.orderRowId };
}

/**
 * Backup for a lost notification: asks each gateway about this order's open invoices. Invoices from a gateway that
 * is no longer configured are skipped.
 */
export async function syncOrderPayment(
  db: D1Database,
  gateways: PaymentGateway[],
  orderRowId: string,
  now: number,
): Promise<GatewayResult[]> {
  const open = (await listPayments(db, orderRowId)).filter((p) => p.status === 'PENDING').slice(0, 3);
  const results: GatewayResult[] = [];
  for (const p of open) {
    const gateway = gateways.find((g) => g.name === p.gateway);
    if (!gateway) continue;
    const s = await gateway.checkStatus(p.invoiceNumber, now);
    if (!s) continue;
    // A failed attempt's page cannot be paid any more, so "Bayar" must not hand out this link again.
    if (s.status === 'FAILED') {
      await db.prepare(`UPDATE shop_payments SET status = 'FAILED' WHERE invoiceNumber = ? AND status = 'PENDING'`).bind(p.invoiceNumber).run();
    }
    results.push(await applyGatewayResult(db, p.invoiceNumber, s.status, s.amount, now, gateway.name));
  }
  return results;
}
