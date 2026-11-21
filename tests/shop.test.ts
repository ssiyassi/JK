// Online shop rules. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { adjustStock, getInventory } from '../src/lib/core/inventory.ts';
import { loadStockProducts } from '../src/lib/core/products.ts';
import { ordersForDelivery, stockMessage } from '../src/lib/notify/telegram.ts';
import { deliveryDayWarnings, websiteDeliveryDateKey, websiteDeliveryOptions } from '../src/lib/core/time.ts';
import { cancelOrder, editOrder, getOrder, listOrders, setDelivered, setPaymentPaid } from '../src/lib/core/orders.ts';
import { priceCart, discountFor } from '../src/lib/shop/pricing.ts';
import { normalizePhone, hashPassword, verifyPassword } from '../src/lib/shop/util.ts';
import {
  registerCustomer,
  loginCustomer,
  createSession,
  customerForSession,
  startPasswordReset,
  finishPasswordReset,
  listCustomersForAdmin,
  updateCustomerByAdmin,
  setCustomerDisabled,
  createPasswordSetupToken,
  createAdminLoginToken,
  redeemAdminLoginToken,
  type Guest,
} from '../src/lib/shop/customers.ts';
import { placeOrder, saveProof, getShopOrder, canViewOrder, listWebsiteOrders, fullAddress } from '../src/lib/shop/orders.ts';
import { payerFor } from '../src/lib/shop/payments.ts';
import { addOrderEmail } from '../src/lib/shop/order-email.ts';
import { bookedWebsiteOrders, closedDeliveryDays, deliveryScheduleFrom, listDayOffHistory, listDaysOff, removeDayOff, saveDayOff } from '../src/lib/shop/days-off.ts';
import { orderContact } from '../src/lib/shop/events.ts';
import { orderUrl } from '../src/lib/shop/email.ts';
import { newCustomerDiscountUsed, newCustomerGuardStatement } from '../src/lib/shop/new-customer.ts';
import { createEmailCode, markEmailVerified, verifyEmailCode } from '../src/lib/shop/email-verify.ts';
import { getCustomer } from '../src/lib/shop/customers.ts';
import { issueMonthlyVouchers, listCustomerVouchers, endOfJakartaMonth, monthKey } from '../src/lib/shop/vouchers.ts';
import { changeDeliveryDate, onOrderDelivered, onOrderPaid, paidEmailsAgain, metaPurchaseAgain, onOrderCancelled, shipOrder, assertCanMarkDelivered } from '../src/lib/shop/events.ts';
import { orderConfirmationMessage, orderFollowUpMessage, whatsappLink, whatsappNumber, whatsappOrderLink } from '../src/lib/shop/catalog.ts';
import { deliveredEmail, ownerPaidEmail } from '../src/lib/shop/email.ts';
import { loadCatalog, updateProduct, moveProduct, createProduct, deleteProduct } from '../src/lib/shop/products.ts';
import { createBanner, listBanners, moveBanner, updateBanner, deleteBanner } from '../src/lib/shop/banners.ts';
import { getMedia } from '../src/lib/shop/media.ts';
import type { CatalogItem } from '../src/lib/shop/catalog.ts';
import { hitRateLimits, LIMITS } from '../src/lib/shop/ratelimit.ts';

/** Sign-up followed by the email code, as most tests need a confirmed customer with the welcome voucher. */
async function signUp(db: ReturnType<typeof sqliteD1>, body: Record<string, unknown>, now: number) {
  const { customer } = await registerCustomer(db, body, now);
  const welcome = await markEmailVerified(db, customer.id, now);
  return { customer: (await getCustomer(db, customer.id))!, welcome };
}

const links = { shopUrl: 'https://jentiskitchen.id', adminUrl: 'https://admin.jentiskitchen.id' };

function freshDb(stock = 10) {
  const dir = mkdtempSync(join(tmpdir(), 'jentis-shop-'));
  const db = sqliteD1(join(dir, 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0004_shop_payments.sql', '0005_shop_content.sql', '0023_payday_promo.sql', '0024_promo_photos.sql', '0006_website_only_products.sql', '0007_banner_mobile_image.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql', '0011_delivered_at.sql', '0012_payment_gateway.sql', '0013_customer_disabled.sql', '0025_email_verification.sql', '0014_rate_limits.sql', '0015_stock_product_short_name.sql', '0016_product_box_value.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0026_order_attribution.sql', '0028_guest_checkout.sql', '0029_checkout_accounts_confirmed.sql', '0030_new_customer_discount.sql', '0032_days_off.sql', '0033_payment_method.sql', '0051_payment_channel.sql', '0052_owner_orders.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  db.raw.exec(`INSERT INTO current_inventory VALUES ('current', ${stock}, ${stock}, ${stock}, ${stock}, 0);`);
  return db;
}
const count = (db: ReturnType<typeof freshDb>, sql: string) => Number((db.raw.prepare(sql).get() as any).n);

const person = (over: Record<string, unknown> = {}) => ({
  name: 'Rini', email: 'Rini@Example.com', phone: '0812-3456-7890', password: 'rahasia123', ...over,
});
const address = (over: Record<string, unknown> = {}) => ({
  recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. Mawar 1', kelurahan: 'Gambir',
  kecamatan: 'Gambir', city: 'Jakarta Pusat', ...over,
});

const PRICES: CatalogItem[] = (['babiManis', 'babiAsin', 'sapiManis', 'sapiAsin'] as const).map((product, i) => ({
  product, stockColumn: product, shortName: null, boxValue: 1, name: product, size: '500 gram', description: '', price: 160000, compareAtPrice: null, image: '', accent: '', visible: true, sortOrder: i,
}));

test('pricing: delivery fee and capped discount', () => {
  const one = priceCart({ babiManis: 1, babiAsin: 0, sapiManis: 0, sapiAsin: 0 }, null, PRICES);
  assert.equal(one.deliveryFee, 15000);
  assert.equal(one.total, one.subtotal + 15000);
  const two = priceCart({ babiManis: 1, babiAsin: 0, sapiManis: 1, sapiAsin: 0 }, null, PRICES);
  assert.equal(two.deliveryFee, 0);
  assert.equal(discountFor(200000, { percent: 35, capAmount: 100000 }), 70000);
  assert.equal(discountFor(400000, { percent: 35, capAmount: 100000 }), 100000); // capped
  assert.equal(discountFor(99999, { percent: 20, capAmount: 100000 }), 19999); // rounded down
  // Discount never touches the delivery fee.
  const p = priceCart({ babiManis: 1, babiAsin: 0, sapiManis: 0, sapiAsin: 0 }, { percent: 35, capAmount: 100000 }, PRICES);
  assert.equal(p.discount, 56000); // 35% of 160,000
  assert.equal(p.total, 160000 - 56000 + 15000);
});

test('phone numbers normalise to one form', () => {
  for (const v of ['081234567890', '+62 812-3456-7890', '6281234567890', '81234567890']) {
    assert.equal(normalizePhone(v), '6281234567890');
  }
  assert.throws(() => normalizePhone('12345'));
});

test('passwords are hashed and verified', async () => {
  const h = await hashPassword('rahasia123');
  assert.ok(h.startsWith('pbkdf2$100000$'));
  assert.equal(await verifyPassword('rahasia123', h), true);
  assert.equal(await verifyPassword('salah', h), false);
});

test('register: unique email and phone, welcome voucher 20% capped 100k', async () => {
  const db = freshDb();
  const { customer, welcome } = await signUp(db, person(), Date.now());
  assert.equal(customer.email, 'rini@example.com');
  assert.equal(customer.phone, '6281234567890');
  assert.equal(welcome?.kind, 'WELCOME');
  assert.equal(welcome?.percent, 20);
  assert.equal(welcome?.capAmount, 100000);
  assert.equal(welcome?.expiresAt, null);
  await assert.rejects(registerCustomer(db, person({ phone: '0899999999' }), Date.now()), /Email ini sudah terdaftar/);
  await assert.rejects(registerCustomer(db, person({ email: 'x@y.id' }), Date.now()), /Nomor HP ini sudah terdaftar/);
  await assert.rejects(registerCustomer(db, person({ email: 'a@b.id', phone: '0811111111', referrerPhone: '0822222222' }), Date.now()), /belum terdaftar/);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_customers'), 1);
});

test('email code: welcome voucher only after the emailed code is typed; wrong, old and too many codes refused', async () => {
  const db = freshDb();
  const t0 = Date.UTC(2026, 9, 20, 3);
  const { customer } = await registerCustomer(db, person(), t0);
  assert.equal(customer.emailVerifiedAt, null);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_vouchers'), 0);

  const first = await createEmailCode(db, customer, t0);
  assert.match(first, /^\d{6}$/);
  await assert.rejects(createEmailCode(db, customer, t0 + 10_000), /Tunggu 60 detik/);
  const code = await createEmailCode(db, customer, t0 + 61_000); // the first code stops working
  if (first !== code) await assert.rejects(verifyEmailCode(db, customer, first, t0 + 62_000), /Kode salah\. Sisa 4/);
  const wrong = code === '000000' ? '111111' : '000000';
  await assert.rejects(verifyEmailCode(db, customer, wrong, t0 + 63_000), /Kode salah/);
  // Other customers' unconfirmed emails get no monthly voucher; this one gets none either until confirmed.
  const welcome = await verifyEmailCode(db, customer, code.slice(0, 3) + ' ' + code.slice(3), t0 + 64_000);
  assert.equal(welcome?.kind, 'WELCOME');
  const confirmed = (await getCustomer(db, customer.id))!;
  assert.ok(confirmed.emailVerifiedAt);
  await assert.rejects(verifyEmailCode(db, confirmed, code, t0 + 65_000), /sudah dikonfirmasi/);
  await assert.rejects(createEmailCode(db, confirmed, t0 + 200_000), /sudah dikonfirmasi/);
  assert.equal(await markEmailVerified(db, customer.id, t0 + 70_000), null); // never a second welcome voucher
  assert.equal(count(db, "SELECT COUNT(*) n FROM shop_vouchers WHERE kind = 'WELCOME'"), 1);

  // Expired after 15 minutes; at most 5 tries, even when sent at the same moment.
  const { customer: budi } = await registerCustomer(db, person({ name: 'Budi', email: 'budi@example.com', phone: '081299998888' }), t0);
  const late = await createEmailCode(db, budi, t0);
  await assert.rejects(verifyEmailCode(db, budi, late, t0 + 16 * 60_000), /tidak berlaku/);
  const c = await createEmailCode(db, budi, t0 + 17 * 60_000);
  const guesses = Array.from({ length: 12 }, (_, i) => String(i).padStart(6, '0')).filter((g) => g !== c);
  await Promise.allSettled(guesses.map((g) => verifyEmailCode(db, budi, g, t0 + 17 * 60_000 + 1)));
  await assert.rejects(verifyEmailCode(db, budi, c, t0 + 18 * 60_000), /Terlalu banyak kode salah/);
  // Five codes per hour.
  for (let i = 0; i < 3; i++) await createEmailCode(db, budi, t0 + 19 * 60_000 + i * 61_000);
  await assert.rejects(createEmailCode(db, budi, t0 + 30 * 60_000), /Terlalu banyak permintaan/);
  assert.equal(count(db, "SELECT COUNT(*) n FROM shop_vouchers WHERE customerId = '" + budi.id + "'"), 0);

  // A password reset link also proves the inbox: Budi gets his welcome voucher then.
  const reset = await startPasswordReset(db, 'budi@example.com', t0 + 40 * 60_000);
  const done = await finishPasswordReset(db, { token: reset!.token, password: 'barubaru123' }, t0 + 40 * 60_000);
  assert.equal(done.welcome?.kind, 'WELCOME');
  assert.ok(done.customer.emailVerifiedAt);
});

test('login, session, wrong password, reset password signs out everywhere', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  await assert.rejects(loginCustomer(db, { email: 'rini@example.com', password: 'salah12345' }, now), /salah/);
  const ok = await loginCustomer(db, { email: 'RINI@example.com', password: 'rahasia123' }, now);
  assert.equal(ok.id, customer.id);
  const token = await createSession(db, customer.id, now);
  assert.equal((await customerForSession(db, token, now))?.id, customer.id);
  assert.equal(await customerForSession(db, 'forged', now), null);

  assert.equal(await startPasswordReset(db, 'nobody@example.com', now), null);
  const reset = await startPasswordReset(db, 'rini@example.com', now);
  await finishPasswordReset(db, { token: reset!.token, password: 'barubaru123' }, now);
  await assert.rejects(finishPasswordReset(db, { token: reset!.token, password: 'lagilagi123' }, now), /tidak berlaku/);
  assert.equal(await customerForSession(db, token, now), null);
  await loginCustomer(db, { email: 'rini@example.com', password: 'barubaru123' }, now);
});

test('reset password: earlier links stop working and a stranger\'s login lock is lifted', async () => {
  const db = freshDb();
  const now = Date.now();
  await signUp(db, person(), now);
  // Someone tries wrong passwords until the account is locked for 15 minutes.
  for (let i = 0; i < 10; i++) await assert.rejects(loginCustomer(db, { email: 'rini@example.com', password: 'tebak' + i }, now), /salah/);
  await assert.rejects(loginCustomer(db, { email: 'rini@example.com', password: 'rahasia123' }, now), /Terlalu banyak/);
  const older = await startPasswordReset(db, 'rini@example.com', now);
  const newer = await startPasswordReset(db, 'rini@example.com', now + 1);
  await finishPasswordReset(db, { token: newer!.token, password: 'barubaru123' }, now + 2);
  await assert.rejects(finishPasswordReset(db, { token: older!.token, password: 'jahat12345' }, now + 3), /tidak berlaku/);
  await loginCustomer(db, { email: 'rini@example.com', password: 'barubaru123' }, now + 4);
});

test('admin customers: edit email/phone (unique), deactivate signs out and blocks login/reset/monthly voucher, reactivate', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  await signUp(db, person({ name: 'Budi', email: 'budi@example.com', phone: '081299998888' }), now + 1);

  const list = await listCustomersForAdmin(db);
  assert.deepEqual(list.map((c) => c.name), ['Budi', 'Rini']);
  assert.equal(list[1].orders, 0);

  await assert.rejects(updateCustomerByAdmin(db, customer.id, { email: 'BUDI@example.com' }, now), /already uses this email/);
  await assert.rejects(updateCustomerByAdmin(db, customer.id, { phone: '+62 812-9999-8888' }, now), /already uses this phone/);
  await assert.rejects(updateCustomerByAdmin(db, customer.id, { phone: '123' }, now), /not valid/);
  const edited = await updateCustomerByAdmin(db, customer.id, { name: 'Rini S', email: 'Rini.Baru@Example.com', phone: '0813 1111 2222' }, now);
  assert.equal(edited.email, 'rini.baru@example.com');
  assert.equal(edited.phone, '6281311112222');
  assert.equal(edited.name, 'Rini S');
  await assert.rejects(loginCustomer(db, { email: 'rini@example.com', password: 'rahasia123' }, now), /salah/);
  await loginCustomer(db, { email: 'rini.baru@example.com', password: 'rahasia123' }, now);

  const token = await createSession(db, customer.id, now);
  const off = await setCustomerDisabled(db, customer.id, true, now);
  assert.equal(off.disabledAt, now);
  assert.equal(await customerForSession(db, token, now), null);
  assert.equal(count(db, `SELECT COUNT(*) AS n FROM shop_sessions WHERE customerId = '${customer.id}'`), 0);
  await assert.rejects(loginCustomer(db, { email: 'rini.baru@example.com', password: 'rahasia123' }, now), /dinonaktifkan/);
  // A wrong password still says "wrong password", so the message never reveals the account exists.
  await assert.rejects(loginCustomer(db, { email: 'rini.baru@example.com', password: 'salah12345' }, now), /salah/);
  assert.equal(await startPasswordReset(db, 'rini.baru@example.com', now), null);
  const jobs = await issueMonthlyVouchers(db, now);
  assert.deepEqual(jobs.map((j) => j.email), ['budi@example.com']);
  await assert.rejects(
    registerCustomer(db, person({ name: 'Ani', email: 'ani@example.com', phone: '081277776666', referrerPhone: '081311112222' }), now),
    /belum terdaftar/,
  );

  const on = await setCustomerDisabled(db, customer.id, false, now);
  assert.equal(on.disabledAt, null);
  await loginCustomer(db, { email: 'rini.baru@example.com', password: 'rahasia123' }, now);
  assert.ok((await issueMonthlyVouchers(db, now)).some((j) => j.email === 'rini.baru@example.com'));
  await assert.rejects(setCustomerDisabled(db, 'missing', true, now), /not found/);
});

test('order: Kota dropdown: city required when on, courier cities sent the day after the order, the 4 home cities keep same-day', async () => {
  const db = freshDb();
  const now = Date.parse('2026-10-15T09:00:00+07:00'); // Thursday morning
  const { customer } = await signUp(db, person(), now);
  const body = (city: string, deliveryDate?: unknown) => ({ items: { babiManis: 1 }, address: { ...address(), city }, deliveryDate });
  const day = (o: { deliveryDate: number | null }) => new Date(o.deliveryDate!).toISOString().slice(0, 10);

  // Off (today's checkout): no city needed, same-day as before.
  assert.equal(day((await placeOrder(db, customer, { items: { babiManis: 1 }, address: address() }, 'off', now)).order), '2026-10-15');

  await assert.rejects(placeOrder(db, customer, body(''), 'none', now, true), /pilih kota/);
  await assert.rejects(placeOrder(db, customer, body('Pontianak'), 'other', now, true), /pilih kota/);
  for (const city of ['Jakarta', 'Tangerang', 'Bekasi', 'Depok']) {
    assert.equal(day((await placeOrder(db, customer, body(city), `same-${city}`, now, true)).order), '2026-10-15');
  }
  assert.equal(day((await placeOrder(db, customer, body('Surabaya'), 'sby', now, true)).order), '2026-10-16'); // courier city
  const bandung = (await placeOrder(db, customer, body('Bandung'), 'bdg', now, true)).order;
  assert.equal(day(bandung), '2026-10-16'); // Friday, tomorrow
  assert.equal(bandung.city, 'Bandung');
  assert.match(fullAddress(bandung), /, Bandung$/);
  await assert.rejects(placeOrder(db, customer, body('Medan', '2026-10-15'), 'early', now, true), /Tanggal pengiriman tidak tersedia/);
  assert.equal(day((await placeOrder(db, customer, body('Medan', '2026-10-20'), 'later', now, true)).order), '2026-10-20');

  // Delivery fee: courier cities Rp 25.000 below 4 packs, free from 4; the 4 home cities keep 15.000 / free from 2.
  assert.equal(bandung.deliveryFee, 25000);
  const packs = (city: string, n: number) => ({ items: { babiManis: n }, address: { ...address(), city } });
  assert.equal((await placeOrder(db, customer, packs('Medan', 3), 'm3', now, true)).order.deliveryFee, 25000);
  assert.equal((await placeOrder(db, customer, packs('Medan', 4), 'm4', now, true)).order.deliveryFee, 0);
  assert.equal((await placeOrder(db, customer, packs('Jakarta', 1), 'j1', now, true)).order.deliveryFee, 15000);
  assert.equal((await placeOrder(db, customer, packs('Jakarta', 2), 'j2', now, true)).order.deliveryFee, 0);
  const off = (await placeOrder(db, customer, packs('Bandung', 2), 'off2', now)).order; // dropdown off: old rule
  assert.equal(off.deliveryFee, 0);

  // Always tomorrow, at any hour of the order. The day after Saturday is a Sunday: Monday.
  assert.equal(websiteDeliveryOptions(Date.parse('2026-10-16T20:00:00+07:00'), [], 14, 1)[0], '2026-10-17');
  assert.equal(websiteDeliveryOptions(Date.parse('2026-10-17T09:00:00+07:00'), [], 14, 1)[0], '2026-10-19');
  // A day off pushes it on.
  assert.equal(websiteDeliveryOptions(now, ['2026-10-15', '2026-10-16', '2026-10-17'], 14, 1)[0], '2026-10-19');
});

test('order: customer can pick a later delivery day from the offered days only', async () => {
  const db = freshDb();
  const now = Date.parse('2026-10-15T09:00:00+07:00'); // Thursday
  const { customer } = await signUp(db, person(), now);
  const body = (deliveryDate?: unknown) => ({ items: { babiManis: 1 }, address: address(), deliveryDate });
  const day = (o: { deliveryDate: number | null }) => new Date(o.deliveryDate!).toISOString().slice(0, 10);

  assert.equal(day((await placeOrder(db, customer, body('2026-10-20'), 'k1', now)).order), '2026-10-20');
  assert.equal(day((await placeOrder(db, customer, body(), 'k2', now)).order), '2026-10-15'); // default before 14:00: today
  for (const bad of ['2026-10-14', '2026-10-18', '2026-11-30', 'besok', 20261020]) {
    await assert.rejects(placeOrder(db, customer, body(bad), `bad-${bad}`, now), /Tanggal pengiriman tidak tersedia/);
  }
  // From 14:00 WIB today is no longer offered; the default is tomorrow.
  const afternoon = Date.parse('2026-10-15T14:00:00+07:00');
  await assert.rejects(placeOrder(db, customer, body('2026-10-15'), 'late-today', afternoon), /Tanggal pengiriman tidak tersedia/);
  assert.equal(day((await placeOrder(db, customer, body(), 'late-default', afternoon)).order), '2026-10-16');
  assert.equal(websiteDeliveryOptions(afternoon)[0], '2026-10-16');
});

test('days off: no delivery on them, earliest day moves to the day after, editable and removable', async () => {
  const db = freshDb();
  const now = Date.parse('2026-10-15T09:00:00+07:00'); // Thursday morning
  const { customer } = await signUp(db, person(), now);
  const body = (deliveryDate?: unknown) => ({ items: { babiManis: 1 }, address: address(), deliveryDate });
  const day = (o: { deliveryDate: number | null }) => new Date(o.deliveryDate!).toISOString().slice(0, 10);

  // A paid order already booked on Friday shows up as a warning.
  const booked = (await placeOrder(db, customer, body('2026-10-16'), 'before', now)).order;
  await setPaymentPaid(db, booked.orderRowId);

  // Thu 15 – Fri 16 off: earliest is Saturday 17; Thu/Fri refused.
  const off = await saveDayOff(db, { startDate: '2026-10-15', endDate: '2026-10-16', note: 'Libur' }, now);
  assert.deepEqual(await closedDeliveryDays(db, now), ['2026-10-15', '2026-10-16']);
  assert.deepEqual((await bookedWebsiteOrders(db, '2026-10-15', '2026-10-16')).map((o) => o.deliveryDay), ['2026-10-16']);
  assert.equal(websiteDeliveryOptions(now, await closedDeliveryDays(db, now))[0], '2026-10-17');
  assert.equal(day((await placeOrder(db, customer, body(), 'k1', now)).order), '2026-10-17');
  await assert.rejects(placeOrder(db, customer, body('2026-10-16'), 'k2', now), /Tanggal pengiriman tidak tersedia/);

  // Edited to end on Saturday: day after is Sunday, so Monday 19.
  await saveDayOff(db, { id: off.id, startDate: '2026-10-15', endDate: '2026-10-17', note: '' }, now);
  assert.equal(day((await placeOrder(db, customer, body(), 'k3', now)).order), '2026-10-19');
  assert.equal((await listDaysOff(db, now))[0].note, '');

  // A running day off only counts from today; over ones are hidden.
  assert.deepEqual(await closedDeliveryDays(db, Date.parse('2026-10-17T09:00:00+07:00')), ['2026-10-17']);
  assert.deepEqual(await listDaysOff(db, Date.parse('2026-10-18T09:00:00+07:00')), []);

  // Checks: order of dates, over already, too long, unknown id.
  await assert.rejects(saveDayOff(db, { startDate: '2026-10-20', endDate: '2026-10-19' }, now), /on or after/);
  await assert.rejects(saveDayOff(db, { startDate: '2026-10-01', endDate: '2026-10-14' }, now), /already over/);
  await assert.rejects(saveDayOff(db, { startDate: '2026-10-20', endDate: '2027-01-31' }, now), /at most 62 days/);
  await assert.rejects(saveDayOff(db, { id: 'missing', startDate: '2026-10-20' }, now), /no longer exists/);
  assert.equal((await saveDayOff(db, { startDate: '2026-10-20' }, now)).endDate, '2026-10-20'); // single day

  assert.equal((await listDayOffHistory(db)).length, 2);
  await removeDayOff(db, off.id);
  assert.equal(day((await placeOrder(db, customer, body(), 'k4', now)).order), '2026-10-15');
  await assert.rejects(removeDayOff(db, off.id), /no longer exists/);
});

test('days off: from H-2 only the days off themselves are Penuh', () => {
  const off = [{ startDate: '2026-11-17', endDate: '2026-11-23' }]; // owner's 17–23 Nov
  const at = (wib: string) => Date.parse(`${wib}+07:00`);
  const week = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'];
  // Before H-2 (Sat 14): nothing.
  assert.deepEqual(deliveryScheduleFrom(off, at('2026-11-14T20:00:00')), { closedDays: [], full: false });
  // From H-2 (Sun 15): 17–23 are Penuh, 16 is still a normal day, no full notice.
  const h2 = deliveryScheduleFrom(off, at('2026-11-15T08:00:00'));
  assert.deepEqual(h2, { closedDays: week, full: false });
  const opts = websiteDeliveryOptions(at('2026-11-15T08:00:00'), h2.closedDays);
  assert.equal(opts[0], '2026-11-16');
  assert.equal(opts[1], '2026-11-24');
  // Mon 16 before 14:00: same day 16 still open; after 14:00 the soonest day is a day off → full notice, soonest 24.
  assert.equal(deliveryScheduleFrom(off, at('2026-11-16T10:00:00')).full, false);
  const late = deliveryScheduleFrom(off, at('2026-11-16T15:00:00'));
  assert.equal(late.full, true);
  assert.equal(websiteDeliveryOptions(at('2026-11-16T15:00:00'), late.closedDays)[0], '2026-11-24');
  // During: only the remaining days off are closed; after the last day nothing.
  assert.deepEqual(deliveryScheduleFrom(off, at('2026-11-23T09:00:00')), { closedDays: ['2026-11-23'], full: true });
  assert.deepEqual(deliveryScheduleFrom(off, at('2026-11-24T09:00:00')), { closedDays: [], full: false });
  // Ending on Saturday: soonest is Monday.
  const sat = deliveryScheduleFrom([{ startDate: '2026-10-17', endDate: '2026-10-17' }], at('2026-10-16T15:00:00'));
  assert.equal(websiteDeliveryOptions(at('2026-10-16T15:00:00'), sat.closedDays)[0], '2026-10-19');
});

test('owner paid email: WhatsApp confirmation button instead of the admin link', async () => {
  const db = freshDb();
  const now = Date.parse('2026-10-15T09:00:00+07:00');
  const { customer } = await signUp(db, person(), now);
  const { order } = await placeOrder(db, customer, { items: { babiManis: 1 }, address: address(), deliveryDate: '2026-10-16' }, 'wa', now);
  const mail = ownerPaidEmail('owner@example.com', order, 'x@example.com', { shopUrl: 'https://jentiskitchen.id', adminUrl: 'https://admin.jentiskitchen.id' } as any);
  assert.match(mail.html, /https:\/\/wa\.me\/62\d+\?text=/);
  assert.match(mail.html, /untuk konfirmasi/);
  assert.doesNotMatch(mail.html, /Buka Website Orders/);
});

test('order: takes stock and joins the admin list only once paid, voucher used once, retry-safe', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer, welcome } = await signUp(db, person(), now);
  const body = { items: { babiManis: 2, sapiAsin: 1 }, address: address({ latitude: -6.2, longitude: 106.8 }), voucherCode: welcome!.code.toLowerCase() };
  const { order } = await placeOrder(db, customer, body, 'submit-1', now);

  assert.match(order.orderId, /^\d{12}$/);
  assert.equal(order.paymentStatus, 'PENDING');
  assert.equal(order.subtotal, 3 * 160000);
  assert.equal(order.discount, 96000); // 20% of 480,000
  assert.equal(order.deliveryFee, 0);
  assert.equal(order.total, 480000 - 96000);
  const adminRow = db.raw.prepare('SELECT * FROM orders WHERE id = ?').get(order.orderRowId) as any;
  assert.equal(adminRow.reseller, 'Website');
  // Delivery date: the day after the order (Jakarta), never a Sunday.
  assert.equal(new Date(adminRow.deliveryDate).toISOString().slice(0, 10), websiteDeliveryDateKey(now));
  assert.equal(order.deliveryDate, adminRow.deliveryDate);
  assert.equal(adminRow.phoneNumber, '081234567890');
  assert.match(adminRow.address, /Kel\. Gambir.*Pin: https:\/\/www\.google\.com\/maps\?q=-6\.2,106\.8/);
  // Unpaid: no stock taken, not in the admin order list or reseller report.
  const stock = async () => {
    const inv = await getInventory(db);
    return [inv.quantities.babiManis, inv.quantities.babiAsin, inv.quantities.sapiManis, inv.quantities.sapiAsin];
  };
  assert.deepEqual(await stock(), [10, 10, 10, 10]);
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE type = 'ORDER'`), 0);
  assert.deepEqual(await listOrders(db), []);

  // Paid: stock taken once (even if marked paid twice) and the order appears in the admin list.
  await setPaymentPaid(db, order.orderRowId);
  await setPaymentPaid(db, order.orderRowId);
  assert.deepEqual(await stock(), [8, 10, 10, 9]);
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE type = 'ORDER'`), 1);
  const listed = await listOrders(db);
  assert.deepEqual(listed.map((o) => [o.id, o.fromWebsite, o.websiteShipped]), [[order.orderRowId, true, false]]);

  // Same submission again: same order, nothing applied twice.
  const replay = await placeOrder(db, customer, body, 'submit-1', now);
  assert.equal(replay.replayed, true);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM orders'), 1);

  // A new order with the same voucher is refused and changes nothing.
  await assert.rejects(placeOrder(db, customer, body, 'submit-2', now), /sudah pernah dipakai/);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM orders'), 1);

  // Someone else cannot use this customer's code.
  const other = await signUp(db, person({ email: 'b@b.id', phone: '0822222222' }), now);
  await assert.rejects(placeOrder(db, other.customer, { ...body, voucherCode: welcome!.code }, null, now), /tidak ditemukan/);

  // Cancelling a paid order in the admin returns stock and frees the voucher.
  await cancelOrder(db, order.orderRowId);
  await onOrderCancelled(db, order.orderRowId, 'ADMIN', links, now);
  assert.deepEqual(await stock(), [10, 10, 10, 10]);
  const vouchers = await listCustomerVouchers(db, customer.id, now);
  assert.equal(vouchers[0].status, 'AVAILABLE');

  // Cancelling an unpaid order changes no stock; a payment arriving after the cancel takes none either.
  const unpaid = (await placeOrder(db, customer, body, 'submit-3', now)).order;
  await cancelOrder(db, unpaid.orderRowId);
  await setPaymentPaid(db, unpaid.orderRowId);
  assert.deepEqual(await stock(), [10, 10, 10, 10]);
  assert.equal(count(db, `SELECT COUNT(*) n FROM stock_movement_history WHERE orderId = '${unpaid.orderId}'`), 0);
});

test('order: editing an unpaid website order never changes stock', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  const { order } = await placeOrder(db, customer, { items: { babiManis: 2 }, address: address() }, null, now);
  await editOrder(db, order.orderRowId, { customerName: 'Rini', reseller: 'Website', address: 'x', phoneNumber: '1', babiManis: 5 }, null);
  assert.equal((await getInventory(db)).quantities.babiManis, 10);
  await setPaymentPaid(db, order.orderRowId); // takes the edited quantity
  assert.equal((await getInventory(db)).quantities.babiManis, 5);
});

test('order: single pack pays delivery; stock never blocks a website order', async () => {
  const db = freshDb(2);
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  const { order } = await placeOrder(db, customer, { items: { sapiManis: 1 }, address: address() }, null, now);
  assert.equal(order.deliveryFee, 15000);
  assert.equal(order.total, 160000 + 15000);
  // More than the 2 in stock: accepted, and once paid the admin stock goes below zero like an admin-entered order.
  const big = (await placeOrder(db, customer, { items: { sapiManis: 3 }, address: address() }, null, now)).order;
  await setPaymentPaid(db, big.orderRowId);
  assert.equal((await getInventory(db)).quantities.sapiManis, -1);
  await assert.rejects(placeOrder(db, customer, { items: {}, address: address() }, null, now), /kosong/);
  // Checkout asks for one full address; kelurahan / kecamatan / kota are optional (older orders have them).
  await assert.rejects(placeOrder(db, customer, { items: { sapiManis: 1 }, address: address({ street: ' ' }) }, null, now), /Alamat lengkap/);
  const oneField = (await placeOrder(db, customer, { items: { sapiManis: 1 }, address: { recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. Mawar 1 RT 01/02, Gambir, Jakarta Pusat' } }, null, now)).order;
  assert.equal(fullAddress(oneField), 'Jl. Mawar 1 RT 01/02, Gambir, Jakarta Pusat');
  assert.equal(fullAddress(big), 'Jl. Mawar 1, Kel. Gambir, Kec. Gambir, Jakarta Pusat');
  assert.equal((db.raw.prepare('SELECT address FROM orders WHERE id = ?').get(oneField.orderRowId) as { address: string }).address, 'Jl. Mawar 1 RT 01/02, Gambir, Jakarta Pusat');
});

test('payment proof upload, paid emails once', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  const { order } = await placeOrder(db, customer, { items: { babiAsin: 2 }, address: address() }, null, now);
  const first = await saveProof(db, customer.id, order.orderRowId, 'data:image/jpeg;base64,/9j/AAAA', now);
  assert.equal(first.first, true);
  assert.equal((await saveProof(db, customer.id, order.orderRowId, 'data:image/jpeg;base64,/9j/BBBB', now)).first, false);
  await assert.rejects(saveProof(db, 'someone-else', order.orderRowId, 'data:image/jpeg;base64,/9j/AAAA', now), /tidak ditemukan/);
  await assert.rejects(saveProof(db, customer.id, order.orderRowId, 'data:text/html;base64,PGI+', now), /gambar/);

  const alerts: string[] = [];
  const tg = async (text: string) => void alerts.push(text);
  assert.deepEqual(await onOrderPaid(db, order.orderRowId, 'owner@x.id', links, now, tg), []); // not paid yet
  assert.equal(alerts.length, 0); // unpaid orders are never announced on Telegram
  await setPaymentPaid(db, order.orderRowId);
  const emails = await onOrderPaid(db, order.orderRowId, 'owner@x.id', links, now, tg);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /New website order \(PAID\)/);
  assert.match(alerts[0], new RegExp(`Order ${order.orderId}`));
  assert.match(alerts[0], /2 x Babi Marinade Asin Gurih/);
  assert.match(alerts[0], /Total paid: Rp/);
  assert.deepEqual(emails.map((e) => e.to), ['rini@example.com', 'owner@x.id']);
  assert.match(emails[1].subject, /\[PAID\]/);
  assert.match(emails[1].html, /Babi Marinade Asin Gurih × 2/);
  assert.deepEqual(await onOrderPaid(db, order.orderRowId, 'owner@x.id', links, now, tg), []); // clicked twice
  assert.equal(alerts.length, 1); // announced once
  // Manual resend (lost emails): same two emails again, no new Telegram alert.
  const again = await paidEmailsAgain(db, order.orderRowId, 'owner@x.id', links);
  assert.deepEqual(again.map((e) => e.subject), emails.map((e) => e.subject));
  assert.equal(alerts.length, 1);
  const purchases: { now: number; total: number }[] = [];
  assert.equal(await metaPurchaseAgain(db, order.orderRowId, async (i) => void purchases.push({ now: i.now, total: i.order.total })), true);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].total, order.total);
});

test('referral: referrer gets 25% once, after the friend\'s first delivered order', async () => {
  const db = freshDb();
  const now = Date.now();
  const referrer = (await signUp(db, person(), now)).customer;
  const friend = (await signUp(db, person({ name: 'Budi', email: 'budi@x.id', phone: '0899 1234 5678', referrerPhone: '+6281234567890' }), now)).customer;
  assert.equal(friend.referredById, referrer.id);

  const a = (await placeOrder(db, friend, { items: { babiManis: 2 }, address: address() }, null, now)).order;
  const b = (await placeOrder(db, friend, { items: { babiManis: 2 }, address: address() }, null, now)).order;
  assert.deepEqual(await onOrderDelivered(db, a.orderRowId, links, now), []); // not delivered yet

  await setDelivered(db, a.orderRowId, 15000);
  const emails = await onOrderDelivered(db, a.orderRowId, links, now);
  assert.deepEqual(emails.map((e) => e.to), ['budi@x.id', 'rini@example.com']);
  const reward = (await listCustomerVouchers(db, referrer.id, now)).find((v) => v.kind === 'REFERRAL');
  assert.equal(reward?.percent, 25);
  assert.equal(reward?.capAmount, 100000);
  assert.deepEqual(await onOrderDelivered(db, a.orderRowId, links, now), []); // clicked twice

  await setDelivered(db, b.orderRowId, 15000);
  const second = await onOrderDelivered(db, b.orderRowId, links, now);
  assert.deepEqual(second.map((e) => e.to), ['budi@x.id']); // delivered email only, no second reward
  assert.equal(count(db, `SELECT COUNT(*) n FROM shop_vouchers WHERE kind = 'REFERRAL'`), 1);
});

test('monthly vouchers: one per customer per month, expire at month end (Jakarta), resend only unsent', async () => {
  const db = freshDb();
  const now = Date.parse('2026-10-13T05:00:00Z');
  await signUp(db, person(), now);
  await signUp(db, person({ email: 'b@b.id', phone: '0822222222' }), now);
  const jobs = await issueMonthlyVouchers(db, now);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].voucher.percent, 20);
  assert.equal(jobs[0].voucher.period, '2026-10');
  assert.equal(new Date(jobs[0].voucher.expiresAt!).toISOString(), '2026-10-31T16:59:59.999Z'); // 23:59:59 WIB
  db.raw.prepare('UPDATE shop_vouchers SET emailedAt = 1 WHERE id = ?').run(jobs[0].voucher.id);
  const again = await issueMonthlyVouchers(db, now);
  assert.equal(again.length, 1); // only the unsent one
  assert.equal(count(db, `SELECT COUNT(*) n FROM shop_vouchers WHERE kind = 'MONTHLY'`), 2);
  assert.equal(monthKey(Date.parse('2026-10-31T17:30:00Z')), '2026-11'); // 00:30 WIB on 1 Nov
  assert.equal(endOfJakartaMonth(Date.parse('2026-12-15T00:00:00Z')), Date.parse('2026-12-31T16:59:59.999Z'));

  // Expired monthly voucher is refused at checkout.
  const c = (await loginCustomer(db, { email: 'rini@example.com', password: 'rahasia123' }, now));
  const mine = (await listCustomerVouchers(db, c.id, now)).find((v) => v.kind === 'MONTHLY')!;
  await assert.rejects(
    placeOrder(db, c, { items: { babiManis: 1 }, address: address(), voucherCode: mine.code }, null, Date.parse('2026-11-01T00:00:00Z')),
    /kedaluwarsa/,
  );
  assert.equal((await getShopOrder(db, 'none')), null);
});


const IMG = 'data:image/jpeg;base64,/9j/AAAA';

test('products: admin edits change the shop price; hidden products cannot be ordered; old orders keep their names', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  const before = (await placeOrder(db, customer, { items: { babiManis: 2 }, address: address() }, null, now)).order;
  assert.equal(before.lines[0].name, 'Babi Marinade Manis');

  await updateProduct(db, 'babiManis', { name: 'Babi Manis Spesial', size: '1 kg', description: 'Baru', price: 175000, compareAtPrice: 200000, visible: true, image: IMG }, now);
  const item = (await loadCatalog(db)).find((p) => p.product === 'babiManis')!;
  assert.equal(item.price, 175000);
  assert.equal(item.compareAtPrice, 200000);
  assert.match(item.image, /^\/shop\/media\/[0-9a-f-]{36}$/);
  assert.ok(await getMedia(db, item.image.split('/').pop()!));

  const after = (await placeOrder(db, customer, { items: { babiManis: 2 }, address: address() }, null, now)).order;
  assert.equal(after.subtotal, 350000); // new price is what the customer pays
  assert.equal(after.lines[0].name, 'Babi Manis Spesial');
  assert.equal((await getShopOrder(db, before.orderRowId))!.lines[0].name, 'Babi Marinade Manis'); // unchanged

  await assert.rejects(updateProduct(db, 'babiManis', { name: 'X', size: '1', price: 100000, compareAtPrice: 90000 }, now), /Original price must be higher/);
  await assert.rejects(updateProduct(db, 'babiManis', { name: '', size: '1', price: 100000 }, now), /Name is required/);
  await assert.rejects(updateProduct(db, 'nope', { name: 'X', size: '1', price: 100000 }, now), /Unknown product/);

  // Replacing the photo deletes the old upload; going back to the built-in photo deletes the new one.
  const firstMedia = item.image.split('/').pop()!;
  await updateProduct(db, 'babiManis', { name: 'A', size: '1', price: 175000, image: IMG }, now);
  assert.equal(await getMedia(db, firstMedia), null);
  await updateProduct(db, 'babiManis', { name: 'A', size: '1', price: 175000, resetImage: true }, now);
  assert.equal((await loadCatalog(db)).find((p) => p.product === 'babiManis')!.image, '/shop/products/babi-manis.jpg');
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_media'), 0);

  await updateProduct(db, 'sapiAsin', { name: 'Sapi Asin', size: '500 gram', price: 160000, visible: false }, now);
  await assert.rejects(placeOrder(db, customer, { items: { sapiAsin: 1 }, address: address() }, null, now), /sedang tidak tersedia/);

  const moved = await moveProduct(db, 'sapiManis', 'up', now);
  assert.deepEqual(moved.map((p) => p.product), ['babiManis', 'sapiManis', 'babiAsin', 'sapiAsin']);
});

test('banners: desktop + mobile images, add, edit, hide, reorder, delete', async () => {
  const db = freshDb();
  const now = Date.now();
  const [def] = await listBanners(db, true);
  assert.equal(def.image, '/shop/banners/banner-1.jpg');
  assert.equal(def.mobileImage, '/shop/banners/banner-1.jpg'); // existing banner: same image for both until replaced
  assert.equal(def.title, 'Nikmati Kelezatan\nDaging Pilihan');

  await assert.rejects(createBanner(db, { title: 'X', mobileImage: IMG }, now), /desktop banner image/);
  await assert.rejects(createBanner(db, { title: 'X', image: IMG }, now), /mobile banner image/);
  const pictureOnly = await createBanner(db, { title: '', image: IMG, mobileImage: IMG }, now); // title is optional
  assert.equal(pictureOnly.title, '');
  await deleteBanner(db, pictureOnly.id);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_media'), 0); // both images removed

  const b = await createBanner(db, { title: 'Promo\nAkhir Tahun', badge: 'BARU', image: IMG, mobileImage: IMG }, now);
  assert.match(b.image, /^\/shop\/media\//);
  assert.match(b.mobileImage, /^\/shop\/media\//);
  assert.notEqual(b.image, b.mobileImage);

  // Replacing only the mobile image keeps the desktop one and removes the old mobile upload.
  const updated = await updateBanner(db, b.id, { title: b.title, mobileImage: IMG }, now);
  assert.equal(updated.image, b.image);
  assert.notEqual(updated.mobileImage, b.mobileImage);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_media'), 2);

  // Replacing only the desktop image of the built-in banner keeps its built-in mobile image.
  const def2 = await updateBanner(db, def.id, { title: def.title, image: IMG }, now);
  assert.match(def2.image, /^\/shop\/media\//);
  assert.equal(def2.mobileImage, '/shop/banners/banner-1.jpg');

  await moveBanner(db, b.id, 'up', now);
  assert.equal((await listBanners(db, true))[0].id, b.id);
  await updateBanner(db, def.id, { title: def.title, active: false }, now);
  assert.deepEqual((await listBanners(db, true)).map((x) => x.id), [b.id]);

  await deleteBanner(db, b.id);
  await deleteBanner(db, def.id);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_media'), 0);
  assert.equal((await listBanners(db, false)).length, 0);
});

test('website-only products (from before every product had stock): sold without touching stock, deletable', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  db.raw.exec(`INSERT INTO shop_products (product, name, size, description, price, visible, sortOrder, updatedAt, stockColumn)
    VALUES ('web-sambal', 'Sambal Bawang', '200 ml', 'Pedas', 45000, 1, 9, 0, NULL)`);
  const sambal = (await loadCatalog(db)).find((p) => p.product === 'web-sambal')!;
  assert.equal(sambal.stockColumn, null);
  assert.equal(sambal.image, ''); // no photo yet: the shop shows a coloured tile

  // A cart with only the website-only product: no stock change, admin order has 0 boxes.
  const only = (await placeOrder(db, customer, { items: { [sambal.product]: 2 }, address: address() }, null, now)).order;
  assert.equal(only.subtotal, 90000);
  assert.equal(only.deliveryFee, 0); // 2 packs: free delivery
  assert.deepEqual(only.lines, [{ product: sambal.product, name: 'Sambal Bawang', price: 45000, qty: 2, stockColumn: null }]);
  const adminRow = db.raw.prepare('SELECT * FROM orders WHERE id = ?').get(only.orderRowId) as any;
  assert.deepEqual([adminRow.babiManis, adminRow.babiAsin, adminRow.sapiManis, adminRow.sapiAsin, adminRow.boxCounter], [0, 0, 0, 0, 0]);
  assert.equal((await getInventory(db)).quantities.babiManis, 10);

  // Mixed cart: once paid, stock products are deducted, the website-only one is listed on the shop order.
  const mixed = (await placeOrder(db, customer, { items: { babiManis: 1, [sambal.product]: 1 }, address: address() }, null, now)).order;
  await setPaymentPaid(db, mixed.orderRowId);
  assert.equal(mixed.subtotal, 160000 + 45000);
  assert.equal((await getInventory(db)).quantities.babiManis, 9);
  assert.deepEqual(mixed.lines.map((l) => l.name), ['Babi Marinade Manis', 'Sambal Bawang']);

  // Delete: past orders keep the item; the deleted product is ignored if still in someone's cart.
  await deleteProduct(db, sambal.product);
  assert.equal((await getShopOrder(db, only.orderRowId))!.lines[0].name, 'Sambal Bawang');
  await assert.rejects(placeOrder(db, customer, { items: { [sambal.product]: 1 }, address: address() }, null, now), /kosong/);
  await assert.rejects(deleteProduct(db, 'babiManis'), /already has stock, orders or stock history/);
});

test('new products: on the website and in the inventory, orders, stock movements and Telegram at once', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  const ayam = await createProduct(db, { name: 'Ayam Marinade Pedas', shortName: 'Ayam Pedas', boxValue: '0,5', size: '500 gram', price: 120000, initialStock: 7 }, now);
  assert.equal(ayam.boxValue, 0.5);
  assert.equal(ayam.product, 'ayamPedas');
  assert.equal(ayam.stockColumn, 'ayamPedas');
  assert.equal((await loadCatalog(db)).at(-1)!.product, 'ayamPedas'); // added at the end
  assert.deepEqual((await loadStockProducts(db)).map((p) => p.label), ['Babi Manis', 'Babi Asin', 'Sapi Manis', 'Sapi Asin', 'Ayam Pedas']);
  // Starting stock is a normal production entry.
  assert.equal((await getInventory(db)).quantities.ayamPedas, 7);
  const prod = db.raw.prepare(`SELECT * FROM stock_movement_history WHERE type = 'PRODUCTION'`).get() as any;
  assert.deepEqual([prod.ayamPedasBeginning, prod.ayamPedasChanges, prod.ayamPedasFinal, prod.babiManisChanges], [0, 7, 7, 0]);

  // A name that is already taken gets a number; names are checked without case.
  const second = await createProduct(db, { name: 'BABI manis', size: '1 kg', price: 300000, boxValue: 2 }, now);
  assert.equal(second.product, 'babiManis2');

  // Website order: stock is taken once paid, from the new product's own column.
  const { order } = await placeOrder(db, customer, { items: { ayamPedas: 2, babiManis: 1 }, address: address() }, null, now);
  assert.equal(order.subtotal, 2 * 120000 + 160000);
  await setPaymentPaid(db, order.orderRowId);
  let inv = await getInventory(db);
  assert.deepEqual([inv.quantities.ayamPedas, inv.quantities.babiManis], [5, 9]);
  const adminOrder = (await getOrder(db, order.orderRowId))!;
  assert.deepEqual(adminOrder.quantities, { babiManis: 1, babiAsin: 0, sapiManis: 0, sapiAsin: 0, ayamPedas: 2, babiManis2: 0 });
  assert.equal(adminOrder.boxCounter, 2); // 2 packs x 0.5 + 1 pack x 1

  // Box counter value: required on create, decimals up to 2 places; a change applies to orders saved afterwards.
  await assert.rejects(createProduct(db, { name: 'Tanpa Box', size: '1', price: 100000 }, now), /Box counter value is required/);
  await assert.rejects(createProduct(db, { name: 'Salah', size: '1', price: 100000, boxValue: '0.333' }, now), /at most 2 decimals/);
  await assert.rejects(createProduct(db, { name: 'Nol', size: '1', price: 100000, boxValue: 0 }, now), /above 0/);
  await updateProduct(db, 'ayamPedas', { name: 'Ayam Marinade Pedas', shortName: 'Ayam Pedas', size: '500 gram', price: 120000, boxValue: 1.5 }, now);
  assert.equal((await getOrder(db, order.orderRowId))!.boxCounter, 2); // stored order unchanged

  // Admin edit and cancel move the new product's stock too.
  await editOrder(db, order.orderRowId, { customerName: 'Rini', reseller: 'Website', address: 'x', phoneNumber: '1', quantities: { babiManis: 1, ayamPedas: 4 } }, null);
  assert.equal((await getInventory(db)).quantities.ayamPedas, 3);
  assert.equal((await getOrder(db, order.orderRowId))!.boxCounter, 7); // 4 x 1.5 + 1 (new box value on edit)
  await cancelOrder(db, order.orderRowId);
  inv = await getInventory(db);
  assert.deepEqual([inv.quantities.ayamPedas, inv.quantities.babiManis], [7, 10]);

  // Adjust stock and the low stock alert know the new product.
  await adjustStock(db, { ayamPedas: 2 }, null);
  assert.equal((await getInventory(db)).quantities.ayamPedas, 2);
  const products = await loadStockProducts(db);
  assert.match(stockMessage((await getInventory(db)).quantities, products)!, /• Ayam Pedas: 2/);

  // Delete: only while never stocked or ordered.
  await assert.rejects(deleteProduct(db, 'ayamPedas'), /cannot be deleted/);
  await deleteProduct(db, 'babiManis2');
  assert.ok(!(await loadStockProducts(db)).some((p) => p.key === 'babiManis2'));
  assert.equal((await createProduct(db, { name: 'Babi Manis', size: '1 kg', price: 300000, boxValue: 1 }, now)).product, 'babiManis3'); // old columns stay reserved
});

test('shipping: a paid order is shipped with a tracking link (emailed once); Mark delivered finishes it', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  const { order } = await placeOrder(db, customer, { items: { babiManis: 2 }, address: address() }, null, now);

  await assert.rejects(shipOrder(db, order.orderRowId, 'https://track.example/1', links, now, 20000), /not paid yet/);
  await setPaymentPaid(db, order.orderRowId);
  await assert.rejects(assertCanMarkDelivered(db, order.orderRowId), /Ship order/);
  await assert.rejects(shipOrder(db, order.orderRowId, 'track.example/1', links, now), /full tracking link/);
  await assert.rejects(shipOrder(db, order.orderRowId, 'javascript:alert(1)', links, now), /full tracking link|must start/);

  await assert.rejects(shipOrder(db, order.orderRowId, 'https://track.example/1', links, now), /Enter the delivery fee/);

  const shipTime = now + 60_000;
  const first = await shipOrder(db, order.orderRowId, 'https://track.example/1', links, shipTime, 20000);
  assert.equal(first.firstTime, true);
  assert.equal(first.emails.length, 1); // only "sedang dikirim" with the tracking link
  assert.match(first.emails[0].subject, /sedang dikirim/);
  assert.match(first.emails[0].html, /href="https:\/\/track\.example\/1"/); // clickable link in the email
  const again = await shipOrder(db, order.orderRowId, 'https://track.example/2', links, shipTime + 1000, '22.500'); // link + fee corrected
  assert.deepEqual(again.emails, []);
  const shipped = (await getShopOrder(db, order.orderRowId))!;
  assert.equal(shipped.trackingUrl, 'https://track.example/2');
  assert.equal(shipped.courierFee, 22500);
  assert.equal(shipped.shippedAt, shipTime); // time it entered "Dalam Perjalanan"
  assert.equal(shipped.deliveryStatus, 'PENDING'); // on its way, not delivered yet
  assert.equal(shipped.deliveredAt, null);

  // Shipped: it can no longer be cancelled, and the admin list knows it was shipped.
  await assert.rejects(cancelOrder(db, order.orderRowId), /already shipped/);
  assert.equal((await listOrders(db))[0].websiteShipped, true);

  // Mark delivered: allowed now; "Diterima" email; time it entered "Sampai di Tujuan" recorded.
  await assertCanMarkDelivered(db, order.orderRowId);
  await setDelivered(db, order.orderRowId);
  const deliveredTime = shipTime + 3_600_000;
  const delivered = await onOrderDelivered(db, order.orderRowId, links, deliveredTime);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].subject, deliveredEmail(customer.email, (await getShopOrder(db, order.orderRowId))!, links).subject);
  const done = (await getShopOrder(db, order.orderRowId))!;
  assert.equal(done.deliveryStatus, 'DELIVERED');
  assert.equal(done.deliveredAt, deliveredTime);
  assert.ok(done.paidAt); // time it entered "Diproses"
  await assertCanMarkDelivered(db, 'not-a-website-order'); // admin-entered orders have no ship step
});

test('shipping: courier choice; TIKI and JNE take a resi (letters and numbers), the email links to the courier\'s cek resi page', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  const place = async () => {
    const { order } = await placeOrder(db, customer, { items: { babiManis: 2 }, address: address() }, null, now);
    await setPaymentPaid(db, order.orderRowId);
    return order.orderRowId;
  };

  const tiki = await place();
  await assert.rejects(shipOrder(db, tiki, '', links, now, 30000, 'pos'), /choose the courier/);
  await assert.rejects(shipOrder(db, tiki, '', links, now, 30000, 'tiki', ''), /enter the resi/);
  await assert.rejects(shipOrder(db, tiki, '', links, now, 30000, 'tiki', '0301-2345'), /letters and numbers/);
  const shipped = await shipOrder(db, tiki, '', links, now, 30000, 'tiki', ' 0301 2345ab ');
  const t = (await getShopOrder(db, tiki))!;
  assert.equal(t.courier, 'tiki');
  assert.equal(t.trackingNumber, '03012345AB');
  assert.equal(t.trackingUrl, 'https://www.tiki.id/id/track');
  assert.match(shipped.emails[0].html, /03012345AB/);
  assert.match(shipped.emails[0].html, /Cek resi di TIKI/);

  const jne = await place();
  await shipOrder(db, jne, '', links, now, 30000, 'jne', 'CGK1234567890');
  assert.equal((await getShopOrder(db, jne))!.trackingUrl, 'https://www.jne.co.id/tracking-package');

  // Link couriers keep the tracking link; switching TIKI to Paxel clears the resi.
  await shipOrder(db, tiki, 'https://paxel.co/track/ABC', links, now, 40000, 'paxel', 'IGNORED');
  const p = (await getShopOrder(db, tiki))!;
  assert.deepEqual([p.courier, p.trackingNumber, p.trackingUrl], ['paxel', null, 'https://paxel.co/track/ABC']);
  await assert.rejects(shipOrder(db, jne, 'not a link', links, now, 30000, 'grab'), /full tracking link/);
});

test('shipping emails the customer; the referrer is rewarded when the order is marked delivered', async () => {
  const db = freshDb();
  const now = Date.now();
  const referrer = await signUp(db, person({ email: 'ref@x.id', phone: '0811111111' }), now);
  const { customer } = await signUp(db, person({ referrerPhone: '0811111111' }), now);
  assert.equal(customer.referredById, referrer.customer.id);
  const { order } = await placeOrder(db, customer, { items: { babiManis: 2 }, address: address() }, null, now);
  await setPaymentPaid(db, order.orderRowId);
  const { emails } = await shipOrder(db, order.orderRowId, 'https://track.example/1', links, now, 20000);
  assert.deepEqual(emails.map((e) => e.to), [customer.email]);
  assert.match(emails[0].subject, /sedang dikirim/);
  assert.deepEqual(await onOrderDelivered(db, order.orderRowId, links, now), []); // not delivered yet: no reward
  await setDelivered(db, order.orderRowId);
  const delivered = await onOrderDelivered(db, order.orderRowId, links, now);
  assert.deepEqual(delivered.map((e) => e.to), [customer.email, 'ref@x.id']);
});

test('cancel by admin: customer emailed once with the reason, voucher freed', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer, welcome } = await signUp(db, person(), now);
  const { order } = await placeOrder(db, customer, { items: { babiManis: 2 }, address: address(), voucherCode: welcome!.code }, null, now);
  assert.deepEqual(await onOrderCancelled(db, order.orderRowId, 'ADMIN', links, now), []); // not cancelled yet: nothing
  await cancelOrder(db, order.orderRowId);
  const emails = await onOrderCancelled(db, order.orderRowId, 'ADMIN', links, now);
  assert.equal(emails.length, 1);
  assert.match(emails[0].subject, /dibatalkan/);
  assert.match(emails[0].html, /bisa digunakan lagi/); // voucher freed
  assert.deepEqual(await onOrderCancelled(db, order.orderRowId, 'ADMIN', links, now), []); // once
  assert.equal((await getShopOrder(db, order.orderRowId))!.cancelReason, 'ADMIN');
});

test('contact link: WhatsApp with the order ID in the message', () => {
  const url = whatsappOrderLink('131020260007');
  assert.equal(
    decodeURIComponent(url),
    'https://wa.me/6285215448802?text=Halo Admin Jentis Kitchen, tolong cek orderan saya dong dengan order ID 131020260007',
  );
});

test('attempt limits: per key, within the window only, nothing counted once blocked', async () => {
  const db = freshDb();
  const now = Date.UTC(2026, 9, 15, 3);
  for (let i = 0; i < 3; i++) await hitRateLimits(db, [LIMITS.forgotEmail('Rini@example.com')], now + i);
  await assert.rejects(hitRateLimits(db, [LIMITS.forgotEmail('rini@example.com')], now + 10), /Terlalu banyak/);
  // Another email and another IP are not affected.
  await hitRateLimits(db, [LIMITS.forgotEmail('budi@example.com'), LIMITS.forgotIp('1.2.3.4')], now + 10);
  // One hour later the first email works again.
  await hitRateLimits(db, [LIMITS.forgotEmail('rini@example.com')], now + 60 * 60 * 1000 + 5);
  // Five sign-ups per IP per hour.
  for (let i = 0; i < 5; i++) await hitRateLimits(db, [LIMITS.register('9.9.9.9')], now + i);
  await assert.rejects(hitRateLimits(db, [LIMITS.register('9.9.9.9')], now + 20), /Terlalu banyak/);
  // Ten website orders and twenty voucher tries per customer.
  for (let i = 0; i < 10; i++) await hitRateLimits(db, [LIMITS.order('c1')], now + i);
  await assert.rejects(hitRateLimits(db, [LIMITS.order('c1')], now + 20), /Terlalu banyak/);
  await hitRateLimits(db, [LIMITS.order('c2')], now + 20);
  for (let i = 0; i < 20; i++) await hitRateLimits(db, [LIMITS.voucherTry('c1')], now + i);
  await assert.rejects(hitRateLimits(db, [LIMITS.voucherTry('c1')], now + 30), /Terlalu banyak/);
  await hitRateLimits(db, [LIMITS.voucherTry('c1')], now + 15 * 60 * 1000 + 30);
});

test('WhatsApp follow-up: Indonesian numbers get 62, message filled in', () => {
  assert.equal(whatsappNumber('081234567890'), '6281234567890');
  assert.equal(whatsappNumber('+62 812-3456-7890'), '6281234567890');
  assert.equal(whatsappNumber('6281234567890'), '6281234567890');
  assert.equal(whatsappNumber('81234567890'), '6281234567890');
  const text = orderConfirmationMessage({
    customerName: 'Rini',
    lines: [{ name: 'Babi Marinade Manis', qty: 2 }, { name: 'Sapi Marinade Asin Gurih', qty: 1 }],
    address: 'Jl. Mawar 1, Kel. Gambir, Kec. Gambir, Jakarta Pusat',
    deliveryDate: Date.parse('2026-10-16T00:00:00Z'),
  });
  assert.equal(text, [
    'Halo Kak Rini, kami dari Jentis Kitchen ingin mengkonfirmasi pesanan kakak yang akan dikirimkan ke *Jl. Mawar 1, Kel. Gambir, Kec. Gambir, Jakarta Pusat*',
    'pada *Jumat, 16 Oktober 2026*',
    '',
    'Dengan pesanan :',
    '- 2 x Babi Marinade Manis',
    '- 1 x Sapi Marinade Asin Gurih',
    '',
    'Apakah sudah benar detail pesanannya kak?',
    'Terima kasih',
  ].join('\n'));
  assert.equal(orderFollowUpMessage('Rini'), [
    'Halo Kak Rini, apakah sudah dicoba masak dan di makan kak orderannya kemarin?',
    '',
    'Apakah kakak suka akan produknya? mungkin dari segi rasa / empuk dagingnya?',
  ].join('\n'));
  assert.ok(whatsappLink('0812 3456 7890', text).startsWith('https://wa.me/6281234567890?text=Halo%20Kak%20Rini'));
});

test('change delivery date: the owner moves an order, all readers follow, the customer is emailed on a real change', async () => {
  const db = freshDb();
  const now = Date.parse('2026-11-02T03:00:00Z'); // Monday 10:00 WIB
  const { customer } = await signUp(db, person(), now);
  const { order } = await placeOrder(db, customer, { items: { babiManis: 2 }, address: address(), deliveryDate: '2026-11-04' }, null, now);
  const id = order.orderRowId;
  const stored = async () => new Date((await getOrder(db, id))!.deliveryDate!).toISOString().slice(0, 10);

  // Unpaid orders can be moved too; the email says it ships after payment.
  const unpaid = await changeDeliveryDate(db, id, '2026-11-05', links, now);
  assert.equal(unpaid.changed, true);
  assert.match(unpaid.emails[0].html, /Dikirim setelah pembayaran diterima/);
  assert.equal(await stored(), '2026-11-05');
  await setPaymentPaid(db, id);

  const { emails, changed } = await changeDeliveryDate(db, id, '2026-11-06', links, now);
  assert.equal(changed, true);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, customer.email);
  assert.match(emails[0].subject, /Tanggal pengiriman pesanan .* diubah/);
  assert.match(emails[0].html, /Jumat, 6 November 2026/);
  assert.match(emails[0].html, /Tanggal sebelumnya: Kamis, 5 November 2026/);
  // Stored as midnight UTC, and every reader follows: shop order, admin order, 19:00 delivery list.
  assert.equal((await getShopOrder(db, id))!.deliveryDate, Date.parse('2026-11-06T00:00:00Z'));
  assert.equal(await stored(), '2026-11-06');
  const orders = await listOrders(db);
  assert.deepEqual(ordersForDelivery(orders, '2026-11-06').map((o) => o.id), [id]);
  assert.deepEqual(ordersForDelivery(orders, '2026-11-05'), []);

  // Same date again: nothing changes, no email.
  const same = await changeDeliveryDate(db, id, '2026-11-06', links, now);
  assert.equal(same.changed, false);
  assert.deepEqual(same.emails, []);

  // Today, a Sunday and a store day off are allowed by hand; the owner only gets warnings.
  await saveDayOff(db, { startDate: '2026-11-10', endDate: '2026-11-11' }, now);
  for (const day of ['2026-11-02', '2026-11-08', '2026-11-10']) {
    await changeDeliveryDate(db, id, day, links, now);
    assert.equal(await stored(), day);
  }
  const off = [{ startDate: '2026-11-10', endDate: '2026-11-11' }];
  assert.deepEqual(deliveryDayWarnings('2026-11-09', off, now), []);
  assert.match(deliveryDayWarnings('2026-11-08', off, now).join(), /Sunday/);
  assert.match(deliveryDayWarnings('2026-11-11', off, now).join(), /day off/);
  assert.match(deliveryDayWarnings('2026-11-02', off, now).join(), /19:00/);
  // Tomorrow's list only goes out at 19:00 WIB.
  assert.deepEqual(deliveryDayWarnings('2026-11-03', off, Date.parse('2026-11-02T11:59:00Z')), []);
  assert.match(deliveryDayWarnings('2026-11-03', off, Date.parse('2026-11-02T12:00:00Z')).join(), /19:00/);

  // Refused: past days (Jakarta time), nonsense, unknown orders.
  await assert.rejects(changeDeliveryDate(db, id, '2026-11-01', links, now), /already over/);
  for (const bad of ['', 'besok', '2026-02-31', '2026-11-7', undefined, 20261107]) {
    await assert.rejects(changeDeliveryDate(db, id, bad, links, now), /choose a delivery date/);
  }
  await assert.rejects(changeDeliveryDate(db, 'nope', '2026-11-09', links, now), /not found/);
  // Refused changes leave the date alone.
  assert.equal(await stored(), '2026-11-10');

  // Shipped but not delivered: still movable. Delivered: locked.
  await shipOrder(db, id, 'https://track.example/1', links, now, 20000);
  await changeDeliveryDate(db, id, '2026-11-09', links, now);
  await setDelivered(db, id);
  await assert.rejects(changeDeliveryDate(db, id, '2026-11-12', links, now), /already delivered/);
  assert.equal(await stored(), '2026-11-09');

  // Cancelled: locked.
  const second = (await placeOrder(db, customer, { items: { babiManis: 1 }, address: address() }, null, now)).order;
  await cancelOrder(db, second.orderRowId);
  await assert.rejects(changeDeliveryDate(db, second.orderRowId, '2026-11-12', links, now), /cancelled/);
});

test('change delivery date: a guest order without email changes without an email; with email it uses the checkout email', async () => {
  const db = freshDb();
  const now = Date.parse('2026-11-02T03:00:00Z');
  const silent = (await placeOrder(db, guest(), { items: { babiManis: 1 }, address: address() }, null, now)).order;
  const res = await changeDeliveryDate(db, silent.orderRowId, '2026-11-09', links, now);
  assert.deepEqual([res.changed, res.customerHasEmail, res.emails.length], [true, false, 0]);
  const mailed = (await placeOrder(db, guest('tamu@example.id', false), { items: { babiManis: 1 }, address: address({ recipientPhone: '0855 1234 0000' }) }, null, now)).order;
  const res2 = await changeDeliveryDate(db, mailed.orderRowId, '2026-11-09', links, now);
  assert.equal(res2.emails[0].to, 'tamu@example.id');
  assert.ok(res2.emails[0].html.includes(mailed.guestKey!)); // private link, no sign-in needed
});

const guest = (email: string | null = null, createAccount = true): Guest => ({ guest: true, email, phone: null, createAccount });

test('guest checkout: no email = no account, private key only, payer from the delivery details', async () => {
  const db = freshDb();
  const now = Date.now();
  const { order, newAccount } = await placeOrder(db, guest(), { items: { babiManis: 2 }, address: address() }, 'g-1', now);
  assert.equal(newAccount, null);
  assert.equal(order.customerId, '');
  assert.equal(order.contactEmail, null);
  assert.match(order.guestKey!, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_customers'), 0);
  // Only the browser (or link) with the key can open it.
  assert.equal(canViewOrder(order, { customerId: null, guestKey: order.guestKey }), true);
  assert.equal(canViewOrder(order, { customerId: null, guestKey: 'wrong' }), false);
  assert.equal(canViewOrder(order, { customerId: '', guestKey: null }), false);
  assert.equal(orderUrl(order, links), `https://jentiskitchen.id/orders/${order.orderRowId}/open?k=${order.guestKey}`);
  // Payment page: name and phone from the order; gateways need an email, so the shop's no-reply address.
  assert.deepEqual(payerFor(order, null, links), { id: `guest-${order.orderId}`, name: 'Rini', email: 'noreply@jentiskitchen.id', phone: '6281234567890' });
  // No email: nobody to email, but the owner still sees it (as "Guest").
  assert.equal((await orderContact(db, order)).email, null);
  await setPaymentPaid(db, order.orderRowId);
  const emails = await onOrderPaid(db, order.orderRowId, 'owner@x.id', links, now);
  assert.deepEqual(emails.map((e) => e.to), ['owner@x.id']);
  assert.match(emails[0].html, /guest, no email/);
  assert.deepEqual((await listWebsiteOrders(db)).map((o) => [o.customerName, o.customerEmail]), [['Guest', 'no email']]);
  // Retry of the same submission: same order.
  const replay = await placeOrder(db, guest(), { items: { babiManis: 2 }, address: address() }, 'g-1', now);
  assert.equal(replay.replayed, true);
  assert.equal(replay.order.orderRowId, order.orderRowId);
  // Proof upload works with the key only.
  await assert.rejects(saveProof(db, { customerId: null, guestKey: 'x' }, order.orderRowId, 'data:image/jpeg;base64,/9j/AAAA', now), /tidak ditemukan/);
});

test('guest checkout: a new email + new phone makes an account without password; the emailed link sets it', async () => {
  const db = freshDb();
  const now = Date.now();
  const { order, newAccount } = await placeOrder(db, guest('Budi@Example.com'.toLowerCase()), { items: { babiManis: 2 }, address: address({ recipientName: 'Budi', recipientPhone: '0813 1111 2222' }) }, null, now);
  assert.ok(newAccount);
  assert.deepEqual([newAccount.email, newAccount.name, newAccount.phone, newAccount.hasPassword, newAccount.emailVerifiedAt], ['budi@example.com', 'Budi', '6281311112222', false, now]);
  assert.equal(order.customerId, newAccount.id); // in the new account's order list
  assert.equal(order.contactEmail, 'budi@example.com');
  assert.equal((await orderContact(db, order)).email, 'budi@example.com');
  // No password yet: login never works, whatever is typed.
  await assert.rejects(loginCustomer(db, { email: 'budi@example.com', password: '' }, now), /salah/);
  // The emailed "Buat password" link sets the first password, signs in and confirms the email.
  const token = await createPasswordSetupToken(db, newAccount.id, now);
  const { customer } = await finishPasswordReset(db, { token, password: 'rahasia123' }, now + 3 * 86400_000); // still valid after 3 days
  assert.equal(customer.hasPassword, true);
  assert.ok(customer.emailVerifiedAt);
  assert.equal((await loginCustomer(db, { email: 'budi@example.com', password: 'rahasia123' }, now)).id, newAccount.id);
  // Links run out after 7 days.
  const old = await createPasswordSetupToken(db, newAccount.id, now);
  await assert.rejects(finishPasswordReset(db, { token: old, password: 'rahasia456' }, now + 8 * 86400_000), /tidak berlaku/);
  // Registering with that email (the register page) is refused for an account that already has a password.
  await assert.rejects(registerCustomer(db, person({ email: 'budi@example.com', phone: '0899999999' }), now), /sudah terdaftar/);
});

test('guest checkout: known email joins that account; known phone with a new email makes no account', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer: rini } = await signUp(db, person(), now);
  const known = await placeOrder(db, guest('rini@example.com'), { items: { babiManis: 2 }, address: address({ recipientPhone: '0877 0000 1111' }) }, null, now);
  assert.equal(known.newAccount, null);
  assert.equal(known.order.customerId, rini.id); // shows in Rini's order list
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_customers'), 1);
  assert.deepEqual((await listWebsiteOrders(db)).map((o) => o.customerName), ['Guest (account: Rini)']);

  // New email, but Rini's phone as delivery phone: order goes through, no account, no voucher.
  const phoneTaken = await placeOrder(db, guest('someone@new.id'), { items: { babiManis: 2 }, address: address() }, null, now);
  assert.equal(phoneTaken.newAccount, null);
  assert.equal(phoneTaken.order.customerId, '');
  assert.equal(phoneTaken.order.contactEmail, 'someone@new.id');
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_customers'), 1);

  // Sign-up limit used up: no account either.
  const limited = await placeOrder(db, guest('fresh@new.id', false), { items: { babiManis: 2 }, address: address({ recipientPhone: '0855 5555 5555' }) }, null, now);
  assert.equal(limited.newAccount, null);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_customers'), 1);
});

test('guest checkout: another customer\'s personal voucher works once and puts the order in that customer\'s list', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer: rini, welcome } = await signUp(db, person(), now);
  const body = { items: { babiManis: 2 }, address: address({ recipientName: 'Teman', recipientPhone: '0866 1234 5678' }), voucherCode: welcome!.code };
  const { order, newAccount } = await placeOrder(db, guest(), body, null, now);
  assert.equal(newAccount, null);
  assert.equal(order.customerId, rini.id);
  assert.equal(order.discount, 64000); // 20% of 320.000
  // Rini's account sees it, but order emails only go to the email typed by the guest (none here).
  assert.equal(canViewOrder(order, { customerId: rini.id, guestKey: null }), true);
  assert.equal((await orderContact(db, order)).email, null);
  // Used once only.
  await assert.rejects(placeOrder(db, guest(), body, null, now), /sudah pernah dipakai/);
  // A signed-in customer still cannot use someone else's code.
  const other = await signUp(db, person({ email: 'b@b.id', phone: '0822222222' }), now);
  await cancelOrder(db, order.orderRowId);
  await onOrderCancelled(db, order.orderRowId, 'ADMIN', links, now);
  await assert.rejects(placeOrder(db, other.customer, body, null, now), /tidak ditemukan untuk akun ini/);
  // Vouchers of a deactivated account stop working for guests too.
  await setCustomerDisabled(db, rini.id, true, now);
  await assert.rejects(placeOrder(db, guest(), body, null, now), /tidak berlaku/);
});

test('new-customer discount for guests: once per phone and email, freed on cancel, race-safe', async () => {
  const db = freshDb();
  const now = Date.now();
  const body = (phone: string, extra: Record<string, unknown> = {}) => ({ items: { babiManis: 2 }, address: address({ recipientPhone: phone }), newCustomerDiscount: true, ...extra });
  const first = (await placeOrder(db, guest(), body('0811 1000 0001'), null, now)).order;
  assert.equal(first.discount, 64000); // 20% of 320.000
  assert.equal(first.deliveryFee, 0);
  assert.equal(first.voucherCode, 'PELANGGAN BARU');
  assert.equal(first.newCustomerDiscount, true);
  assert.equal(first.customerId, '');
  // Same phone again: refused with the first-purchase message; nothing saved.
  await assert.rejects(placeOrder(db, guest(), body('0811-1000-0001'), null, now), /hanya untuk pembelian pertama/);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM shop_orders'), 1);
  // Without the discount the same phone can still order at full price.
  assert.equal((await placeOrder(db, guest(), { ...body('0811 1000 0001'), newCustomerDiscount: false }, null, now)).order.discount, 0);
  // Cancelled: the discount is free again for that phone.
  await cancelOrder(db, first.orderRowId);
  await onOrderCancelled(db, first.orderRowId, 'CUSTOMER', links, now);
  await placeOrder(db, guest(), body('0811 1000 0001'), null, now);

  // Email: a different phone with an email that already used it is refused too.
  await placeOrder(db, guest('ani@new.id', false), body('0811 1000 0002'), null, now);
  await assert.rejects(placeOrder(db, guest('ani@new.id', false), body('0811 1000 0003'), null, now), /pembelian pertama/);

  // Two tabs at once: the guard inside the order transaction refuses a second active order with the discount.
  const solo = (await placeOrder(db, guest(), body('0811 1000 0009'), null, now)).order;
  const id = { phones: ['6281110000009'], emails: [] };
  await newCustomerGuardStatement(db, id).run(); // only this order holds it: passes
  db.raw.prepare(`INSERT INTO shop_orders (orderRowId, customerId, recipientName, recipientPhone, street, kelurahan, kecamatan, city, unitPrices, subtotal, discount, deliveryFee, total, voucherActive, createdAt, newCustomerDiscount)
    VALUES ('race', '', 'x', '6281110000009', 's', 'k', 'k', 'c', '{}', 0, 0, 0, 0, 1, 0, 1)`).run();
  await assert.rejects(newCustomerGuardStatement(db, id).run(), /CHECK constraint failed/);
  assert.ok(solo);
});

test('new-customer discount: an account\'s unused welcome voucher is spent; new accounts get theirs spent; sign-ups after a guest use get none', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer: rini, welcome } = await signUp(db, person(), now);
  // Guest with Rini's email (other phone): Rini's own welcome voucher is used, order in Rini's list.
  const o = (await placeOrder(db, guest('rini@example.com'), { items: { babiManis: 2 }, address: address({ recipientPhone: '0822 3333 4444' }), newCustomerDiscount: true }, null, now)).order;
  assert.equal(o.customerId, rini.id);
  assert.equal(o.voucherCode, welcome!.code);
  assert.equal(o.newCustomerDiscount, true);
  // Rini signed in cannot use it again, and neither can a guest with her phone.
  await assert.rejects(placeOrder(db, rini, { items: { babiManis: 2 }, address: address(), voucherCode: welcome!.code }, null, now), /sudah pernah dipakai/);
  await assert.rejects(placeOrder(db, guest(), { items: { babiManis: 2 }, address: address(), newCustomerDiscount: true }, null, now), /pembelian pertama/);

  // New email + new phone: the account is made and its welcome voucher is spent on this order.
  const made = await placeOrder(db, guest('budi@new.id'), { items: { babiManis: 2 }, address: address({ recipientPhone: '0855 1234 0000' }), newCustomerDiscount: true }, null, now);
  assert.ok(made.newAccount);
  assert.equal(made.order.customerId, made.newAccount.id);
  assert.equal(made.order.discount, 64000);
  const budiVouchers = await listCustomerVouchers(db, made.newAccount.id, now);
  assert.deepEqual(budiVouchers.map((v) => [v.kind, v.status]), [['WELCOME', 'USED']]);

  // A guest who used it without an account, then signs up with that phone: no new welcome voucher.
  await placeOrder(db, guest(), { items: { babiManis: 2 }, address: address({ recipientPhone: '0866 0000 1111' }), newCustomerDiscount: true }, null, now);
  assert.equal(await newCustomerDiscountUsed(db, { phones: ['6286600001111'], emails: [] }), true);
  // A signed-in customer whose phone was used by a guest is refused their welcome voucher at checkout.
  const late = await registerCustomer(db, person({ email: 'late@x.id', phone: '0866 0000 1111' }), now);
  const lateWelcome = await markEmailVerified(db, late.customer.id, now);
  await assert.rejects(
    placeOrder(db, (await getCustomer(db, late.customer.id))!, { items: { babiManis: 2 }, address: address({ recipientPhone: '0866 0000 1111' }), voucherCode: lateWelcome!.code }, null, now),
    /pembelian pertama/,
  );
});

test('login as customer: one-time link, short flagged session, not for deactivated accounts', async () => {
  const db = freshDb();
  const now = Date.now();
  const { customer } = await signUp(db, person(), now);
  const token = await createAdminLoginToken(db, customer.id, 'owner@x.id', now);
  // Only a hash is stored, with who made it.
  const row = db.raw.prepare('SELECT * FROM shop_admin_logins').get() as { tokenHash: string; createdBy: string };
  assert.notEqual(row.tokenHash, token);
  assert.equal(row.createdBy, 'owner@x.id');

  const session = await redeemAdminLoginToken(db, token, now + 1000);
  assert.ok(session);
  const signedIn = await customerForSession(db, session, now + 2000);
  assert.equal(signedIn?.id, customer.id);
  assert.equal(signedIn?.adminSession, true);
  // Works once; the session ends after 2 hours; normal sessions are not flagged.
  assert.equal(await redeemAdminLoginToken(db, token, now + 3000), null);
  assert.equal(await customerForSession(db, session, now + 2 * 3600_000 + 2000), null);
  assert.equal((await customerForSession(db, await createSession(db, customer.id, now), now))?.adminSession, false);

  // Expired, wrong and empty tokens.
  const old = await createAdminLoginToken(db, customer.id, null, now);
  assert.equal(await redeemAdminLoginToken(db, old, now + 5 * 60_000 + 1), null);
  assert.equal(await redeemAdminLoginToken(db, 'wrong', now), null);
  assert.equal(await redeemAdminLoginToken(db, '', now), null);

  // Accounts without a password can be opened too (made at guest checkout).
  const made = await placeOrder(db, guest('budi@new.id'), { items: { babiManis: 2 }, address: address({ recipientPhone: '0855 1234 0000' }) }, null, now);
  const budi = await redeemAdminLoginToken(db, await createAdminLoginToken(db, made.newAccount!.id, null, now), now);
  assert.equal((await customerForSession(db, budi!, now))?.email, 'budi@new.id');

  // Deactivated: no new links, and a link made earlier stops working.
  const earlier = await createAdminLoginToken(db, customer.id, null, now);
  await setCustomerDisabled(db, customer.id, true, now);
  await assert.rejects(createAdminLoginToken(db, customer.id, null, now), /deactivated/);
  assert.equal(await redeemAdminLoginToken(db, earlier, now), null);
  await assert.rejects(createAdminLoginToken(db, 'nobody', null, now), /not found/);
});

test('cart WhatsApp text lists the cart (owner, 2026-11-13) and nothing personal', async () => {
  const { cartWhatsAppText } = await import('../src/lib/shop/catalog.ts');
  assert.equal(
    cartWhatsAppText([{ name: 'Babi Marinade Manis', qty: 2 }, { name: 'Sapi Marinade Asin Gurih', qty: 1 }]),
    'Halo Jentis Kitchen, saya mau pesan:\n- 2 x Babi Marinade Manis\n- 1 x Sapi Marinade Asin Gurih\n\nBisa dibantu?',
  );
  assert.match(cartWhatsAppText([]), /mau tanya/);
});

test('Clarity snippet only for a valid project ID; private pages are masked (owner, 2026-11-13)', async () => {
  const { claritySnippet, isPrivatePage } = await import('../src/lib/shop/clarity.ts');
  assert.match(claritySnippet('abc123xyz9') ?? '', /clarity\.ms\/tag\//);
  assert.equal(claritySnippet('bad id"; alert(1)'), null);
  assert.equal(claritySnippet(''), null);
  for (const p of ['/checkout', '/shop/checkout', '/pesanan', '/orders/123', '/account', '/voucher', '/affiliate', '/r/abc']) assert.ok(isPrivatePage(p), p);
  for (const p of ['/', '/shop', '/produk/babi-manis', '/paket/paket-hemat-3-box', '/resep-tips']) assert.ok(!isPrivatePage(p), p);
});

test('order net profit: income − HPP − payment fee − courier fee; HPP missing or courier fee not entered are said', async () => {
  const { orderNetProfit } = await import('../src/lib/core/orderProfit.ts');
  const hpp = (k: string) => (k === 'babiManis' ? 60000 : k === 'x' ? null : 70000);
  const web = orderNetProfit({ income: 700000, packs: [{ key: 'babiManis', qty: 2 }, { key: 'sapiAsin', qty: 3 }], hpp, paymentFeePercent: 0.7, paidAmount: 700000, courierFee: 25000 });
  assert.deepEqual(web, { income: 700000, productCost: 330000, paymentFee: 4900, courierFee: 25000, courierMissing: false, net: 340100 });
  const res = orderNetProfit({ income: 480000, packs: [{ key: 'babiManis', qty: 4 }], hpp, paymentFeePercent: 0, paidAmount: 0, courierFee: null });
  assert.equal(res.net, 240000);
  assert.equal(res.courierMissing, true);
  assert.equal(orderNetProfit({ income: 1, packs: [{ key: 'x', qty: 1 }], hpp, paymentFeePercent: 0, paidAmount: 0, courierFee: 0 }).net, null);
});

test('add email later: guest order joins the account, first purchase marked used, paid email on request', async () => {
  const db = freshDb();
  const now = Date.now();
  const body = (phone: string) => ({ items: { babiManis: 2 }, address: address({ recipientPhone: phone }), newCustomerDiscount: true });
  // New email + phone: an account is made, its welcome voucher is spent by this order.
  const a = (await placeOrder(db, guest(), body('0812 0000 7777'), null, now)).order;
  assert.equal(a.contactEmail, null);
  const r1 = await addOrderEmail(db, a.orderRowId, { email: 'Sari@Mail.id' }, links, now);
  assert.equal(r1.account, 'new');
  assert.equal(r1.firstPurchaseMarked, true);
  assert.equal(r1.emails.length, 0); // not paid yet: the email goes out when marked paid
  const a2 = (await getShopOrder(db, a.orderRowId))!;
  assert.equal(a2.contactEmail, 'sari@mail.id');
  assert.ok(a2.customerId);
  assert.deepEqual((await listCustomerVouchers(db, a2.customerId, now)).map((v) => [v.kind, v.status]), [['WELCOME', 'USED']]);
  assert.equal(await newCustomerDiscountUsed(db, { phones: [], emails: ['sari@mail.id'] }), true);
  await assert.rejects(placeOrder(db, guest('sari@mail.id', false), body('0812 0000 8888'), null, now), /pembelian pertama/);
  // Only once, only guest orders without an email.
  await assert.rejects(addOrderEmail(db, a.orderRowId, { email: 'x@y.id' }, links, now), /already has an email/);
  await assert.rejects(addOrderEmail(db, a.orderRowId, { email: 'nope' }, links, now), /tidak valid/);

  // Existing account: the order joins it and its unused welcome voucher is marked used; paid → email on request.
  const { customer: rini } = await signUp(db, person(), now);
  const b = (await placeOrder(db, guest(), body('0813 1111 2222'), null, now)).order;
  db.raw.prepare("UPDATE orders SET paymentStatus = 'PAID' WHERE id = ?").run(b.orderRowId);
  const r2 = await addOrderEmail(db, b.orderRowId, { email: rini.email, sendPaidEmail: true }, links, now);
  assert.equal(r2.account, 'existing');
  assert.equal(r2.emails.length, 1);
  assert.equal(r2.emails[0].to, rini.email);
  assert.equal((await getShopOrder(db, b.orderRowId))!.customerId, rini.id);
  assert.deepEqual((await listCustomerVouchers(db, rini.id, now)).map((v) => [v.kind, v.status]), [['WELCOME', 'USED']]);
});
