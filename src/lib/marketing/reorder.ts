// Experiment 2 (owner approved 2026-10-27): WhatsApp re-order reminder. Each Monday the owner gets the customers whose
// website order was delivered 10–16 days earlier and who have not ordered again, with a ready WhatsApp link + message.
// No new promotion: it only mentions the customer's existing monthly voucher when they have an unused one.
import type { D1Database } from '../core/d1.ts';
import { jakartaDateKey } from '../core/time.ts';
import { isTestOrder } from '../shop/payments.ts';
import { normalizePhone } from '../shop/util.ts';

export interface ReorderContact {
  orderId: string;
  name: string;
  phone: string; // 628…
  deliveredDay: string;
  voucherCode: string | null;
  waLink: string;
}

export function reorderMessage(firstName: string, voucherCode: string | null, stage: 1 | 2 = 1): string {
  const voucher = voucherCode ? ` Kakak juga punya voucher 20% bulan ini (kode ${voucherCode}, maks. Rp100.000, khusus produk).` : '';
  if (stage === 2)
    return `Halo Kak ${firstName} 👋 Ini Jentis Kitchen lagi. Semoga sekeluarga sehat ya. Kalau mau stok lauk praktis buat minggu ini, tinggal pesan di jentiskitchen.id, nanti kami antar 🙏${voucher}`;
  return `Halo Kak ${firstName} 👋 Ini Jentis Kitchen. Gimana daging marinasinya kemarin, cocok? Kalau stok di freezer mulai habis, bisa pesan lagi di jentiskitchen.id ya 🙏${voucher}`;
}

/**
 * Website customers whose order was delivered between `fromDaysAgo` and `toDaysAgo` days before `now` and who have
 * not ordered again. Default 9–16 days (the old Monday list); the daily reminder uses one calendar day (14 or 30).
 */
export async function reorderContacts(db: D1Database, now: number, window: { start: number; end: number } | null = null, stage: 1 | 2 = 1): Promise<ReorderContact[]> {
  const day = 86400 * 1000;
  const start = window?.start ?? now - 16 * day;
  const end = window?.end ?? now - 9 * day;
  const { results } = await db
    .prepare(
      `SELECT s.orderRowId, o.orderId, s.recipientName, s.recipientPhone, s.customerId, s.deliveredAt
       FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
       WHERE o.orderStatus = 'ACTIVE' AND o.deliveryStatus = 'DELIVERED' AND s.deliveredAt >= ? AND s.deliveredAt < ?
         AND NOT EXISTS (
           SELECT 1 FROM shop_orders s2 JOIN orders o2 ON o2.id = s2.orderRowId
           WHERE o2.orderStatus = 'ACTIVE' AND s2.createdAt > s.deliveredAt
             AND (s2.recipientPhone = s.recipientPhone OR (s.customerId IS NOT NULL AND s2.customerId = s.customerId)))
       ORDER BY s.deliveredAt`,
    )
    .bind(start, end)
    .all<{ orderRowId: string; orderId: string; recipientName: string; recipientPhone: string; customerId: string | null; deliveredAt: number }>();
  const period = jakartaDateKey(now).slice(0, 7);
  const out: ReorderContact[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (await isTestOrder(db, r.orderRowId)) continue;
    let phone: string;
    try {
      phone = normalizePhone(r.recipientPhone);
    } catch {
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    const voucher = r.customerId
      ? await db
          .prepare(
            `SELECT v.code FROM shop_vouchers v WHERE v.customerId = ? AND v.kind = 'MONTHLY' AND v.period = ? AND (v.expiresAt IS NULL OR v.expiresAt > ?)
               AND NOT EXISTS (SELECT 1 FROM shop_orders x WHERE x.voucherId = v.id AND x.voucherActive = 1)`,
          )
          .bind(r.customerId, period, now)
          .first<{ code: string }>()
      : null;
    const firstName = r.recipientName.trim().split(/\s+/)[0] || 'Kak';
    const text = reorderMessage(firstName, voucher?.code ?? null, stage);
    out.push({
      orderId: r.orderId,
      name: r.recipientName,
      phone,
      deliveredDay: jakartaDateKey(r.deliveredAt),
      voucherCode: voucher?.code ?? null,
      waLink: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
    });
  }
  return out;
}

/** Days after delivery for the two WhatsApp reminders (owner approved 2026-11-11, research: most second orders come early). */
export const REORDER_DAYS = { first: 14, second: 30 } as const;

/** Jakarta midnight of the day `n` days before the Jakarta day of `now`. */
function jakartaDayStart(now: number, n: number): number {
  const key = jakartaDateKey(now - n * 86400 * 1000);
  return Date.parse(`${key}T00:00:00+07:00`);
}

/** Today's reminders: delivered exactly 14 days ago (first) and 30 days ago (second), not reordered since. */
export async function dailyReorderContacts(db: D1Database, now: number): Promise<{ first: ReorderContact[]; second: ReorderContact[] }> {
  const day = 86400 * 1000;
  const win = (n: number) => ({ start: jakartaDayStart(now, n), end: jakartaDayStart(now, n) + day });
  return {
    first: await reorderContacts(db, now, win(REORDER_DAYS.first), 1),
    second: await reorderContacts(db, now, win(REORDER_DAYS.second), 2),
  };
}

/** The CMO bot message: one tap per customer opens WhatsApp with the text ready. Null when nobody is due. */
export function dailyReorderText(r: { first: ReorderContact[]; second: ReorderContact[] }): string | null {
  if (!r.first.length && !r.second.length) return null;
  const rows = (list: ReorderContact[], start: number) =>
    list.map((c, i) => `${start + i}. ${c.name} (#${c.orderId}, delivered ${c.deliveredDay}${c.voucherCode ? `, voucher ${c.voucherCode}` : ''})\n${c.waLink}`);
  return [
    `📲 WhatsApp reorder reminders today (${r.first.length + r.second.length})`,
    'Tap a link → WhatsApp opens with the message ready → Send.',
    ...(r.first.length ? ['', `Delivered ${REORDER_DAYS.first} days ago, not ordered again:`, ...rows(r.first, 1)] : []),
    ...(r.second.length ? ['', `Delivered ${REORDER_DAYS.second} days ago, still not ordered again (2nd reminder):`, ...rows(r.second, r.first.length + 1)] : []),
  ].join('\n');
}
