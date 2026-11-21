// Past-customers retargeting project (owner asked 2026-10-31): the owner's list of 1.582 old customers sees a
// "Diskon 35% pembelian pertama" ad in its own Meta campaign. A customer is "completed" with their first paid order
// after the project started, on any channel: the website (from the ad, from the owner's WhatsApp link, or otherwise)
// or the reseller order book. Success = 20% (30% excellent) of the customers in the delivery area by week 8.
// The list lives in past_customers (migration 0038) as hashes of the phone number only; orders are matched by
// hashing their phone the same way.
import { AppError, type D1Database } from '../core/d1.ts';
import { COUNTED_ORDER } from '../core/orders.ts';
import { col, loadStockProducts } from '../core/products.ts';
import { fromMetaAd, parseStoredAttribution } from '../shop/attribution.ts';
import { getShopOrder } from '../shop/orders.ts';
import { isTestOrder } from '../shop/payments.ts';
import { addDaysToKey } from '../core/time.ts';
import { dayStart, orderProfit } from './adsReport.ts';

export const PAST_CUSTOMERS = {
  key: 'past-customers-oct26',
  start: '2026-10-31', // first day of the campaign (WIB)
  campaignId: '120250210888910619', // Meta campaign "Jentis · Retarget · Past customers · Okt 2026"
  goalPct: 20,
  excellentPct: 30,
  checkpoints: [
    { day: '2026-11-28', label: 'Week 4', pct: 5 },
    { day: '2026-12-26', label: 'Week 8', pct: 20 },
  ],
};
/** Reseller orders in this many days before the start mean the customer was still buying (not a win-back). */
const ACTIVE_BEFORE_DAYS = 60;

/** Indonesian mobile number → 628…, or null when it isn't one. */
export function phone628(value: string | null | undefined): string | null {
  let d = (value ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  return /^628\d{7,12}$/.test(d) ? d : null;
}

export async function hashPhone(phone: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`jentis-past-customers:${phone}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type Channel = 'ad' | 'wa-link' | 'main-ads' | 'website' | 'reseller' | 'manual';
export const CHANNEL_LABEL: Record<Channel, string> = {
  ad: 'Website · from the past-customer ad',
  'wa-link': 'Website · your WhatsApp link',
  'main-ads': 'Website · from the main ads',
  website: 'Website · other',
  reseller: 'Reseller order book',
  manual: 'Ticked by you',
};

export interface Comeback {
  orderId: string;
  name: string; // first name only
  day: string; // YYYY-MM-DD (WIB) of the order
  channel: Channel;
  reseller: string | null;
  packs: number;
  paid: number | null; // website orders only (the order book has no customer price)
  profit: number | null; // profit before ads, website orders only
  activeBefore: boolean; // ordered through a reseller in the 60 days before the project
  extra?: 'not-on-list' | 'repeat'; // came through the ad, but isn't a customer's first order on the list
}

export interface PastCustomersReport {
  listed: number;
  inArea: number;
  completed: number; // customers in the area with a paid order since the start, up to `to`
  completedOutside: number;
  winBacks: number; // completed and NOT already buying through resellers just before the start
  byChannel: Record<Channel, number>;
  period: Comeback[]; // first orders that fall in the chosen dates
  spend: number; // campaign spend since the start, up to `to`
  periodSpend: number;
  profit: number | null; // profit before ads since the start: completing website orders + other orders through the ad
  adExtras: number; // orders through the ad that don't complete anyone (number not on the list, or a repeat order)
  started: boolean;
}

const firstName = (name: string | null) => (name ?? '').trim().split(/\s+/)[0]?.slice(0, 20) || '?';
const wib = (ms: number) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);

interface Found extends Comeback {
  at: number;
  shopRowId: string | null;
}

/**
 * Each listed customer's first paid order since the start and before `end` (ms), plus the customers who were still
 * buying through resellers in the 60 days before the start. A customer the owner ticked by hand counts from that
 * moment when no order is found.
 */
async function findComebacks(db: D1Database, end: number, area: Map<string, boolean>, manual: Map<string, number>) {
  const p = PAST_CUSTOMERS;
  const start = dayStart(p.start);
  const products = await loadStockProducts(db);
  const { results: orders } = await db
    .prepare(
      `SELECT o.id, o.orderId, o.customerName, o.phoneNumber, o.reseller, o.createdAt, o.orderStatus, o.paymentStatus,
              ${products.map((x) => `o.${col(x.key)}`).join(', ')}, s.orderRowId AS shopRowId, s.recipientPhone, s.attribution
       FROM orders o LEFT JOIN shop_orders s ON s.orderRowId = o.id
       WHERE o.orderStatus = 'ACTIVE' AND o.createdAt >= ? AND o.createdAt < ? AND ${COUNTED_ORDER}
       ORDER BY o.createdAt`,
    )
    .bind(start - ACTIVE_BEFORE_DAYS * 86400 * 1000, end)
    .all<Record<string, unknown>>();

  const activeBefore = new Set<string>();
  const firsts = new Map<string, Found>();
  const extras: Found[] = [];
  for (const o of orders) {
    const phones = [phone628(String(o.recipientPhone ?? '')), phone628(String(o.phoneNumber ?? ''))].filter((x): x is string => Boolean(x));
    let hash: string | null = null;
    for (const ph of new Set(phones)) {
      const h = await hashPhone(ph);
      if (area.has(h)) hash = h;
    }
    const at = Number(o.createdAt);
    const shopRowId = (o.shopRowId as string | null) ?? null;
    if (at < start) {
      if (hash && !shopRowId) activeBefore.add(hash);
      continue;
    }
    if (o.paymentStatus !== 'PAID') continue;
    const a = shopRowId ? parseStoredAttribution((o.attribution as string | null) ?? null) : null;
    const first = Boolean(hash && !firsts.has(hash));
    // Besides each customer's first order, every order tagged with this campaign counts for the ad's profit.
    if (!first && a?.utm_campaign !== p.key && a?.ad_campaign !== p.key) continue;
    if (shopRowId && (await isTestOrder(db, shopRowId))) continue;
    let channel: Channel = 'reseller';
    if (shopRowId) {
      if (a?.utm_campaign === p.key) channel = a.utm_source === 'whatsapp' ? 'wa-link' : 'ad';
      else if (a?.ad_campaign === p.key) channel = 'ad';
      else if (fromMetaAd(a)) channel = 'main-ads';
      else channel = 'website';
    }
    const row: Found = {
      orderId: String(o.orderId),
      name: firstName(o.customerName as string | null),
      day: wib(at),
      channel,
      reseller: shopRowId ? null : String(o.reseller ?? ''),
      packs: products.reduce((s, x) => s + Number(o[x.key] ?? 0), 0),
      paid: null,
      profit: null,
      activeBefore: false,
      at,
      shopRowId,
    };
    if (first) firsts.set(hash as string, row);
    else extras.push({ ...row, extra: hash ? 'repeat' : 'not-on-list' });
  }
  for (const [hash, at] of manual) {
    if (firsts.has(hash) || at < start || at >= end) continue;
    firsts.set(hash, { orderId: '', name: '', day: wib(at), channel: 'manual', reseller: null, packs: 0, paid: null, profit: null, activeBefore: false, at, shopRowId: null });
  }
  for (const [hash, c] of firsts) c.activeBefore = activeBefore.has(hash);
  return { firsts, extras };
}

interface ListRow {
  phoneHash: string;
  inArea: number;
  name: string | null;
  manualAt: number | null;
}
const loadList = async (db: D1Database) =>
  (await db.prepare('SELECT phoneHash, inArea, name, manualAt FROM past_customers WHERE project = ?').bind(PAST_CUSTOMERS.key).all<ListRow>()).results;
const manualOf = (list: ListRow[]) => new Map(list.filter((r) => r.manualAt).map((r) => [r.phoneHash, Number(r.manualAt)]));

/** Progress of the project up to `to`, with the comebacks in [from, to]. null when the list isn't loaded. */
export async function pastCustomersReport(
  db: D1Database,
  from: string,
  to: string,
  hpp: (key: string) => number | null,
  feePercent: number,
): Promise<PastCustomersReport | null> {
  const p = PAST_CUSTOMERS;
  const list = await loadList(db);
  if (!list.length) return null;
  const area = new Map(list.map((r) => [r.phoneHash, Boolean(r.inArea)]));
  const names = new Map(list.map((r) => [r.phoneHash, r.name]));
  const { firsts, extras } = await findComebacks(db, dayStart(addDaysToKey(to, 1)), area, manualOf(list));

  const byChannel = { ad: 0, 'wa-link': 0, 'main-ads': 0, website: 0, reseller: 0, manual: 0 } as Record<Channel, number>;
  let completed = 0;
  let completedOutside = 0;
  let winBacks = 0;
  let profit: number | null = 0;
  const period: Comeback[] = [];
  for (const [hash, c] of firsts) {
    if (c.channel === 'manual') c.name = firstName(names.get(hash) ?? null);
    if (c.shopRowId) {
      const order = await getShopOrder(db, c.shopRowId);
      c.paid = order?.total ?? null;
      c.profit = order ? orderProfit(order, hpp, feePercent, order.courierFee) : null;
      profit = profit === null || c.profit === null ? null : profit + c.profit;
    }
    if (!area.get(hash)) completedOutside++;
    else {
      completed++;
      byChannel[c.channel]++;
      if (!c.activeBefore) winBacks++;
    }
    if (c.day >= from && c.day <= to) {
      const { at: _at, shopRowId: _s, ...row } = c;
      period.push(row);
    }
  }
  for (const c of extras) {
    const order = c.shopRowId ? await getShopOrder(db, c.shopRowId) : null;
    c.paid = order?.total ?? null;
    c.profit = order ? orderProfit(order, hpp, feePercent, order.courierFee) : null;
    profit = profit === null || c.profit === null ? null : profit + c.profit;
    if (c.day >= from && c.day <= to) {
      const { at: _at, shopRowId: _s, ...row } = c;
      period.push(row);
    }
  }

  const spendOf = async (a: string, b: string) =>
    Number((await db.prepare('SELECT SUM(spend) AS s FROM meta_ad_insights WHERE campaignId = ? AND date >= ? AND date <= ?').bind(p.campaignId, a, b).first<{ s: number | null }>())?.s ?? 0);
  return {
    listed: list.length,
    inArea: list.filter((r) => r.inArea).length,
    completed,
    completedOutside,
    winBacks,
    byChannel,
    period,
    spend: await spendOf(p.start, to),
    periodSpend: await spendOf(from < p.start ? p.start : from, to),
    profit,
    adExtras: extras.length,
    started: to >= p.start,
  };
}

export interface PastCustomerEntry {
  id: string; // phone hash
  name: string;
  phone: string | null; // 628…
  city: string | null;
  done: { day: string; orderId: string; channel: Channel; label: string } | null;
  manual: boolean; // ticked by the owner (and no matching order)
  activeBefore: boolean;
}

/** Ads Report → customer list: everyone in the delivery area, with who came back so far (admin only). */
export async function pastCustomersList(db: D1Database, now: number): Promise<PastCustomerEntry[]> {
  const { results } = await db
    .prepare('SELECT phoneHash, inArea, name, phone, city, manualAt FROM past_customers WHERE project = ? AND inArea = 1')
    .bind(PAST_CUSTOMERS.key)
    .all<ListRow & { phone: string | null; city: string | null }>();
  const { firsts } = await findComebacks(db, now + 1, new Map(results.map((r) => [r.phoneHash, true])), manualOf(results));
  return results
    .map((r) => {
      const c = firsts.get(r.phoneHash);
      return {
        id: r.phoneHash,
        name: (r.name ?? '').trim() || '?',
        phone: r.phone,
        city: r.city,
        done: c ? { day: c.day, orderId: c.orderId, channel: c.channel, label: CHANNEL_LABEL[c.channel] } : null,
        manual: c?.channel === 'manual',
        activeBefore: c?.activeBefore ?? false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
}

/** The owner ticks (or unticks) a customer as won back by hand. */
export async function setPastCustomerManual(db: D1Database, id: unknown, done: unknown, now: number): Promise<void> {
  if (typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id)) throw new AppError(404, 'Unknown customer');
  const r = await db.prepare('UPDATE past_customers SET manualAt = ? WHERE phoneHash = ? AND project = ?').bind(done ? now : null, id, PAST_CUSTOMERS.key).run();
  if (!r.meta.changes) throw new AppError(404, 'Unknown customer');
}
