// Products shown in the shop, edited from the admin. Prices here are what customers pay.
// Every product created here is a stock product: it gets its own inventory columns (core/products.ts), so it appears
// on the inventory, order and stock movement pages too. Stock products that were ever stocked or ordered can be hidden
// but not deleted. Website-only products (no stock) exist only from before this rule and can still be deleted.
import { AppError, type D1Database } from '../core/d1.ts';
import { addProduction } from '../core/inventory.ts';
import { addStockColumnStatements, col, loadStockProducts, MAX_STOCK_PRODUCTS, newProductKey } from '../core/products.ts';
import { DEFAULT_PRODUCT_LOOK, mediaUrl, WEBSITE_ONLY_ACCENT, type CatalogItem } from './catalog.ts';
import { deleteMediaIfUnused, saveMedia } from './media.ts';

function mapProduct(r: Record<string, unknown>): CatalogItem {
  const stockColumn = r.stockColumn ? String(r.stockColumn) : null;
  const look = (stockColumn && DEFAULT_PRODUCT_LOOK[stockColumn]) || { image: '', accent: WEBSITE_ONLY_ACCENT };
  return {
    product: String(r.product),
    stockColumn,
    shortName: r.shortName ? String(r.shortName) : null,
    boxValue: Number(r.boxValue ?? 1),
    name: String(r.name),
    size: String(r.size),
    description: String(r.description),
    price: Number(r.price),
    compareAtPrice: r.compareAtPrice === null || r.compareAtPrice === undefined ? null : Number(r.compareAtPrice),
    image: r.imageMediaId ? mediaUrl(String(r.imageMediaId)) : look.image,
    accent: look.accent,
    visible: Number(r.visible) === 1,
    sortOrder: Number(r.sortOrder),
  };
}

/** All products in display order (hidden ones included; filter on `visible` for the shop). */
export async function loadCatalog(db: D1Database): Promise<CatalogItem[]> {
  const { results } = await db.prepare('SELECT * FROM shop_products ORDER BY sortOrder, product').all<Record<string, unknown>>();
  return results.map(mapProduct);
}

function text(value: unknown, label: string, max: number, required = true): string {
  const t = typeof value === 'string' ? value.trim() : '';
  if (required && !t) throw new AppError(400, `${label} is required`);
  if (t.length > max) throw new AppError(400, `${label} is too long (max ${max} characters)`);
  return t;
}

function rupiah(value: unknown, label: string, optional = false): number | null {
  if (optional && (value === null || value === undefined || value === '')) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1000 || n > 100_000_000) throw new AppError(400, `${label} must be a whole number of rupiah (at least 1.000)`);
  return n;
}

/** Box counter value: more than 0, at most 100, up to 2 decimals. "0,5" (Indonesian comma) is read as 0.5. */
function boxValue(value: unknown): number {
  const n = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 100 || Math.round(n * 100) !== n * 100) {
    throw new AppError(400, 'Box counter value must be a number above 0 with at most 2 decimals (e.g. 1, 0.5 or 1.5)');
  }
  return n;
}

function details(body: Record<string, unknown>) {
  const price = rupiah(body.price, 'Price')!;
  const compareAtPrice = rupiah(body.compareAtPrice, 'Original price', true);
  if (compareAtPrice !== null && compareAtPrice <= price) throw new AppError(400, 'Original price must be higher than the price');
  return {
    name: text(body.name, 'Name', 80),
    shortName: text(body.shortName, 'Short name', 30, false) || null,
    boxValue: body.boxValue === undefined ? null : boxValue(body.boxValue),
    size: text(body.size, 'Size', 40),
    description: text(body.description, 'Description', 300, false),
    price,
    compareAtPrice,
    visible: body.visible === false ? 0 : 1,
  };
}

async function findProduct(db: D1Database, product: string): Promise<Record<string, unknown>> {
  const row = await db.prepare('SELECT * FROM shop_products WHERE product = ?').bind(product).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, 'Unknown product');
  return row;
}

/**
 * A new product, added at the end of the list. In one transaction it gets its stock columns (inventory, orders,
 * stock movements) and its shop row, so it appears on the website and in the admin inventory at the same time.
 * Optional `initialStock` is then added as a normal production entry.
 */
export async function createProduct(db: D1Database, body: Record<string, unknown>, now: number): Promise<CatalogItem> {
  const d = details(body);
  if (d.boxValue === null) throw new AppError(400, 'Box counter value is required (how many boxes one pack counts as)');
  const initialStock = body.initialStock === undefined || body.initialStock === null || body.initialStock === '' ? 0 : Number(body.initialStock);
  if (!Number.isInteger(initialStock) || initialStock < 0 || initialStock > 100_000) throw new AppError(400, 'Starting stock must be a whole number (0 or more)');
  if ((await loadStockProducts(db)).length >= MAX_STOCK_PRODUCTS) {
    throw new AppError(409, `You already have ${MAX_STOCK_PRODUCTS} stock products, the most this system supports. Hide one you no longer sell instead.`);
  }
  const key = await newProductKey(db, d.shortName || d.name);
  const imageMediaId = body.image ? await saveMedia(db, body.image, now) : null;
  const last = await db.prepare('SELECT COALESCE(MAX(sortOrder), 0) AS m FROM shop_products').first<{ m: number }>();
  try {
    await db.batch([
      ...addStockColumnStatements(db, key),
      db
        .prepare(
          `INSERT INTO shop_products (product, name, shortName, boxValue, size, description, price, compareAtPrice, visible, sortOrder, imageMediaId, updatedAt, stockColumn)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(key, d.name, d.shortName, d.boxValue, d.size, d.description, d.price, d.compareAtPrice, d.visible, Number(last?.m ?? 0) + 1, imageMediaId, now, key),
    ]);
  } catch (error) {
    await deleteMediaIfUnused(db, imageMediaId);
    throw error;
  }
  if (initialStock > 0) await addProduction(db, { [key]: initialStock }, null);
  return mapProduct(await findProduct(db, key));
}

/**
 * Saves the admin's edits for one product. `image` (a data URL) replaces the photo; `resetImage` removes the uploaded
 * photo (stock products go back to their built-in photo). Order changes are done with moveProduct.
 */
export async function updateProduct(db: D1Database, product: string, body: Record<string, unknown>, now: number): Promise<CatalogItem> {
  const current = await findProduct(db, product);
  const d = details(body);
  const oldImage = (current.imageMediaId as string | null) ?? null;
  let imageMediaId = oldImage;
  if (body.image) imageMediaId = await saveMedia(db, body.image, now);
  else if (body.resetImage) imageMediaId = null;

  await db
    .prepare(
      `UPDATE shop_products SET name = ?, shortName = ?, boxValue = COALESCE(?, boxValue), size = ?, description = ?, price = ?, compareAtPrice = ?, visible = ?,
         imageMediaId = ?, updatedAt = ? WHERE product = ?`,
    )
    .bind(d.name, d.shortName, d.boxValue, d.size, d.description, d.price, d.compareAtPrice, d.visible, imageMediaId, now, product)
    .run();
  if (oldImage !== imageMediaId) await deleteMediaIfUnused(db, oldImage);
  return mapProduct(await findProduct(db, product));
}

/**
 * True if a stock product was ever used: stock other than 0, any order with this product, or any stock movement.
 * Such products are kept forever (hide them instead) so the order and stock history stays complete.
 */
export async function stockProductUsed(db: D1Database, key: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM current_inventory WHERE ${col(key)} != 0)
            + (SELECT COUNT(*) FROM orders WHERE ${col(key)} != 0)
            + (SELECT COUNT(*) FROM stock_movement_history WHERE ${col(key, 'Changes')} != 0) AS n`,
    )
    .first<{ n: number }>();
  return Number(row?.n ?? 0) > 0;
}

/**
 * Deletes a product. Past website orders keep its name and price (saved with each order). A stock product can only be
 * deleted while it was never stocked or ordered (e.g. created by mistake); its empty stock columns stay in the database.
 */
export async function deleteProduct(db: D1Database, product: string): Promise<void> {
  const current = await findProduct(db, product);
  const stockColumn = current.stockColumn ? String(current.stockColumn) : null;
  if (stockColumn && (await stockProductUsed(db, stockColumn))) {
    throw new AppError(409, 'This product already has stock, orders or stock history, so it cannot be deleted. Untick "Show on the website" to hide it.');
  }
  await db.prepare('DELETE FROM shop_products WHERE product = ?').bind(product).run();
  await deleteMediaIfUnused(db, (current.imageMediaId as string | null) ?? null);
}

/** Moves a product one place up or down in the shop. */
export async function moveProduct(db: D1Database, product: string, direction: 'up' | 'down', now: number): Promise<CatalogItem[]> {
  const items = await loadCatalog(db);
  const i = items.findIndex((p) => p.product === product);
  if (i < 0) throw new AppError(404, 'Unknown product');
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= items.length) return items;
  [items[i], items[j]] = [items[j], items[i]];
  await db.batch(items.map((p, k) => db.prepare('UPDATE shop_products SET sortOrder = ?, updatedAt = ? WHERE product = ?').bind(k + 1, now, p.product)));
  return loadCatalog(db);
}
