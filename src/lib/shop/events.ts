// What the shop does when the owner changes an order in the admin. Each function is a no-op for orders that
// did not come from the website, and is safe to call more than once (emails and rewards happen once).
import { AppError, isUniqueViolation, type D1Database } from '../core/d1.ts';
import { operationKeyStatement } from '../core/inventory.ts';
import { cancelOrder, parseCourierFee } from '../core/orders.ts';
import { deliveryDateFromKey, jakartaDateKey } from '../core/time.ts';
import type { MetaPurchaseNotify } from '../notify/meta.ts';
import { websiteOrderPaidMessage, websiteOrderUnpaidMessage, type TelegramNotify } from '../notify/telegram.ts';
import { parseStoredAttribution } from './attribution.ts';
import { getCustomer, type Customer } from './customers.ts';
import {
  deliveredEmail,
  deliveryDateChangedEmail,
  orderCancelledEmail,
  ownerPaidEmail,
  paymentConfirmedEmail,
  referralRewardEmail,
  shippedEmail,
  type Email,
  type EmailLinks,
} from './email.ts';
import type { PaymentGateway } from './gateway.ts';
import { findCourier, usesResi } from './couriers.ts';
import { asViewer, canViewOrder, getShopOrder, type OrderViewer, type ShopOrder } from './orders.ts';
import { isTestOrder, PAYMENT_DUE_MINUTES, paymentLinkFor, syncOrderPayment, TEST_GATEWAY } from './payments.ts';
import { issueVoucher } from './vouchers.ts';

/**
 * Who hears about an order: the account it belongs to (if any), and the email for order emails. Guest orders use the
 * email typed at checkout (none = no emails); orders placed while signed in use the account's email.
 */
export async function orderContact(db: D1Database, order: ShopOrder): Promise<{ account: Customer | null; email: string | null }> {
  const account = order.customerId ? await getCustomer(db, order.customerId) : null;
  return { account, email: order.guestKey ? order.contactEmail : (account?.email ?? null) };
}

/** The buyer's details for Meta: the account for signed-in orders, the checkout details for guest orders. */
function metaBuyer(order: ShopOrder, account: Customer | null, email: string | null) {
  if (!order.guestKey) return account;
  return { id: account?.id ?? '', email: email ?? '', phone: order.recipientPhone, name: order.recipientName };
}

/** Claims a one-time action. Returns false if it was already done. */
async function once(db: D1Database, key: string, refId: string, now: number): Promise<boolean> {
  try {
    await operationKeyStatement(db, key, 'SHOP_EVENT', refId, now).run();
    return true;
  } catch (error) {
    if (isUniqueViolation(error, 'operation_keys')) return false;
    throw error;
  }
}

export async function onOrderPaid(
  db: D1Database,
  orderRowId: string,
  ownerEmail: string | null,
  links: EmailLinks,
  now: number,
  telegram?: TelegramNotify,
  meta?: MetaPurchaseNotify,
): Promise<Email[]> {
  const order = await getShopOrder(db, orderRowId);
  if (!order || order.paymentStatus !== 'PAID') return [];
  if (!(await once(db, `shop:paid:${orderRowId}`, orderRowId, now))) return [];
  const { account, email } = await orderContact(db, order);
  const emails: Email[] = [];
  if (email) emails.push(paymentConfirmedEmail(email, order, links));
  // Test account orders (Duitku sandbox): the customer gets the usual email, the owner is not bothered.
  if (await isTestOrder(db, orderRowId)) return emails;
  // Owner's Telegram alert: only now that the order is paid, and only once (same one-time key as the emails).
  // Meta Conversions API Purchase (ads optimisation); once, under the same one-time key.
  // Both run side by side, so a slow one leaves enough of the background time for the emails that follow.
  await Promise.all([
    telegram ? telegram(websiteOrderPaidMessage(order, email)) : null,
    meta
      ? db.prepare('SELECT attribution FROM shop_orders WHERE orderRowId = ?').bind(orderRowId).first<{ attribution: string | null }>()
          .then((row) => meta({ order, customer: metaBuyer(order, account, email), attribution: parseStoredAttribution(row?.attribution), now }))
      : null,
  ]);
  if (ownerEmail) emails.push(ownerPaidEmail(ownerEmail, order, email ?? (order.guestKey ? 'guest, no email' : '-'), links));
  return emails;
}

/**
 * Resend the "paid" emails of one order (customer: payment confirmed; owner: paid order) without the Telegram alert or
 * the Meta purchase. Used when the first send was lost (14 Nov 2026: a slow Telegram used up the background time).
 */
export async function paidEmailsAgain(db: D1Database, orderRowId: string, ownerEmail: string | null, links: EmailLinks): Promise<Email[]> {
  const order = await getShopOrder(db, orderRowId);
  if (!order || order.paymentStatus !== 'PAID') return [];
  const { email } = await orderContact(db, order);
  const emails: Email[] = [];
  if (email) emails.push(paymentConfirmedEmail(email, order, links));
  if (ownerEmail) emails.push(ownerPaidEmail(ownerEmail, order, email ?? (order.guestKey ? 'guest, no email' : '-'), links));
  return emails;
}

/**
 * Send the Meta Conversions API Purchase of one paid order again (lost on 14 Nov 2026, see paidEmailsAgain), dated at the
 * time it was paid. Same event_id as the browser Pixel, so Meta never counts the purchase twice.
 */
export async function metaPurchaseAgain(db: D1Database, orderRowId: string, meta: MetaPurchaseNotify): Promise<boolean> {
  const order = await getShopOrder(db, orderRowId);
  if (!order || order.paymentStatus !== 'PAID') return false;
  const { account, email } = await orderContact(db, order);
  const row = await db
    .prepare(
      `SELECT s.attribution, (SELECT MAX(p.paidAt) FROM shop_payments p WHERE p.orderRowId = s.orderRowId) AS paidAt
       FROM shop_orders s WHERE s.orderRowId = ?`,
    )
    .bind(orderRowId)
    .first<{ attribution: string | null; paidAt: number | null }>();
  await meta({ order, customer: metaBuyer(order, account, email), attribution: parseStoredAttribution(row?.attribution), now: row?.paidAt ?? order.createdAt });
  return true;
}

/**
 * Delivered: email the customer, and if this customer was referred, reward the referrer with a 25% voucher.
 * The referrer is rewarded once per referred friend (their first delivered order); see shop_vouchers_referral_key.
 */
export async function onOrderDelivered(db: D1Database, orderRowId: string, links: EmailLinks, now: number): Promise<Email[]> {
  // Time it entered "Sampai di Tujuan" (customer timeline); kept if already set.
  await db
    .prepare(
      `UPDATE shop_orders SET deliveredAt = COALESCE(deliveredAt, ?)
       WHERE orderRowId = ? AND orderRowId IN (SELECT id FROM orders WHERE deliveryStatus = 'DELIVERED')`,
    )
    .bind(now, orderRowId)
    .run();
  const order = await getShopOrder(db, orderRowId);
  if (!order || order.deliveryStatus !== 'DELIVERED' || order.orderStatus !== 'ACTIVE') return [];
  if (!(await once(db, `shop:delivered:${orderRowId}`, orderRowId, now))) return [];
  const { account: customer, email } = await orderContact(db, order);
  const emails: Email[] = email ? [deliveredEmail(email, order, links)] : [];

  if (customer?.referredById) {
    const referrer = await getCustomer(db, customer.referredById);
    if (referrer) {
      const reward = await issueVoucher(db, { customerId: referrer.id, kind: 'REFERRAL', now, sourceCustomerId: customer.id });
      if (reward) emails.push(referralRewardEmail(referrer.email, referrer.name, customer.name, reward, links));
    }
  }
  return emails;
}

/**
 * Cancelled (by the owner in the admin, or automatically when the payment expired): the voucher used on the order
 * becomes available again, and the customer is emailed once with the reason.
 */
export async function onOrderCancelled(
  db: D1Database,
  orderRowId: string,
  reason: 'EXPIRED' | 'ADMIN' | 'CUSTOMER',
  links: EmailLinks,
  now: number,
): Promise<Email[]> {
  await db
    .prepare('UPDATE shop_orders SET voucherActive = 0, cancelReason = COALESCE(cancelReason, ?) WHERE orderRowId = ?')
    .bind(reason, orderRowId)
    .run();
  const order = await getShopOrder(db, orderRowId);
  if (!order || order.orderStatus !== 'CANCELLED') return [];
  if (!(await once(db, `shop:cancelled:${orderRowId}`, orderRowId, now))) return [];
  const { email } = await orderContact(db, order);
  return email ? [orderCancelledEmail(email, order, order.cancelReason ?? reason, links)] : [];
}

/**
 * The customer cancels their own unpaid order from the order page. The gateway is asked first, so an order that was
 * just paid is recorded as paid instead of cancelled. The voucher is freed before this returns, so it shows as
 * available again right away. Returns the emails to send (cancel confirmation, or the paid emails).
 */
export async function cancelByCustomer(
  db: D1Database,
  gateways: PaymentGateway[],
  orderRowId: string,
  viewer: OrderViewer | string, // a customer id = that signed-in customer
  links: EmailLinks,
  ownerEmail: string | null,
  now: number,
  telegram?: TelegramNotify,
  meta?: MetaPurchaseNotify,
): Promise<{ result: 'cancelled' | 'already-cancelled' | 'paid'; emails: Email[] }> {
  const order = await getShopOrder(db, orderRowId);
  if (!order || !canViewOrder(order, asViewer(viewer))) throw new AppError(404, 'Pesanan tidak ditemukan');
  if (order.orderStatus === 'CANCELLED') return { result: 'already-cancelled', emails: [] };
  if (order.paymentStatus === 'PAID') throw new AppError(409, 'Pesanan ini sudah dibayar dan tidak bisa dibatalkan. Silakan hubungi kami.');

  const sync = await syncOrderPayment(db, gateways, orderRowId, now);
  if (sync.some((r) => r.kind === 'paid' || r.kind === 'already-paid')) {
    return { result: 'paid', emails: await onOrderPaid(db, orderRowId, ownerEmail, links, now, telegram, meta) };
  }
  const { alreadyCancelled } = await cancelOrder(db, orderRowId);
  const emails = await onOrderCancelled(db, orderRowId, 'CUSTOMER', links, now);
  return { result: alreadyCancelled ? 'already-cancelled' : 'cancelled', emails };
}

/** Checks a tracking link typed by the owner: must be a full http(s) address. */
export function parseTrackingUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'Please paste the full tracking link, starting with https://');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new AppError(400, 'The tracking link must start with https://');
  if (raw.length > 500) throw new AppError(400, 'The tracking link is too long');
  return url.toString();
}

/** Checks a resi (TIKI, JNE) typed by the owner: letters and numbers only, saved in capitals. */
export function parseTrackingNumber(value: unknown): string {
  const raw = typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : '';
  if (!raw) throw new AppError(400, 'Please enter the resi number');
  if (!/^[A-Z0-9]+$/.test(raw)) throw new AppError(400, 'The resi number can only have letters and numbers');
  if (raw.length > 40) throw new AppError(400, 'The resi number is too long');
  return raw;
}

/**
 * "Ship order": saves the tracking link and emails it to the customer (once) — the order is now "Dalam Perjalanan".
 * The owner marks it delivered separately ("Mark delivered"). After shipping the order can no longer be cancelled.
 * Calling it again only updates the link. Only paid, active website orders can be shipped.
 * The delivery fee the owner paid the courier is saved on the order (required unless it already has one).
 * `courierInput` (couriers.ts): TIKI and JNE take a resi (`trackingNumberInput`) and the link becomes the courier's own
 * "cek resi" page; the other couriers take the tracking link. Without a courier (older admin page) only the link is used.
 */
export async function shipOrder(
  db: D1Database,
  orderRowId: string,
  trackingUrlInput: unknown,
  links: EmailLinks,
  now: number,
  courierFeeInput?: unknown,
  courierInput?: unknown,
  trackingNumberInput?: unknown,
): Promise<{ emails: Email[]; firstTime: boolean }> {
  const courier = courierInput === undefined || courierInput === null || courierInput === '' ? null : findCourier(courierInput);
  if (courierInput && !courier) throw new AppError(400, 'Please choose the courier');
  const trackingNumber = usesResi(courier) ? parseTrackingNumber(trackingNumberInput) : null;
  const trackingUrl = trackingNumber ? courier!.checkUrl! : parseTrackingUrl(trackingUrlInput);
  const feeGiven = courierFeeInput !== undefined && courierFeeInput !== null && String(courierFeeInput).trim() !== '';
  const courierFee = feeGiven ? parseCourierFee(courierFeeInput) : null;
  const order = await getShopOrder(db, orderRowId);
  if (!order) throw new AppError(404, 'Website order not found');
  if (order.orderStatus !== 'ACTIVE') throw new AppError(409, 'This order is cancelled');
  if (order.paymentStatus !== 'PAID') throw new AppError(409, 'This order is not paid yet');
  if (order.deliveryStatus === 'DELIVERED' && order.shippedAt === null) throw new AppError(409, 'This order is already delivered');
  if (courierFee === null) {
    const row = await db.prepare('SELECT courierFee FROM orders WHERE id = ?').bind(orderRowId).first<{ courierFee: number | null }>();
    if (row?.courierFee === null || row?.courierFee === undefined) parseCourierFee(courierFeeInput); // "Enter the delivery fee…"
  }

  await db.batch([
    db
      .prepare('UPDATE shop_orders SET trackingUrl = ?, courier = ?, trackingNumber = ?, shippedAt = COALESCE(shippedAt, ?) WHERE orderRowId = ?')
      .bind(trackingUrl, courier?.id ?? null, trackingNumber, now, orderRowId),
    db.prepare('UPDATE orders SET courierFee = COALESCE(?, courierFee) WHERE id = ?').bind(courierFee, orderRowId),
  ]);
  const firstTime = await once(db, `shop:shipped:${orderRowId}`, orderRowId, now);
  if (!firstTime) return { emails: [], firstTime };
  const updated = await getShopOrder(db, orderRowId);
  const { email } = updated ? await orderContact(db, updated) : { email: null };
  return { emails: updated && email ? [shippedEmail(email, updated, links)] : [], firstTime };
}

/**
 * The owner moves the delivery day of a website order (customers sometimes ask): stored as midnight UTC like every other
 * delivery date, so all pages and the Telegram list follow. Only delivered and cancelled orders are locked. Unlike checkout,
 * Sundays and store days off are allowed; only days already over are refused. The customer is emailed on every real change.
 */
export async function changeDeliveryDate(
  db: D1Database,
  orderRowId: string,
  dateInput: unknown,
  links: EmailLinks,
  now: number,
): Promise<{ emails: Email[]; changed: boolean; customerHasEmail: boolean }> {
  const key = typeof dateInput === 'string' ? dateInput.trim() : '';
  const deliveryDate = deliveryDateFromKey(key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(deliveryDate) || new Date(deliveryDate).toISOString().slice(0, 10) !== key) {
    throw new AppError(400, 'Please choose a delivery date');
  }
  if (key < jakartaDateKey(now)) throw new AppError(400, 'This day is already over. Please choose today or a later day.');

  const order = await getShopOrder(db, orderRowId);
  if (!order) throw new AppError(404, 'Website order not found');
  const res = await db
    .prepare(`UPDATE orders SET deliveryDate = ?, updatedAt = ? WHERE id = ? AND orderStatus = 'ACTIVE' AND deliveryStatus != 'DELIVERED'`)
    .bind(deliveryDate, now, orderRowId)
    .run();
  if (!res.meta.changes) {
    throw new AppError(409, order.orderStatus !== 'ACTIVE' ? 'This order is cancelled' : 'This order is already delivered');
  }
  const updated = (await getShopOrder(db, orderRowId))!;
  const { email } = await orderContact(db, updated);
  const changed = order.deliveryDate !== deliveryDate;
  return { emails: changed && email ? [deliveryDateChangedEmail(email, updated, order.deliveryDate, links)] : [], changed, customerHasEmail: Boolean(email) };
}

/** A website order must be shipped (with a tracking link) before it can be marked delivered. Other orders: no rule. */
export async function assertCanMarkDelivered(db: D1Database, orderRowId: string): Promise<void> {
  const order = await getShopOrder(db, orderRowId);
  if (order && order.deliveryStatus !== 'DELIVERED' && order.shippedAt === null) {
    throw new AppError(409, 'This is a website order: click "Ship order" on the Website Orders page first, then mark it delivered.');
  }
}

/** Unpaid website orders are cancelled this long after they were placed (payment link validity + a margin). */
export const EXPIRE_AFTER_MS = (PAYMENT_DUE_MINUTES + 15) * 60 * 1000;
/** OVO orders are cancelled this long after their last OVO link closed: an approval started at the last moment still lands. */
export const OVO_EXPIRE_MARGIN_MS = 60 * 1000;
/** Orders paid by manual bank transfer get 24 hours to upload the transfer proof; orders the owner placed for a
 * customer get 24 hours to be paid (any method), the same value. */
export const TRANSFER_EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Cancels website orders whose payment was not completed in time (QRIS: ~2¼ hours; OVO: a minute after the OVO link
 * closed; manual transfer: 24 hours without an uploaded proof; placed by the owner for a customer: 24 hours): frees the voucher and emails the customer. Orders with an uploaded transfer proof are never
 * cancelled here; they wait for the owner's "Confirm paid". Before cancelling, the gateway is asked once more, so a
 * late payment is recorded instead.
 * Runs every 15 minutes (Cron Trigger) and when the Website Orders page is opened. Safe to run concurrently.
 */
export async function expireUnpaidOrders(
  db: D1Database,
  gateways: PaymentGateway[],
  links: EmailLinks,
  ownerEmail: string | null,
  now: number,
  telegram?: TelegramNotify,
  meta?: MetaPurchaseNotify,
): Promise<{ emails: Email[]; cancelled: string[]; paid: string[]; failed: { orderRowId: string; message: string }[] }> {
  // Old enough, still unpaid, and no payment link that is still open (or closed less than 15 minutes ago),
  // so a customer who opened a new link late is never cancelled while paying.
  const margin = EXPIRE_AFTER_MS - PAYMENT_DUE_MINUTES * 60 * 1000;
  const { results } = await db
    .prepare(
      `SELECT s.orderRowId FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
       WHERE o.orderStatus = 'ACTIVE' AND o.paymentStatus = 'PENDING' AND s.proofUploadedAt IS NULL
         AND ((s.createdAt < CASE WHEN s.paymentMethod = 'TRANSFER' OR s.placedByOwner IS NOT NULL THEN ? ELSE ? END
               AND NOT EXISTS (SELECT 1 FROM shop_payments p WHERE p.orderRowId = s.orderRowId AND p.status = 'PENDING' AND p.expiresAt > ?))
           OR (s.paymentMethod = 'OVO' AND s.placedByOwner IS NULL
               AND EXISTS (SELECT 1 FROM shop_payments p WHERE p.orderRowId = s.orderRowId)
               AND NOT EXISTS (SELECT 1 FROM shop_payments p WHERE p.orderRowId = s.orderRowId AND p.status = 'PENDING' AND p.expiresAt > ?)))
       ORDER BY s.createdAt LIMIT 20`,
    )
    .bind(now - TRANSFER_EXPIRE_AFTER_MS, now - EXPIRE_AFTER_MS, now - margin, now - OVO_EXPIRE_MARGIN_MS)
    .all<{ orderRowId: string }>();

  const emails: Email[] = [];
  const cancelled: string[] = [];
  const paid: string[] = [];
  const failed: { orderRowId: string; message: string }[] = [];
  for (const { orderRowId } of results) {
    try {
      const sync = await syncOrderPayment(db, gateways, orderRowId, now);
      if (sync.some((r) => r.kind === 'paid' || r.kind === 'already-paid')) {
        paid.push(orderRowId);
        emails.push(...(await onOrderPaid(db, orderRowId, ownerEmail, links, now, telegram, meta)));
        continue;
      }
      const { alreadyCancelled } = await cancelOrder(db, orderRowId);
      if (alreadyCancelled) continue;
      cancelled.push(orderRowId);
      emails.push(...(await onOrderCancelled(db, orderRowId, 'EXPIRED', links, now)));
    } catch (error) {
      // e.g. gateway unreachable: leave the order as it is and try again on the next run.
      failed.push({ orderRowId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { emails, cancelled, paid, failed };
}

/**
 * QRIS for an unpaid order, opened by the owner from Website Orders (e.g. to show or send to the customer): the
 * order's payment page (DOKU, QRIS only). Reuses the open link when it is still valid, else makes a new one, which
 * also keeps the order from expiring for the next 2 hours.
 */
export async function ownerQrisLink(
  db: D1Database,
  gateway: PaymentGateway | null,
  orderRowId: string,
  links: EmailLinks,
  now: number,
): Promise<{ url: string; order: ShopOrder }> {
  if (!gateway || gateway.name !== 'doku') throw new AppError(503, 'QRIS needs the DOKU payment gateway, which is not set up.');
  const order = await getShopOrder(db, orderRowId);
  if (!order) throw new AppError(404, 'Order not found');
  if (order.orderStatus !== 'ACTIVE') throw new AppError(409, 'This order is cancelled.');
  if (order.paymentStatus === 'PAID') throw new AppError(409, 'This order is already paid.');
  const account = order.guestKey ? null : await getCustomer(db, order.customerId);
  return { url: await paymentLinkFor(db, gateway, order, account, links, now, { qris: true }), order };
}

/** A website order still unpaid this long after it was placed gets one Telegram alert. */
export const UNPAID_ALERT_AFTER_MS = 15 * 60 * 1000;
/** Older unpaid orders are not alerted (e.g. right after this feature went live). */
const UNPAID_ALERT_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Every 15 minutes: one Telegram alert (Incoming Order bot) per website order that is still not paid 15 minutes
 * after it was placed. Each order is alerted once; cancelled and test-account orders never.
 */
export async function alertUnpaidOrders(db: D1Database, links: EmailLinks, now: number, telegram: TelegramNotify): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT s.orderRowId FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
       WHERE o.orderStatus = 'ACTIVE' AND o.paymentStatus = 'PENDING' AND s.createdAt <= ? AND s.createdAt > ?
         AND NOT EXISTS (SELECT 1 FROM shop_payments p WHERE p.orderRowId = s.orderRowId AND p.gateway = ?)
       ORDER BY s.createdAt LIMIT 20`,
    )
    .bind(now - UNPAID_ALERT_AFTER_MS, now - UNPAID_ALERT_WINDOW_MS, TEST_GATEWAY)
    .all<{ orderRowId: string }>();
  const alerted: string[] = [];
  for (const { orderRowId } of results) {
    const order = await getShopOrder(db, orderRowId);
    if (!order || order.paymentStatus !== 'PENDING' || order.orderStatus !== 'ACTIVE') continue;
    if (!(await once(db, `shop:unpaid-alert:${orderRowId}`, orderRowId, now))) continue;
    const opened = await db.prepare('SELECT 1 FROM shop_payments WHERE orderRowId = ?').bind(orderRowId).first();
    await telegram(websiteOrderUnpaidMessage(order, now, Boolean(opened), `${links.adminUrl}/orders`));
    alerted.push(orderRowId);
  }
  return alerted;
}
