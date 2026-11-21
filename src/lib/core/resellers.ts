import { AppError, isUniqueViolation, newId, toDate, type D1Database } from './d1.ts';
import { COUNTED_ORDER, mapOrder } from './orders.ts';
import { roundBoxes } from './products.ts';
import { jakartaRecapWeek, parseBaseDate, rewardPeriod } from './time.ts';
import { normalizePhone } from '../shop/util.ts';

export interface Reseller {
  id: string;
  reseller: string;
  parentReseller: string | null;
  /** WhatsApp number as 628xx, or null when not filled in yet. */
  phone: string | null;
  /** Name printed as "DARI" on the shipping label (starts as the reseller name). */
  labelName: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapReseller(r: Record<string, unknown>): Reseller {
  return {
    id: String(r.id),
    reseller: String(r.reseller),
    parentReseller: (r.parentReseller as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    labelName: (r.labelName as string | null) || String(r.reseller),
    createdAt: toDate(r.createdAt),
    updatedAt: toDate(r.updatedAt),
  };
}

/** Same behaviour as before: search returns up to 10 case-insensitive matches; otherwise the first 50. */
export async function searchResellers(db: D1Database, search: string | null): Promise<Reseller[]> {
  const stmt = search
    ? db.prepare('SELECT * FROM resellers WHERE instr(lower(reseller), lower(?)) > 0 ORDER BY rowid LIMIT 10').bind(search)
    : db.prepare('SELECT * FROM resellers ORDER BY rowid LIMIT 50');
  const { results } = await stmt.all<Record<string, unknown>>();
  return results.map(mapReseller);
}

export async function listResellersAlphabetical(db: D1Database): Promise<Reseller[]> {
  const { results } = await db.prepare('SELECT * FROM resellers ORDER BY reseller ASC').all<Record<string, unknown>>();
  return results.map(mapReseller);
}

export async function createReseller(db: D1Database, body: Record<string, unknown>): Promise<Reseller> {
  const reseller = typeof body.reseller === 'string' ? body.reseller.trim() : '';
  const parent = typeof body.parentReseller === 'string' ? body.parentReseller.trim() : '';
  if (!reseller) throw new AppError(400, 'Reseller name is required');
  const phone = resellerPhone(body.phone);
  const labelName = resellerLabelName(body.labelName) ?? reseller;

  const exists = await db
    .prepare('SELECT id FROM resellers WHERE reseller = ? AND parentReseller IS ? LIMIT 1')
    .bind(reseller, parent || null)
    .first();
  if (exists) throw new AppError(400, 'Combination of reseller and parent reseller already exists');

  const id = newId();
  const now = Date.now();
  try {
    await db
      .prepare('INSERT INTO resellers (id, reseller, parentReseller, phone, labelName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, reseller, parent || null, phone, labelName, now, now)
      .run();
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(400, 'Combination of reseller and parent reseller already exists');
    throw error;
  }
  return { id, reseller, parentReseller: parent || null, phone, labelName, createdAt: new Date(now), updatedAt: new Date(now) };
}

/** Empty means "no number"; anything else must be an Indonesian mobile number (08xx, +628xx, 628xx). */
function resellerPhone(value: unknown): string | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  try {
    return normalizePhone(value);
  } catch {
    throw new AppError(400, 'Invalid WhatsApp number (example: 081234567890)');
  }
}

export async function updateResellerPhone(db: D1Database, id: string | null, phone: unknown): Promise<string | null> {
  if (!id) throw new AppError(400, 'Reseller ID is required');
  const value = resellerPhone(phone);
  const result = await db.prepare('UPDATE resellers SET phone = ?, updatedAt = ? WHERE id = ?').bind(value, Date.now(), id).run();
  if (!result.meta.changes) throw new AppError(404, 'Reseller not found');
  return value;
}

/** Trimmed label name, or null when empty. */
function resellerLabelName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name.length > 60) throw new AppError(400, 'Label name is too long (max 60 characters)');
  return name || null;
}

/** Saves the name printed on the shipping label; empty goes back to the reseller name. */
export async function updateResellerLabelName(db: D1Database, id: string | null, value: unknown): Promise<string> {
  if (!id) throw new AppError(400, 'Reseller ID is required');
  const name = resellerLabelName(value);
  const row = await db
    .prepare('UPDATE resellers SET labelName = COALESCE(?, reseller), updatedAt = ? WHERE id = ? RETURNING labelName')
    .bind(name, Date.now(), id)
    .first<{ labelName: string }>();
  if (!row) throw new AppError(404, 'Reseller not found');
  return row.labelName;
}

export async function deleteReseller(db: D1Database, id: string | null): Promise<void> {
  if (!id) throw new AppError(400, 'Reseller ID is required');
  const existing = await db.prepare('SELECT * FROM resellers WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!existing) throw new AppError(404, 'Reseller not found');
  const r = mapReseller(existing);
  // Delete only if unused, checked and applied in a single statement.
  const result = await db
    .prepare(
      `DELETE FROM resellers WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM orders WHERE reseller = ? AND parentReseller IS ?)`,
    )
    .bind(id, r.reseller, r.parentReseller)
    .run();
  if (!result.meta.changes) {
    throw new AppError(400, 'Cannot delete reseller. This reseller is used in existing orders.');
  }
}

// ---------------------------------------------------------------------------
// Reseller sales report (shared by the page API and the CSV export)
// ---------------------------------------------------------------------------

interface SalesComputation {
  weeklySales: Map<string, number>;
  weeklySalesByParent: Map<string, number>;
  rewardSales: Map<string, number>;
  rewardSalesByParent: Map<string, number>;
  orderResellerNames: Set<string>;
  week: ReturnType<typeof jakartaRecapWeek>;
  period: ReturnType<typeof rewardPeriod>;
}

async function computeSales(db: D1Database, dateParam: string | null): Promise<SalesComputation> {
  const baseDate = parseBaseDate(dateParam);
  const week = jakartaRecapWeek(baseDate);
  const period = rewardPeriod(baseDate);

  const { results } = await db.prepare(`SELECT * FROM orders o WHERE o.orderStatus = 'ACTIVE' AND ${COUNTED_ORDER}`).all<Record<string, unknown>>();

  const weeklySales = new Map<string, number>();
  const weeklySalesByParent = new Map<string, number>();
  const rewardSales = new Map<string, number>();
  const rewardSalesByParent = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, roundBoxes((m.get(k) || 0) + v));

  // Only delivered orders count, by the moment they were marked delivered (owner, 2026-11-01):
  //   week   = Sunday 12:00 to Sunday 12:00 WIB (jakartaRecapWeek), so a Sunday-evening delivery counts next week;
  //   period = the reward period of the day it was delivered (ordered 31 Dec, delivered 2 Jan -> January & February).
  for (const r of results) {
    if (r.deliveryStatus !== 'DELIVERED' || r.deliveredAt === null || r.deliveredAt === undefined) continue;
    const at = Number(r.deliveredAt);
    const order = mapOrder(r, []); // only box counts are needed
    if (at > week.start.getTime() && at <= week.end.getTime()) {
      add(weeklySales, order.reseller, order.boxCounter);
      if (order.parentReseller) add(weeklySalesByParent, order.parentReseller, order.boxCounter);
    }
    if (at >= period.start.getTime() && at <= period.end.getTime()) {
      add(rewardSales, order.reseller, order.boxCounter);
      if (order.parentReseller) add(rewardSalesByParent, order.parentReseller, order.boxCounter);
    }
  }
  const orders = results.map((r) => ({ reseller: String(r.reseller) }));

  return {
    weeklySales,
    weeklySalesByParent,
    rewardSales,
    rewardSalesByParent,
    orderResellerNames: new Set(orders.map((o) => o.reseller)),
    week,
    period,
  };
}

async function allResellers(db: D1Database): Promise<Reseller[]> {
  const { results } = await db.prepare('SELECT * FROM resellers ORDER BY rowid').all<Record<string, unknown>>();
  return results.map(mapReseller);
}

/** Same output shape and grouping rules as the original /api/reseller-sales. */
export async function resellerSalesReport(db: D1Database, dateParam: string | null) {
  const s = await computeSales(db, dateParam);
  const dbResellers = await allResellers(db);

  // Note (unchanged behaviour): resellers are keyed by name, so one name under two parents is merged.
  const resellerMap = new Map<string, { reseller: string; parentReseller: string | null }>();
  for (const r of dbResellers) resellerMap.set(r.reseller, { reseller: r.reseller, parentReseller: r.parentReseller });
  for (const name of s.orderResellerNames) {
    if (!resellerMap.has(name)) resellerMap.set(name, { reseller: name, parentReseller: null });
  }

  const independentResellers = Array.from(resellerMap.values())
    .filter((r) => !r.parentReseller)
    .map((r) => ({
      reseller: r.reseller,
      parentReseller: null,
      weeklySales: s.weeklySales.get(r.reseller) || 0,
      rewardSales: s.rewardSales.get(r.reseller) || 0,
    }))
    .filter((r) => r.weeklySales > 0 || r.rewardSales > 0);

  type Child = { reseller: string; parentReseller: string; weeklySales: number; rewardSales: number };
  const parents = new Map<string, { parentReseller: string; weeklySales: number; rewardSales: number; children: Child[] }>();
  for (const r of resellerMap.values()) {
    if (!r.parentReseller) continue;
    if (!parents.has(r.parentReseller)) {
      parents.set(r.parentReseller, {
        parentReseller: r.parentReseller,
        weeklySales: s.weeklySalesByParent.get(r.parentReseller) || 0,
        rewardSales: s.rewardSalesByParent.get(r.parentReseller) || 0,
        children: [],
      });
    }
    const weekly = s.weeklySales.get(r.reseller) || 0;
    const reward = s.rewardSales.get(r.reseller) || 0;
    if (weekly > 0 || reward > 0) {
      parents.get(r.parentReseller)!.children.push({
        reseller: r.reseller,
        parentReseller: r.parentReseller,
        weeklySales: weekly,
        rewardSales: reward,
      });
    }
  }

  return {
    independentResellers,
    parentResellers: Array.from(parents.values()).filter(
      (p) => p.weeklySales > 0 || p.rewardSales > 0 || p.children.length > 0,
    ),
    // Sunday (12:00) to Sunday (12:00) WIB.
    weekRange: { start: s.week.startKey, end: s.week.endKey },
    rewardPeriod: s.period.name,
  };
}

function csvCell(value: string): string {
  // Quote and escape; prefix formula-like values so spreadsheets do not execute them.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Same columns as the original export; the period column header now names the actual period. */
export async function resellerSalesCsv(db: D1Database, dateParam: string | null): Promise<string> {
  const s = await computeSales(db, dateParam);
  const resellers = await allResellers(db);
  const header = `Reseller,Parent Reseller,Weekly Sales,${s.period.name} Sales\n`;
  const rows = resellers.map(
    (r) =>
      `${csvCell(r.reseller)},${csvCell(r.parentReseller || '')},${s.weeklySales.get(r.reseller) || 0},${s.rewardSales.get(r.reseller) || 0}`,
  );
  return header + rows.join('\n');
}
