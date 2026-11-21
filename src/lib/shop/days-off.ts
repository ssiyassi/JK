// The owner's days off (Schedule → Store Days Off): no website delivery on these days. The shop stays open for orders.
// Owner 15 Nov 2026: customers see a day off from 2 days before it starts (H-2): from then until it ends, ONLY the days
// off themselves show "Penuh" in the calendar and cannot be picked; the days before it stay normal delivery days. When
// the soonest delivery day falls on a day off, checkout shows the blue "full" notice and the soonest day is the first
// open day after it (see websiteDeliveryOptions). Before H-2 the days off are still normal days. The note is admin only.
import { AppError, newId, type D1Database } from '../core/d1.ts';
import { addDaysToKey, deliveryDateFromKey, jakartaDateKey, websiteDeliveryDateKey } from '../core/time.ts';

export type DayOff = { id: string; startDate: string; endDate: string; note: string; updatedAt: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Longest day off in one entry. */
export const MAX_DAYS_OFF = 62;

const toDayOff = (r: Record<string, unknown>): DayOff => ({
  id: String(r.id),
  startDate: String(r.startDate),
  endDate: String(r.endDate),
  note: r.note ? String(r.note) : '',
  updatedAt: Number(r.updatedAt),
});

/** Days off that are not over yet (still running or coming), soonest first. */
export async function listDaysOff(db: D1Database, now: number): Promise<DayOff[]> {
  const { results } = await db
    .prepare('SELECT * FROM shop_days_off WHERE endDate >= ? ORDER BY startDate, endDate')
    .bind(jakartaDateKey(now))
    .all<Record<string, unknown>>();
  return results.map(toDayOff);
}

/** Every day (YYYY-MM-DD) from start to end, both included. */
export function daysBetween(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  for (let key = startDate; key <= endDate && days.length <= MAX_DAYS_OFF * 4; key = addDaysToKey(key, 1)) days.push(key);
  return days;
}

/** Every day off, newest first (history on the admin page). */
export async function listDayOffHistory(db: D1Database, limit = 100): Promise<DayOff[]> {
  const { results } = await db
    .prepare('SELECT * FROM shop_days_off ORDER BY startDate DESC, endDate DESC LIMIT ?')
    .bind(limit)
    .all<Record<string, unknown>>();
  return results.map(toDayOff);
}

/** Days with no website delivery for an order placed now, and whether checkout shows the "full" notice. */
export type DeliverySchedule = { closedDays: string[]; full: boolean };

/** Customers see a day off this many days before it starts (H-2); earlier, its days can still be booked. */
export const DAYS_OFF_NOTICE_DAYS = 2;

/** First day customers see the day off ("Penuh" on its days): H-2. */
export function dayOffNoticeFrom(startDate: string): string {
  return addDaysToKey(startDate, -DAYS_OFF_NOTICE_DAYS);
}

/**
 * Closed days for an order placed now, for the checkout calendar and the order check: the days of every day off that
 * customers already see (from H-2 until its last day), and only those days. `full` = the soonest delivery day (same
 * day before 14:00, else the next day) is one of them, so checkout shows the "full" notice.
 */
export function deliveryScheduleFrom(daysOff: Pick<DayOff, 'startDate' | 'endDate'>[], now: number): DeliverySchedule {
  const today = jakartaDateKey(now);
  const shown = daysOff.filter((d) => dayOffNoticeFrom(d.startDate) <= today && d.endDate >= today);
  const days = [...new Set(shown.flatMap((d) => daysBetween(d.startDate > today ? d.startDate : today, d.endDate)))].sort();
  return { closedDays: days, full: days.includes(websiteDeliveryDateKey(now)) };
}

export async function deliverySchedule(db: D1Database, now: number): Promise<DeliverySchedule> {
  return deliveryScheduleFrom(await listDaysOff(db, now), now);
}

export async function closedDeliveryDays(db: D1Database, now: number): Promise<string[]> {
  return (await deliverySchedule(db, now)).closedDays;
}

function validDate(v: unknown, label: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!DATE.test(s) || Number.isNaN(Date.parse(s))) throw new AppError(400, `Please choose the ${label}`);
  return s;
}

/** Adds a day off, or changes one (body.id). A single day: end date = start date. */
export async function saveDayOff(db: D1Database, body: Record<string, unknown>, now: number): Promise<DayOff> {
  const startDate = validDate(body.startDate, 'first day off');
  const endDate = body.endDate ? validDate(body.endDate, 'last day off') : startDate;
  if (endDate < startDate) throw new AppError(400, 'The last day off must be on or after the first day off');
  if (endDate < jakartaDateKey(now)) throw new AppError(400, 'These days are already over');
  if (daysBetween(startDate, endDate).length > MAX_DAYS_OFF) throw new AppError(400, `A day off can be at most ${MAX_DAYS_OFF} days long`);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 100) : '';

  const id = typeof body.id === 'string' && body.id ? body.id : null;
  if (id) {
    const res = await db
      .prepare('UPDATE shop_days_off SET startDate = ?, endDate = ?, note = ?, updatedAt = ? WHERE id = ?')
      .bind(startDate, endDate, note || null, now, id)
      .run();
    if (!res.meta.changes) throw new AppError(404, 'This day off no longer exists. Please reload the page.');
    return { id, startDate, endDate, note, updatedAt: now };
  }
  const newDayOffId = newId();
  await db
    .prepare('INSERT INTO shop_days_off (id, startDate, endDate, note, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newDayOffId, startDate, endDate, note || null, now, now)
    .run();
  return { id: newDayOffId, startDate, endDate, note, updatedAt: now };
}

export async function removeDayOff(db: D1Database, id: string): Promise<void> {
  const res = await db.prepare('DELETE FROM shop_days_off WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new AppError(404, 'This day off no longer exists. Please reload the page.');
}

/**
 * Paid, not cancelled, not yet delivered website orders with a delivery day from start to end. Shown as a warning
 * when the owner saves a day off; these orders are not moved.
 */
export async function bookedWebsiteOrders(db: D1Database, startDate: string, endDate: string): Promise<{ orderId: string; deliveryDay: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT o.orderId, o.deliveryDate FROM orders o JOIN shop_orders s ON s.orderRowId = o.id
       WHERE o.orderStatus = 'ACTIVE' AND o.paymentStatus = 'PAID' AND o.deliveryStatus != 'DELIVERED'
         AND typeof(o.deliveryDate) IN ('integer', 'real') AND o.deliveryDate BETWEEN ? AND ?
       ORDER BY o.deliveryDate, o.orderId`,
    )
    .bind(deliveryDateFromKey(startDate), deliveryDateFromKey(endDate))
    .all<{ orderId: string; deliveryDate: number }>();
  return results.map((r) => ({ orderId: r.orderId, deliveryDay: new Date(r.deliveryDate).toISOString().slice(0, 10) }));
}
