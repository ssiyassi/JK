// HPP (cost per pack) and monthly profit. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { addProduction } from '../src/lib/core/inventory.ts';
import { cancelOrder, createOrder, listOrders, setCourierFee, setDelivered } from '../src/lib/core/orders.ts';
import { createReseller } from '../src/lib/core/resellers.ts';
import {
  addIngredientPurchases,
  addMeatPurchase,
  hppForMonth,
  loadProductCosting,
  meatCostForMonth,
  meatPurchaseStatements,
  monthKeyOf,
  monthlyProfit,
  monthRange,
  resellerOrderPrice,
  packsPerMeat,
  parseMeatPrices,
  saveRecipe,
} from '../src/lib/core/costs.ts';
import { monthlyProfitEmail } from '../src/lib/shop/email.ts';

// Test recipe (made-up amounts per kg of meat; the real recipe lives only in the production database).
const MANIS = { minyak: 10, kecap: 10, hitam: 10, tepung: 10, gula: 10 };
const ASIN = { minyak: 10, kecap: 10, hitam: 10, tepung: 10, bumbu: 10 };

async function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-costs-')), 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0005_shop_content.sql', '0023_payday_promo.sql', '0024_promo_photos.sql', '0006_website_only_products.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql', '0011_delivered_at.sql', '0015_stock_product_short_name.sql', '0016_product_box_value.sql', '0017_reseller_phone.sql', '0037_reseller_label_name.sql', '0018_hpp.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0028_guest_checkout.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  db.raw.exec(`INSERT INTO current_inventory VALUES ('initial', 1, 1, 1, 1, 0), ('current', 500, 500, 500, 500, 0);`);
  await saveRecipe(db, { recipe: 'Manis', amounts: MANIS });
  await saveRecipe(db, { recipe: 'Asin', amounts: ASIN });
  return db;
}

// Ingredient cost per gram/ml from the starting prices.
const perUnit = { minyak: 49800 / 2000, kecap: 171000 / 6500, hitam: 25500 / 600, tepung: 30120 / 1000, gula: 17500 / 1000, bumbu: 30000 / 460 };
const recipeCost = (r: Record<string, number>, kgPerPack = 0.5) =>
  Object.entries(r).reduce((t, [k, g]) => t + g * kgPerPack * perUnit[k as keyof typeof perUnit], 0);

test('October 2026: meat = total spent / total packs, plus ingredients and packaging', async () => {
  const db = await freshDb();
  const meat = await meatCostForMonth(db, '2026-10');
  assert.equal(meat.babi.spent, 3400000);
  assert.equal(meat.babi.packs, 71);
  assert.equal(meat.sapi.spent, 7769000);
  assert.equal(meat.sapi.packs, 121);

  const hpp = await hppForMonth(db, '2026-10');
  const by = Object.fromEntries(hpp.products.map((p) => [p.key, p]));
  assert.equal(by.babiManis.meat, 'babi');
  assert.equal(by.sapiAsin.recipe, 'Asin');
  assert.ok(Math.abs(by.babiManis.total! - (3400000 / 71 + recipeCost(MANIS) + 1150)) < 1e-6);
  assert.ok(Math.abs(by.sapiAsin.total! - (7769000 / 121 + recipeCost(ASIN) + 1150)) < 1e-6);
  assert.deepEqual(by.babiAsin.missing, []);
});

test('a month without meat prices uses the latest earlier month; before any price there is no HPP', async () => {
  const db = await freshDb();
  const dec = await meatCostForMonth(db, '2026-12');
  assert.equal(dec.babi.fromMonth, '2026-10');
  assert.equal(dec.babi.perPack, 3400000 / 71);
  const sep = await hppForMonth(db, '2026-09');
  assert.equal(sep.products[0].total, null);
  assert.ok(sep.products[0].missing.some((m) => m.includes('meat price')));

  // A new month with its own price starts fresh (no mixing with October).
  await addMeatPurchase(db, { purchaseDate: '2026-11-02', meat: 'babi', price: 2000000, packs: 40 }, Date.parse('2026-11-05T00:00:00Z'));
  assert.equal((await meatCostForMonth(db, '2026-11')).babi.perPack, 50000);
  assert.equal((await meatCostForMonth(db, '2026-11')).sapi.fromMonth, '2026-10');
});

test('ingredients: the newest purchase replaces the base price; older ones stay as history', async () => {
  const db = await freshDb();
  await addIngredientPurchases(db, { shopDate: '2026-10-20', items: [{ ingredient: 'gula', size: '2000', price: '30.000' }, { ingredient: 'minyak', size: 1000, price: 30000 }] }, Date.parse('2026-10-21T00:00:00Z'));
  const oct = await hppForMonth(db, '2026-10');
  assert.equal(oct.ingredientPrices.gula.perUnit, 15);
  assert.equal(oct.ingredientPrices.minyak.perUnit, 30);
  assert.equal(oct.ingredientPrices.kecap.perUnit, 171000 / 6500);
  const history = db.raw.prepare(`SELECT COUNT(*) AS n FROM ingredient_purchases WHERE ingredient = 'gula'`).get() as { n: number };
  assert.equal(history.n, 2);

  await assert.rejects(addIngredientPurchases(db, { shopDate: '2026-10-20', items: [] }, Date.parse('2026-10-21T00:00:00Z')), /at least one/);
  await assert.rejects(addIngredientPurchases(db, { shopDate: '2026-10-20', items: [{ ingredient: 'garam', size: 1, price: 1 }] }, Date.parse('2026-10-21T00:00:00Z')), /choose an ingredient/);
  await assert.rejects(addIngredientPurchases(db, { shopDate: '2026-10-20', items: [{ ingredient: 'gula', size: 0, price: 1 }] }, Date.parse('2026-10-21T00:00:00Z')), /size/);
  await assert.rejects(addIngredientPurchases(db, { shopDate: '2099-01-01', items: [{ ingredient: 'gula', size: 1, price: 1 }] }), /future/);
});

test('production: a meat price is required for each meat with packs, and saved in the same batch', async () => {
  const db = await freshDb();
  const costing = await loadProductCosting(db);
  const q = { babiManis: 20, babiAsin: 18, sapiManis: 0, sapiAsin: 0 };
  const packs = packsPerMeat(q, costing);
  assert.deepEqual(packs, { babi: 38, sapi: 0 });
  assert.throws(() => parseMeatPrices({}, packs), /Babi meat price/);
  assert.throws(() => parseMeatPrices({ meatPrices: { babi: '1700000', sapi: '1' } }, packs), /no Sapi packs/);
  assert.throws(() => parseMeatPrices({ meatPrices: { babi: '100000010000' } }, packs), /too high/);
  const prices = parseMeatPrices({ meatPrices: { babi: '1.700.000' } }, packs);
  assert.deepEqual(prices, { babi: 1700000 });

  await addProduction(db, q, 'key-1', (id, now) => meatPurchaseStatements(db, id, now, prices, packs));
  await addProduction(db, q, 'key-1', (id, now) => meatPurchaseStatements(db, id, now, prices, packs)); // retry: no double
  const rows = db.raw.prepare(`SELECT m.packs, m.price, h.type FROM meat_purchases m JOIN stock_movement_history h ON h.id = m.productionId`).all();
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0] }, { packs: 38, price: 1700000, type: 'PRODUCTION' });
});

test('profit: reseller price, Payday 350k per 3, free boxes cost HPP, cancelled orders left out', async () => {
  const db = await freshDb();
  await createReseller(db, { reseller: 'Budi' });
  const order = async (over: Record<string, unknown>) => {
    const { order: o } = await createOrder(db, {
      reseller: 'Budi', parentReseller: null, recipientName: 'X', phone: '0812', address: 'Jl. A',
      deliveryDate: '2026-10-20', promo: 'None', babiManis: 0, babiAsin: 0, sapiManis: 0, sapiAsin: 0, ...over,
    }, null);
    db.raw.prepare('UPDATE orders SET date = ? WHERE id = ?').run(Date.parse('2026-10-15T05:00:00Z'), o.id);
    return o;
  };
  const first = await order({ babiManis: 2 }); // 2 x 140.000
  await order({ promo: 'Payday Promo', sapiManis: 3, babiAsin: 3 }); // 6 x 350.000 / 3
  await order({ promo: 'Payday Promo', babiManis: 5, sapiAsin: 3 }); // 8 packs: 2 x 350.000 + 2 x 140.000
  await order({ isFree: true, sapiAsin: 1 });
  const cancelled = await order({ babiManis: 10 });
  await cancelOrder(db, cancelled.id);
  const nov = await order({ babiManis: 5 });
  db.raw.prepare('UPDATE orders SET date = ? WHERE id = ?').run(Date.parse('2026-10-31T17:00:00Z'), nov.id); // 1 Nov 00:00 WIB

  await setDelivered(db, first.id, '25.000'); // delivery fee paid by the owner: a cost
  const free = (await listOrders(db)).find((o) => o.paymentStatus === 'FREE')!;
  await db.prepare("UPDATE orders SET deliveryStatus = 'DELIVERED' WHERE id = ?").bind(free.id).run(); // no fee entered
  await assert.rejects(setDelivered(db, nov.id), /Enter the delivery fee/);
  await assert.rejects(setCourierFee(db, nov.id, -1), /whole rupiah/);
  await assert.rejects(setCourierFee(db, nov.id, 5_000_000), /too high/);

  const p = await monthlyProfit(db, '2026-10');
  assert.equal(p.courierFees, 25000);
  assert.equal(p.deliveryCharged, 0);
  assert.deepEqual(p.missingCourierFee, [free.orderId]);
  const h = Object.fromEntries(p.hpp.products.map((x) => [x.key, x.total!]));
  assert.equal(p.orders, 4);
  assert.equal(p.resellerOrders, 3);
  assert.equal(p.freeOrders, 1);
  assert.equal(p.resellerSales, 280000 + 700000 + 980000);
  assert.equal(p.websiteSales, 0);
  assert.equal(p.hppSold, Math.round(7 * h.babiManis + 3 * h.sapiManis + 3 * h.babiAsin + 3 * h.sapiAsin));
  assert.equal(p.freeBoxCost, Math.round(h.sapiAsin));
  assert.equal(p.profit, Math.round(1960000 - (7 * h.babiManis + 3 * h.sapiManis + 3 * h.babiAsin + 3 * h.sapiAsin) - h.sapiAsin - 25000));

  const email = monthlyProfitEmail('owner@example.test', p, { shopUrl: 'https://jentiskitchen.id', adminUrl: 'https://admin.jentiskitchen.id' });
  assert.match(email.subject, /^Profit October 2026: Rp/);
  assert.match(email.html, /inventory\/hpp\?month=2026-10/);
  assert.match(email.html, /Free reward boxes \(1 packs\)/);
  assert.match(email.html, /Delivery fees you paid/);
  assert.match(email.html, /no delivery fee yet/);
  assert.doesNotMatch(email.html, /amountPerKg|recipe_items/);
});

test('Payday Promo: full sets of 3 at the Payday price, leftover packs at the normal price', () => {
  const s = { resellerPrice: 140000, paydayPricePer3: 350000 };
  assert.equal(resellerOrderPrice(8, true, s), 980000);
  assert.equal(resellerOrderPrice(6, true, s), 700000);
  assert.equal(resellerOrderPrice(2, true, s), 280000);
  assert.equal(resellerOrderPrice(8, false, s), 1120000);
});

test('months follow the Jakarta calendar', () => {
  assert.equal(monthKeyOf(Date.parse('2026-10-31T16:59:59Z')), '2026-10');
  assert.equal(monthKeyOf(Date.parse('2026-10-31T17:00:00Z')), '2026-11');
  assert.deepEqual(monthRange('2026-12'), { start: Date.parse('2026-11-30T17:00:00Z'), end: Date.parse('2026-12-31T17:00:00Z') });
});

test('HPP lock: emailed code unlocks for 12 hours; wrong codes, old codes and too many tries are refused', async () => {
  const { createOtp, verifyOtp, isUnlocked, lock, maskedEmail } = await import('../src/lib/core/hpp-lock.ts');
  const db = await freshDb();
  db.raw.exec(readFileSync(new URL('../migrations/0019_hpp_otp.sql', import.meta.url), 'utf8'));
  const t0 = Date.parse('2026-10-17T10:00:00Z');
  assert.equal(maskedEmail('yuwonochaiyadi@gmail.com'), 'yu•••••@gmail.com');

  const first = await createOtp(db, t0);
  assert.match(first, /^\d{6}$/);
  await assert.rejects(createOtp(db, t0 + 10_000), /Wait 30 seconds/);
  const code = await createOtp(db, t0 + 31_000); // the first code stops working
  if (first !== code) await assert.rejects(verifyOtp(db, first, t0 + 40_000), /Wrong code/);
  const wrong = code === '000000' ? '111111' : '000000';
  await assert.rejects(verifyOtp(db, wrong, t0 + 41_000), /Wrong code\. \d tr/);
  const token = await verifyOtp(db, code, t0 + 42_000);
  assert.equal(await isUnlocked(db, token, t0 + 11 * 3600_000), true);
  assert.equal(await isUnlocked(db, token, t0 + 13 * 3600_000), false);
  assert.equal(await isUnlocked(db, 'made-up', t0), false);
  await assert.rejects(verifyOtp(db, code, t0 + 50_000), /expired/); // a code works once
  await lock(db, token);
  assert.equal(await isUnlocked(db, token, t0 + 60_000), false);

  // Expired after 10 minutes; at most 5 tries.
  const late = await createOtp(db, t0 + 120_000);
  await assert.rejects(verifyOtp(db, late, t0 + 120_000 + 11 * 60_000), /expired/);
  const c = await createOtp(db, t0 + 200_000);
  const bad = c === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await assert.rejects(verifyOtp(db, bad, t0 + 201_000), /Wrong code/);
  await assert.rejects(verifyOtp(db, c, t0 + 202_000), /Too many wrong tries/);

  // Many guesses sent at the same moment still get only 5 tries.
  const d = await createOtp(db, t0 + 300_000);
  const guesses = Array.from({ length: 20 }, (_, i) => String(i).padStart(6, '0')).filter((g) => g !== d);
  await Promise.allSettled(guesses.map((g) => verifyOtp(db, g, t0 + 301_000)));
  const row = db.raw.prepare('SELECT attempts FROM hpp_otp_codes WHERE usedAt IS NULL').get() as { attempts: number };
  assert.equal(row.attempts, 5);
  await assert.rejects(verifyOtp(db, d, t0 + 302_000), /Too many wrong tries/);
});
