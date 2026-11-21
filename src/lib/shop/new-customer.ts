// The new-customer discount (the % the ads promise; 20% since 2026-11-11, was 35%): first purchase only, once per phone number and per email.
// It is a WELCOME voucher (accounts) or, for a guest without one, the guest discount at checkout. An order holding it
// has shop_orders.newCustomerDiscount = 1; cancelling the order frees it (voucherActive = 0). Framework-free.
import { AppError, type D1Database, type D1PreparedStatement } from '../core/d1.ts';

export { NEW_CUSTOMER_CODE } from './pricing.ts';

export function newCustomerUsedMessage(percent: number): string {
  return `Diskon ${percent}% hanya untuk pembelian pertama. Nomor HP / email ini sudah pernah memakainya. Lepas diskon untuk lanjut dengan harga normal.`;
}

/** Phone numbers (normalised 628…) and emails (lower-case) of the person ordering. */
export interface Identity {
  phones: string[];
  emails: string[];
}

/** Orders (alias s, customers alias c) holding the discount whose phone or email matches: their own or their account's. */
function matching(id: Identity): { where: string; binds: string[] } {
  const phones = [...new Set(id.phones.filter(Boolean))];
  const emails = [...new Set(id.emails.filter(Boolean).map((e) => e.toLowerCase()))];
  const list = (n: number) => Array(n).fill('?').join(', ');
  const conds: string[] = [];
  const binds: string[] = [];
  if (phones.length) {
    conds.push(`s.recipientPhone IN (${list(phones.length)}) OR c.phone IN (${list(phones.length)})`);
    binds.push(...phones, ...phones);
  }
  if (emails.length) {
    conds.push(`s.contactEmail IN (${list(emails.length)}) OR c.email IN (${list(emails.length)})`);
    binds.push(...emails, ...emails);
  }
  return {
    where: `s.newCustomerDiscount = 1 AND s.voucherActive = 1 AND (${conds.length ? conds.join(' OR ') : '0'})`,
    binds,
  };
}

const FROM = 'FROM shop_orders s LEFT JOIN shop_customers c ON c.id = s.customerId';

/** Whether these phone numbers / emails already hold the discount on an active order (other than exceptOrderRowId). */
export async function newCustomerDiscountUsed(db: D1Database, id: Identity, exceptOrderRowId?: string): Promise<boolean> {
  const m = matching(id);
  const row = await db
    .prepare(`SELECT 1 ${FROM} WHERE ${m.where} AND s.orderRowId != ? LIMIT 1`)
    .bind(...m.binds, exceptOrderRowId ?? '')
    .first();
  return Boolean(row);
}

export async function assertNewCustomerDiscountFree(db: D1Database, id: Identity, percent: number): Promise<void> {
  if (await newCustomerDiscountUsed(db, id)) throw new AppError(409, newCustomerUsedMessage(percent));
}

/**
 * Runs inside the order transaction, after the order row exists: if another active order of the same phone/email
 * holds the discount (two tabs ordering at once), the insert into shop_voucher_guard fails its CHECK and the whole
 * order is rolled back.
 */
export function newCustomerGuardStatement(db: D1Database, id: Identity): D1PreparedStatement {
  const m = matching(id);
  return db.prepare(`INSERT INTO shop_voucher_guard (blocked) SELECT 1 WHERE (SELECT COUNT(*) ${FROM} WHERE ${m.where}) > 1`).bind(...m.binds);
}
