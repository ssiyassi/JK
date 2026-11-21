// Bundle packages ("Paket Hemat", admin Promotions → Bundles, migration 0047). Owner, 2026-11-13.
// A bundle has picks (slots); for each pick the owner ticks which products may be chosen. The customer pays one price
// for the whole bundle. In the cart a bundle is { bundleId, picks } (one product id per slot); in the order every
// picked pack becomes a normal line with a `bundle` tag and its share of the bundle price, so stock, labels, reports,
// HPP and box counts keep working. Bundle rules: freeDelivery = the whole order ships free; voucherAllowed = off means
// a voucher only discounts the products outside the bundle.
import { AppError, newId, type D1Database } from '../core/d1.ts';
import type { CatalogItem, LineBundle, LineItem } from './catalog.ts';

export type { LineBundle };

export interface Bundle {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  slots: string[][]; // per pick: the product ids the customer may choose
  price: number;
  freeDelivery: boolean;
  voucherAllowed: boolean;
  active: boolean;
  startsAt: number | null;
  endsAt: number | null;
  /** Weekdays it can be bought (Jakarta time, 0 = Sunday … 6 = Saturday); null = every day. */
  weekdays: number[] | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** One bundle in a cart: the product picked for each slot, in slot order. */
export interface CartBundle {
  bundleId: string;
  picks: string[];
}

export const MAX_BUNDLES_IN_CART = 10;
export const MAX_SLOTS = 10;

function mapBundle(r: Record<string, unknown>): Bundle {
  let slots: string[][] = [];
  try {
    const parsed = JSON.parse(String(r.slots));
    if (Array.isArray(parsed)) slots = parsed.map((s) => (Array.isArray(s) ? s.map(String) : []));
  } catch {
    /* broken row: no slots, never shown */
  }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    tagline: String(r.tagline ?? ''),
    slots,
    price: Number(r.price),
    freeDelivery: Number(r.freeDelivery) === 1,
    voucherAllowed: Number(r.voucherAllowed) === 1,
    active: Number(r.active) === 1,
    startsAt: num(r.startsAt),
    endsAt: num(r.endsAt),
    weekdays: parseWeekdays(r.weekdays),
    sortOrder: Number(r.sortOrder ?? 0),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

function parseWeekdays(v: unknown): number[] | null {
  if (v === null || v === undefined || v === '') return null;
  const days = [...new Set(String(v).split(',').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return days.length && days.length < 7 ? days : null;
}

// ---------- Weekly days (owner 16 Nov 2026: Paket Hemat only Thursday–Sunday) ----------

const DAY_MS = 24 * 3600 * 1000;
const JAKARTA_MS = 7 * 3600 * 1000;
export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
/** Weekday (0 = Sunday) in Jakarta at this moment. */
const jakartaWeekday = (now: number) => new Date(now + JAKARTA_MS).getUTCDay();
/** 00:00 Jakarta time of the day `now` falls in. */
const jakartaDayStart = (now: number) => Math.floor((now + JAKARTA_MS) / DAY_MS) * DAY_MS - JAKARTA_MS;

/** Open today by its weekly days (true when it has none). */
export function openToday(b: Pick<Bundle, 'weekdays'>, now: number): boolean {
  return !b.weekdays || b.weekdays.includes(jakartaWeekday(now));
}

/**
 * When customers can no longer buy it (ms), for the countdown: the end of the last of its weekdays in a row from
 * today (e.g. Sunday 23:59:59 for Thursday–Sunday), or its end date when that is sooner. null = no end in sight.
 */
export function bundleClosesAt(b: Pick<Bundle, 'weekdays' | 'endsAt'>, now: number): number | null {
  let closes: number | null = null;
  if (b.weekdays && openToday(b, now)) {
    let day = jakartaDayStart(now);
    for (let i = 0; i < 7 && b.weekdays.includes(jakartaWeekday(day + DAY_MS)); i++) day += DAY_MS;
    closes = day + DAY_MS - 1;
  }
  if (b.endsAt !== null && (closes === null || b.endsAt < closes)) closes = b.endsAt;
  return closes;
}

/** Next 00:00 (Jakarta) on one of its weekdays after today, when it is closed today by its weekly days. */
export function bundleOpensAt(b: Pick<Bundle, 'weekdays'>, now: number): number | null {
  if (!b.weekdays) return null;
  let day = jakartaDayStart(now);
  for (let i = 0; i < 7; i++) {
    day += DAY_MS;
    if (b.weekdays.includes(jakartaWeekday(day))) return day;
  }
  return null;
}

/** "Kamis–Minggu" for days in a row, else "Kamis, Sabtu" (week starts Monday). */
export function weekdaysLabel(days: number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  const idx = order.map((d) => (d + 6) % 7);
  const inRow = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return inRow && order.length > 2 ? `${DAY_NAMES[order[0]]}–${DAY_NAMES[order[order.length - 1]]}` : order.map((d) => DAY_NAMES[d]).join(', ');
}

/** Every bundle (admin), newest first in the owner's order. */
export async function loadBundles(db: D1Database): Promise<Bundle[]> {
  const { results } = await db.prepare('SELECT * FROM shop_bundles ORDER BY sortOrder, createdAt DESC').all<Record<string, unknown>>();
  return results.map(mapBundle);
}

/** Switched on, inside its dates, and every pick still has a product on sale. */
export function isBundleLive(b: Bundle, catalog: CatalogItem[], now: number): boolean {
  if (!b.active || b.slots.length === 0) return false;
  if (b.startsAt !== null && now < b.startsAt) return false;
  if (b.endsAt !== null && now > b.endsAt) return false;
  if (!openToday(b, now)) return false;
  return b.slots.every((slot) => slotOptions(slot, catalog).length > 0);
}

/** The bundles customers can buy now. */
export async function loadShopBundles(db: D1Database, catalog: CatalogItem[], now: number): Promise<Bundle[]> {
  return (await loadBundles(db)).filter((b) => isBundleLive(b, catalog, now));
}

/** Products of a slot that are on sale, in catalog order. */
export function slotOptions(slot: string[], catalog: CatalogItem[]): CatalogItem[] {
  return catalog.filter((p) => p.visible && slot.includes(p.product));
}

/**
 * What the bundle "normally" costs: per slot the dearest product it allows (today's price), and the crossed-out
 * total (per slot the dearest original price, "harga coret"; a product without one counts its price).
 */
export function bundleTotals(b: Pick<Bundle, 'slots'>, catalog: CatalogItem[]): { normal: number; compareAt: number } {
  let normal = 0;
  let compareAt = 0;
  for (const slot of b.slots) {
    const options = catalog.filter((p) => slot.includes(p.product));
    normal += Math.max(0, ...options.map((p) => p.price));
    compareAt += Math.max(0, ...options.map((p) => p.compareAtPrice ?? p.price));
  }
  return { normal, compareAt };
}

/** "Babi Manis" etc.: the short name when the product has one. */
export const shortProductName = (p: Pick<CatalogItem, 'name' | 'shortName'>): string => p.shortName ?? p.name.replace(/ Marinade/i, '');

/** "2× Babi Manis, 1× Sapi Manis": what a bundle in the cart holds. */
export function bundlePicksText(picks: string[], catalog: CatalogItem[]): string {
  const counts: [string, number][] = [];
  for (const p of picks) {
    const c = counts.find((x) => x[0] === p);
    if (c) c[1] += 1;
    else counts.push([p, 1]);
  }
  return counts.map(([p, n]) => {
    const item = catalog.find((c) => c.product === p);
    return `${n}× ${item ? shortProductName(item) : p}`;
  }).join(', ');
}

/**
 * Reads the bundles of a cart from untrusted input: each must be on sale and have one allowed, visible product per
 * slot. Unknown bundles are refused with a clear message (the customer's page may be old).
 */
export function parseCartBundles(input: unknown, bundles: Bundle[], catalog: CatalogItem[], now: number): CartBundle[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new AppError(400, 'Paket tidak valid');
  if (input.length > MAX_BUNDLES_IN_CART) throw new AppError(400, `Maksimal ${MAX_BUNDLES_IN_CART} paket per pesanan`);
  return input.map((raw) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const bundle = bundles.find((b) => b.id === r.bundleId);
    if (!bundle || !isBundleLive(bundle, catalog, now)) throw new AppError(409, 'Paket ini sudah tidak tersedia. Silakan hapus dari keranjang.');
    const picks = Array.isArray(r.picks) ? r.picks.map((p) => (typeof p === 'string' ? p : '')) : [];
    if (picks.length !== bundle.slots.length) throw new AppError(400, `Pilih ${bundle.slots.length} pack untuk ${bundle.name}`);
    picks.forEach((p, i) => {
      if (!slotOptions(bundle.slots[i], catalog).some((o) => o.product === p)) {
        throw new AppError(409, `Isi ${bundle.name} sudah berubah. Silakan pilih ulang isi paketnya.`);
      }
    });
    return { bundleId: bundle.id, picks };
  });
}

/**
 * The order lines of one bundle: one line per product picked, each pack priced at its share of the bundle price (so
 * the lines add up to exactly the bundle price). The few Rupiah left over from dividing go to one product with a
 * single pack, or else to a pack split off into its own line.
 */
export function bundleLines(bundle: Bundle, picks: string[], catalog: CatalogItem[], key: string): LineItem[] {
  const n = picks.length;
  const base = Math.floor(bundle.price / n);
  let rest = bundle.price - base * n;
  const tag: LineBundle = { id: bundle.id, key, name: bundle.name, price: bundle.price, compareAt: bundleTotals(bundle, catalog).compareAt };
  const groups: { item: CatalogItem; qty: number }[] = [];
  for (const p of picks) {
    const item = catalog.find((c) => c.product === p)!;
    const g = groups.find((x) => x.item.product === p);
    if (g) g.qty += 1;
    else groups.push({ item, qty: 1 });
  }
  const line = (item: CatalogItem, qty: number, price: number): LineItem => ({ product: item.product, name: item.name, price, qty, stockColumn: item.stockColumn, bundle: tag });
  const lines: LineItem[] = [];
  // A group whose pack count divides the leftover takes it evenly (most often a single pack).
  const taker = rest > 0 ? groups.find((g) => rest % g.qty === 0) : undefined;
  for (const g of groups) {
    if (rest > 0 && g === taker) {
      lines.push(line(g.item, g.qty, base + rest / g.qty));
      rest = 0;
    } else if (rest > 0 && !taker && g === groups[0]) {
      if (g.qty > 1) lines.push(line(g.item, g.qty - 1, base));
      lines.push(line(g.item, 1, base + rest));
      rest = 0;
    } else {
      lines.push(line(g.item, g.qty, base));
    }
  }
  return lines;
}

// ---------- Admin ----------

export interface BundleInput {
  name: string;
  tagline: string;
  slots: string[][];
  price: number;
  freeDelivery: boolean;
  voucherAllowed: boolean;
  active: boolean;
  startsAt: number | null;
  endsAt: number | null;
  weekdays: number[] | null;
}

function date(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new AppError(400, `${label} is not a valid date`);
  return n;
}

/** Checks what the admin form sends. Products must exist (hidden ones may be ticked; they are skipped in the shop). */
export function parseBundleInput(body: Record<string, unknown>, catalog: CatalogItem[]): BundleInput {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new AppError(400, 'Name is required');
  if (name.length > 60) throw new AppError(400, 'Name is too long (max 60 characters)');
  const tagline = typeof body.tagline === 'string' ? body.tagline.trim() : '';
  if (tagline.length > 80) throw new AppError(400, 'Short line is too long (max 80 characters)');
  if (!Array.isArray(body.slots) || body.slots.length < 1) throw new AppError(400, 'Add at least one product pick');
  if (body.slots.length > MAX_SLOTS) throw new AppError(400, `At most ${MAX_SLOTS} products per bundle`);
  const known = new Set(catalog.map((p) => p.product));
  const slots = body.slots.map((s, i) => {
    const ids = Array.isArray(s) ? [...new Set(s.filter((x): x is string => typeof x === 'string' && known.has(x)))] : [];
    if (!ids.length) throw new AppError(400, `Tick at least one product for Product ${i + 1}`);
    return catalog.filter((p) => ids.includes(p.product)).map((p) => p.product);
  });
  const price = Number(body.price);
  if (!Number.isInteger(price) || price < 1000 || price > 100_000_000) throw new AppError(400, 'Final price must be a whole number of rupiah (at least 1.000)');
  if (price < slots.length) throw new AppError(400, 'Final price is too low');
  const startsAt = date(body.startsAt, 'Start date');
  const endsAt = date(body.endsAt, 'End date');
  if (startsAt !== null && endsAt !== null && endsAt < startsAt) throw new AppError(400, 'End date is before the start date');
  const weekdays = Array.isArray(body.weekdays) ? parseWeekdays(body.weekdays.join(',')) : null;
  if (Array.isArray(body.weekdays) && body.weekdays.length === 0) throw new AppError(400, 'Tick at least one day');
  return {
    weekdays,
    name,
    tagline,
    slots,
    price,
    freeDelivery: body.freeDelivery === true,
    voucherAllowed: body.voucherAllowed === true,
    active: body.active === true,
    startsAt,
    endsAt,
  };
}

/** URL part from the name: "Paket Hemat 3 Box" → "paket-hemat-3-box" (a number is added when taken). */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'paket'
  );
}

async function freeSlug(db: D1Database, name: string, exceptId: string | null): Promise<string> {
  const base = slugify(name);
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const row = await db.prepare('SELECT id FROM shop_bundles WHERE slug = ?').bind(slug).first<{ id: string }>();
    if (!row || row.id === exceptId) return slug;
  }
  return `${base}-${newId().slice(0, 6)}`;
}

export async function createBundle(db: D1Database, input: BundleInput, now: number): Promise<Bundle> {
  const id = newId();
  const slug = await freeSlug(db, input.name, null);
  const top = await db.prepare('SELECT MIN(sortOrder) AS m FROM shop_bundles').first<{ m: number | null }>();
  await db
    .prepare(
      `INSERT INTO shop_bundles (id, slug, name, tagline, imageMediaId, slots, price, freeDelivery, voucherAllowed, active, startsAt, endsAt, weekdays, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, slug, input.name, input.tagline, JSON.stringify(input.slots), input.price, input.freeDelivery ? 1 : 0, input.voucherAllowed ? 1 : 0,
      input.active ? 1 : 0, input.startsAt, input.endsAt, input.weekdays?.join(',') ?? null, Number(top?.m ?? 1) - 1, now, now,
    )
    .run();
  return (await getBundle(db, id))!;
}

/** Saves the form. The link (slug) stays the same so shared links keep working. Paid orders keep their prices. */
export async function updateBundle(db: D1Database, id: string, input: BundleInput, now: number): Promise<Bundle> {
  const res = await db
    .prepare(
      `UPDATE shop_bundles SET name = ?, tagline = ?, slots = ?, price = ?, freeDelivery = ?, voucherAllowed = ?, active = ?, startsAt = ?, endsAt = ?, weekdays = ?, updatedAt = ?
       WHERE id = ?`,
    )
    .bind(
      input.name, input.tagline, JSON.stringify(input.slots), input.price, input.freeDelivery ? 1 : 0, input.voucherAllowed ? 1 : 0, input.active ? 1 : 0,
      input.startsAt, input.endsAt, input.weekdays?.join(',') ?? null, now, id,
    )
    .run();
  if (!res.meta.changes) throw new AppError(404, 'Bundle not found');
  return (await getBundle(db, id))!;
}

export async function setBundleActive(db: D1Database, id: string, active: boolean, now: number): Promise<void> {
  const res = await db.prepare('UPDATE shop_bundles SET active = ?, updatedAt = ? WHERE id = ?').bind(active ? 1 : 0, now, id).run();
  if (!res.meta.changes) throw new AppError(404, 'Bundle not found');
}

export async function getBundle(db: D1Database, id: string): Promise<Bundle | null> {
  const r = await db.prepare('SELECT * FROM shop_bundles WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return r ? mapBundle(r) : null;
}

export async function getBundleBySlug(db: D1Database, slug: string): Promise<Bundle | null> {
  const r = await db.prepare('SELECT * FROM shop_bundles WHERE slug = ?').bind(slug).first<Record<string, unknown>>();
  return r ? mapBundle(r) : null;
}

/** Deletes a bundle nobody ordered yet (otherwise switch it off instead). */
export async function deleteBundle(db: D1Database, id: string): Promise<void> {
  const used = await db.prepare(`SELECT 1 FROM shop_orders WHERE lineItems LIKE ? LIMIT 1`).bind(`%"id":"${id}"%`).first();
  if (used) throw new AppError(409, 'This bundle was already ordered. Switch it off instead.');
  await db.prepare('DELETE FROM shop_bundles WHERE id = ?').bind(id).run();
}

export interface BundleStats {
  sold: number; // bundles in paid, not cancelled orders
  thisWeek: number; // of those, paid in the last 7 days
  sales: number; // Rupiah of those bundles
}

/** Sold counts per bundle from paid, not cancelled website orders (test orders included only if marked paid). */
export async function bundleStats(db: D1Database, now: number): Promise<Record<string, BundleStats>> {
  const { results } = await db
    .prepare(
      `SELECT s.lineItems, s.createdAt FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
       WHERE o.paymentStatus = 'PAID' AND o.orderStatus = 'ACTIVE' AND s.lineItems LIKE '%"bundle":%'`,
    )
    .all<{ lineItems: string; createdAt: number }>();
  const out: Record<string, BundleStats> = {};
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  for (const r of results) {
    let lines: LineItem[] = [];
    try {
      lines = JSON.parse(r.lineItems) as LineItem[];
    } catch {
      continue;
    }
    const seen = new Set<string>();
    for (const l of lines) {
      if (!l.bundle || seen.has(l.bundle.key)) continue;
      seen.add(l.bundle.key);
      const s = (out[l.bundle.id] ??= { sold: 0, thisWeek: 0, sales: 0 });
      s.sold += 1;
      s.sales += l.bundle.price;
      if (r.createdAt >= weekAgo) s.thisWeek += 1;
    }
  }
  return out;
}

/** Lines grouped for display: each bundle once (with its packs), then the products bought on their own. */
export function groupOrderLines(lines: LineItem[]): { bundles: { bundle: LineBundle; lines: LineItem[] }[]; singles: LineItem[] } {
  const bundles: { bundle: LineBundle; lines: LineItem[] }[] = [];
  const singles: LineItem[] = [];
  for (const l of lines) {
    if (!l.bundle) {
      singles.push(l);
      continue;
    }
    const g = bundles.find((b) => b.bundle.key === l.bundle!.key);
    if (g) {
      const same = g.lines.find((x) => x.product === l.product);
      if (same) same.qty += l.qty;
      else g.lines.push({ ...l });
    } else bundles.push({ bundle: l.bundle, lines: [{ ...l }] });
  }
  return { bundles, singles };
}

/** Order lines for customers: a bundle as one row "Paket Hemat 3 Box (2× Babi Manis, 1× Sapi Manis)", then the rest. */
export function orderDisplayLines(lines: LineItem[]): { label: string; amount: number }[] {
  const { bundles, singles } = groupOrderLines(lines);
  return [
    ...bundles.map((b) => ({
      label: `${b.bundle.name} (${b.lines.map((l) => `${l.qty}× ${l.name.replace(/ Marinade/i, '')}`).join(', ')})`,
      amount: b.bundle.price,
    })),
    ...singles.map((l) => ({ label: `${l.name} × ${l.qty}`, amount: l.price * l.qty })),
  ];
}

/** "2 x Babi Marinade Manis (Paket Hemat 3 Box)" rows for the owner (Telegram): one row per product and bundle. */
export function packLines(lines: LineItem[]): { name: string; qty: number }[] {
  const out: { name: string; qty: number }[] = [];
  for (const l of lines) {
    const name = l.bundle ? `${l.name} (${l.bundle.name})` : l.name;
    const same = out.find((x) => x.name === name);
    if (same) same.qty += l.qty;
    else out.push({ name, qty: l.qty });
  }
  return out;
}
