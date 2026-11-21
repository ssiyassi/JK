// Bundle packages (Paket Hemat). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { priceCart } from '../src/lib/shop/pricing.ts';
import {
  bundleClosesAt,
  bundleLines,
  bundleOpensAt,
  bundleStats,
  isBundleLive,
  weekdaysLabel,
  bundleTotals,
  createBundle,
  deleteBundle,
  groupOrderLines,
  loadShopBundles,
  orderDisplayLines,
  packLines,
  parseBundleInput,
  parseCartBundles,
  setBundleActive,
  slugify,
  updateBundle,
  type Bundle,
} from '../src/lib/shop/bundles.ts';
import { placeOrder, quote } from '../src/lib/shop/orders.ts';
import { loadCatalog } from '../src/lib/shop/products.ts';
import { setPaymentPaid } from '../src/lib/core/orders.ts';
import type { CatalogItem } from '../src/lib/shop/catalog.ts';
import type { Guest } from '../src/lib/shop/customers.ts';

const CATALOG: CatalogItem[] = (['babiManis', 'babiAsin', 'sapiManis', 'sapiAsin'] as const).map((product, i) => ({
  product, stockColumn: product, shortName: null, boxValue: 1, name: `${product} name`, size: '500 gram', description: '', price: 160000, compareAtPrice: 200000, image: '', accent: '', visible: true, sortOrder: i,
}));
const ALL = CATALOG.map((p) => p.product);
const NOW = Date.parse('2026-11-16T02:00:00Z'); // Monday 09:00 WIB

function bundle(over: Partial<Bundle> = {}): Bundle {
  return {
    id: 'b1', slug: 'paket-hemat-3-box', name: 'Paket Hemat 3 Box', tagline: '', slots: [ALL, ALL, ALL], price: 400000,
    freeDelivery: true, voucherAllowed: false, active: true, startsAt: null, endsAt: null, weekdays: null, sortOrder: 0, createdAt: 0, updatedAt: 0, ...over,
  };
}

test('bundle totals: today\'s price and the crossed-out price per pick', () => {
  assert.deepEqual(bundleTotals(bundle(), CATALOG), { normal: 480000, compareAt: 600000 });
});

test('bundle lines add up to the bundle price, one line per product where possible', () => {
  const sum = (ls: { price: number; qty: number }[]) => ls.reduce((s, l) => s + l.price * l.qty, 0);
  const mixed = bundleLines(bundle(), ['babiManis', 'sapiManis', 'babiManis'], CATALOG, '1');
  assert.equal(sum(mixed), 400000);
  assert.equal(mixed.length, 2); // 2× babi manis + 1× sapi manis (the single pack takes the leftover Rupiah)
  assert.deepEqual(mixed.map((l) => [l.product, l.qty, l.price]), [['babiManis', 2, 133333], ['sapiManis', 1, 133334]]);
  assert.ok(mixed.every((l) => l.bundle?.id === 'b1' && l.bundle.compareAt === 600000));
  const same = bundleLines(bundle(), ['babiAsin', 'babiAsin', 'babiAsin'], CATALOG, '1');
  assert.equal(sum(same), 400000);
  assert.equal(same.reduce((n, l) => n + l.qty, 0), 3);
  const even = bundleLines(bundle({ price: 390000 }), ['babiAsin', 'babiAsin', 'sapiAsin'], CATALOG, '1');
  assert.deepEqual(even.map((l) => [l.qty, l.price]), [[2, 130000], [1, 130000]]);
});

test('pricing with a bundle: free delivery, no voucher on the bundle, voucher still on other products', () => {
  const b = [{ bundle: bundle(), picks: ['babiManis', 'babiAsin', 'sapiManis'] }];
  const only = priceCart({}, { percent: 35, capAmount: 150000 }, CATALOG, 'Bandung', b);
  assert.equal(only.subtotal, 400000);
  assert.equal(only.voucherBase, 0);
  assert.equal(only.discount, 0);
  assert.equal(only.deliveryFee, 0); // courier city, 3 packs: normally Rp25.000
  assert.equal(only.total, 400000);
  assert.equal(only.totalPacks, 3);
  assert.deepEqual(only.stockQuantities, { babiManis: 1, babiAsin: 1, sapiManis: 1 });
  const mixed = priceCart({ sapiAsin: 1 }, { percent: 35, capAmount: 150000 }, CATALOG, undefined, b);
  assert.equal(mixed.voucherBase, 160000);
  assert.equal(mixed.discount, 56000); // 35% of the single pack only
  assert.equal(mixed.total, 560000 - 56000);
  // A bundle that allows vouchers and has no free delivery.
  const open = priceCart({}, { percent: 10, capAmount: null }, CATALOG, 'Bandung', [{ bundle: bundle({ voucherAllowed: true, freeDelivery: false }), picks: ALL.slice(0, 3) }]);
  assert.equal(open.discount, 40000);
  assert.equal(open.deliveryFee, 25000);
});

test('cart bundles are checked: live bundle, right number of picks, allowed products only', () => {
  const limited = bundle({ slots: [ALL, ALL, ['babiManis', 'babiAsin']] });
  assert.deepEqual(parseCartBundles([{ bundleId: 'b1', picks: ['sapiManis', 'sapiAsin', 'babiAsin'] }], [limited], CATALOG, NOW), [
    { bundleId: 'b1', picks: ['sapiManis', 'sapiAsin', 'babiAsin'] },
  ]);
  assert.throws(() => parseCartBundles([{ bundleId: 'b1', picks: ['sapiManis', 'sapiAsin', 'sapiAsin'] }], [limited], CATALOG, NOW), /sudah berubah/);
  assert.throws(() => parseCartBundles([{ bundleId: 'b1', picks: ['sapiManis'] }], [limited], CATALOG, NOW), /Pilih 3 pack/);
  assert.throws(() => parseCartBundles([{ bundleId: 'b1', picks: ALL.slice(0, 3) }], [bundle({ active: false })], CATALOG, NOW), /tidak tersedia/);
  assert.throws(() => parseCartBundles([{ bundleId: 'b1', picks: ALL.slice(0, 3) }], [bundle({ endsAt: NOW - 1 })], CATALOG, NOW), /tidak tersedia/);
  assert.throws(() => parseCartBundles([{ bundleId: 'nope', picks: [] }], [bundle()], CATALOG, NOW), /tidak tersedia/);
  // A hidden product in a pick is never allowed.
  const hidden = CATALOG.map((p) => (p.product === 'sapiAsin' ? { ...p, visible: false } : p));
  assert.throws(() => parseCartBundles([{ bundleId: 'b1', picks: ['sapiAsin', 'babiAsin', 'babiAsin'] }], [bundle()], hidden, NOW), /sudah berubah/);
  assert.deepEqual(parseCartBundles(undefined, [], CATALOG, NOW), []);
});

test('admin input: name, picks, price and dates', () => {
  const ok = parseBundleInput({ name: ' Paket Hemat ', slots: [ALL, ['babiManis', 'x'], ALL], price: 400000, freeDelivery: true, active: true }, CATALOG);
  assert.equal(ok.name, 'Paket Hemat');
  assert.deepEqual(ok.slots[1], ['babiManis']);
  assert.equal(ok.voucherAllowed, false);
  assert.throws(() => parseBundleInput({ name: '', slots: [ALL], price: 400000 }, CATALOG), /Name/);
  assert.throws(() => parseBundleInput({ name: 'A', slots: [ALL, []], price: 400000 }, CATALOG), /Product 2/);
  assert.throws(() => parseBundleInput({ name: 'A', slots: [ALL], price: 0 }, CATALOG), /Final price/);
  assert.throws(() => parseBundleInput({ name: 'A', slots: [ALL], price: 400000, startsAt: 10, endsAt: 5 }, CATALOG), /End date/);
  assert.equal(slugify('Paket Hemat 3 Box!'), 'paket-hemat-3-box');
});

test('display: a bundle is one row for customers, packs per product for the owner', () => {
  const lines = [...bundleLines(bundle(), ['babiManis', 'babiManis', 'babiManis'], CATALOG, '1'), { product: 'sapiAsin', name: 'Sapi Marinade Asin Gurih', price: 160000, qty: 1, stockColumn: 'sapiAsin' }];
  const shown = orderDisplayLines(lines);
  assert.deepEqual(shown, [
    { label: 'Paket Hemat 3 Box (3× babiManis name)', amount: 400000 },
    { label: 'Sapi Marinade Asin Gurih × 1', amount: 160000 },
  ]);
  assert.deepEqual(packLines(lines), [{ name: 'babiManis name (Paket Hemat 3 Box)', qty: 3 }, { name: 'Sapi Marinade Asin Gurih', qty: 1 }]);
  assert.equal(groupOrderLines(lines).bundles.length, 1);
});

// ---------- With the database ----------

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'jentis-bundles-'));
  const db = sqliteD1(join(dir, 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0004_shop_payments.sql', '0005_shop_content.sql', '0023_payday_promo.sql', '0024_promo_photos.sql', '0006_website_only_products.sql', '0007_banner_mobile_image.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql', '0011_delivered_at.sql', '0012_payment_gateway.sql', '0013_customer_disabled.sql', '0025_email_verification.sql', '0014_rate_limits.sql', '0015_stock_product_short_name.sql', '0016_product_box_value.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0028_guest_checkout.sql', '0029_checkout_accounts_confirmed.sql', '0030_new_customer_discount.sql', '0032_days_off.sql', '0033_payment_method.sql', '0051_payment_channel.sql', '0052_owner_orders.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql', '0047_bundles.sql', '0049_bundle_weekdays.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  db.raw.exec(`INSERT INTO current_inventory VALUES ('current', 10, 10, 10, 10, 0);`);
  return db;
}

const guest: Guest = { guest: true, email: null, phone: null, createAccount: false };
const address = { recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. Mawar 1, Jakarta Pusat' };

test('bundles in the database: create, edit, switch off, order, stats, delete', async () => {
  const db = freshDb();
  const catalog = await loadCatalog(db);
  const ids = catalog.filter((p) => p.visible).map((p) => p.product);
  const input = parseBundleInput({ name: 'Paket Hemat 3 Box', tagline: 'Pilih 3 pack bebas', slots: [ids, ids, ids], price: 400000, freeDelivery: true, active: true }, catalog);
  const b = await createBundle(db, input, NOW);
  assert.equal(b.slug, 'paket-hemat-3-box');
  const second = await createBundle(db, { ...input, active: false }, NOW);
  assert.equal(second.slug, 'paket-hemat-3-box-2');
  assert.deepEqual((await loadShopBundles(db, catalog, NOW)).map((x) => x.id), [b.id]);

  // Guest with the new-customer discount on, cart with only the bundle: no discount, and the discount is not used up.
  const picks = [ids[0], ids[0], ids[2]];
  const { order } = await placeOrder(db, guest, { items: {}, bundles: [{ bundleId: b.id, picks }], address, newCustomerDiscount: true }, 'k1', NOW);
  assert.equal(order.subtotal, 400000);
  assert.equal(order.discount, 0);
  assert.equal(order.deliveryFee, 0);
  assert.equal(order.total, 400000);
  assert.equal(order.newCustomerDiscount, false);
  assert.equal(order.lines.reduce((n, l) => n + l.qty, 0), 3);
  assert.ok(order.lines.every((l) => l.bundle?.name === 'Paket Hemat 3 Box'));
  const row = db.raw.prepare(`SELECT ${ids[0]} AS a, ${ids[2]} AS c FROM orders WHERE id = ?`).get(order.orderRowId) as { a: number; c: number };
  assert.deepEqual([row.a, row.c], [2, 1]);

  // A typed voucher on a bundle-only cart is refused with a clear message.
  await assert.rejects(quote(db, guest, { items: {}, bundles: [{ bundleId: b.id, picks }], voucherCode: 'ABC' }, NOW), /Voucher tidak bisa dipakai untuk Paket Hemat 3 Box/);
  // Bundle plus a loose pack: the new-customer discount works on the loose pack only.
  const mixed = await placeOrder(db, { ...guest }, { items: { [ids[1]]: 1 }, bundles: [{ bundleId: b.id, picks }], address: { ...address, recipientPhone: '081299990000' }, newCustomerDiscount: true }, 'k2', NOW);
  const loosePrice = catalog.find((p) => p.product === ids[1])!.price;
  assert.equal(mixed.order.subtotal, 400000 + loosePrice);
  assert.ok(mixed.order.discount > 0 && mixed.order.discount <= loosePrice);
  assert.equal(mixed.order.newCustomerDiscount, true);

  // Stats count paid orders only.
  assert.deepEqual(await bundleStats(db, NOW), {});
  await setPaymentPaid(db, order.orderRowId);
  assert.deepEqual((await bundleStats(db, NOW))[b.id], { sold: 1, thisWeek: 1, sales: 400000 });

  // Edit keeps the link; switching off hides it and refuses new orders.
  const edited = await updateBundle(db, b.id, { ...input, name: 'Paket Baru', price: 390000 }, NOW + 1);
  assert.equal(edited.slug, 'paket-hemat-3-box');
  assert.equal(edited.price, 390000);
  await setBundleActive(db, b.id, false, NOW + 2);
  assert.equal((await loadShopBundles(db, catalog, NOW)).length, 0);
  await assert.rejects(placeOrder(db, guest, { items: {}, bundles: [{ bundleId: b.id, picks }], address }, 'k3', NOW), /tidak tersedia/);

  // Ordered bundles cannot be deleted; unused ones can.
  await assert.rejects(deleteBundle(db, b.id), /already ordered/);
  await deleteBundle(db, second.id);
  assert.equal(Number((db.raw.prepare('SELECT COUNT(*) AS n FROM shop_bundles').get() as { n: number }).n), 1);
});

test('weekly bundle (Thursday–Sunday): open, countdown end and next opening in Jakarta time', () => {
  const weekend = bundle({ weekdays: [4, 5, 6, 0] });
  const wib = (s: string) => Date.parse(`${s}+07:00`);
  const sundayEnd = wib('2026-11-29T23:59:59.999');
  assert.equal(weekdaysLabel([4, 5, 6, 0]), 'Kamis–Minggu');
  // Monday 16 Nov: closed, opens Thursday 19 Nov 00:00 WIB.
  assert.equal(isBundleLive(weekend, CATALOG, NOW), false);
  assert.equal(bundleOpensAt(weekend, NOW), wib('2026-11-19T00:00:00'));
  // Wednesday 23:59 still closed; Thursday 00:00 open until Sunday 23:59:59.
  assert.equal(isBundleLive(weekend, CATALOG, wib('2026-11-25T23:59:00')), false);
  assert.equal(isBundleLive(weekend, CATALOG, wib('2026-11-26T00:00:00')), true);
  assert.equal(bundleClosesAt(weekend, wib('2026-11-26T00:00:00')), sundayEnd);
  assert.equal(bundleClosesAt(weekend, wib('2026-11-29T22:00:00')), sundayEnd);
  assert.equal(isBundleLive(weekend, CATALOG, wib('2026-11-30T00:00:00')), false);
  // An end date sooner than Sunday wins; a bundle without days has no countdown.
  assert.equal(bundleClosesAt(bundle({ weekdays: [4, 5, 6, 0], endsAt: wib('2026-11-27T12:00:00') }), wib('2026-11-26T09:00:00')), wib('2026-11-27T12:00:00'));
  assert.equal(bundleClosesAt(bundle(), NOW), null);
  // Saved from the admin form; an empty list is refused, all 7 days = every day.
  assert.deepEqual(parseBundleInput({ name: 'P', slots: [ALL], price: 100000, weekdays: [4, 5, 6, 0] }, CATALOG).weekdays, [4, 5, 6, 0]);
  assert.equal(parseBundleInput({ name: 'P', slots: [ALL], price: 100000, weekdays: [0, 1, 2, 3, 4, 5, 6] }, CATALOG).weekdays, null);
  assert.throws(() => parseBundleInput({ name: 'P', slots: [ALL], price: 100000, weekdays: [] }, CATALOG), /at least one day/);
});
