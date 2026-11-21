// Public affiliate programme (jentiskitchen.id/affiliate, Website → Affiliates). Anyone signs up with name, city,
// WhatsApp, how they promote and their bank account, and gets their own link at once (jentiskitchen.id/r/<code>,
// which lands on the shop with utm_medium=affiliate&utm_campaign=<code>, see attribution.ts).
//
// Commission (owner, 2026-11-12): Rp10.000 per box, paid every Sunday, for life:
//   - a customer whose FIRST paid order came through the affiliate's link belongs to that affiliate for good;
//   - that first order and every later paid order of the same customer (same account, phone or email) count.
// Not counted: customers who had already bought before (their first paid order did not come through the link),
// the affiliate's own orders (order phone = their WhatsApp), orders after the affiliate was switched off.
// An existing customer of affiliate A who later taps affiliate B's link stays with A.
import { AppError, newId, type D1Database } from '../core/d1.ts';
import { orderLines } from './orders.ts';
import { TEST_GATEWAY } from './payments.ts';
import { NOT_TEST, PAID_AT, roundBoxes, sum, week, type CommissionSum, type CommissionWeek } from './collab-report.ts';
import { slugify } from './collabs.ts';
import { normalizeEmail, normalizePhone, randomCode, requireText } from './util.ts';

/** Same as SITE_URL in seo.ts (not imported: seo.ts is not loadable in the Node tests). Pages pass emailLinks().shopUrl. */
const SITE_URL = 'https://jentiskitchen.id';

import { AFFILIATE_CHANNELS, AFFILIATE_COMMISSION, CHANNEL_LABELS_EN, type AffiliateChannel } from './affiliate-text.ts';
export * from './affiliate-text.ts';

export interface Affiliate {
  id: string;
  slug: string;
  code: string;
  name: string;
  city: string;
  whatsapp: string;
  email: string;
  channels: AffiliateChannel[];
  bank: string;
  accountName: string;
  accountNumber: string;
  commissionPerBox: number;
  note: string;
  disabledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function parseChannels(v: unknown): AffiliateChannel[] {
  try {
    const list = JSON.parse(str(v));
    return Array.isArray(list) ? AFFILIATE_CHANNELS.filter((c) => list.includes(c)) : [];
  } catch {
    return [];
  }
}

function toAffiliate(r: Record<string, unknown>): Affiliate {
  return {
    id: str(r.id),
    slug: str(r.slug),
    code: str(r.code),
    name: str(r.name),
    city: str(r.city),
    whatsapp: str(r.whatsapp),
    email: str(r.email),
    channels: parseChannels(r.channels),
    bank: str(r.bank),
    accountName: str(r.accountName),
    accountNumber: str(r.accountNumber),
    commissionPerBox: Number(r.commissionPerBox),
    note: str(r.note),
    disabledAt: r.disabledAt === null || r.disabledAt === undefined ? null : Number(r.disabledAt),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

/** The short link they share: jentiskitchen.id/r/<code>. */
export function affiliateLink(a: Pick<Affiliate, 'code'>, siteUrl = SITE_URL): string {
  return `${siteUrl}/r/${a.code}`;
}

/** Where /r/<code> sends the visitor: the shop with the tags that credit the order (attribution.ts). */
export function affiliateLandingPath(code: string): string {
  return `/?utm_source=affiliate&utm_medium=affiliate&utm_campaign=${encodeURIComponent(code)}`;
}

export function affiliatePageLink(a: Pick<Affiliate, 'slug'>, siteUrl = SITE_URL): string {
  return `${siteUrl}/affiliate/${a.slug}`;
}

/** "1234567890" → "••••7890" for the affiliate's own page. */
export const maskAccount = (n: string) => (n.replace(/\D/g, '').length > 4 ? `••••${n.replace(/\D/g, '').slice(-4)}` : n);

// ---------------------------------------------------------------------------
// Public sign-up (messages in Indonesian)
// ---------------------------------------------------------------------------

const ALREADY = (what: string) =>
  `${what} ini sudah terdaftar sebagai affiliate. Lupa link kamu? Pakai "Lihat link & komisi saya" di halaman ini, kami kirim lewat email.`;

export async function createAffiliate(db: D1Database, body: Record<string, unknown>, now: number): Promise<Affiliate> {
  const name = requireText(body.name, 'Nama', 100);
  const city = requireText(body.city, 'Kota', 60);
  const whatsapp = normalizePhone(body.whatsapp);
  const email = normalizeEmail(body.email);
  const picked = Array.isArray(body.channels) ? body.channels : [];
  const channels = AFFILIATE_CHANNELS.filter((c) => picked.includes(c));
  if (!channels.length) throw new AppError(400, 'Pilih minimal satu cara promosi');
  const bank = requireText(body.bank, 'Nama bank / e-wallet', 60);
  const accountName = requireText(body.accountName, 'Nama pemilik rekening', 100);
  const accountNumber = requireText(body.accountNumber, 'Nomor rekening', 40);
  if (!/^[\d\s.-]{5,40}$/.test(accountNumber)) throw new AppError(400, 'Nomor rekening hanya boleh berisi angka');

  const taken = await db
    .prepare('SELECT whatsapp FROM shop_affiliates WHERE whatsapp = ? OR email = ? LIMIT 1')
    .bind(whatsapp, email)
    .first<{ whatsapp: string }>();
  if (taken) throw new AppError(409, ALREADY(taken.whatsapp === whatsapp ? 'Nomor WhatsApp' : 'Email'));

  const id = newId();
  const first = slugify(name.split(/\s+/)[0] ?? '', 10).replace(/-/g, '') || 'teman';
  for (let attempt = 0; ; attempt++) {
    const code = `${first}${randomCode(3).toLowerCase()}`;
    const slug = `${slugify(name, 20) || 'affiliate'}-${randomCode(8).toLowerCase()}`;
    try {
      await db
        .prepare(
          `INSERT INTO shop_affiliates (id, slug, code, name, city, whatsapp, email, channels, bank, accountName, accountNumber,
             commissionPerBox, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, slug, code, name, city, whatsapp, email, JSON.stringify(channels), bank, accountName, accountNumber.replace(/[\s.-]/g, ''), AFFILIATE_COMMISSION, now, now)
        .run();
      break;
    } catch (error) {
      if (/UNIQUE/i.test(String(error)) && /whatsapp|email/i.test(String(error))) throw new AppError(409, ALREADY('Nomor WhatsApp atau email'));
      if (attempt < 4 && /UNIQUE/i.test(String(error))) continue;
      throw error;
    }
  }
  return (await getAffiliate(db, id))!;
}

export async function getAffiliate(db: D1Database, id: string): Promise<Affiliate | null> {
  const r = await db.prepare('SELECT * FROM shop_affiliates WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return r ? toAffiliate(r) : null;
}

export async function getAffiliateBySlug(db: D1Database, slug: string): Promise<Affiliate | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const r = await db.prepare('SELECT * FROM shop_affiliates WHERE slug = ?').bind(slug).first<Record<string, unknown>>();
  return r ? toAffiliate(r) : null;
}

/** "Lupa link": the affiliate with this email (switched-off ones too: their page explains it), or null. */
export async function getAffiliateByEmail(db: D1Database, email: unknown): Promise<Affiliate | null> {
  const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!e) return null;
  const r = await db.prepare('SELECT * FROM shop_affiliates WHERE email = ?').bind(e).first<Record<string, unknown>>();
  return r ? toAffiliate(r) : null;
}

/** Active affiliate for a short link, or null (unknown or switched off: the visitor still lands on the shop). */
export async function activeAffiliateCode(db: D1Database, code: string): Promise<string | null> {
  const c = code.toLowerCase();
  if (!/^[a-z0-9]{2,20}$/.test(c)) return null;
  const r = await db.prepare('SELECT code FROM shop_affiliates WHERE code = ? AND disabledAt IS NULL').bind(c).first<{ code: string }>();
  return r?.code ?? null;
}

/** Newest first. */
export async function listAffiliates(db: D1Database): Promise<Affiliate[]> {
  const { results } = await db.prepare('SELECT * FROM shop_affiliates ORDER BY createdAt DESC LIMIT 1000').all<Record<string, unknown>>();
  return results.map(toAffiliate);
}

export async function setAffiliateDisabled(db: D1Database, id: string, disabled: boolean, now: number): Promise<void> {
  const res = await db.prepare('UPDATE shop_affiliates SET disabledAt = ?, updatedAt = ? WHERE id = ?').bind(disabled ? now : null, now, id).run();
  if (!res.meta.changes) throw new AppError(404, 'This affiliate no longer exists. Please reload the page.');
}

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------

export interface AffiliateOrder {
  orderRowId: string;
  orderId: string;
  recipientName: string;
  paidAt: number;
  /** FIRST = the customer's first order through the link; REPEAT = a later order of that customer. */
  kind: 'FIRST' | 'REPEAT';
  boxes: number;
  commission: number;
  total: number;
}

export interface AffiliateCommission {
  affiliateId: string;
  customers: number;
  thisWeek: CommissionSum;
  lastWeek: CommissionSum;
  total: CommissionSum;
  orders: AffiliateOrder[]; // newest first
}

export interface AffiliateReport {
  thisWeek: CommissionWeek;
  lastWeek: CommissionWeek;
  affiliates: AffiliateCommission[];
}

const keysOf = (r: Record<string, unknown>) =>
  [r.customerId ? `c:${r.customerId}` : '', r.recipientPhone ? `p:${r.recipientPhone}` : '', r.contactEmail ? `e:${String(r.contactEmail).toLowerCase()}` : ''].filter(Boolean);

/**
 * Commission for this week, last week and in total for the given affiliates. One query over the paid website orders
 * placed since the first affiliate signed up, walked oldest first: a first order through a link claims the customer
 * (account, phone and email), and every later order matching any of those claims more of them for the same affiliate.
 */
export async function affiliateCommissions(db: D1Database, affiliates: Affiliate[], now: number): Promise<AffiliateReport> {
  const thisWeek = week(new Date(now));
  const lastWeek = week(new Date(thisWeek.start - 1));
  if (!affiliates.length) return { thisWeek, lastWeek, affiliates: [] };

  const [orders, products] = await Promise.all([
    db
      .prepare(
        `SELECT s.orderRowId, o.orderId, s.recipientName, s.recipientPhone, s.contactEmail, s.customerId, s.total, s.createdAt,
                s.lineItems, s.unitPrices, s.itemNames, o.babiManis, o.babiAsin, o.sapiManis, o.sapiAsin, ${PAID_AT} AS paidAt,
                CASE WHEN lower(json_extract(s.attribution, '$.utm_medium')) = 'affiliate' THEN lower(json_extract(s.attribution, '$.utm_campaign')) END AS linkCode,
                CASE WHEN lower(json_extract(s.attribution, '$.utm_medium')) = 'affiliate' THEN NOT EXISTS (
                  SELECT 1 FROM shop_orders p JOIN orders po ON po.id = p.orderRowId
                  WHERE po.paymentStatus = 'PAID' AND po.orderStatus = 'ACTIVE' AND p.createdAt < s.createdAt
                    AND ((s.customerId != '' AND p.customerId = s.customerId) OR p.recipientPhone = s.recipientPhone
                         OR (s.contactEmail IS NOT NULL AND p.contactEmail = s.contactEmail))
                    AND NOT EXISTS (SELECT 1 FROM shop_payments tp WHERE tp.orderRowId = p.orderRowId AND tp.gateway = '${TEST_GATEWAY}')
                ) END AS firstOrder
         FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
         WHERE o.paymentStatus = 'PAID' AND o.orderStatus = 'ACTIVE'
           AND s.createdAt >= (SELECT MIN(createdAt) FROM shop_affiliates) AND ${NOT_TEST}
         ORDER BY s.createdAt`,
      )
      .all<Record<string, unknown>>(),
    db.prepare('SELECT product, boxValue FROM shop_products').all<{ product: string; boxValue: number | null }>(),
  ]);

  const boxValue = new Map(products.results.map((p) => [p.product, Number(p.boxValue ?? 1)]));
  const byCode = new Map(affiliates.map((a) => [a.code, a]));
  const owner = new Map<string, string>(); // customer key → affiliate id
  const lists = new Map(affiliates.map((a) => [a.id, [] as AffiliateOrder[]]));
  const customers = new Map(affiliates.map((a) => [a.id, 0]));
  const byId = new Map(affiliates.map((a) => [a.id, a]));

  for (const r of orders.results) {
    const keys = keysOf(r);
    let affiliateId = keys.map((k) => owner.get(k)).find(Boolean);
    let kind: AffiliateOrder['kind'] = 'REPEAT';
    if (!affiliateId && r.linkCode && Number(r.firstOrder) === 1) {
      const a = byCode.get(String(r.linkCode));
      if (a && Number(r.createdAt) >= a.createdAt && String(r.recipientPhone) !== a.whatsapp) {
        affiliateId = a.id;
        kind = 'FIRST';
        customers.set(a.id, customers.get(a.id)! + 1);
      }
    }
    if (!affiliateId) continue;
    for (const k of keys) if (!owner.has(k)) owner.set(k, affiliateId);
    const a = byId.get(affiliateId)!;
    const paidAt = Number(r.paidAt);
    if (a.disabledAt !== null && paidAt > a.disabledAt) continue; // switched off: no more commission
    const boxes = roundBoxes(orderLines(r).reduce((s, l) => s + l.qty * (boxValue.get(l.product) ?? 1), 0));
    lists.get(affiliateId)!.push({
      orderRowId: String(r.orderRowId),
      orderId: String(r.orderId),
      recipientName: String(r.recipientName),
      paidAt,
      kind,
      boxes,
      commission: Math.round(boxes * a.commissionPerBox),
      total: Number(r.total),
    });
  }

  return {
    thisWeek,
    lastWeek,
    affiliates: affiliates.map((a) => {
      const list = lists.get(a.id)!.sort((x, y) => y.paidAt - x.paidAt);
      return {
        affiliateId: a.id,
        customers: customers.get(a.id)!,
        thisWeek: sum(list, thisWeek.start, thisWeek.end),
        lastWeek: sum(list, lastWeek.start, lastWeek.end),
        total: sum(list),
        orders: list,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Telegram (CMO bot), in English for the owner
// ---------------------------------------------------------------------------

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (key: string) => {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
const boxText = (n: number) => `${n.toLocaleString('id-ID')} box${n === 1 ? '' : 'es'}`;

export function affiliateSignupMessage(a: Affiliate, adminUrl: string): string {
  return [
    `🔗 New affiliate: ${a.name} (${a.city})`,
    `WhatsApp: ${a.whatsapp.replace(/^62/, '0')} · ${a.email}`,
    `Promotes via: ${a.channels.map((c) => CHANNEL_LABELS_EN[c]).join(', ')}`,
    `Link: ${affiliateLink(a)}`,
    `${adminUrl}/website-affiliates`,
  ].join('\n');
}

/** Sunday 12:00 WIB: what to transfer to each affiliate. Null when no affiliate earned anything this week or last. */
export function affiliateCommissionMessage(report: AffiliateReport, affiliates: Affiliate[], adminUrl: string): string | null {
  const byId = new Map(affiliates.map((a) => [a.id, a]));
  const rows = report.affiliates.filter((r) => r.thisWeek.orders > 0 || r.lastWeek.orders > 0);
  if (!rows.length) return null;
  rows.sort((a, b) => b.thisWeek.commission - a.thisWeek.commission || b.lastWeek.commission - a.lastWeek.commission);
  const totalThis = rows.reduce((s, r) => s + r.thisWeek.commission, 0);
  return [
    '🔗 Affiliate commission',
    `This week ${day(report.thisWeek.startKey)} – ${day(report.thisWeek.endKey)} (so far, until 12:00 today)`,
    '(paid orders of the customers who first bought through their link)',
    '',
    ...rows.flatMap((r, i) => {
      const a = byId.get(r.affiliateId)!;
      return [
        `${i + 1}. ${a.name} (${a.city})`,
        `   This week: ${boxText(r.thisWeek.boxes)} x ${rupiah(a.commissionPerBox)} = ${rupiah(r.thisWeek.commission)}`,
        `   Last week: ${boxText(r.lastWeek.boxes)} = ${rupiah(r.lastWeek.commission)}`,
        `   Transfer to: ${a.bank} ${a.accountNumber} a/n ${a.accountName}`,
        '',
      ];
    }),
    `Total this week so far: ${rupiah(totalThis)}`,
    `Orders after 12:00 today: ${adminUrl}/website-affiliates`,
  ].join('\n');
}
