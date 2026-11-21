// Real recent orders for the shop's "Ja*** di Jakarta Barat membeli 4 box Babi Marinade Manis" snack bar and the "box terjual" line
// (owner, 2026-11-06). Every line is a real order (admin/reseller orders that are not cancelled or free, website orders
// only once paid, never Duitku sandbox tests). No full names, phones or addresses leave the server: only the first two
// letters of the first name ("Ri***", owner 2026-11-06), the city picked from a fixed list, the number of boxes, the
// product when there is one, and the order time.
import type { D1Database } from '../core/d1.ts';
import { jakartaDateKey } from '../core/time.ts';
import { DEFAULT_PRODUCT_NAMES } from './catalog.ts';
import { deliverySchedule } from './days-off.ts';
import { TEST_GATEWAY } from './payments.ts';
import type { RecentOrder, SocialProof } from './social-proof-text.ts';

export type { RecentOrder, SocialProof };

export const RECENT_DAYS = 14;
export const SOLD_DAYS = 30;
const MAX_RECENT = 40;
const DAY_MS = 86_400_000;

// Most specific first: "Tangerang Selatan" before "Tangerang", "Jakarta Barat" before plain "Jakarta".
const AREAS: [RegExp, string][] = [
  [/jakarta\s*barat|\bjakbar\b/, 'Jakarta Barat'],
  [/jakarta\s*timur|\bjaktim\b/, 'Jakarta Timur'],
  [/jakarta\s*utara|\bjakut\b/, 'Jakarta Utara'],
  [/jakarta\s*selatan|\bjaksel\b/, 'Jakarta Selatan'],
  [/jakarta\s*pusat|\bjakpus\b/, 'Jakarta Pusat'],
  [/tangerang\s*selatan|\btangsel\b/, 'Tangerang Selatan'],
  [/tangerang/, 'Tangerang'],
  [/bekasi/, 'Bekasi'],
  [/depok/, 'Depok'],
  [/bogor/, 'Bogor'],
  [/surabaya/, 'Surabaya'],
  [/jakarta/, 'Jakarta'],
];

/** The city of an address, only from the list above (never any other part of the address); null when unknown. */
export function areaOf(text: string): string | null {
  const s = text.toLowerCase();
  return AREAS.find(([re]) => re.test(s))?.[1] ?? null;
}

// Titles skipped so "Ibu Sari" shows as "Sa***", not "Ib***".
const TITLES = new Set(['ibu', 'bu', 'bapak', 'pak', 'bpk', 'kak', 'ka', 'mbak', 'mba', 'mas', 'ci', 'cici', 'ko', 'koko', 'koh', 'cik', 'tante', 'om', 'sis', 'bro', 'mr', 'mrs', 'ms', 'mr.', 'mrs.', 'ms.', 'dr', 'dr.', 'hj', 'hj.', 'h.']);

/** First name cut to its first two letters + "***" ("Rini Wijaya" -> "Ri***"); null when there is no usable name. */
export function maskedName(name: string | null | undefined): string | null {
  const words = (name ?? '').split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
  const first = words.find((w) => !TITLES.has(w.toLowerCase())) ?? null;
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1, 2).toLowerCase() + '***';
}

const PRODUCTS = ['babiManis', 'babiAsin', 'sapiManis', 'sapiAsin'] as const;

type Row = { customerName: string | null; address: string; city: string | null; kecamatan: string | null; createdAt: number } & Record<(typeof PRODUCTS)[number], number>;

const REAL_ORDER = `o.orderStatus != 'CANCELLED' AND o.paymentStatus != 'FREE'
  AND (s.orderRowId IS NULL OR o.paymentStatus = 'PAID')
  AND NOT EXISTS (SELECT 1 FROM shop_payments p WHERE p.orderRowId = o.id AND p.gateway = ?)`;

export async function loadSocialProof(db: D1Database, now: number): Promise<SocialProof> {
  const [recentRows, sold, schedule] = await Promise.all([
    db
      .prepare(
        `SELECT o.customerName, o.address, s.city, s.kecamatan, o.createdAt, o.babiManis, o.babiAsin, o.sapiManis, o.sapiAsin
         FROM orders o LEFT JOIN shop_orders s ON s.orderRowId = o.id
         WHERE o.createdAt >= ? AND o.createdAt <= ? AND ${REAL_ORDER}
         ORDER BY o.createdAt DESC LIMIT ?`,
      )
      .bind(now - RECENT_DAYS * DAY_MS, now, TEST_GATEWAY, MAX_RECENT)
      .all<Row>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(o.babiManis), 0) AS babiManis, COALESCE(SUM(o.babiAsin), 0) AS babiAsin,
                COALESCE(SUM(o.sapiManis), 0) AS sapiManis, COALESCE(SUM(o.sapiAsin), 0) AS sapiAsin
         FROM orders o LEFT JOIN shop_orders s ON s.orderRowId = o.id
         WHERE o.createdAt >= ? AND o.createdAt <= ? AND ${REAL_ORDER}`,
      )
      .bind(now - SOLD_DAYS * DAY_MS, now, TEST_GATEWAY)
      .first<Record<(typeof PRODUCTS)[number], number>>(),
    deliverySchedule(db, now),
  ]);
  // One line per product of an order ("Ja*** memesan 4 box Babi Manis", later "Ja*** memesan 2 box Sapi Manis").
  const realOrders = recentRows.results.filter((r) => PRODUCTS.some((p) => Number(r[p]) > 0));
  const recent = realOrders.flatMap((r, order): RecentOrder[] =>
    PRODUCTS.filter((p) => Number(r[p]) > 0).map((p) => ({
      name: maskedName(r.customerName),
      area: areaOf(`${r.city ?? ''} ${r.kecamatan ?? ''} ${r.address ?? ''}`),
      qty: Number(r[p]),
      product: DEFAULT_PRODUCT_NAMES[p],
      order,
      at: Number(r.createdAt),
    })),
  );
  const soldByProduct = PRODUCTS.map((p) => ({ key: p, name: DEFAULT_PRODUCT_NAMES[p], boxes: Number(sold?.[p]) || 0 }))
    .filter((p) => p.boxes > 0)
    .sort((a, b) => b.boxes - a.boxes);
  const today = jakartaDateKey(now);
  return {
    recent,
    soldBoxes: soldByProduct.reduce((sum, p) => sum + p.boxes, 0),
    soldByProduct,
    todayOrders: realOrders.filter((r) => jakartaDateKey(Number(r.createdAt)) === today).length,
    closedDays: schedule.closedDays,
    full: schedule.full,
  };
}
