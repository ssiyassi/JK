import { AppError, isUniqueViolation, newId, type D1Database } from '../core/d1.ts';
import { jakartaInstant, jakartaParts } from '../core/time.ts';
import { VOUCHER_RULES, type VoucherKind } from './catalog.ts';
import { findCampaignVoucher, type CampaignVoucher } from './campaigns.ts';
import { isGuest, type Buyer } from './customers.ts';
import type { DiscountTerms } from './pricing.ts';
import { randomCode } from './util.ts';

export interface Voucher {
  id: string;
  code: string;
  customerId: string;
  kind: VoucherKind;
  percent: number;
  capAmount: number;
  period: string | null;
  expiresAt: number | null;
  emailedAt: number | null;
  createdAt: number;
}

export type VoucherStatus = 'AVAILABLE' | 'USED' | 'EXPIRED';

function mapVoucher(r: Record<string, unknown>): Voucher {
  return {
    id: String(r.id),
    code: String(r.code),
    customerId: String(r.customerId),
    kind: r.kind as VoucherKind,
    percent: Number(r.percent),
    capAmount: Number(r.capAmount),
    period: (r.period as string | null) ?? null,
    expiresAt: r.expiresAt === null || r.expiresAt === undefined ? null : Number(r.expiresAt),
    emailedAt: r.emailedAt === null || r.emailedAt === undefined ? null : Number(r.emailedAt),
    createdAt: Number(r.createdAt),
  };
}

/** "2026-10" for the Jakarta month containing the instant. */
export function monthKey(now: number): string {
  const p = jakartaParts(now);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}`;
}

/** Last millisecond of the Jakarta month containing the instant. */
export function endOfJakartaMonth(now: number): number {
  const p = jakartaParts(now);
  return jakartaInstant(p.year, p.month + 1, 1).getTime() - 1;
}

export type VoucherRules = Record<VoucherKind, { percent: number; cap: number; label: string }>;

/** Current terms of the automatic vouchers: the owner's settings, else the defaults in VOUCHER_RULES. */
export async function loadVoucherRules(db: D1Database): Promise<VoucherRules> {
  const rules: VoucherRules = {
    WELCOME: { ...VOUCHER_RULES.WELCOME },
    MONTHLY: { ...VOUCHER_RULES.MONTHLY },
    REFERRAL: { ...VOUCHER_RULES.REFERRAL },
  };
  const { results } = await db.prepare('SELECT kind, percent, capAmount FROM shop_voucher_settings').all<Record<string, unknown>>();
  for (const r of results) {
    const kind = r.kind as VoucherKind;
    if (rules[kind]) rules[kind] = { ...rules[kind], percent: Number(r.percent), cap: Number(r.capAmount) };
  }
  return rules;
}

/**
 * Saves the percent and max discount of the automatic vouchers: { WELCOME: { percent, cap }, REFERRAL: …, MONTHLY: … }.
 * Applies to vouchers issued from now on; vouchers already issued keep their terms.
 */
export async function saveVoucherRules(db: D1Database, body: Record<string, unknown>, now: number): Promise<VoucherRules> {
  const statements = [];
  for (const kind of Object.keys(VOUCHER_RULES) as VoucherKind[]) {
    const input = (body[kind] && typeof body[kind] === 'object' ? body[kind] : {}) as Record<string, unknown>;
    const name = VOUCHER_RULES[kind].label;
    const percent = Number(input.percent);
    const cap = Number(input.cap);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new AppError(400, `${name}: discount must be a whole number from 1 to 100`);
    if (!Number.isInteger(cap) || cap < 1 || cap > 100_000_000) throw new AppError(400, `${name}: max discount must be at least Rp 1`);
    statements.push(
      db
        .prepare(
          `INSERT INTO shop_voucher_settings (kind, percent, capAmount, updatedAt) VALUES (?, ?, ?, ?)
           ON CONFLICT(kind) DO UPDATE SET percent = excluded.percent, capAmount = excluded.capAmount, updatedAt = excluded.updatedAt`,
        )
        .bind(kind, percent, cap, now),
    );
  }
  await db.batch(statements);
  return loadVoucherRules(db);
}

/**
 * Creates a voucher. Returns null if the customer already has this one
 * (one welcome voucher per customer, one monthly voucher per month, one referral reward per referred friend).
 */
export async function issueVoucher(
  db: D1Database,
  v: {
    customerId: string;
    kind: VoucherKind;
    now: number;
    period?: string;
    sourceCustomerId?: string;
    expiresAt?: number | null;
    rules?: VoucherRules; // already loaded (bulk runs)
  },
): Promise<Voucher | null> {
  const rule = (v.rules ?? (await loadVoucherRules(db)))[v.kind];
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `JK-${randomCode(4)}-${randomCode(4)}`;
    const id = newId();
    try {
      await db
        .prepare(
          `INSERT INTO shop_vouchers (id, code, customerId, kind, percent, capAmount, period, sourceCustomerId, expiresAt, emailedAt, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .bind(id, code, v.customerId, v.kind, rule.percent, rule.cap, v.period ?? null, v.sourceCustomerId ?? null, v.expiresAt ?? null, v.now)
        .run();
      const row = await db.prepare('SELECT * FROM shop_vouchers WHERE id = ?').bind(id).first<Record<string, unknown>>();
      return row ? mapVoucher(row) : null;
    } catch (error) {
      if (isUniqueViolation(error, 'shop_vouchers.code')) continue; // astronomically rare: pick another code
      if (isUniqueViolation(error)) return null; // already issued
      throw error;
    }
  }
  throw new Error('Could not generate a unique voucher code');
}

export async function markVoucherEmailed(db: D1Database, id: string, now: number): Promise<void> {
  await db.prepare('UPDATE shop_vouchers SET emailedAt = ? WHERE id = ?').bind(now, id).run();
}

/** Every voucher of a customer, newest first, with its current status. */
export async function listCustomerVouchers(
  db: D1Database,
  customerId: string,
  now: number,
): Promise<(Voucher & { status: VoucherStatus })[]> {
  const { results } = await db
    .prepare(
      `SELECT v.*, EXISTS (SELECT 1 FROM shop_orders o WHERE o.voucherId = v.id AND o.voucherActive = 1) AS used
       FROM shop_vouchers v WHERE v.customerId = ? ORDER BY v.createdAt DESC`,
    )
    .bind(customerId)
    .all<Record<string, unknown>>();
  return results.map((r) => {
    const v = mapVoucher(r);
    const status: VoucherStatus = Number(r.used) ? 'USED' : v.expiresAt !== null && v.expiresAt < now ? 'EXPIRED' : 'AVAILABLE';
    return { ...v, status };
  });
}

/**
 * Checks a personal voucher (welcome / monthly / referral) typed at checkout: unused and not expired. A signed-in
 * customer can only use their own; a guest can use anyone's (the order then joins that customer's order list).
 * Returns null when no such code exists (it may be an admin voucher, see campaigns.ts).
 * (The final "once" guarantee is the unique index on shop_orders.voucherId, checked when the order is saved.)
 */
async function findPersonalVoucher(db: D1Database, code: string, buyer: Buyer, now: number): Promise<Voucher | null> {
  const row = await db
    .prepare('SELECT v.*, c.disabledAt AS ownerDisabledAt FROM shop_vouchers v LEFT JOIN shop_customers c ON c.id = v.customerId WHERE v.code = ?')
    .bind(code)
    .first<Record<string, unknown>>();
  if (!row) return null;
  if (!isGuest(buyer) && String(row.customerId) !== buyer.id) throw new AppError(400, 'Kode voucher tidak ditemukan untuk akun ini');
  if (row.ownerDisabledAt != null) throw new AppError(400, 'Voucher sudah tidak berlaku');
  const v = mapVoucher(row);
  if (v.expiresAt !== null && v.expiresAt < now) throw new AppError(400, 'Voucher sudah kedaluwarsa');
  const used = await db
    .prepare('SELECT 1 FROM shop_orders WHERE voucherId = ? AND voucherActive = 1')
    .bind(v.id)
    .first();
  if (used) throw new AppError(400, 'Voucher sudah pernah dipakai');
  return v;
}

/** A voucher accepted at checkout: one of the customer's own (personal) or an admin voucher (campaign). */
export interface CheckoutVoucher extends DiscountTerms {
  code: string;
  personal: Voucher | null;
  campaign: CampaignVoucher | null;
}

/** Checks a code typed at checkout: personal vouchers first, then the admin vouchers. */
export async function findUsableVoucher(db: D1Database, rawCode: unknown, buyer: Buyer, now: number): Promise<CheckoutVoucher> {
  const code = (typeof rawCode === 'string' ? rawCode : '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) throw new AppError(400, 'Masukkan kode voucher');
  const personal = await findPersonalVoucher(db, code, buyer, now);
  if (personal) return { code: personal.code, percent: personal.percent, fixedAmount: null, capAmount: personal.capAmount, minOrder: 0, personal, campaign: null };
  const campaign = await findCampaignVoucher(db, code, buyer, now);
  if (campaign) {
    return { code: campaign.code, percent: campaign.percent, fixedAmount: campaign.fixedAmount, capAmount: campaign.capAmount, minOrder: campaign.minOrder, personal: null, campaign };
  }
  throw new AppError(400, isGuest(buyer) ? 'Kode voucher tidak ditemukan' : 'Kode voucher tidak ditemukan untuk akun ini');
}

export interface VoucherEmailJob {
  voucher: Voucher;
  email: string;
  name: string;
}

/**
 * Monthly voucher run (owner clicks it in the admin): gives every customer this month's 20% voucher if they
 * don't have it yet, and returns all of this month's vouchers that have not been emailed. Safe to run again:
 * nobody gets a second voucher, and only unsent emails are returned.
 */
export async function issueMonthlyVouchers(db: D1Database, now: number): Promise<VoucherEmailJob[]> {
  const period = monthKey(now);
  const expiresAt = endOfJakartaMonth(now);
  const { results: missing } = await db
    .prepare(
      `SELECT id FROM shop_customers c
       WHERE c.disabledAt IS NULL AND c.emailVerifiedAt IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM shop_vouchers v WHERE v.customerId = c.id AND v.kind = 'MONTHLY' AND v.period = ?)`,
    )
    .bind(period)
    .all<{ id: string }>();
  const rules = await loadVoucherRules(db);
  for (const c of missing) await issueVoucher(db, { customerId: c.id, kind: 'MONTHLY', now, period, expiresAt, rules });

  const { results } = await db
    .prepare(
      `SELECT v.*, c.email AS customerEmail, c.name AS customerName
       FROM shop_vouchers v JOIN shop_customers c ON c.id = v.customerId
       WHERE v.kind = 'MONTHLY' AND v.period = ? AND v.emailedAt IS NULL AND c.disabledAt IS NULL AND c.emailVerifiedAt IS NOT NULL`,
    )
    .bind(period)
    .all<Record<string, unknown>>();
  return results.map((r) => ({ voucher: mapVoucher(r), email: String(r.customerEmail), name: String(r.customerName) }));
}

/** A customer's voucher for the current month, for the WhatsApp reminder on the admin Customers page. */
export interface MonthlyReminder {
  code: string;
  percent: number;
  capAmount: number;
  expiresAt: number | null;
  used: boolean;
}

/**
 * This month's monthly voucher of every customer who has one, by customer id. Read fresh on every page load, so after
 * "Send" for a new month the reminders use the new codes (older months are never offered).
 */
export async function monthlyRemindersByCustomer(db: D1Database, now: number): Promise<Record<string, MonthlyReminder>> {
  const { results } = await db
    .prepare(
      `SELECT v.customerId, v.code, v.percent, v.capAmount, v.expiresAt,
         EXISTS (SELECT 1 FROM shop_orders o WHERE o.voucherId = v.id AND o.voucherActive = 1) AS used
       FROM shop_vouchers v WHERE v.kind = 'MONTHLY' AND v.period = ?`,
    )
    .bind(monthKey(now))
    .all<Record<string, unknown>>();
  return Object.fromEntries(
    results.map((r) => [
      String(r.customerId),
      {
        code: String(r.code),
        percent: Number(r.percent),
        capAmount: Number(r.capAmount),
        expiresAt: r.expiresAt == null ? null : Number(r.expiresAt),
        used: Boolean(Number(r.used)),
      },
    ]),
  );
}

export async function monthlyVoucherStats(db: D1Database, now: number) {
  const period = monthKey(now);
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM shop_customers WHERE disabledAt IS NULL AND emailVerifiedAt IS NOT NULL) AS customers,
              (SELECT COUNT(*) FROM shop_vouchers WHERE kind = 'MONTHLY' AND period = ? AND emailedAt IS NOT NULL) AS sent`,
    )
    .bind(period)
    .first<Record<string, unknown>>();
  return { period, customers: Number(row?.customers ?? 0), sent: Number(row?.sent ?? 0) };
}
