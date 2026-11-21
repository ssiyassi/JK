// Run with: npm test   (Node 22+, no install needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { orderIdPrefix, jakartaWeek, rewardPeriod, parseBaseDate, jakartaDateKey, websiteDeliveryDateKey, deliveryDateFromKey, websiteDeliveryOptions } from '../src/lib/core/time.ts';
import { createOrder, cancelOrder, editOrder, setPaymentPaid, setDelivered, calculateBoxCounter } from '../src/lib/core/orders.ts';
import { addProduction, adjustStock, getInventory } from '../src/lib/core/inventory.ts';
import { resellerSalesReport, deleteReseller } from '../src/lib/core/resellers.ts';

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'jentis-'));
  const db = sqliteD1(join(dir, 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0005_shop_content.sql', '0023_payday_promo.sql', '0024_promo_photos.sql', '0006_website_only_products.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql', '0011_delivered_at.sql', '0015_stock_product_short_name.sql', '0016_product_box_value.sql', '0017_reseller_phone.sql', '0037_reseller_label_name.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0028_guest_checkout.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  db.raw.exec(`
    INSERT INTO current_inventory VALUES ('initial', 1, 1, 1, 1, 0), ('current', 10, 10, 10, 10, 0);
    INSERT INTO resellers (id, reseller, parentReseller, createdAt, updatedAt) VALUES ('r1', 'Alang', NULL, 0, 0), ('r2', 'Budi', 'Alang', 0, 0);`);
  return db;
}
const count = (db: ReturnType<typeof freshDb>, sql: string) => Number((db.raw.prepare(sql).get() as any).n);
const orderBody = (over: Record<string, unknown> = {}) => ({
  reseller: 'Alang', parentReseller: null, recipientName: 'Rini', phone: '0812', address: 'Jl. A',
  deliveryDate: '2026-10-14', promo: 'None', babiManis: 2, babiAsin: 1, sapiManis: 0, sapiAsin: 0, ...over,
});

test('Jakarta time: order prefix, week, reward period', () => {
  assert.equal(orderIdPrefix(Date.parse('2026-10-12T18:30:00Z')), '13102026'); // 01:30 WIB on 13 Oct
  assert.equal(orderIdPrefix(Date.parse('2026-10-12T16:59:59Z')), '12102026'); // 23:59 WIB on 12 Oct
  const w = jakartaWeek(parseBaseDate('2026-10-18')); // a Sunday
  assert.equal(w.startKey, '2026-10-12');
  assert.equal(w.endKey, '2026-10-18');
  assert.equal(w.monday.toISOString(), '2026-10-11T17:00:00.000Z');
  const feb = rewardPeriod(parseBaseDate('2028-02-29'));
  assert.equal(feb.name, 'January & February');
  assert.equal(jakartaDateKey(feb.end), '2028-02-29');
  assert.equal(rewardPeriod(parseBaseDate('2026-10-13')).name, 'September & October');
});

test('website delivery date: same day before 14:00 WIB, else next day; Sunday moves to Monday', () => {
  const wib = (iso: string) => Date.parse(`${iso}+07:00`);
  assert.equal(websiteDeliveryDateKey(wib('2026-10-15T09:00:00')), '2026-10-15'); // Thu morning -> today
  assert.equal(websiteDeliveryDateKey(wib('2026-10-15T13:59:59')), '2026-10-15'); // just before 14:00 -> today
  assert.equal(websiteDeliveryDateKey(wib('2026-10-15T14:00:00')), '2026-10-16'); // 14:00 -> tomorrow
  assert.equal(websiteDeliveryDateKey(wib('2026-10-15T23:59:00')), '2026-10-16'); // late night -> tomorrow
  assert.equal(websiteDeliveryDateKey(wib('2026-10-16T00:05:00')), '2026-10-16'); // just after midnight WIB (still Thu in UTC) -> Fri
  assert.equal(websiteDeliveryDateKey(wib('2026-10-17T10:00:00')), '2026-10-17'); // Sat morning -> Sat
  assert.equal(websiteDeliveryDateKey(wib('2026-10-17T15:00:00')), '2026-10-19'); // Sat afternoon -> Mon (no Sunday delivery)
  assert.equal(websiteDeliveryDateKey(wib('2026-10-18T10:00:00')), '2026-10-19'); // Sun -> Mon
  assert.equal(websiteDeliveryDateKey(wib('2026-12-31T20:00:00')), '2027-01-01'); // year end
  assert.equal(new Date(deliveryDateFromKey('2026-10-16')).toISOString(), '2026-10-16T00:00:00.000Z');
});

test('website delivery choices: 14 days from the earliest, Sundays skipped', () => {
  const morning = websiteDeliveryOptions(Date.parse('2026-10-15T09:00:00+07:00')); // Thursday morning
  assert.equal(morning.length, 14);
  assert.deepEqual(morning.slice(0, 4), ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19']); // Thu, Fri, Sat, (no Sun) Mon
  const afternoon = websiteDeliveryOptions(Date.parse('2026-10-15T16:00:00+07:00')); // Thursday afternoon
  assert.equal(afternoon[0], '2026-10-16');
  assert.ok(!afternoon.includes('2026-10-15') && !afternoon.includes('2026-10-18') && !afternoon.includes('2026-10-25'));
  assert.equal(afternoon[13], '2026-10-31');
});

test('website delivery choices skip the owner\'s days off', () => {
  const thuMorning = Date.parse('2026-10-15T09:00:00+07:00');
  const days = websiteDeliveryOptions(thuMorning, ['2026-10-15', '2026-10-16', '2026-10-17']);
  assert.equal(days[0], '2026-10-19'); // off Thu–Sat, no Sunday -> Monday
  assert.equal(days.length, 14);
  assert.ok(!days.some((d) => d >= '2026-10-15' && d <= '2026-10-18'));
});

test('box counter rule unchanged', () => {
  assert.equal(calculateBoxCounter({ babiManis: 2, babiAsin: 1, sapiManis: 1, sapiAsin: 0 }, 'Payday Promo'), 2);
  assert.equal(calculateBoxCounter({ babiManis: 2, babiAsin: 1, sapiManis: 1, sapiAsin: 0 }, 'None'), 4);
  const products = [{ key: 'babiManis', label: 'Babi Manis', boxValue: 1 }, { key: 'kecil', label: 'Kecil', boxValue: 0.1 }];
  assert.equal(calculateBoxCounter({ babiManis: 1, kecil: 3 }, 'None', products), 1.3); // not 1.3000000000000003
  assert.equal(calculateBoxCounter({ babiManis: 3, kecil: 5 }, 'Payday Promo', products), 2); // floor(3.5 / 3 * 2)
});

test('create order deducts stock once, logs history, sequential IDs, retry-safe', async () => {
  const db = freshDb();
  const a = await createOrder(db, orderBody(), 'key-1');
  assert.match(a.order.orderId, /^\d{8}0001$/);
  assert.equal(a.order.orderId.slice(0, 8), orderIdPrefix(Date.now()));
  let inv = await getInventory(db);
  assert.deepEqual([inv.quantities.babiManis, inv.quantities.babiAsin, inv.quantities.sapiManis, inv.quantities.sapiAsin], [8, 9, 10, 10]);
  const h = db.raw.prepare(`SELECT * FROM stock_movement_history`).get() as any;
  assert.equal(h.type, 'ORDER'); assert.equal(h.orderId, a.order.orderId);
  assert.equal(h.babiManisBeginning, 10); assert.equal(h.babiManisChanges, -2); assert.equal(h.babiManisFinal, 8);

  const replay = await createOrder(db, orderBody(), 'key-1'); // same submission retried
  assert.equal(replay.replayed, true);
  assert.equal(replay.order.id, a.order.id);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM orders'), 1);
  inv = await getInventory(db);
  assert.equal(inv.quantities.babiManis, 8);

  const b = await createOrder(db, orderBody(), 'key-2');
  assert.equal(b.order.orderId, a.order.orderId.slice(0, 8) + '0002');
  // The 'initial' row is never touched.
  assert.equal(count(db, `SELECT babiManis n FROM current_inventory WHERE id='initial'`), 1);
});

test('create order validation preserved', async () => {
  const db = freshDb();
  await assert.rejects(createOrder(db, orderBody({ reseller: 'Nobody' }), null), /Reseller not found/);
  await assert.rejects(createOrder(db, orderBody({ babiManis: -1 }), null), /cannot be negative/);
  await assert.rejects(createOrder(db, orderBody({ babiManis: 0, babiAsin: 0 }), null), /At least one product/);
  await assert.rejects(createOrder(db, orderBody({ address: '' }), null), /mandatory/);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM orders'), 0);
});

test('cancel returns stock exactly once', async () => {
  const db = freshDb();
  const { order } = await createOrder(db, orderBody(), null);
  const first = await cancelOrder(db, order.id);
  const second = await cancelOrder(db, order.id);
  assert.equal(first.alreadyCancelled, false);
  assert.equal(second.alreadyCancelled, true);
  const inv = await getInventory(db);
  assert.deepEqual([inv.quantities.babiManis, inv.quantities.babiAsin], [10, 10]);
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE type='CANCEL_ORDER'`), 1);
});

test('a failed batch changes nothing (atomicity)', async () => {
  const db = freshDb();
  const { order } = await createOrder(db, orderBody(), null);
  db.raw.exec(`INSERT INTO operation_keys VALUES ('order:cancel:${order.id}', 'X', NULL, 0)`); // force the batch to fail
  await cancelOrder(db, order.id);
  const row = db.raw.prepare('SELECT orderStatus FROM orders').get() as any;
  assert.equal(row.orderStatus, 'ACTIVE');
  assert.equal((await getInventory(db)).quantities.babiManis, 8);
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE type='CANCEL_ORDER'`), 0);
});

test('edit uses stored quantities, ignores browser-sent originals, retry-safe', async () => {
  const db = freshDb();
  const { order } = await createOrder(db, orderBody(), null); // stock 8/9/10/10
  const body = {
    customerName: 'Rini', reseller: 'Alang', parentReseller: null, address: 'Jl. B', phoneNumber: '0812',
    isPaydayPromo: false, deliveryDate: '2026-10-15', babiManis: 1, babiAsin: 1, sapiManis: 3, sapiAsin: 0,
    originalBabiManis: 99, originalBabiAsin: 99, originalSapiManis: 99, originalSapiAsin: 99, // stale/forged
  };
  const r = await editOrder(db, order.id, body, 'edit-1');
  assert.deepEqual(r.inventoryChanges, { babiManis: 1, babiAsin: 0, sapiManis: -3, sapiAsin: 0 });
  let inv = await getInventory(db);
  assert.deepEqual([inv.quantities.babiManis, inv.quantities.babiAsin, inv.quantities.sapiManis, inv.quantities.sapiAsin], [9, 9, 7, 10]);
  assert.equal(r.order.boxCounter, 5);
  assert.equal(r.order.address, 'Jl. B');
  await editOrder(db, order.id, body, 'edit-1'); // retried
  inv = await getInventory(db);
  assert.deepEqual([inv.quantities.babiManis, inv.quantities.sapiManis], [9, 7]);
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE type='EDIT_ORDER'`), 1);
  // Same quantities again with a new key: details update, no stock movement.
  await editOrder(db, order.id, { ...body, address: 'Jl. C' }, 'edit-2');
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE type='EDIT_ORDER'`), 1);
});

test('free product orders: stock taken and logged, payment FREE, 0 boxes counted, editable both ways', async () => {
  const db = freshDb();
  const { order } = await createOrder(db, orderBody({ isFree: true, promo: '', reseller: 'Budi', parentReseller: 'Alang' }), null);
  assert.equal(order.paymentStatus, 'FREE');
  assert.equal(order.boxCounter, 0);
  assert.equal(order.isPaydayPromo, false);
  const inv = await getInventory(db);
  assert.deepEqual([inv.quantities.babiManis, inv.quantities.babiAsin], [8, 9]);
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE type='ORDER' AND orderId='${order.orderId}'`), 1);

  // Mark paid keeps it FREE.
  assert.equal((await setPaymentPaid(db, order.id)).paymentStatus, 'FREE');

  // Free orders do not count for reseller sales / rewards.
  db.raw.exec(`UPDATE orders SET date = ${Date.parse('2026-10-10T03:00:00Z')} WHERE id='${order.id}'`);
  let report = await resellerSalesReport(db, '2026-10-18');
  assert.equal(report.parentResellers.find((p) => p.parentReseller === 'Alang')?.children[0]?.rewardSales ?? 0, 0);

  const edit = {
    customerName: 'Rini', reseller: 'Budi', parentReseller: 'Alang', address: 'Jl. A', phoneNumber: '0812',
    isPaydayPromo: true, deliveryDate: '2026-10-14', babiManis: 3, babiAsin: 1, sapiManis: 0, sapiAsin: 0,
  };
  // Still free (payday ignored), quantity change logged.
  let r = await editOrder(db, order.id, { ...edit, isFree: true }, null);
  assert.deepEqual([r.order.paymentStatus, r.order.boxCounter, r.order.isPaydayPromo], ['FREE', 0, false]);
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE type='EDIT_ORDER'`), 1);
  // An edit without isFree (older page) keeps it free.
  r = await editOrder(db, order.id, { ...edit, isPaydayPromo: false }, null);
  assert.equal(r.order.paymentStatus, 'FREE');
  // Unticked: back to a normal pending order that counts.
  r = await editOrder(db, order.id, { ...edit, isPaydayPromo: false, isFree: false }, null);
  assert.deepEqual([r.order.paymentStatus, r.order.boxCounter], ['PENDING', 4]);
  // Counts once delivered (delivered orders only, by when they were marked delivered).
  db.raw.exec(`UPDATE orders SET deliveryStatus='DELIVERED', deliveredAt=${Date.parse('2026-10-14T03:00:00Z')} WHERE id='${order.id}'`);
  report = await resellerSalesReport(db, '2026-10-18');
  assert.equal(report.parentResellers.find((p) => p.parentReseller === 'Alang')!.children[0].rewardSales, 4);
  db.raw.exec(`UPDATE orders SET deliveryStatus='PENDING', deliveredAt=NULL WHERE id='${order.id}'`);
  // Ticked again on an order that is not free.
  r = await editOrder(db, order.id, { ...edit, isPaydayPromo: false, isFree: true }, null);
  assert.deepEqual([r.order.paymentStatus, r.order.boxCounter], ['FREE', 0]);
});

test('cancelled orders cannot have quantities edited', async () => {
  const db = freshDb();
  const { order } = await createOrder(db, orderBody(), null);
  await cancelOrder(db, order.id);
  await assert.rejects(
    editOrder(db, order.id, { customerName: 'x', reseller: 'Alang', address: 'y', babiManis: 5, babiAsin: 1, sapiManis: 0, sapiAsin: 0 }, null),
    /cancelled/,
  );
});

test('delivered orders cannot be edited or cancelled', async () => {
  const db = freshDb();
  const { order } = await createOrder(db, orderBody(), null);
  await setDelivered(db, order.id, 15000);
  await assert.rejects(
    editOrder(db, order.id, { customerName: 'x', reseller: 'Alang', address: 'y', babiManis: 2, babiAsin: 1, sapiManis: 0, sapiAsin: 0 }, null),
    /already delivered/,
  );
  await assert.rejects(cancelOrder(db, order.id), /already delivered/);
  assert.equal((await getInventory(db)).quantities.babiManis, 8); // stock untouched
});

test('production and adjustment are retry-safe; blank adjustment keeps value', async () => {
  const db = freshDb();
  await addProduction(db, { babiManis: 5, babiAsin: 0, sapiManis: 0, sapiAsin: 2 }, 'p-1');
  await addProduction(db, { babiManis: 5, babiAsin: 0, sapiManis: 0, sapiAsin: 2 }, 'p-1');
  let inv = await getInventory(db);
  assert.deepEqual([inv.quantities.babiManis, inv.quantities.sapiAsin], [15, 12]);
  const r = await adjustStock(db, { babiManis: 3, babiAsin: null, sapiManis: 0, sapiAsin: null }, 'a-1');
  assert.deepEqual(r.newInventory, { babiManis: 3, babiAsin: 10, sapiManis: 0, sapiAsin: 12 });
  const h = db.raw.prepare(`SELECT * FROM stock_movement_history WHERE type='STOCK_ADJUSTMENT'`).get() as any;
  assert.equal(h.babiManisChanges, -12); assert.equal(h.babiAsinChanges, 0); assert.equal(h.sapiManisChanges, -10);
});

test('status updates and reseller rules', async () => {
  const db = freshDb();
  await assert.rejects(setPaymentPaid(db, 'missing'), /not found/);
  const { order } = await createOrder(db, orderBody({ reseller: 'Budi', parentReseller: 'Alang' }), null);
  assert.equal((await setPaymentPaid(db, order.id)).paymentStatus, 'PAID');
  await assert.rejects(deleteReseller(db, 'r2'), /used in existing orders/);
});

test('reseller sales: delivered orders only, week Sunday 12:00 to Sunday 12:00, period of the delivery day', async () => {
  const db = freshDb();
  const make = async (deliveredAtIso: string | null, orderedIso = '2026-10-10T03:00:00Z') => {
    const { order } = await createOrder(db, orderBody({ reseller: 'Budi', parentReseller: 'Alang', deliveryDate: '2026-10-12' }), null);
    db.raw.exec(`UPDATE orders SET date=${Date.parse(orderedIso)}${deliveredAtIso ? `, deliveryStatus='DELIVERED', deliveredAt=${Date.parse(deliveredAtIso)}` : ''} WHERE id='${order.id}'`);
  };
  await make('2026-10-12T03:00:00Z'); // Mon 12 Oct 10:00 WIB: this week (3 boxes)
  await make('2026-10-18T04:59:00Z'); // Sun 18 Oct 11:59 WIB: still this week (3)
  await make('2026-10-18T06:00:00Z'); // Sun 18 Oct 13:00 WIB, after the recap: next week (3)
  await make(null); // not delivered: never counted
  let report = await resellerSalesReport(db, '2026-10-18');
  let parent = report.parentResellers.find((p) => p.parentReseller === 'Alang')!;
  assert.equal(parent.weeklySales, 6);
  assert.equal(parent.rewardSales, 9); // September & October: all 3 delivered
  assert.equal(parent.children[0].reseller, 'Budi');
  assert.deepEqual(report.weekRange, { start: '2026-10-11', end: '2026-10-18' });
  report = await resellerSalesReport(db, '2026-10-19');
  assert.equal(report.parentResellers.find((p) => p.parentReseller === 'Alang')!.weeklySales, 3);
  assert.deepEqual(report.weekRange, { start: '2026-10-18', end: '2026-10-25' });

  // Ordered 31 Dec, delivered 2 Jan: counts for January & February, not November & December.
  await make('2027-01-02T03:00:00Z', '2026-12-31T03:00:00Z');
  const dec = await resellerSalesReport(db, '2026-12-27');
  assert.equal(dec.parentResellers.length, 0);
  const jan = await resellerSalesReport(db, '2027-01-03');
  assert.equal(jan.parentResellers[0].rewardSales, 3);
  assert.equal(jan.rewardPeriod, 'January & February');
});

test('reseller order total: payday packages of 3, Rp140.000 per other box, Rp15.000 delivery for 1 box', async () => {
  const { resellerOrderCharge } = await import('../src/lib/core/resellerPrice.ts');
  // The owner's example: 11 boxes on payday = 3 × 350.000 + 2 × 140.000
  assert.deepEqual(resellerOrderCharge({ boxes: 11, payday: true, free: false }), { price: 1_330_000, deliveryFee: 0, total: 1_330_000 });
  assert.equal(resellerOrderCharge({ boxes: 4, payday: true, free: false }).total, 490_000);
  assert.equal(resellerOrderCharge({ boxes: 3, payday: true, free: false }).total, 350_000);
  assert.equal(resellerOrderCharge({ boxes: 11, payday: false, free: false }).total, 1_540_000);
  assert.deepEqual(resellerOrderCharge({ boxes: 1, payday: false, free: false }), { price: 140_000, deliveryFee: 15_000, total: 155_000 });
  assert.deepEqual(resellerOrderCharge({ boxes: 1, payday: true, free: false }), { price: 140_000, deliveryFee: 15_000, total: 155_000 });
  assert.equal(resellerOrderCharge({ boxes: 2, payday: false, free: false }).deliveryFee, 0);
  assert.deepEqual(resellerOrderCharge({ boxes: 6, payday: false, free: true }), { price: 0, deliveryFee: 0, total: 0 });
});
