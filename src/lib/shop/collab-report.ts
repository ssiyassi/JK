// Weekly influencer commission (Website → Collabs, Sunday Telegram on the CMO bot). Commission is paid every Sunday:
// boxes their followers bought x the collab's commissionPerBox. Only PAID, not cancelled, non-test website orders count:
//   - LINK: the customer's first paid order, arriving through the influencer's link
//     (attribution utm_medium=influencer, utm_campaign = shop_collabs.campaign);
//   - CODE: any order holding the admin voucher whose code = shop_collabs.voucherCode (shop_orders.campaignId,
//     voucherActive = 1). The owner creates that voucher by hand in Website → Vouchers.
// An order matching both counts once, for the code (typed by the customer). Weeks are Monday–Sunday WIB, by paid time.
import type { D1Database } from '../core/d1.ts';
import { jakartaWeek } from '../core/time.ts';
import { orderLines } from './orders.ts';
import { TEST_GATEWAY } from './payments.ts';
import type { Collab } from './collabs.ts';

export interface CollabOrder {
  orderRowId: string;
  orderId: string;
  recipientName: string;
  paidAt: number;
  via: 'LINK' | 'CODE';
  boxes: number;
  commission: number;
  total: number;
}

export interface CommissionSum {
  orders: number;
  boxes: number;
  commission: number;
}

export interface CollabCommission {
  collabId: string;
  /** The voucher with the collab's code exists in Website → Vouchers (otherwise repeat orders cannot count yet). */
  voucherCreated: boolean;
  thisWeek: CommissionSum;
  lastWeek: CommissionSum;
  total: CommissionSum;
  orders: CollabOrder[]; // newest first
}

export interface CommissionWeek {
  start: number; // first millisecond of Monday (WIB)
  end: number; // last millisecond of Sunday (WIB)
  startKey: string;
  endKey: string;
}

export interface CommissionReport {
  thisWeek: CommissionWeek;
  lastWeek: CommissionWeek;
  collabs: CollabCommission[];
}

export const week = (base: Date): CommissionWeek => {
  const w = jakartaWeek(base);
  return { start: w.monday.getTime(), end: w.sunday.getTime(), startKey: w.startKey, endKey: w.endKey };
};

/** Boxes with at most 2 decimals (products may count as 0.5 box). */
export const roundBoxes = (n: number) => Math.round(n * 100) / 100;

export function sum(orders: Pick<CollabOrder, 'paidAt' | 'boxes' | 'commission'>[], from = -Infinity, to = Infinity): CommissionSum {
  const inside = orders.filter((o) => o.paidAt >= from && o.paidAt <= to);
  return {
    orders: inside.length,
    boxes: roundBoxes(inside.reduce((s, o) => s + o.boxes, 0)),
    commission: Math.round(inside.reduce((s, o) => s + o.commission, 0)),
  };
}

// Paid time as on the admin orders page: when the order took its stock (test orders, which take none, are left out).
export const PAID_AT = 'COALESCE(s.stockTakenAt, s.createdAt)';
export const NOT_TEST = `NOT EXISTS (SELECT 1 FROM shop_payments tp WHERE tp.orderRowId = s.orderRowId AND tp.gateway = '${TEST_GATEWAY}')`;

/**
 * Commission per collab for this week, last week and in total. `collabs` are the pages to report on (listCollabs).
 * One query over the paid orders placed since the first collab page was made.
 */
export async function collabCommissions(db: D1Database, collabs: Collab[], now: number): Promise<CommissionReport> {
  const thisWeek = week(new Date(now));
  const lastWeek = week(new Date(thisWeek.start - 1));
  if (!collabs.length) return { thisWeek, lastWeek, collabs: [] };

  const [orders, codes, products] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM (
           SELECT s.orderRowId, o.orderId, s.recipientName, s.total, s.lineItems, s.unitPrices, s.itemNames,
                  o.babiManis, o.babiAsin, o.sapiManis, o.sapiAsin, ${PAID_AT} AS paidAt,
                  CASE WHEN s.voucherActive = 1 AND s.campaignId IS NOT NULL THEN
                    (SELECT c.id FROM shop_collabs c JOIN shop_voucher_codes vc ON vc.code = c.voucherCode
                     WHERE vc.campaignId = s.campaignId AND s.createdAt >= c.createdAt LIMIT 1)
                  END AS codeCollabId,
                  CASE WHEN lower(json_extract(s.attribution, '$.utm_medium')) = 'influencer' THEN
                    (SELECT c.id FROM shop_collabs c
                     WHERE c.campaign = lower(json_extract(s.attribution, '$.utm_campaign')) AND s.createdAt >= c.createdAt)
                  END AS linkCollabId,
                  -- First order: no earlier paid, not cancelled order of the same account, phone or email.
                  NOT EXISTS (
                    SELECT 1 FROM shop_orders p JOIN orders po ON po.id = p.orderRowId
                    WHERE po.paymentStatus = 'PAID' AND po.orderStatus = 'ACTIVE' AND p.createdAt < s.createdAt
                      AND ((s.customerId != '' AND p.customerId = s.customerId) OR p.recipientPhone = s.recipientPhone
                           OR (s.contactEmail IS NOT NULL AND p.contactEmail = s.contactEmail))
                      AND NOT EXISTS (SELECT 1 FROM shop_payments tp WHERE tp.orderRowId = p.orderRowId AND tp.gateway = '${TEST_GATEWAY}')
                  ) AS firstOrder
           FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
           WHERE o.paymentStatus = 'PAID' AND o.orderStatus = 'ACTIVE'
             AND s.createdAt >= (SELECT MIN(createdAt) FROM shop_collabs) AND ${NOT_TEST}
         ) WHERE codeCollabId IS NOT NULL OR (linkCollabId IS NOT NULL AND firstOrder = 1)
         ORDER BY paidAt DESC`,
      )
      .all<Record<string, unknown>>(),
    db.prepare('SELECT DISTINCT code FROM shop_voucher_codes WHERE code IN (SELECT voucherCode FROM shop_collabs)').all<{ code: string }>(),
    db.prepare('SELECT product, boxValue FROM shop_products').all<{ product: string; boxValue: number | null }>(),
  ]);

  const boxValue = new Map(products.results.map((p) => [p.product, Number(p.boxValue ?? 1)]));
  const created = new Set(codes.results.map((c) => c.code));
  const byCollab = new Map(collabs.map((c) => [c.id, [] as CollabOrder[]]));
  const perBox = new Map(collabs.map((c) => [c.id, c.commissionPerBox]));

  for (const r of orders.results) {
    const collabId = (r.codeCollabId ?? r.linkCollabId) as string;
    const list = byCollab.get(collabId);
    if (!list) continue; // a page not in the list asked for
    const boxes = roundBoxes(orderLines(r).reduce((s, l) => s + l.qty * (boxValue.get(l.product) ?? 1), 0));
    list.push({
      orderRowId: String(r.orderRowId),
      orderId: String(r.orderId),
      recipientName: String(r.recipientName),
      paidAt: Number(r.paidAt),
      via: r.codeCollabId ? 'CODE' : 'LINK',
      boxes,
      commission: Math.round(boxes * perBox.get(collabId)!),
      total: Number(r.total),
    });
  }

  return {
    thisWeek,
    lastWeek,
    collabs: collabs.map((c) => {
      const list = byCollab.get(c.id)!;
      return {
        collabId: c.id,
        voucherCreated: created.has(c.voucherCode),
        thisWeek: sum(list, thisWeek.start, thisWeek.end),
        lastWeek: sum(list, lastWeek.start, lastWeek.end),
        total: sum(list),
        orders: list,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Sunday Telegram (CMO bot)
// ---------------------------------------------------------------------------

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (key: string) => {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
const boxText = (n: number) => `${n.toLocaleString('id-ID')} box${n === 1 ? '' : 'es'}`;

/**
 * Sunday 12:00 WIB: what to transfer to each influencer. Sent at noon, so this week's numbers are "so far";
 * last week's are final. Null when no influencer has any order this week or last week.
 */
export function collabCommissionMessage(report: CommissionReport, collabs: Collab[], adminUrl: string): string | null {
  const names = new Map(collabs.map((c) => [c.id, c]));
  const rows = report.collabs.filter((r) => r.thisWeek.orders > 0 || r.lastWeek.orders > 0);
  if (!rows.length) return null;
  rows.sort((a, b) => b.thisWeek.commission - a.thisWeek.commission || b.lastWeek.commission - a.lastWeek.commission);
  const totalThis = rows.reduce((s, r) => s + r.thisWeek.commission, 0);
  return [
    '🤝 Influencer commission',
    `This week ${day(report.thisWeek.startKey)} – ${day(report.thisWeek.endKey)} (so far, until 12:00 today)`,
    '(paid orders: first orders via their link + orders with their code)',
    '',
    ...rows.flatMap((r, i) => {
      const c = names.get(r.collabId)!;
      return [
        `${i + 1}. ${c.name}${c.handle ? ` (@${c.handle})` : ''}`,
        `   This week: ${boxText(r.thisWeek.boxes)} x ${rupiah(c.commissionPerBox)} = ${rupiah(r.thisWeek.commission)}`,
        `   Last week: ${boxText(r.lastWeek.boxes)} = ${rupiah(r.lastWeek.commission)}`,
        ...(c.accepted ? [`   Transfer to: ${c.accepted.bank} ${c.accepted.accountNumber} a/n ${c.accepted.accountName}`] : []),
        '',
      ];
    }),
    `Total this week so far: ${rupiah(totalThis)}`,
    `Orders after 12:00 today: ${adminUrl}/website-collabs`,
  ].join('\n');
}
