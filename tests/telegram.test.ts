// Telegram bot messages. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { createOrder, setDelivered, setPaymentPaid } from '../src/lib/core/orders.ts';
import { adjustStock } from '../src/lib/core/inventory.ts';
import { checkLowStock, deliveryMessage, sendDailySummary, sendParentRecap } from '../src/lib/notify/telegram.ts';
import { courierService } from '../src/lib/shop/delivery-cities.ts';
import { getOrder } from '../src/lib/core/orders.ts';
import { loadStockProducts } from '../src/lib/core/products.ts';

function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-tg-')), 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0005_shop_content.sql', '0023_payday_promo.sql', '0024_promo_photos.sql', '0006_website_only_products.sql', '0008_shipping_and_cancel_reason.sql', '0009_notification_state.sql', '0010_website_stock_on_payment.sql', '0011_delivered_at.sql', '0015_stock_product_short_name.sql', '0016_product_box_value.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0028_guest_checkout.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  db.raw.exec(`
    INSERT INTO current_inventory VALUES ('initial', 1, 1, 1, 1, 0), ('current', 10, 10, 10, 10, 0);
    INSERT INTO resellers VALUES ('r1', 'Alang', NULL, 0, 0);`);
  return db;
}

function fakeTelegram() {
  const sent: { chat_id: string; text: string; token: string }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    sent.push({ ...JSON.parse(String(init.body)), token: url.split('/bot')[1].split('/')[0] });
    return new Response('{"ok":true}', { status: 200 });
  };
  return { sent, fetchFn };
}

const env = {
  TELEGRAM_BOT_TOKEN: 'stock-token',
  TELEGRAM_SHIPPING_BOT_TOKEN: 'shipping-token',
  TELEGRAM_REPORTING_BOT_TOKEN: 'reporting-token',
  TELEGRAM_CHAT_ID: '42',
};
const order = (over: Record<string, unknown>) => ({
  reseller: 'Alang', parentReseller: null, recipientName: 'Rini', phone: '0812', address: 'Jl. A 1',
  deliveryDate: '2026-10-14', promo: 'None', babiManis: 2, babiAsin: 0, sapiManis: 1, sapiAsin: 0, ...over,
});
// 19:00 WIB on 13 Oct 2026, so "tomorrow" is 14 Oct.
const evening = Date.parse('2026-10-13T12:00:00Z');

test('daily summary: one bubble per order for tomorrow, then the unpaid list', async () => {
  const db = freshDb();
  await adjustStock(db, { babiManis: 50, babiAsin: 50, sapiManis: 50, sapiAsin: 50 }, null); // no stock warning
  const a = await createOrder(db, order({ recipientName: 'Rini', address: 'Jl. Mawar 3' }), null);
  await createOrder(db, order({ recipientName: 'Sari', phone: '0899' }), null);
  await createOrder(db, order({ recipientName: 'Later', deliveryDate: '2026-10-15' }), null); // not tomorrow
  await setPaymentPaid(db, a.order.id);

  const { sent, fetchFn } = fakeTelegram();
  assert.equal(await sendDailySummary({ ...env, DB: db }, fetchFn, evening, 0), 3);

  assert.equal(sent.length, 3);
  assert.ok(sent.every((m) => m.chat_id === '42' && m.token === 'shipping-token'));
  assert.equal(
    sent[0].text,
    [
      `🚚 Delivery Wednesday, 14 October 2026 (1/2)`,
      `Order ${a.order.orderId}`,
      '',
      'Rini',
      'Jl. Mawar 3',
      '0812',
      '',
      'Order list:',
      '2 x Babi Manis',
      '1 x Sapi Manis',
      '',
      'Payment: ✅ Paid',
    ].join('\n'),
  );
  assert.match(sent[1].text, /\n\nSari\nJl\. A 1\n0899\n/);
  assert.match(sent[1].text, /NOT PAID YET/);
  assert.match(sent[2].text, /^⚠️ 1 order NOT PAID/);
  assert.match(sent[2].text, /Sari \(0899\)/);
  assert.doesNotMatch(sent.map((m) => m.text).join(), /Later/);
});

test('delivery list: out-of-town website orders say which courier to book (Paxel Nextday, TIKI ONS for Medan/Bali)', async () => {
  assert.equal(courierService('Bandung'), 'Paxel Nextday');
  assert.equal(courierService('Surabaya'), 'Paxel Nextday');
  for (const city of ['Medan', 'Denpasar', 'Badung']) assert.equal(courierService(city), 'TIKI One Night Service');
  for (const city of ['Jakarta', 'Tangerang', 'Bekasi', 'Depok', '', null]) assert.equal(courierService(city), null);

  const db = freshDb();
  const products = await loadStockProducts(db);
  const { order: created } = await createOrder(db, order({}), null);
  const o = (await getOrder(db, created.id))!;
  assert.equal(o.websiteCity, null); // admin-entered order: no courier line
  assert.doesNotMatch(deliveryMessage(o, 0, 1, '2026-10-14', products), /Send with/);
  assert.match(deliveryMessage({ ...o, websiteCity: 'Medan' }, 0, 1, '2026-10-14', products), /\n📦 Send with: TIKI ONE NIGHT SERVICE \(Medan\)\n/);
  assert.match(deliveryMessage({ ...o, websiteCity: 'Malang' }, 0, 1, '2026-10-14', products), /📦 Send with: PAXEL NEXTDAY \(Malang\)/);
  assert.doesNotMatch(deliveryMessage({ ...o, websiteCity: 'Depok' }, 0, 1, '2026-10-14', products), /Send with/);
});

test('daily summary: says so when nothing is due, and leaves stock to the Stock Alert bot', async () => {
  const db = freshDb();
  await adjustStock(db, { babiManis: -3, babiAsin: 5, sapiManis: 5, sapiAsin: 5 }, null);
  const { sent, fetchFn } = fakeTelegram();
  await sendDailySummary({ ...env, DB: db }, fetchFn, evening, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, '🚚 No deliveries for Wednesday, 14 October 2026.');
});

test('a bot without its own token uses the Stock Alert bot', async () => {
  const db = freshDb();
  const { sent, fetchFn } = fakeTelegram();
  await sendDailySummary({ TELEGRAM_BOT_TOKEN: 'stock-token', TELEGRAM_CHAT_ID: '42', DB: db }, fetchFn, evening, 0);
  assert.equal(sent[0].token, 'stock-token');
});

test('nothing is sent without a bot token', async () => {
  const db = freshDb();
  const { sent, fetchFn } = fakeTelegram();
  assert.equal(await sendDailySummary({ DB: db }, fetchFn, evening), 0);
  assert.equal(await checkLowStock({ DB: db }, fetchFn, () => {}), false);
  assert.equal(sent.length, 0);
});

test('low stock alert: below 5, once per shortage, again only when it gets worse', async () => {
  const db = freshDb();
  const { sent, fetchFn } = fakeTelegram();
  const check = () => checkLowStock({ ...env, DB: db }, fetchFn, () => {});

  assert.equal(await check(), false); // all stock 10
  await createOrder(db, order({ babiManis: 0, babiAsin: 5, sapiManis: 0 }), null); // babiAsin 10 -> 5
  assert.equal(await check(), false); // exactly 5 is not below 5
  await createOrder(db, order({ babiManis: 6, sapiManis: 0 }), null); // babiManis 10 -> 4
  assert.equal(await check(), true);
  assert.match(sent[0].text, /^🏭 Stock below 5 — production needed/);
  assert.equal(sent[0].token, 'stock-token');
  assert.match(sent[0].text, /• Babi Manis: 4/);
  assert.doesNotMatch(sent[0].text, /• Babi Asin/);

  assert.equal(await check(), false); // same shortage: no repeat
  await createOrder(db, order({ babiManis: 5, sapiManis: 0 }), null); // -1: worse
  assert.equal(await check(), true);
  assert.match(sent[1].text, /• Babi Manis: -1/);
  await adjustStock(db, { babiManis: 20, babiAsin: 10, sapiManis: 10, sapiAsin: 10 }, null); // produced
  assert.equal(await check(), false);
  await createOrder(db, order({ babiManis: 17, sapiManis: 0 }), null); // below 5 again later: new alert
  assert.equal(await check(), true);
  assert.equal(sent.length, 3);
});

test('Sunday recap: boxes marked delivered Sunday 12:00 to Sunday 12:00 per parent reseller x Rp 5.000', async () => {
  const db = freshDb();
  db.raw.exec(`INSERT INTO resellers VALUES
    ('r2', 'Budi', 'Alang', 0, 0), ('r3', 'Citra', 'Alang', 0, 0), ('r4', 'Dewi', 'Eko', 0, 0)`);
  const delivered = async (over: Record<string, unknown>, at: string) => {
    const { order: o } = await createOrder(db, order({ babiManis: 0, sapiManis: 0, ...over }), null);
    await setDelivered(db, o.id, 15000);
    db.raw.prepare('UPDATE orders SET deliveredAt = ? WHERE id = ?').run(Date.parse(at), o.id); // when it was marked delivered
    return o;
  };
  // Recap of Sunday 18 Oct 2026 12:00 WIB = marked delivered after Sun 11 Oct 12:00 up to Sun 18 Oct 12:00.
  await delivered({ reseller: 'Budi', parentReseller: 'Alang', babiManis: 4 }, '2026-10-12T03:00:00Z'); // 4
  await delivered({ reseller: 'Citra', parentReseller: 'Alang', sapiAsin: 3, promo: 'Payday Promo' }, '2026-10-18T04:00:00Z'); // Sun 11:00: 2
  await delivered({ reseller: 'Dewi', parentReseller: 'Eko', babiAsin: 1 }, '2026-10-15T03:00:00Z'); // 1
  await delivered({ reseller: 'Alang', babiAsin: 9 }, '2026-10-14T03:00:00Z'); // no parent: not in recap
  await delivered({ reseller: 'Budi', parentReseller: 'Alang', babiManis: 5 }, '2026-10-11T04:00:00Z'); // Sun 11 Oct 11:00: last week
  await delivered({ reseller: 'Budi', parentReseller: 'Alang', babiManis: 5 }, '2026-10-18T06:00:00Z'); // Sun 18 Oct 13:00: next week
  await createOrder(db, order({ reseller: 'Budi', parentReseller: 'Alang', deliveryDate: '2026-10-16' }), null); // not delivered
  const c = await delivered({ reseller: 'Dewi', parentReseller: 'Eko', babiAsin: 7 }, '2026-10-16T03:00:00Z');
  // Cancelled after delivery (the app no longer allows it, but older data may have such orders).
  db.raw.prepare(`UPDATE orders SET orderStatus = 'CANCELLED' WHERE id = ?`).run(c.id);

  const { sent, fetchFn } = fakeTelegram();
  // Sunday 18 Oct 2026, 12:00 WIB
  assert.equal(await sendParentRecap({ ...env, DB: db }, fetchFn, Date.parse('2026-10-18T05:00:00Z')), 1);
  assert.equal(sent[0].token, 'reporting-token');
  assert.equal(
    sent[0].text,
    [
      '💰 Parent reseller recap',
      'Sunday, 11 October 2026 – Sunday, 18 October 2026',
      '(orders marked delivered, Sunday 12:00 to Sunday 12:00)',
      '',
      '1. Alang',
      '   6 boxes x Rp 5.000 = Rp 30.000',
      '   (Budi 4, Citra 2)',
      '',
      '2. Eko',
      '   1 box x Rp 5.000 = Rp 5.000',
      '   (Dewi 1)',
      '',
      'Total to transfer: Rp 35.000 (7 boxes)',
    ].join('\n'),
  );

  const empty = fakeTelegram();
  await sendParentRecap({ ...env, DB: db }, empty.fetchFn, Date.parse('2026-11-01T05:00:00Z'));
  assert.match(empty.sent[0].text, /No delivered orders from resellers with a parent this week/);
});
