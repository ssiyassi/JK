// "Add email" on a website order (owner 15 Nov 2026): a guest ordered without an email (often helped on WhatsApp); the
// owner types it in later. The order then gets that email for every order email (so "Pembayaran diterima" goes out when
// it is marked paid), it moves to the customer's account (the existing one with that email, else a new account made
// from the order, like guest checkout), and when the order used the first-purchase discount that email + phone count
// as having used it: the order holds the discount for both, and the account's welcome voucher is marked used.
import { AppError, newId, type D1Database } from '../core/d1.ts';
import { findCustomerByEmail, NO_PASSWORD } from './customers.ts';
import { paymentConfirmedEmail, type Email, type EmailLinks } from './email.ts';
import { getShopOrder } from './orders.ts';
import { randomCode, normalizeEmail } from './util.ts';
import { loadVoucherRules } from './vouchers.ts';

export interface AddEmailResult {
  account: 'existing' | 'new' | 'none'; // none: the phone belongs to another account with a different email
  firstPurchaseMarked: boolean;
  emails: Email[];
}

export async function addOrderEmail(
  db: D1Database,
  orderRowId: string,
  body: Record<string, unknown>,
  links: EmailLinks,
  now: number,
): Promise<AddEmailResult> {
  const email = normalizeEmail(body.email);
  const order = await getShopOrder(db, orderRowId);
  if (!order) throw new AppError(404, 'Order not found');
  if (!order.guestKey) throw new AppError(409, 'This order was placed from an account: it already uses the account email.');
  if (order.contactEmail) throw new AppError(409, `This order already has an email (${order.contactEmail}).`);
  if (order.orderStatus !== 'ACTIVE') throw new AppError(409, 'This order is cancelled.');

  // The account: the one with this email, else a new one from the order (only if the phone is not someone else's).
  const account = await findCustomerByEmail(db, email);
  let kind: AddEmailResult['account'] = account ? 'existing' : 'none';
  if (account?.disabledAt != null) throw new AppError(409, 'The account with this email is deactivated. Re-activate it on Customers first.');
  const statements = [];
  let newAccountId: string | null = null;
  if (!account) {
    const phoneTaken = await db.prepare('SELECT 1 FROM shop_customers WHERE phone = ? LIMIT 1').bind(order.recipientPhone).first();
    if (!phoneTaken) {
      newAccountId = newId();
      kind = 'new';
      statements.push(
        db
          .prepare(
            `INSERT INTO shop_customers (id, email, name, phone, passwordHash, referredById, createdAt, updatedAt, emailVerifiedAt)
             VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          )
          .bind(newAccountId, email, order.recipientName, order.recipientPhone, NO_PASSWORD, now, now, now),
      );
    }
  }
  const customerId = account?.id ?? newAccountId ?? order.customerId ?? '';

  // First purchase: this order holds the discount, so mark the account's welcome voucher as used by it.
  let firstPurchaseMarked = false;
  let welcomeId: string | null = null;
  const raw = await db.prepare('SELECT voucherId, voucherActive FROM shop_orders WHERE orderRowId = ?').bind(orderRowId).first<{ voucherId: string | null; voucherActive: number }>();
  const holdsDiscount = order.newCustomerDiscount && Number(raw?.voucherActive) === 1;
  if (holdsDiscount) {
    firstPurchaseMarked = true;
    if (newAccountId) {
      const rule = (await loadVoucherRules(db)).WELCOME;
      welcomeId = newId();
      statements.push(
        db
          .prepare(
            `INSERT INTO shop_vouchers (id, code, customerId, kind, percent, capAmount, period, sourceCustomerId, expiresAt, emailedAt, createdAt)
             VALUES (?, ?, ?, 'WELCOME', ?, ?, NULL, NULL, NULL, NULL, ?)`,
          )
          .bind(welcomeId, `JK-${randomCode(4)}-${randomCode(4)}`, newAccountId, rule.percent, rule.cap, now),
      );
    } else if (account) {
      const unused = await db
        .prepare(
          `SELECT v.id FROM shop_vouchers v WHERE v.customerId = ? AND v.kind = 'WELCOME'
             AND NOT EXISTS (SELECT 1 FROM shop_orders o WHERE o.voucherId = v.id AND o.voucherActive = 1) LIMIT 1`,
        )
        .bind(account.id)
        .first<{ id: string }>();
      welcomeId = unused?.id ?? null;
    }
  }

  statements.push(
    db
      .prepare(
        `UPDATE shop_orders SET contactEmail = ?, customerId = ?, voucherId = COALESCE(voucherId, ?)
         WHERE orderRowId = ? AND contactEmail IS NULL`,
      )
      .bind(email, customerId, raw?.voucherId ? null : welcomeId, orderRowId),
  );
  await db.batch(statements);

  const after = (await getShopOrder(db, orderRowId))!;
  // Already paid: the "Pembayaran diterima" email now, when asked. Unpaid: it goes out by itself when marked paid.
  const emails = body.sendPaidEmail === true && after.paymentStatus === 'PAID' ? [paymentConfirmedEmail(email, after, links)] : [];
  return { account: kind, firstPurchaseMarked, emails };
}
