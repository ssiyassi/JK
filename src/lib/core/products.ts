// The stock products: every product created in the admin, each with its own quantity column in current_inventory,
// orders and stock_movement_history (<key>Beginning / <key>Changes / <key>Final). The list lives in shop_products
// (rows with a stockColumn), in the website's display order.
import { AppError, type D1Database, type D1PreparedStatement } from './d1.ts';

export interface StockProduct {
  key: string; // column name, e.g. 'babiManis'
  label: string; // short name for the admin and Telegram, e.g. 'Babi Manis'
  boxValue: number; // boxes one pack counts as in an order's box counter (may be a decimal, e.g. 0.5)
}

/** Column names are built into SQL, so only plain letters and digits are ever accepted. */
const KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,29}$/;

/**
 * D1 allows 100 columns per table and 100 values per query; the order edit binds about 3 values per product.
 * 20 stock products stay well inside both limits.
 */
export const MAX_STOCK_PRODUCTS = 20;

export function assertProductKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new AppError(500, `Invalid stock product key: ${key}`);
  return key;
}

export async function loadStockProducts(db: D1Database): Promise<StockProduct[]> {
  const { results } = await db
    .prepare('SELECT stockColumn, shortName, name, boxValue FROM shop_products WHERE stockColumn IS NOT NULL ORDER BY sortOrder, product')
    .all<{ stockColumn: string; shortName: string | null; name: string; boxValue: number | null }>();
  return results.map((r) => ({ key: assertProductKey(r.stockColumn), label: r.shortName || r.name, boxValue: Number(r.boxValue ?? 1) }));
}

/** Box counts are kept to 2 decimals (avoids 0.1 + 0.2 = 0.30000000000000004). */
export function roundBoxes(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Quoted column name for SQL, e.g. "babiManis" or "babiManisFinal". */
export function col(key: string, suffix = ''): string {
  return `"${assertProductKey(key)}${suffix}"`;
}

/** camelCase key from a product name: "Ayam Pedas 1kg" -> "ayamPedas1kg". */
export function keyFromName(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  if (!/^[a-z]/.test(key)) key = `produk${key}`;
  return key.slice(0, 24);
}

/** Every column name already used in the three stock tables (lower case: SQLite column names ignore case). */
export async function usedColumnNames(db: D1Database): Promise<Set<string>> {
  const used = new Set<string>();
  for (const table of ['current_inventory', 'orders', 'stock_movement_history']) {
    const { results } = await db.prepare(`PRAGMA table_info("${table}")`).all<{ name: string }>();
    for (const r of results) used.add(r.name.toLowerCase());
  }
  return used;
}

/** A new, unused key for a product name ("ayamPedas", else "ayamPedas2", …). */
export async function newProductKey(db: D1Database, name: string): Promise<string> {
  const used = await usedColumnNames(db);
  const { results } = await db.prepare('SELECT product FROM shop_products').all<{ product: string }>();
  for (const r of results) used.add(r.product.toLowerCase());
  const base = keyFromName(name);
  const free = (k: string) => ['', 'beginning', 'changes', 'final'].every((s) => !used.has((k + s).toLowerCase()));
  for (let n = 1; n < 1000; n++) {
    const key = n === 1 ? base : `${base}${n}`;
    if (free(key)) return assertProductKey(key);
  }
  throw new AppError(409, 'Could not find a free name for this product');
}

/** The statements that give a new product its stock columns (run in the same batch as the shop_products insert). */
export function addStockColumnStatements(db: D1Database, key: string): D1PreparedStatement[] {
  const add = (table: string, column: string) =>
    db.prepare(`ALTER TABLE "${table}" ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
  return [
    add('current_inventory', col(key)),
    add('orders', col(key)),
    add('stock_movement_history', col(key, 'Beginning')),
    add('stock_movement_history', col(key, 'Changes')),
    add('stock_movement_history', col(key, 'Final')),
  ];
}

/** Quantities for every stock product (missing = 0). */
export function fillQuantities(products: StockProduct[], q: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(products.map((p) => [p.key, q[p.key] ?? 0]));
}
