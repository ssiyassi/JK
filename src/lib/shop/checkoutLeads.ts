// Unfinished checkouts: guests who typed their phone number at checkout but did not order (migration 0042). The owner
// sees them in Ads Report and may send one WhatsApp by hand; the form tells the customer so. Never sent automatically,
// no address is kept, and the phone number stays out of Telegram.
import type { D1Database } from '../core/d1.ts';
import type { CatalogItem } from './catalog.ts';
import { parseCart, priceCart } from './pricing.ts';
import { normalizePhone } from './util.ts';

export const LEAD_WAIT_MS = 30 * 60 * 1000; // they may still be ordering
export const LEAD_KEEP_DAYS = 14;
const ALERT_FROM_HOUR = 8; // WIB: no Telegram at night, the leads wait for the morning
const ALERT_TO_HOUR = 21;

export interface CheckoutLead {
  phone: string;
  name: string;
  items: string;
  subtotal: number;
  source: string;
  updatedAt: number;
  contactedAt: number | null;
}

/** Saves what the guest typed so far. Anything malformed is ignored: this must never bother a shopper. */
export async function saveCheckoutLead(db: D1Database, body: Record<string, unknown>, catalog: CatalogItem[], source: string, now: number): Promise<boolean> {
  const id = typeof body.id === 'string' && /^[a-z0-9]{12,40}$/.test(body.id) ? body.id : null;
  if (!id) return false;
  let phone: string;
  let items: string;
  let subtotal: number;
  try {
    phone = normalizePhone(body.phone);
    const price = priceCart(parseCart(body.items, catalog), null, catalog);
    items = price.lines.map((l) => `${l.qty} x ${l.name}`).join(', ');
    subtotal = price.subtotal;
  } catch {
    return false;
  }
  const name = (typeof body.name === 'string' ? body.name : '').trim().replace(/\s+/g, ' ').slice(0, 60);
  await db
    .prepare(
      `INSERT INTO checkout_leads (id, phone, name, items, subtotal, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET phone = excluded.phone, name = excluded.name, items = excluded.items, subtotal = excluded.subtotal, updatedAt = excluded.updatedAt`,
    )
    .bind(id, phone, name, items, subtotal, source.slice(0, 40), now, now)
    .run();
  return true;
}

/** They ordered: nothing to remind them about. */
export async function removeCheckoutLeads(db: D1Database, phone: string): Promise<void> {
  await db.prepare('DELETE FROM checkout_leads WHERE phone = ?').bind(phone).run();
}

const WAITING = `updatedAt <= ? AND updatedAt > ?
  AND NOT EXISTS (SELECT 1 FROM shop_orders s WHERE s.recipientPhone = checkout_leads.phone AND s.createdAt >= checkout_leads.createdAt)`;

/** Admin list: newest first, one row per phone number. */
export async function listCheckoutLeads(db: D1Database, now: number): Promise<CheckoutLead[]> {
  const { results } = await db
    .prepare(`SELECT phone, name, items, subtotal, source, updatedAt, contactedAt FROM checkout_leads WHERE ${WAITING} ORDER BY updatedAt DESC LIMIT 200`)
    .bind(now - LEAD_WAIT_MS, now - LEAD_KEEP_DAYS * 86400000)
    .all<CheckoutLead>();
  const byPhone = new Map<string, CheckoutLead>();
  for (const r of results) {
    const seen = byPhone.get(r.phone);
    if (seen) seen.contactedAt = seen.contactedAt ?? r.contactedAt;
    else byPhone.set(r.phone, { ...r });
  }
  return [...byPhone.values()];
}

export async function setCheckoutLeadContacted(db: D1Database, phone: unknown, contacted: boolean, now: number): Promise<void> {
  await db.prepare('UPDATE checkout_leads SET contactedAt = ? WHERE phone = ?').bind(contacted ? now : null, normalizePhone(phone)).run();
}

export async function pruneCheckoutLeads(db: D1Database, now: number): Promise<void> {
  await db.prepare('DELETE FROM checkout_leads WHERE updatedAt < ?').bind(now - LEAD_KEEP_DAYS * 86400000).run();
}

/** Telegram text for leads not announced yet (no names or numbers), or null when there is nothing to say or it is night. */
export async function checkoutLeadsAlert(db: D1Database, adminUrl: string, now: number, send: (text: string) => Promise<unknown>): Promise<number> {
  const hour = new Date(now + 7 * 3600000).getUTCHours();
  if (hour < ALERT_FROM_HOUR || hour >= ALERT_TO_HOUR) return 0;
  const { results } = await db
    .prepare(`SELECT id, phone FROM checkout_leads WHERE alertedAt IS NULL AND ${WAITING}`)
    .bind(now - LEAD_WAIT_MS, now - LEAD_KEEP_DAYS * 86400000)
    .all<{ id: string; phone: string }>();
  if (!results.length) return 0;
  const people = new Set(results.map((r) => r.phone)).size;
  await send(`🛒 ${people} customer${people > 1 ? 's' : ''} stopped at checkout without ordering.\n\nSee the list in Ads Report → Unfinished checkouts:\n${adminUrl}/marketing-report`);
  await db.batch(results.map((r) => db.prepare('UPDATE checkout_leads SET alertedAt = ? WHERE id = ?').bind(now, r.id)));
  return people;
}
