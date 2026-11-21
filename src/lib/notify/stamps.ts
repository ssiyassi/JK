// Reseller stamp card (owner, 2026-11-01): one stamp per delivered box in the current reward period, shown on four level
// cards (jentiskitchen.id/stamp, looked up by WhatsApp number) with a Telegram alert to the owner when a level is filled.
// Same numbers as the Sunday recap: delivered orders only, in the period of the day they were marked delivered, keyed
// by reseller name (like resellerSalesReport). After 100 boxes the four cards start again in the same period.
// Framework-free: used by the shop page API and by the 15-minute job (custom-worker.ts).
import type { D1Database } from '../core/d1.ts';
import { COUNTED_ORDER } from '../core/orders.ts';
import { roundBoxes } from '../core/products.ts';
import { jakartaDateKey, rewardPeriod } from '../core/time.ts';
import { recapPeriod } from './reseller-recap.ts';

export interface StampLevel {
  level: number;
  name: string;
  /** Box count (within one 0–100 round) that fills this card. */
  upTo: number;
  reward: string;
  kind: 'box' | 'cash';
}

/** The Nov–Dec 2026 scheme (FREE_BOX_TIERS in reseller-recap.ts), wording as on the poster. */
export const STAMP_LEVELS: readonly StampLevel[] = [
  { level: 1, name: 'PEMULA', upTo: 15, reward: 'GRATIS 1 box', kind: 'box' },
  { level: 2, name: 'JAGOAN', upTo: 25, reward: 'GRATIS 2 box LAGI', kind: 'box' },
  { level: 3, name: 'JURAGAN', upTo: 65, reward: 'CASH Rp650.000', kind: 'cash' },
  { level: 4, name: 'SULTAN', upTo: 100, reward: 'CASH Rp2.350.000 LAGI', kind: 'cash' },
];

export interface StampDelivery {
  orderId: string;
  deliveredAt: number;
  boxes: number;
}

export interface StampCard {
  reseller: string;
  parentReseller: string | null;
  periodLabel: string;
  /** Delivered boxes in the period. */
  total: number;
  /** Rounds of 100 already completed in this period (the cards start again after each). */
  round: number;
  /** Boxes within the current round (what the cards show). */
  roundBoxes: number;
  levels: { level: number; name: string; from: number; upTo: number; reward: string; kind: 'box' | 'cash'; filled: number; state: 'done' | 'now' | 'lock' }[];
  next: { left: number; reward: string; level: number; name: string } | null;
  recent: StampDelivery[];
}

/** Builds the four cards from the period's delivered boxes. Partial boxes (box values may be decimals) fill no stamp. */
export function buildStampCard(
  reseller: { reseller: string; parentReseller: string | null },
  deliveries: StampDelivery[],
  periodLabel: string,
): StampCard {
  const total = roundBoxes(deliveries.reduce((sum, d) => sum + d.boxes, 0));
  const round = Math.floor(total / 100);
  const inRound = roundBoxes(total - round * 100);
  let from = 0;
  let current: StampCard['levels'][number] | null = null;
  const levels = STAMP_LEVELS.map((l) => {
    const size = l.upTo - from;
    const filled = Math.max(0, Math.min(size, Math.floor(inRound - from)));
    const state: 'done' | 'now' | 'lock' = inRound >= l.upTo ? 'done' : inRound >= from && !current ? 'now' : 'lock';
    const card = { level: l.level, name: l.name, from, upTo: l.upTo, reward: l.reward, kind: l.kind, filled, state };
    if (state === 'now') current = card;
    from = l.upTo;
    return card;
  });
  const now = current as StampCard['levels'][number] | null;
  return {
    reseller: reseller.reseller,
    parentReseller: reseller.parentReseller,
    periodLabel,
    total,
    round,
    roundBoxes: inRound,
    levels,
    next: now ? { left: roundBoxes(now.upTo - inRound), reward: now.reward, level: now.level, name: now.name } : null,
    recent: [...deliveries].sort((a, b) => b.deliveredAt - a.deliveredAt).slice(0, 6),
  };
}

/** Delivered reseller orders in the reward period containing `now`, newest first, keyed by reseller name. */
async function periodDeliveries(db: D1Database, now: number, reseller?: string): Promise<Map<string, StampDelivery[]>> {
  const period = rewardPeriod(new Date(now));
  const { results } = await db
    .prepare(
      `SELECT o.reseller, o.orderId, o.deliveredAt, o.boxCounter FROM orders o
        WHERE o.orderStatus = 'ACTIVE' AND o.deliveryStatus = 'DELIVERED' AND o.deliveredAt BETWEEN ? AND ?
          AND o.boxCounter > 0 AND ${COUNTED_ORDER} ${reseller === undefined ? '' : 'AND o.reseller = ?'}
        ORDER BY o.deliveredAt DESC`,
    )
    .bind(period.start.getTime(), period.end.getTime(), ...(reseller === undefined ? [] : [reseller]))
    .all<{ reseller: string; orderId: string; deliveredAt: number; boxCounter: number }>();
  const map = new Map<string, StampDelivery[]>();
  for (const r of results) {
    const list = map.get(r.reseller) ?? [];
    list.push({ orderId: String(r.orderId), deliveredAt: Number(r.deliveredAt), boxes: Number(r.boxCounter) });
    map.set(r.reseller, list);
  }
  return map;
}

/** Stamp cards of every reseller saved with this WhatsApp number (628…), for the portal. */
export async function stampCardsForPhone(db: D1Database, phone: string, now: number): Promise<StampCard[]> {
  const { results } = await db
    .prepare('SELECT reseller, parentReseller FROM resellers WHERE phone = ? ORDER BY reseller COLLATE NOCASE')
    .bind(phone)
    .all<{ reseller: string; parentReseller: string | null }>();
  const label = recapPeriod(now).label;
  const cards: StampCard[] = [];
  for (const r of results) {
    const deliveries = (await periodDeliveries(db, now, r.reseller)).get(r.reseller) ?? [];
    cards.push(buildStampCard({ reseller: r.reseller, parentReseller: r.parentReseller ?? null }, deliveries, label));
  }
  return cards;
}

export interface StampMilestone {
  reseller: string;
  milestone: number;
  round: number;
  level: StampLevel;
  total: number;
}

/** Every level filled so far this period (round * 100 + level box count), for each reseller. */
export function milestonesReached(reseller: string, total: number): StampMilestone[] {
  const out: StampMilestone[] = [];
  for (let round = 0; round * 100 < total; round++) {
    for (const level of STAMP_LEVELS) {
      const milestone = round * 100 + level.upTo;
      if (milestone <= total) out.push({ reseller, milestone, round, level, total });
    }
  }
  return out;
}

export function stampAlertText(m: StampMilestone, periodLabel: string, parent: string | null): string {
  return [
    `🏆 Stamp reward: ${m.reseller}${parent ? ` (parent ${parent})` : ''}`,
    `filled Level ${m.level.level} ${m.level.name}${m.round ? ` (round ${m.round + 1})` : ''}`,
    `Reward: ${m.level.reward}`,
    `Periode ${periodLabel} · ${m.total} box delivered`,
  ].join('\n');
}

/**
 * 15-minute job (Reporting bot): one message per newly filled level, sent once. A level is recorded before its message
 * goes out and released again when sending failed, so the next run retries it.
 */
export async function checkStampMilestones(db: D1Database, send: (texts: string[]) => Promise<number>, now: number): Promise<number> {
  const periodStart = jakartaDateKey(rewardPeriod(new Date(now)).start);
  const label = recapPeriod(now).label;
  const deliveries = await periodDeliveries(db, now);
  const { results: parents } = await db.prepare('SELECT reseller, parentReseller FROM resellers').all<{ reseller: string; parentReseller: string | null }>();
  const parentOf = new Map(parents.map((p) => [p.reseller, p.parentReseller ?? null]));
  let sent = 0;
  for (const [reseller, list] of deliveries) {
    const total = roundBoxes(list.reduce((sum, d) => sum + d.boxes, 0));
    for (const m of milestonesReached(reseller, total)) {
      const claim = await db
        .prepare('INSERT OR IGNORE INTO reseller_stamp_alerts (reseller, periodStart, milestone, sentAt) VALUES (?, ?, ?, ?)')
        .bind(reseller, periodStart, m.milestone, now)
        .run();
      if (!claim.meta.changes) continue;
      if (await send([stampAlertText(m, label, parentOf.get(reseller) ?? null)])) sent++;
      else {
        await db.prepare('DELETE FROM reseller_stamp_alerts WHERE reseller = ? AND periodStart = ? AND milestone = ?').bind(reseller, periodStart, m.milestone).run();
        return sent; // Telegram is down: try again next run
      }
    }
  }
  return sent;
}
