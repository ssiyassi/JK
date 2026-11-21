// HPP (cost per pack) and monthly profit.
//
// HPP of a product in a month = meat per pack + ingredients per pack + packaging/courier per pack.
//   Meat: every production records what the meat cost. The month's meat cost per pack = total spent / total packs
//         of that month; a month without any meat price uses the latest earlier month that has one.
//   Ingredients: the newest purchase of each ingredient is its base price (older purchases stay as history).
//         Recipes are amounts per kg of meat; one pack holds `meatKgPerPack` kg. 1 ml counts as 1 gram.
// Profit of a month = sales - HPP of the packs sold - HPP of free reward boxes - payment fee on website orders.
import { AppError, newId, type D1Database, type D1PreparedStatement, type Quantities } from './d1.ts';
import { COUNTED_ORDER } from './orders.ts';
import { loadStockProducts, type StockProduct } from './products.ts';
import { jakartaDateKey, jakartaInstant } from './time.ts';

import { MEATS, MEAT_LABELS, isMeat, type Meat } from './meat.ts';

export { MEATS, MEAT_LABELS, isMeat, type Meat };

export interface CostSettings {
  packagingPerPack: number;
  meatKgPerPack: number;
  resellerPrice: number;
  paydayPricePer3: number;
  paymentFeePercent: number;
}

export const SETTING_LABELS: Record<keyof CostSettings, string> = {
  packagingPerPack: 'Packaging + courier per pack (Rp)',
  meatKgPerPack: 'Meat per pack (kg)',
  resellerPrice: 'Reseller price per pack (Rp)',
  paydayPricePer3: 'Payday Promo price per 3 packs (Rp)',
  paymentFeePercent: 'Payment fee on website orders (%)',
};

const DEFAULT_SETTINGS: CostSettings = {
  packagingPerPack: 0,
  meatKgPerPack: 0.5,
  resellerPrice: 140000,
  paydayPricePer3: 350000,
  paymentFeePercent: 0.7,
};

export interface Ingredient {
  key: string;
  name: string;
  unit: string;
}

export interface IngredientPurchase {
  id: string;
  ingredient: string;
  shopDate: string;
  size: number;
  price: number;
  createdAt: number;
}

export interface MeatPurchase {
  id: string;
  productionId: string | null;
  purchaseDate: string;
  meat: Meat;
  price: number;
  packs: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Months (Jakarta calendar)
// ---------------------------------------------------------------------------

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** YYYY-MM of the Jakarta month containing the instant. */
export function monthKeyOf(instant: Date | number): string {
  return jakartaDateKey(instant).slice(0, 7);
}

export function parseMonthKey(v: unknown): string | null {
  const m = typeof v === 'string' ? MONTH_PATTERN.exec(v) : null;
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? v as string : null;
}

/** First instant of the month and first instant of the next month (Jakarta). */
export function monthRange(monthKey: string): { start: number; end: number } {
  const [y, m] = monthKey.split('-').map(Number);
  return { start: jakartaInstant(y, m - 1, 1).getTime(), end: jakartaInstant(y, m, 1).getTime() };
}

export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function parseDateKey(v: unknown, field: string): string {
  if (typeof v !== 'string' || !DATE_PATTERN.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new AppError(400, `${field} must be a valid date`);
  }
  return v;
}

function positiveNumber(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) throw new AppError(400, `${field} must be more than 0`);
  return n;
}

/** Rupiah amount: digits only ("1.700.000" and "1700000" both accepted). `max` catches typos with extra zeros. */
export function parseRupiah(v: unknown, field: string, max = 100_000_000): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[.\s]/g, ''));
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, `${field} must be a whole rupiah amount above 0`);
  if (n > max) throw new AppError(400, `${field} looks too high (more than Rp ${max.toLocaleString('id-ID')}): check for extra zeros`);
  return n;
}

// ---------------------------------------------------------------------------
// Settings, ingredients, recipes
// ---------------------------------------------------------------------------

export async function loadCostSettings(db: D1Database): Promise<CostSettings> {
  const { results } = await db.prepare('SELECT key, value FROM cost_settings').all<{ key: string; value: number }>();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of results) if (r.key in s) s[r.key as keyof CostSettings] = Number(r.value);
  return s;
}

export async function saveCostSettings(db: D1Database, body: Record<string, unknown>): Promise<CostSettings> {
  const statements: D1PreparedStatement[] = [];
  for (const key of Object.keys(SETTING_LABELS) as (keyof CostSettings)[]) {
    if (body[key] === undefined) continue;
    const n = Number(String(body[key]).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) throw new AppError(400, `${SETTING_LABELS[key]} must be 0 or more`);
    if (key === 'meatKgPerPack' && n === 0) throw new AppError(400, 'Meat per pack must be more than 0');
    statements.push(db.prepare('INSERT INTO cost_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, n));
  }
  if (statements.length) await db.batch(statements);
  return loadCostSettings(db);
}

export async function listIngredients(db: D1Database): Promise<Ingredient[]> {
  const { results } = await db.prepare('SELECT key, name, unit FROM ingredients ORDER BY sortOrder, name').all<Ingredient>();
  return results;
}

export async function listIngredientPurchases(db: D1Database, limit = 200): Promise<IngredientPurchase[]> {
  const { results } = await db
    .prepare('SELECT * FROM ingredient_purchases ORDER BY shopDate DESC, createdAt DESC LIMIT ?')
    .bind(limit)
    .all<IngredientPurchase>();
  return results.map((r) => ({ ...r, size: Number(r.size), price: Number(r.price), createdAt: Number(r.createdAt) }));
}

/** Base price of each ingredient: its newest purchase on or before `onOrBefore` (YYYY-MM-DD). */
export async function ingredientBasePrices(db: D1Database, onOrBefore: string): Promise<Record<string, IngredientPurchase & { perUnit: number }>> {
  const { results } = await db
    .prepare(
      `SELECT p.* FROM ingredient_purchases p
       WHERE p.shopDate <= ? AND p.id = (
         SELECT q.id FROM ingredient_purchases q WHERE q.ingredient = p.ingredient AND q.shopDate <= ?
         ORDER BY q.shopDate DESC, q.createdAt DESC LIMIT 1)`,
    )
    .bind(onOrBefore, onOrBefore)
    .all<IngredientPurchase>();
  return Object.fromEntries(results.map((r) => [r.ingredient, { ...r, size: Number(r.size), price: Number(r.price), perUnit: Number(r.price) / Number(r.size) }]));
}

/** Saves one shopping trip: several ingredient rows with the same date. */
export async function addIngredientPurchases(db: D1Database, body: Record<string, unknown>, now = Date.now()): Promise<number> {
  const shopDate = parseDateKey(body.shopDate, 'Date of shop');
  if (shopDate > jakartaDateKey(now)) throw new AppError(400, 'Date of shop cannot be in the future');
  const rows = Array.isArray(body.items) ? body.items : [];
  if (!rows.length) throw new AppError(400, 'Add at least one ingredient');
  if (rows.length > 30) throw new AppError(400, 'At most 30 rows at a time');
  const known = new Set((await listIngredients(db)).map((i) => i.key));
  const statements = rows.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const row = `Row ${i + 1}`;
    if (typeof r.ingredient !== 'string' || !known.has(r.ingredient)) throw new AppError(400, `${row}: choose an ingredient`);
    const size = positiveNumber(r.size, `${row}: size`);
    const price = parseRupiah(r.price, `${row}: price`);
    return db
      .prepare('INSERT INTO ingredient_purchases (id, ingredient, shopDate, size, price, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(newId(), r.ingredient, shopDate, size, price, now + i);
  });
  await db.batch(statements);
  return statements.length;
}

export async function deleteIngredientPurchase(db: D1Database, id: string): Promise<void> {
  const r = await db.prepare('DELETE FROM ingredient_purchases WHERE id = ?').bind(id).run();
  if (!r.meta.changes) throw new AppError(404, 'Purchase not found');
}

export interface ProductCosting {
  product: string;
  meat: Meat;
  recipe: string;
}

export async function loadProductCosting(db: D1Database): Promise<Record<string, ProductCosting>> {
  const { results } = await db.prepare('SELECT product, meat, recipe FROM product_costing').all<ProductCosting>();
  return Object.fromEntries(results.filter((r) => isMeat(r.meat)).map((r) => [r.product, r]));
}

const RECIPE_NAME = /^[A-Za-z0-9 ]{1,30}$/;

export async function saveProductCosting(db: D1Database, body: Record<string, unknown>): Promise<void> {
  const products = await loadStockProducts(db);
  const product = String(body.product ?? '');
  if (!products.some((p) => p.key === product)) throw new AppError(404, 'Product not found');
  if (!isMeat(body.meat)) throw new AppError(400, 'Choose babi or sapi');
  const recipe = String(body.recipe ?? '').trim();
  if (!RECIPE_NAME.test(recipe)) throw new AppError(400, 'Recipe name: letters and numbers only, up to 30');
  await db
    .prepare('INSERT INTO product_costing (product, meat, recipe) VALUES (?, ?, ?) ON CONFLICT(product) DO UPDATE SET meat = excluded.meat, recipe = excluded.recipe')
    .bind(product, body.meat, recipe)
    .run();
}

/** recipe name -> ingredient key -> amount per kg of meat. */
export async function loadRecipes(db: D1Database): Promise<Record<string, Record<string, number>>> {
  const { results } = await db.prepare('SELECT recipe, ingredient, amountPerKg FROM recipe_items').all<{ recipe: string; ingredient: string; amountPerKg: number }>();
  const recipes: Record<string, Record<string, number>> = {};
  for (const r of results) (recipes[r.recipe] ??= {})[r.ingredient] = Number(r.amountPerKg);
  return recipes;
}

/** Replaces one recipe's amounts. Blank or 0 removes the ingredient from the recipe. */
export async function saveRecipe(db: D1Database, body: Record<string, unknown>): Promise<void> {
  const recipe = String(body.recipe ?? '').trim();
  if (!RECIPE_NAME.test(recipe)) throw new AppError(400, 'Recipe name: letters and numbers only, up to 30');
  const amounts = (body.amounts && typeof body.amounts === 'object' ? body.amounts : {}) as Record<string, unknown>;
  const ingredients = await listIngredients(db);
  const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM recipe_items WHERE recipe = ?').bind(recipe)];
  for (const ing of ingredients) {
    const raw = amounts[ing.key];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) throw new AppError(400, `${ing.name} must be 0 or more`);
    if (n > 0) statements.push(db.prepare('INSERT INTO recipe_items (recipe, ingredient, amountPerKg) VALUES (?, ?, ?)').bind(recipe, ing.key, n));
  }
  await db.batch(statements);
}

// ---------------------------------------------------------------------------
// Meat
// ---------------------------------------------------------------------------

export async function listMeatPurchases(db: D1Database, monthKey?: string): Promise<MeatPurchase[]> {
  const { results } = monthKey
    ? await db.prepare('SELECT * FROM meat_purchases WHERE purchaseDate LIKE ? ORDER BY purchaseDate DESC, createdAt DESC').bind(`${monthKey}-%`).all<MeatPurchase>()
    : await db.prepare('SELECT * FROM meat_purchases ORDER BY purchaseDate DESC, createdAt DESC LIMIT 200').all<MeatPurchase>();
  return results.map((r) => ({ ...r, price: Number(r.price), packs: Number(r.packs), createdAt: Number(r.createdAt) }));
}

export interface MeatCost {
  perPack: number | null; // null = no meat price at all yet
  spent: number;
  packs: number;
  fromMonth: string | null; // the month the average comes from (an earlier month when this one has no prices)
}

/** Meat cost per pack for a month: total spent / total packs; falls back to the latest earlier month with prices. */
export async function meatCostForMonth(db: D1Database, monthKey: string): Promise<Record<Meat, MeatCost>> {
  const out = {} as Record<Meat, MeatCost>;
  for (const meat of MEATS) {
    const latest = await db
      .prepare(`SELECT substr(purchaseDate, 1, 7) AS m FROM meat_purchases WHERE meat = ? AND packs > 0 AND purchaseDate < ? ORDER BY purchaseDate DESC LIMIT 1`)
      .bind(meat, `${addMonths(monthKey, 1)}-01`)
      .first<{ m: string }>();
    if (!latest) {
      out[meat] = { perPack: null, spent: 0, packs: 0, fromMonth: null };
      continue;
    }
    const sum = await db
      .prepare('SELECT COALESCE(SUM(price), 0) AS spent, COALESCE(SUM(packs), 0) AS packs FROM meat_purchases WHERE meat = ? AND purchaseDate LIKE ?')
      .bind(meat, `${latest.m}-%`)
      .first<{ spent: number; packs: number }>();
    const spent = Number(sum?.spent ?? 0);
    const packs = Number(sum?.packs ?? 0);
    out[meat] = { perPack: packs ? spent / packs : null, spent, packs, fromMonth: latest.m };
  }
  return out;
}

/** Packs per meat in a production (products without a meat set are not counted). */
export function packsPerMeat(quantities: Quantities, costing: Record<string, ProductCosting>): Record<Meat, number> {
  const packs: Record<Meat, number> = { babi: 0, sapi: 0 };
  for (const [product, qty] of Object.entries(quantities)) {
    const meat = costing[product]?.meat;
    if (meat && qty > 0) packs[meat] += qty;
  }
  return packs;
}

/**
 * Meat prices sent with a production. A price is required for every meat that has packs in it,
 * and not allowed for a meat without packs.
 */
export function parseMeatPrices(body: Record<string, unknown>, packs: Record<Meat, number>): Partial<Record<Meat, number>> {
  const source = (body.meatPrices && typeof body.meatPrices === 'object' ? body.meatPrices : {}) as Record<string, unknown>;
  const prices: Partial<Record<Meat, number>> = {};
  for (const meat of MEATS) {
    const raw = source[meat];
    const blank = raw === undefined || raw === null || String(raw).trim() === '';
    if (packs[meat] > 0) {
      if (blank) throw new AppError(400, `Enter the ${MEAT_LABELS[meat]} meat price`);
      prices[meat] = parseRupiah(raw, `${MEAT_LABELS[meat]} meat price`);
    } else if (!blank) {
      throw new AppError(400, `${MEAT_LABELS[meat]} meat price entered, but no ${MEAT_LABELS[meat]} packs`);
    }
  }
  return prices;
}

/** Statements that record the meat prices of a production (run in the production's batch). */
export function meatPurchaseStatements(
  db: D1Database,
  productionId: string,
  now: number,
  prices: Partial<Record<Meat, number>>,
  packs: Record<Meat, number>,
): D1PreparedStatement[] {
  return MEATS.filter((m) => prices[m] !== undefined && packs[m] > 0).map((meat) =>
    db
      .prepare('INSERT INTO meat_purchases (id, productionId, purchaseDate, meat, price, packs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId(), productionId, jakartaDateKey(now), meat, prices[meat], packs[meat], now),
  );
}

/** A meat price added by hand (e.g. for a production entered before prices existed, or a correction). */
export async function addMeatPurchase(db: D1Database, body: Record<string, unknown>, now = Date.now()): Promise<void> {
  const purchaseDate = parseDateKey(body.purchaseDate, 'Date');
  if (purchaseDate > jakartaDateKey(now)) throw new AppError(400, 'Date cannot be in the future');
  if (!isMeat(body.meat)) throw new AppError(400, 'Choose babi or sapi');
  const price = parseRupiah(body.price, 'Price');
  const packs = Number(body.packs);
  if (!Number.isInteger(packs) || packs <= 0) throw new AppError(400, 'Packs must be a whole number above 0');
  await db
    .prepare('INSERT INTO meat_purchases (id, productionId, purchaseDate, meat, price, packs, createdAt) VALUES (?, NULL, ?, ?, ?, ?, ?)')
    .bind(newId(), purchaseDate, body.meat, price, packs, now)
    .run();
}

export async function deleteMeatPurchase(db: D1Database, id: string): Promise<void> {
  const r = await db.prepare('DELETE FROM meat_purchases WHERE id = ?').bind(id).run();
  if (!r.meta.changes) throw new AppError(404, 'Meat price not found');
}

// ---------------------------------------------------------------------------
// HPP per product
// ---------------------------------------------------------------------------

export interface ProductHpp {
  key: string;
  label: string;
  meat: Meat | null;
  recipe: string | null;
  meatCost: number | null;
  ingredientCost: number | null;
  packaging: number;
  total: number | null; // null when meat price or recipe is missing
  missing: string[];
}

export interface HppReport {
  month: string;
  settings: CostSettings;
  meat: Record<Meat, MeatCost>;
  ingredientPrices: Record<string, IngredientPurchase & { perUnit: number }>;
  products: ProductHpp[];
}

export async function hppForMonth(db: D1Database, monthKey: string, products?: StockProduct[]): Promise<HppReport> {
  const list = products ?? (await loadStockProducts(db));
  const [settings, meat, costing, recipes, ingredients] = await Promise.all([
    loadCostSettings(db),
    meatCostForMonth(db, monthKey),
    loadProductCosting(db),
    loadRecipes(db),
    listIngredients(db),
  ]);
  const ingredientPrices = await ingredientBasePrices(db, `${monthKey}-31`);
  const names = Object.fromEntries(ingredients.map((i) => [i.key, i.name]));

  const rows = list.map((p): ProductHpp => {
    const c = costing[p.key];
    const missing: string[] = [];
    if (!c) {
      return { key: p.key, label: p.label, meat: null, recipe: null, meatCost: null, ingredientCost: null, packaging: settings.packagingPerPack, total: null, missing: ['meat and recipe not set'] };
    }
    const meatCost = meat[c.meat].perPack;
    if (meatCost === null) missing.push(`no ${MEAT_LABELS[c.meat]} meat price yet`);
    const items = recipes[c.recipe];
    let ingredientCost: number | null = null;
    if (!items || !Object.keys(items).length) missing.push(`recipe "${c.recipe}" is empty`);
    else {
      ingredientCost = 0;
      for (const [ing, perKg] of Object.entries(items)) {
        const price = ingredientPrices[ing];
        if (!price) {
          missing.push(`no price for ${names[ing] ?? ing}`);
          continue;
        }
        ingredientCost += perKg * settings.meatKgPerPack * price.perUnit;
      }
    }
    const total = missing.length || meatCost === null || ingredientCost === null ? null : meatCost + ingredientCost + settings.packagingPerPack;
    return { key: p.key, label: p.label, meat: c.meat, recipe: c.recipe, meatCost, ingredientCost, packaging: settings.packagingPerPack, total, missing };
  });
  return { month: monthKey, settings, meat, ingredientPrices, products: rows };
}

// ---------------------------------------------------------------------------
// Monthly profit
// ---------------------------------------------------------------------------

export interface ProfitLine {
  key: string;
  label: string;
  hpp: number | null;
  soldPacks: number;
  freePacks: number;
}

export interface MonthlyProfit {
  month: string;
  label: string;
  orders: number;
  resellerOrders: number;
  websiteOrders: number;
  freeOrders: number;
  resellerSales: number;
  websiteSales: number;
  sales: number;
  hppSold: number;
  freeBoxCost: number;
  paymentFees: number;
  deliveryCharged: number; // delivery fees website customers paid (income)
  courierFees: number; // delivery fees the owner paid the courier (cost)
  adSpend: number; // Meta + Google ad spend in the month (as the ad platforms report it, before tax)
  adTax: number; // PPN the ad platforms add on top (AD_TAX_PERCENT)
  missingCourierFee: string[]; // order numbers delivered/shipped without a delivery fee entered
  profit: number;
  lines: ProfitLine[];
  missingHpp: string[]; // products sold without a complete HPP (their cost is counted as 0)
  hpp: HppReport;
}

/**
 * What a reseller pays for an order. Payday Promo: every full set of 3 packs costs the Payday price,
 * the packs left over cost the normal reseller price (8 packs = 2 x 350.000 + 2 x 140.000 = 980.000).
 */
export function resellerOrderPrice(packs: number, isPayday: boolean, s: Pick<CostSettings, 'resellerPrice' | 'paydayPricePer3'>): number {
  if (!isPayday) return packs * s.resellerPrice;
  const sets = Math.floor(packs / 3);
  return sets * s.paydayPricePer3 + (packs - sets * 3) * s.resellerPrice;
}

/**
 * Orders of the month by order date (Jakarta), not cancelled; website orders only once paid.
 *   Reseller order: packs x reseller price; Payday Promo: see resellerOrderPrice.
 *   Website order: what was paid for the products (subtotal - voucher discount, delivery fee left out),
 *                  minus the payment fee on the amount paid.
 *   Free order: no sales; its packs cost their HPP.
 *   Delivery: what website customers paid for delivery is income; the delivery fee the owner paid
 *             the courier (entered when shipping / marking delivered) is a cost, for every order.
 * Cash rewards (reseller tiers, parent transfers) are not included.
 */
/**
 * PPN Meta (and Google) add on top of the ad spend they report. Owner 14 Nov 2026: profit must include ad spend with
 * VAT. Meta's own receipt of 8 Nov 2026 shows 11% (Rp1.673.120 + Rp184.043 tax), so 11% here.
 */
export const AD_TAX_PERCENT = 11;

/** Meta + Google ad spend for the days of a month (YYYY-MM), from the synced insight tables. 0 if a table is missing. */
async function adSpendForMonth(db: D1Database, monthKey: string): Promise<number> {
  const from = `${monthKey}-01`;
  const to = `${addMonths(monthKey, 1)}-01`;
  let total = 0;
  for (const table of ['meta_ad_insights', 'google_ad_insights']) {
    try {
      const row = await db.prepare(`SELECT COALESCE(SUM(spend), 0) AS spend FROM ${table} WHERE date >= ? AND date < ?`).bind(from, to).first<{ spend: number }>();
      total += Number(row?.spend ?? 0);
    } catch {
      /* table not there (old test databases) */
    }
  }
  return total;
}

export async function monthlyProfit(db: D1Database, monthKey: string): Promise<MonthlyProfit> {
  const products = await loadStockProducts(db);
  const hpp = await hppForMonth(db, monthKey, products);
  const { start, end } = monthRange(monthKey);
  const { results } = await db
    .prepare(
      `SELECT o.*, s.orderRowId AS shopRowId, s.subtotal AS shopSubtotal, s.discount AS shopDiscount, s.total AS shopTotal,
              s.deliveryFee AS shopDeliveryFee, s.shippedAt AS shopShippedAt
       FROM orders o LEFT JOIN shop_orders s ON s.orderRowId = o.id
       WHERE o.orderStatus = 'ACTIVE' AND o.date >= ? AND o.date < ? AND ${COUNTED_ORDER}`,
    )
    .bind(start, end)
    .all<Record<string, unknown>>();

  const s = hpp.settings;
  const lines: ProfitLine[] = hpp.products.map((p) => ({ key: p.key, label: p.label, hpp: p.total, soldPacks: 0, freePacks: 0 }));
  const byKey = Object.fromEntries(lines.map((l) => [l.key, l]));
  const r = { orders: 0, resellerOrders: 0, websiteOrders: 0, freeOrders: 0, resellerSales: 0, websiteSales: 0, paymentFees: 0, deliveryCharged: 0, courierFees: 0 };
  const missingCourierFee: string[] = [];

  for (const o of results) {
    r.orders++;
    const free = o.paymentStatus === 'FREE';
    let packs = 0;
    for (const p of products) {
      const qty = Number(o[p.key] ?? 0);
      if (qty <= 0) continue;
      packs += qty;
      if (free) byKey[p.key].freePacks += qty;
      else byKey[p.key].soldPacks += qty;
    }
    if (o.courierFee === null || o.courierFee === undefined) {
      const shipped = o.deliveryStatus === 'DELIVERED' || (o.shopShippedAt !== null && o.shopShippedAt !== undefined);
      if (shipped) missingCourierFee.push(String(o.orderId));
    } else r.courierFees += Number(o.courierFee);
    if (free) r.freeOrders++;
    else if (o.shopRowId !== null && o.shopRowId !== undefined) {
      r.websiteOrders++;
      r.websiteSales += Number(o.shopSubtotal ?? 0) - Number(o.shopDiscount ?? 0);
      r.paymentFees += (Number(o.shopTotal ?? 0) * s.paymentFeePercent) / 100;
      r.deliveryCharged += Number(o.shopDeliveryFee ?? 0);
    } else {
      r.resellerOrders++;
      const isPayday = o.isPaydayPromo === 1 || o.isPaydayPromo === true || o.isPaydayPromo === '1';
      r.resellerSales += resellerOrderPrice(packs, isPayday, s);
    }
  }

  const missingHpp = lines.filter((l) => l.hpp === null && l.soldPacks + l.freePacks > 0).map((l) => l.label);
  const hppSold = lines.reduce((t, l) => t + l.soldPacks * (l.hpp ?? 0), 0);
  const freeBoxCost = lines.reduce((t, l) => t + l.freePacks * (l.hpp ?? 0), 0);
  const sales = r.resellerSales + r.websiteSales;
  const round = Math.round;
  const adSpend = round(await adSpendForMonth(db, monthKey));
  const adTax = round((adSpend * AD_TAX_PERCENT) / 100);
  return {
    month: monthKey,
    label: monthLabel(monthKey),
    ...r,
    resellerSales: round(r.resellerSales),
    websiteSales: round(r.websiteSales),
    paymentFees: round(r.paymentFees),
    deliveryCharged: round(r.deliveryCharged),
    courierFees: round(r.courierFees),
    adSpend,
    adTax,
    missingCourierFee,
    sales: round(sales),
    hppSold: round(hppSold),
    freeBoxCost: round(freeBoxCost),
    profit: round(sales + r.deliveryCharged - hppSold - freeBoxCost - r.paymentFees - r.courierFees) - adSpend - adTax,
    lines,
    missingHpp,
    hpp,
  };
}
