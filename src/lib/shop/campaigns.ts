// Voucher engine: vouchers the owner creates in the admin (Website → Vouchers). See migrations/0020_voucher_campaigns.sql.
// The automatic WELCOME / MONTHLY / REFERRAL vouchers stay in vouchers.ts.
import { AppError, isUniqueViolation, newId, type D1Database, type D1PreparedStatement } from '../core/d1.ts';
import { jakartaDateKey, jakartaInstant, jakartaParts } from '../core/time.ts';
import { formatRupiah } from './catalog.ts';
import { isGuest, type Buyer, type Customer } from './customers.ts';
import type { DiscountTerms } from './pricing.ts';
import { normalizeEmail, randomCode } from './util.ts';

export type CampaignType = 'GENERAL' | 'UNIQUE' | 'BLAST';
export type DiscountType = 'PERCENT' | 'FIXED';

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  discountType: DiscountType;
  discountValue: number;
  capAmount: number | null;
  minOrder: number;
  startsAt: number;
  endsAt: number;
  quota: number | null;
  perCustomerLimit: number | null;
  perCustomerDailyLimit: number | null;
  prefix: string | null;
  disabledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** A campaign code accepted at checkout. */
export interface CampaignVoucher extends DiscountTerms {
  code: string;
  codeId: string;
  campaign: Campaign;
  singleUse: boolean;
  expiresAt: number;
  /** Email-blast code: the email it was sent to (a guest's order using it joins that customer's order list). */
  codeEmail: string | null;
}

export const UNIQUE_CODE_LENGTH = 6;
export const MAX_UNIQUE_CODES = 1000;
export const MAX_BLAST_RECIPIENTS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function mapCampaign(r: Record<string, unknown>): Campaign {
  return {
    id: String(r.id),
    name: String(r.name),
    type: r.type as CampaignType,
    discountType: r.discountType as DiscountType,
    discountValue: Number(r.discountValue),
    capAmount: num(r.capAmount),
    minOrder: Number(r.minOrder ?? 0),
    startsAt: Number(r.startsAt),
    endsAt: Number(r.endsAt),
    quota: num(r.quota),
    perCustomerLimit: num(r.perCustomerLimit),
    perCustomerDailyLimit: num(r.perCustomerDailyLimit),
    prefix: (r.prefix as string | null) ?? null,
    disabledAt: num(r.disabledAt),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

export function campaignTerms(c: Campaign): DiscountTerms {
  return c.discountType === 'FIXED'
    ? { percent: 0, fixedAmount: c.discountValue, capAmount: null, minOrder: c.minOrder }
    : { percent: c.discountValue, fixedAmount: null, capAmount: c.capAmount, minOrder: c.minOrder };
}

/** "10% (max Rp 50.000)" / "Rp 20.000" — admin wording. */
export function campaignDiscountText(c: Campaign): string {
  if (c.discountType === 'FIXED') return formatRupiah(c.discountValue);
  return c.capAmount ? `${c.discountValue}% (max ${formatRupiah(c.capAmount)})` : `${c.discountValue}%`;
}

/** "Diskon 10% (maksimal Rp 50.000)" / "Diskon Rp 20.000" — customer wording. */
export function customerDiscountText(c: Campaign): string {
  if (c.discountType === 'FIXED') return `Diskon ${formatRupiah(c.discountValue)}`;
  return c.capAmount ? `Diskon ${c.discountValue}% (maksimal ${formatRupiah(c.capAmount)})` : `Diskon ${c.discountValue}%`;
}

// ---------------------------------------------------------------------------
// Input checks (admin)
// ---------------------------------------------------------------------------

function whole(value: unknown, label: string, { min = 0, max = 1_000_000_000, optional = false } = {}): number | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (optional) return null;
    throw new AppError(400, `${label} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError(400, `${label} must be a whole number from ${min.toLocaleString('id-ID')}`);
  return n;
}

/** "2026-11-30" → first / last millisecond of that WIB day. */
function dayBounds(value: unknown, label: string): { start: number; end: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '');
  if (!m) throw new AppError(400, `${label} is required`);
  const start = jakartaInstant(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  if (jakartaDateKey(start) !== m[0]) throw new AppError(400, `${label} is not a valid date`);
  return { start, end: start + DAY_MS - 1 };
}

export function normalizeCode(value: unknown): string {
  return (typeof value === 'string' ? value : '').trim().toUpperCase().replace(/\s+/g, '');
}

function parsePrefix(value: unknown): string {
  const prefix = normalizeCode(value);
  if (!/^[A-Z0-9]{2,20}$/.test(prefix)) throw new AppError(400, 'Prefix must be 2–20 letters or numbers (no spaces or symbols)');
  return prefix;
}

interface Terms {
  name: string;
  discountType: DiscountType;
  discountValue: number;
  capAmount: number | null;
  minOrder: number;
  startsAt: number;
  endsAt: number;
  quota: number | null;
  perCustomerLimit: number | null;
  perCustomerDailyLimit: number | null;
}

function parseTerms(b: Record<string, unknown>): Terms {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) throw new AppError(400, 'Name is required');
  if (name.length > 80) throw new AppError(400, 'Name is too long (max 80 characters)');
  const discountType: DiscountType = b.discountType === 'FIXED' ? 'FIXED' : b.discountType === 'PERCENT' ? 'PERCENT' : (() => {
    throw new AppError(400, 'Choose percent or fixed Rupiah');
  })();
  const discountValue =
    discountType === 'PERCENT'
      ? whole(b.discountValue, 'Discount %', { min: 1, max: 100 })!
      : whole(b.discountValue, 'Discount amount', { min: 1 })!;
  const capAmount = discountType === 'PERCENT' ? whole(b.capAmount, 'Max discount', { min: 1, optional: true }) : null;
  const minOrder = whole(b.minOrder ?? 0, 'Minimum order', { min: 0 }) ?? 0;
  const start = dayBounds(b.startDate, 'Start date');
  const end = dayBounds(b.endDate, 'End date');
  if (end.end < start.start) throw new AppError(400, 'End date must be on or after the start date');
  return {
    name,
    discountType,
    discountValue,
    capAmount,
    minOrder,
    startsAt: start.start,
    endsAt: end.end,
    quota: whole(b.quota, 'Total quota', { min: 1, optional: true }),
    perCustomerLimit: whole(b.perCustomerLimit, 'Uses per customer', { min: 1, optional: true }),
    perCustomerDailyLimit: whole(b.perCustomerDailyLimit, 'Uses per customer per day', { min: 1, optional: true }),
  };
}

export interface Recipient {
  email: string;
  name: string | null; // account name when the email belongs to a customer
}

/**
 * Who gets an email-blast voucher: { mode: 'ALL' } (every active customer), { mode: 'SELECTED', customerIds },
 * or { mode: 'EMAILS', emails: "a@x.com, b@y.com ..." } (any address; only an account with that email can use it).
 */
export async function parseRecipients(db: D1Database, input: unknown): Promise<Recipient[]> {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  let out: Recipient[];
  if (r.mode === 'ALL') {
    const { results } = await db.prepare('SELECT email, name FROM shop_customers WHERE disabledAt IS NULL AND emailVerifiedAt IS NOT NULL ORDER BY createdAt').all<Record<string, unknown>>();
    out = results.map((c) => ({ email: String(c.email).toLowerCase(), name: String(c.name) }));
  } else if (r.mode === 'SELECTED') {
    const ids = Array.isArray(r.customerIds) ? r.customerIds.filter((x): x is string => typeof x === 'string') : [];
    if (!ids.length) throw new AppError(400, 'Tick at least one customer');
    out = [];
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await db
        .prepare(`SELECT email, name FROM shop_customers WHERE disabledAt IS NULL AND id IN (${chunk.map(() => '?').join(',')})`)
        .bind(...chunk)
        .all<Record<string, unknown>>();
      out.push(...results.map((c) => ({ email: String(c.email).toLowerCase(), name: String(c.name) })));
    }
  } else if (r.mode === 'EMAILS') {
    const parts = (typeof r.emails === 'string' ? r.emails : '').split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) throw new AppError(400, 'Paste at least one email address');
    const bad: string[] = [];
    const emails: string[] = [];
    for (const p of parts) {
      try {
        emails.push(normalizeEmail(p));
      } catch {
        bad.push(p);
      }
    }
    if (bad.length) throw new AppError(400, `Not valid email addresses: ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? ' …' : ''}`);
    const names = new Map<string, string>();
    for (let i = 0; i < emails.length; i += 90) {
      const chunk = emails.slice(i, i + 90);
      const { results } = await db
        .prepare(`SELECT email, name FROM shop_customers WHERE lower(email) IN (${chunk.map(() => '?').join(',')})`)
        .bind(...chunk)
        .all<Record<string, unknown>>();
      for (const c of results) names.set(String(c.email).toLowerCase(), String(c.name));
    }
    out = emails.map((email) => ({ email, name: names.get(email) ?? null }));
  } else {
    throw new AppError(400, 'Choose who receives the voucher');
  }
  const seen = new Set<string>();
  out = out.filter((x) => (seen.has(x.email) ? false : (seen.add(x.email), true)));
  if (!out.length) throw new AppError(400, 'No customers to send to');
  if (out.length > MAX_BLAST_RECIPIENTS) throw new AppError(400, `Max ${MAX_BLAST_RECIPIENTS} recipients at once`);
  return out;
}

// ---------------------------------------------------------------------------
// Create / edit (admin)
// ---------------------------------------------------------------------------

async function codeTaken(db: D1Database, code: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM shop_voucher_codes WHERE code = ? UNION ALL SELECT 1 FROM shop_vouchers WHERE code = ? LIMIT 1')
    .bind(code, code)
    .first();
  return Boolean(row);
}

function codeInsert(db: D1Database, campaignId: string, code: string, email: string | null, now: number): D1PreparedStatement {
  return db
    .prepare('INSERT INTO shop_voucher_codes (id, campaignId, code, email, emailedAt, disabledAt, createdAt) VALUES (?, ?, ?, ?, NULL, NULL, ?)')
    .bind(newId(), campaignId, code, email, now);
}

/** Adds random PREFIX+XXXXXX codes (one per email for a blast); retries with new codes on the rare collision. */
async function insertRandomCodes(db: D1Database, campaignId: string, prefix: string, emails: (string | null)[], now: number): Promise<void> {
  for (let start = 0; start < emails.length; start += 100) {
    const chunk = emails.slice(start, start + 100);
    for (let attempt = 0; ; attempt++) {
      const codes = new Set<string>();
      while (codes.size < chunk.length) codes.add(prefix + randomCode(UNIQUE_CODE_LENGTH));
      const list = [...codes];
      try {
        await db.batch(chunk.map((email, i) => codeInsert(db, campaignId, list[i], email, now)));
        break;
      } catch (error) {
        if (attempt < 4 && isUniqueViolation(error, 'shop_voucher_codes.code')) continue;
        throw error;
      }
    }
  }
}

/**
 * Creates a voucher. Body: type GENERAL (+ code) | UNIQUE (+ prefix, count) | BLAST (+ prefix, recipients), plus
 * name, discountType, discountValue, capAmount?, minOrder, startDate, endDate (YYYY-MM-DD, WIB), quota?,
 * perCustomerLimit?, perCustomerDailyLimit?.
 */
export async function createCampaign(db: D1Database, body: Record<string, unknown>, now: number): Promise<Campaign> {
  const type = body.type as CampaignType;
  if (!['GENERAL', 'UNIQUE', 'BLAST'].includes(type)) throw new AppError(400, 'Choose the voucher type');
  const t = parseTerms(body);
  let generalCode: string | null = null;
  let prefix: string | null = null;
  let count = 0;
  let recipients: Recipient[] = [];
  if (type === 'GENERAL') {
    generalCode = normalizeCode(body.code);
    if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(generalCode)) throw new AppError(400, 'Code must be 3–30 letters, numbers or dashes');
    if (generalCode.startsWith('JK-') || (await codeTaken(db, generalCode))) throw new AppError(409, `Code ${generalCode} already exists`);
  } else {
    prefix = parsePrefix(body.prefix);
    if (type === 'UNIQUE') count = whole(body.count, 'Number of codes', { min: 1, max: MAX_UNIQUE_CODES })!;
    else recipients = await parseRecipients(db, body.recipients);
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO shop_voucher_campaigns
        (id, name, type, discountType, discountValue, capAmount, minOrder, startsAt, endsAt, quota, perCustomerLimit,
         perCustomerDailyLimit, prefix, disabledAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(id, t.name, type, t.discountType, t.discountValue, t.capAmount, t.minOrder, t.startsAt, t.endsAt, t.quota,
      t.perCustomerLimit, t.perCustomerDailyLimit, prefix, now, now)
    .run();
  try {
    if (generalCode) await codeInsert(db, id, generalCode, null, now).run();
    else if (type === 'UNIQUE') await insertRandomCodes(db, id, prefix!, Array.from({ length: count }, () => null), now);
    else await insertRandomCodes(db, id, prefix!, recipients.map((r) => r.email), now);
  } catch (error) {
    await db.batch([
      db.prepare('DELETE FROM shop_voucher_codes WHERE campaignId = ?').bind(id),
      db.prepare('DELETE FROM shop_voucher_campaigns WHERE id = ?').bind(id),
    ]);
    if (isUniqueViolation(error, 'shop_voucher_codes.code')) throw new AppError(409, `Code ${generalCode} already exists`);
    throw error;
  }
  return (await getCampaign(db, id))!;
}

export async function getCampaign(db: D1Database, id: string): Promise<Campaign | null> {
  const row = await db.prepare('SELECT * FROM shop_voucher_campaigns WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return row ? mapCampaign(row) : null;
}

async function usesOf(db: D1Database, campaignId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM shop_orders WHERE campaignId = ? AND voucherActive = 1')
    .bind(campaignId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Edits a voucher: name, dates, limits, max discount, minimum order. The discount itself (type and value) can only
 * change while nobody holds the voucher, so customers who used it keep what they were promised.
 * { disabled: true | false } deactivates / reactivates the whole voucher.
 */
export async function updateCampaign(db: D1Database, id: string, body: Record<string, unknown>, now: number): Promise<Campaign> {
  const c = await getCampaign(db, id);
  if (!c) throw new AppError(404, 'Voucher not found');
  if (typeof body.disabled === 'boolean') {
    await db.prepare('UPDATE shop_voucher_campaigns SET disabledAt = ?, updatedAt = ? WHERE id = ?').bind(body.disabled ? now : null, now, id).run();
    return (await getCampaign(db, id))!;
  }
  const t = parseTerms(body);
  if ((t.discountType !== c.discountType || t.discountValue !== c.discountValue) && (await usesOf(db, id)) > 0) {
    throw new AppError(409, 'The discount cannot change after customers have used this voucher. Create a new voucher instead.');
  }
  await db
    .prepare(
      `UPDATE shop_voucher_campaigns SET name = ?, discountType = ?, discountValue = ?, capAmount = ?, minOrder = ?, startsAt = ?,
         endsAt = ?, quota = ?, perCustomerLimit = ?, perCustomerDailyLimit = ?, updatedAt = ? WHERE id = ?`,
    )
    .bind(t.name, t.discountType, t.discountValue, t.capAmount, t.minOrder, t.startsAt, t.endsAt, t.quota, t.perCustomerLimit,
      t.perCustomerDailyLimit, now, id)
    .run();
  return (await getCampaign(db, id))!;
}

/** Deactivates / reactivates one code of a voucher. */
export async function setCodeDisabled(db: D1Database, campaignId: string, codeId: string, disabled: boolean, now: number): Promise<void> {
  const r = await db
    .prepare('UPDATE shop_voucher_codes SET disabledAt = ? WHERE id = ? AND campaignId = ?')
    .bind(disabled ? now : null, codeId, campaignId)
    .run();
  if (!r.meta.changes) throw new AppError(404, 'Code not found');
}

export interface BlastJob {
  codeId: string;
  code: string;
  email: string;
  name: string | null;
}

/** Email blast: adds codes for new recipients (people who already have one are skipped). Returns how many were added. */
export async function addBlastRecipients(db: D1Database, id: string, input: unknown, now: number): Promise<number> {
  const c = await getCampaign(db, id);
  if (!c || c.type !== 'BLAST') throw new AppError(404, 'Voucher not found');
  const recipients = await parseRecipients(db, input);
  const { results } = await db.prepare('SELECT email FROM shop_voucher_codes WHERE campaignId = ?').bind(id).all<{ email: string }>();
  const have = new Set(results.map((r) => r.email));
  const fresh = recipients.filter((r) => !have.has(r.email)).map((r) => r.email);
  if (fresh.length) await insertRandomCodes(db, id, c.prefix!, fresh, now);
  return fresh.length;
}

/** Blast codes whose email has not gone out yet (active codes only). */
export async function unsentBlastJobs(db: D1Database, id: string): Promise<BlastJob[]> {
  const { results } = await db
    .prepare(
      `SELECT k.id, k.code, k.email, (SELECT c.name FROM shop_customers c WHERE lower(c.email) = k.email LIMIT 1) AS name
       FROM shop_voucher_codes k WHERE k.campaignId = ? AND k.email IS NOT NULL AND k.emailedAt IS NULL AND k.disabledAt IS NULL
       ORDER BY k.createdAt, k.code`,
    )
    .bind(id)
    .all<Record<string, unknown>>();
  return results.map((r) => ({ codeId: String(r.id), code: String(r.code), email: String(r.email), name: (r.name as string | null) ?? null }));
}

export async function markCampaignCodeEmailed(db: D1Database, codeId: string, now: number): Promise<void> {
  await db.prepare('UPDATE shop_voucher_codes SET emailedAt = ? WHERE id = ?').bind(now, codeId).run();
}

// ---------------------------------------------------------------------------
// Lists (admin)
// ---------------------------------------------------------------------------

export type CampaignStatus = 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'DEACTIVATED';

export function campaignStatus(c: Campaign, now: number): CampaignStatus {
  if (c.disabledAt !== null) return 'DEACTIVATED';
  if (now < c.startsAt) return 'SCHEDULED';
  if (now > c.endsAt) return 'ENDED';
  return 'ACTIVE';
}

export interface CampaignSummary extends Campaign {
  status: CampaignStatus;
  uses: number; // orders holding the voucher (not cancelled)
  paidUses: number;
  discountGiven: number;
  codes: number;
  codesUsed: number;
  codesDisabled: number;
  emailed: number;
  generalCode: string | null;
}

export async function listCampaigns(db: D1Database, now: number): Promise<CampaignSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM shop_orders o WHERE o.campaignId = c.id AND o.voucherActive = 1) AS uses,
         (SELECT COUNT(*) FROM shop_orders o JOIN orders x ON x.id = o.orderRowId
            WHERE o.campaignId = c.id AND o.voucherActive = 1 AND x.paymentStatus = 'PAID') AS paidUses,
         (SELECT COALESCE(SUM(o.discount), 0) FROM shop_orders o WHERE o.campaignId = c.id AND o.voucherActive = 1) AS discountGiven,
         (SELECT COUNT(*) FROM shop_voucher_codes k WHERE k.campaignId = c.id) AS codes,
         (SELECT COUNT(DISTINCT o.campaignCodeId) FROM shop_orders o WHERE o.campaignId = c.id AND o.voucherActive = 1) AS codesUsed,
         (SELECT COUNT(*) FROM shop_voucher_codes k WHERE k.campaignId = c.id AND k.disabledAt IS NOT NULL) AS codesDisabled,
         (SELECT COUNT(*) FROM shop_voucher_codes k WHERE k.campaignId = c.id AND k.emailedAt IS NOT NULL) AS emailed,
         (SELECT k.code FROM shop_voucher_codes k WHERE k.campaignId = c.id AND c.type = 'GENERAL' LIMIT 1) AS generalCode
       FROM shop_voucher_campaigns c ORDER BY c.createdAt DESC`,
    )
    .all<Record<string, unknown>>();
  return results.map((r) => {
    const c = mapCampaign(r);
    return {
      ...c,
      status: campaignStatus(c, now),
      uses: Number(r.uses),
      paidUses: Number(r.paidUses),
      discountGiven: Number(r.discountGiven),
      codes: Number(r.codes),
      codesUsed: Number(r.codesUsed),
      codesDisabled: Number(r.codesDisabled),
      emailed: Number(r.emailed),
      generalCode: (r.generalCode as string | null) ?? null,
    };
  });
}

export interface CodeRow {
  id: string;
  code: string;
  email: string | null;
  emailedAt: number | null;
  disabledAt: number | null;
  used: boolean;
}

export async function listCampaignCodes(db: D1Database, campaignId: string): Promise<CodeRow[]> {
  const { results } = await db
    .prepare(
      `SELECT k.*, EXISTS (SELECT 1 FROM shop_orders o WHERE o.campaignCodeId = k.id AND o.voucherActive = 1) AS used
       FROM shop_voucher_codes k WHERE k.campaignId = ? ORDER BY k.createdAt, k.code`,
    )
    .bind(campaignId)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    email: (r.email as string | null) ?? null,
    emailedAt: num(r.emailedAt),
    disabledAt: num(r.disabledAt),
    used: Boolean(Number(r.used)),
  }));
}

// ---------------------------------------------------------------------------
// CSV downloads (admin)
// ---------------------------------------------------------------------------

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starts with = + - @, tab or CR, e.g. a customer
 * named "=HYPERLINK(...)") gets a leading apostrophe, so Excel and Google Sheets show it as plain text.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function wib(ms: number | null): string {
  if (ms === null) return '';
  return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Unique codes for the partner: one code per line with the terms. */
export async function campaignCodesCsv(db: D1Database, c: Campaign): Promise<string> {
  const codes = await listCampaignCodes(db, c.id);
  const terms = campaignDiscountText(c);
  const valid = `${wib(c.startsAt).slice(0, 10)} – ${wib(c.endsAt).slice(0, 10)}`;
  return csv([
    ['Code', 'Discount', 'Minimum order', 'Valid', 'Status'],
    ...codes.map((k) => [k.code, terms, c.minOrder ? formatRupiah(c.minOrder) : 'None', valid, k.disabledAt ? 'Deactivated' : k.used ? 'Used' : 'Not used']),
  ]);
}

/**
 * Usage report. UNIQUE / BLAST: one row per code (used or not). GENERAL: one row per order that used the code.
 * Only orders that still hold the voucher count as a use (cancelled orders give it back).
 */
export async function campaignUsageCsv(db: D1Database, c: Campaign): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT k.code, k.email AS assignedEmail, k.emailedAt, k.disabledAt, o.orderRowId, o.createdAt AS orderedAt, o.subtotal,
              o.discount, o.total, x.orderId, x.paymentStatus, x.deliveryStatus, cu.name AS customerName, cu.email AS customerEmail,
              cu.phone AS customerPhone
       FROM shop_voucher_codes k
       LEFT JOIN shop_orders o ON o.campaignCodeId = k.id AND o.voucherActive = 1
       LEFT JOIN orders x ON x.id = o.orderRowId
       LEFT JOIN shop_customers cu ON cu.id = o.customerId
       WHERE k.campaignId = ? ${c.type === 'GENERAL' ? 'AND o.orderRowId IS NOT NULL' : ''}
       ORDER BY k.createdAt, k.code, o.createdAt`,
    )
    .bind(c.id)
    .all<Record<string, unknown>>();
  const header = ['Code', ...(c.type === 'BLAST' ? ['Sent to', 'Email sent'] : []), 'Status', 'Customer', 'Customer email', 'Customer phone',
    'Order ID', 'Order date (WIB)', 'Payment', 'Delivery', 'Products subtotal', 'Discount', 'Order total'];
  return csv([
    header,
    ...results.map((r) => {
      const used = r.orderRowId !== null && r.orderRowId !== undefined;
      const status = used ? 'Used' : r.disabledAt !== null ? 'Deactivated' : 'Not used';
      return [
        r.code,
        ...(c.type === 'BLAST' ? [r.assignedEmail, r.emailedAt !== null ? wib(Number(r.emailedAt)) : 'Not sent'] : []),
        status,
        r.customerName,
        r.customerEmail,
        r.customerPhone ? '0' + String(r.customerPhone).slice(2) : '',
        r.orderId,
        used ? wib(Number(r.orderedAt)) : '',
        used ? (r.paymentStatus === 'PAID' ? 'Paid' : 'Waiting for payment') : '',
        used ? (r.deliveryStatus === 'DELIVERED' ? 'Delivered' : 'Not delivered') : '',
        used ? r.subtotal : '',
        used ? r.discount : '',
        used ? r.total : '',
      ];
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

function jakartaDay(now: number): { start: number; end: number } {
  const p = jakartaParts(now);
  const start = jakartaInstant(p.year, p.month, p.day).getTime();
  return { start, end: start + DAY_MS };
}

/**
 * Whose earlier orders count for the "per customer" limits: the signed-in account, or for a guest the delivery phone
 * number. Null = a guest whose phone is not known yet (checked again when the order is placed).
 */
function limitSubject(buyer: Buyer): { where: string; value: string } | null {
  if (!isGuest(buyer)) return { where: 'customerId = ?', value: buyer.id };
  return buyer.phone ? { where: 'recipientPhone = ?', value: buyer.phone } : null;
}

/**
 * Checks a code typed at checkout against an admin voucher. Returns null when no admin voucher has this code.
 * Throws a customer-facing message when it exists but cannot be used now. The limits are checked again inside
 * the order transaction (campaignGuardStatement), so two orders racing for the last use cannot both get it.
 */
export async function findCampaignVoucher(db: D1Database, rawCode: unknown, buyer: Buyer, now: number): Promise<CampaignVoucher | null> {
  const code = normalizeCode(rawCode);
  const row = await db
    .prepare(
      `SELECT c.*, k.id AS codeId, k.code AS codeValue, k.email AS codeEmail, k.disabledAt AS codeDisabledAt
       FROM shop_voucher_codes k JOIN shop_voucher_campaigns c ON c.id = k.campaignId WHERE k.code = ?`,
    )
    .bind(code)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const c = mapCampaign(row);
  const codeId = String(row.codeId);
  // Email-blast codes: only the account with that email when signed in; a guest may use it (shared with them).
  if (c.type === 'BLAST' && !isGuest(buyer) && String(row.codeEmail) !== buyer.email.toLowerCase()) {
    throw new AppError(400, 'Kode voucher tidak ditemukan untuk akun ini');
  }
  if (c.disabledAt !== null || row.codeDisabledAt !== null) throw new AppError(400, 'Voucher sudah tidak berlaku');
  if (now < c.startsAt) throw new AppError(400, `Voucher baru berlaku mulai ${new Date(c.startsAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })}`);
  if (now > c.endsAt) throw new AppError(400, 'Voucher sudah kedaluwarsa');

  const singleUse = c.type !== 'GENERAL';
  const day = jakartaDay(now);
  const who = limitSubject(buyer);
  const mine = who
    ? `(SELECT COUNT(*) FROM shop_orders WHERE campaignId = ? AND voucherActive = 1 AND ${who.where}) AS mine,
       (SELECT COUNT(*) FROM shop_orders WHERE campaignId = ? AND voucherActive = 1 AND ${who.where} AND createdAt >= ? AND createdAt < ?) AS mineToday`
    : '0 AS mine, 0 AS mineToday';
  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM shop_orders WHERE campaignCodeId = ? AND voucherActive = 1) AS codeUses,
         (SELECT COUNT(*) FROM shop_orders WHERE campaignId = ? AND voucherActive = 1) AS uses,
         ${mine}`,
    )
    .bind(codeId, c.id, ...(who ? [c.id, who.value, c.id, who.value, day.start, day.end] : []))
    .first<Record<string, number>>();
  if (singleUse && Number(counts?.codeUses) > 0) throw new AppError(400, 'Voucher sudah pernah dipakai');
  if (c.quota !== null && Number(counts?.uses) >= c.quota) throw new AppError(400, 'Kuota voucher ini sudah habis');
  if (c.perCustomerLimit !== null && Number(counts?.mine) >= c.perCustomerLimit) {
    throw new AppError(400, `Voucher ini hanya bisa dipakai ${c.perCustomerLimit}x per ${isGuest(buyer) ? 'nomor HP' : 'akun'} dan sudah Anda pakai`);
  }
  if (c.perCustomerDailyLimit !== null && Number(counts?.mineToday) >= c.perCustomerDailyLimit) {
    throw new AppError(400, `Voucher ini hanya bisa dipakai ${c.perCustomerDailyLimit}x per hari. Silakan coba lagi besok.`);
  }
  return {
    ...campaignTerms(c),
    code: String(row.codeValue),
    codeId,
    campaign: c,
    singleUse,
    expiresAt: c.endsAt,
    codeEmail: row.codeEmail == null ? null : String(row.codeEmail),
  };
}

/** Customer-facing message when the order is below the voucher's minimum order. */
export function assertMinOrder(v: DiscountTerms, subtotal: number): void {
  if (v.minOrder && subtotal < v.minOrder) {
    throw new AppError(400, `Voucher ini berlaku untuk belanja produk minimal ${formatRupiah(v.minOrder)}`);
  }
}

/**
 * Runs inside the order transaction, after the order row is written: if the order put the voucher over any limit,
 * it inserts into shop_voucher_guard, whose CHECK fails and rolls the whole order back. Null when there is no limit.
 */
export function campaignGuardStatement(db: D1Database, v: CampaignVoucher, buyer: Buyer, now: number): D1PreparedStatement | null {
  const c = v.campaign;
  const who = limitSubject(buyer);
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (v.singleUse) {
    conds.push('(SELECT COUNT(*) FROM shop_orders WHERE campaignCodeId = ? AND voucherActive = 1) > 1');
    binds.push(v.codeId);
  }
  if (c.quota !== null) {
    conds.push('(SELECT COUNT(*) FROM shop_orders WHERE campaignId = ? AND voucherActive = 1) > ?');
    binds.push(c.id, c.quota);
  }
  if (c.perCustomerLimit !== null && who) {
    conds.push(`(SELECT COUNT(*) FROM shop_orders WHERE campaignId = ? AND voucherActive = 1 AND ${who.where}) > ?`);
    binds.push(c.id, who.value, c.perCustomerLimit);
  }
  if (c.perCustomerDailyLimit !== null && who) {
    const day = jakartaDay(now);
    conds.push(`(SELECT COUNT(*) FROM shop_orders WHERE campaignId = ? AND voucherActive = 1 AND ${who.where} AND createdAt >= ? AND createdAt < ?) > ?`);
    binds.push(c.id, who.value, day.start, day.end, c.perCustomerDailyLimit);
  }
  if (!conds.length) return null;
  return db.prepare(`INSERT INTO shop_voucher_guard (blocked) SELECT 1 WHERE ${conds.join(' OR ')}`).bind(...binds);
}

export function isVoucherLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /CHECK constraint failed/i.test(message) && /voucher_limit_reached|blocked/.test(message);
}

/** A blast voucher in the customer's own voucher list (account page, checkout). */
export interface WalletCampaignVoucher {
  id: string;
  code: string;
  label: string;
  percent: number;
  fixedAmount: number | null;
  capAmount: number | null;
  minOrder: number;
  expiresAt: number;
  status: 'AVAILABLE' | 'USED' | 'EXPIRED';
}

/** Email-blast vouchers sent to this customer's email (deactivated ones are left out). */
export async function listCustomerCampaignVouchers(db: D1Database, customer: Customer, now: number): Promise<WalletCampaignVoucher[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*, k.id AS codeId, k.code AS codeValue,
         EXISTS (SELECT 1 FROM shop_orders o WHERE o.campaignCodeId = k.id AND o.voucherActive = 1) AS used
       FROM shop_voucher_codes k JOIN shop_voucher_campaigns c ON c.id = k.campaignId
       WHERE k.email = ? AND k.disabledAt IS NULL AND c.disabledAt IS NULL AND c.type = 'BLAST'
       ORDER BY k.createdAt DESC`,
    )
    .bind(customer.email.toLowerCase())
    .all<Record<string, unknown>>();
  return results
    .map((r) => ({ r, c: mapCampaign(r) }))
    .filter(({ c }) => c.startsAt <= now) // not shown before the voucher starts
    .map(({ r, c }) => {
      const terms = campaignTerms(c);
      const status: WalletCampaignVoucher['status'] = Number(r.used) ? 'USED' : now > c.endsAt ? 'EXPIRED' : 'AVAILABLE';
      return {
        id: String(r.codeId),
        code: String(r.codeValue),
        label: c.name,
        percent: terms.percent,
        fixedAmount: terms.fixedAmount ?? null,
        capAmount: terms.capAmount,
        minOrder: c.minOrder,
        expiresAt: c.endsAt,
        status,
      };
    });
}
