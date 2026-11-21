// Voucher engine (admin vouchers). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { cancelOrder } from '../src/lib/core/orders.ts';
import { jakartaInstant } from '../src/lib/core/time.ts';
import { buildZip } from '../src/lib/core/zip.ts';
import { getCustomer, registerCustomer } from '../src/lib/shop/customers.ts';
import { markEmailVerified } from '../src/lib/shop/email-verify.ts';
import { placeOrder, getShopOrder } from '../src/lib/shop/orders.ts';
import { onOrderCancelled } from '../src/lib/shop/events.ts';
import { discountFor } from '../src/lib/shop/pricing.ts';
import { issueMonthlyVouchers, listCustomerVouchers, loadVoucherRules, monthlyRemindersByCustomer, saveVoucherRules } from '../src/lib/shop/vouchers.ts';
import { monthlyVoucherReminderMessage } from '../src/lib/shop/catalog.ts';
import {
  addBlastRecipients,
  campaignCodesCsv,
  campaignUsageCsv,
  csvCell,
  createCampaign,
  listCampaignCodes,
  listCampaigns,
  listCustomerCampaignVouchers,
  setCodeDisabled,
  unsentBlastJobs,
  updateCampaign,
} from '../src/lib/shop/campaigns.ts';

const links = { shopUrl: 'https://jentiskitchen.id', adminUrl: 'https://admin.jentiskitchen.id' };
const MIGRATIONS = ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0004_shop_payments.sql', '0005_shop_content.sql',
  '0006_website_only_products.sql', '0007_banner_mobile_image.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql',
  '0011_delivered_at.sql', '0012_payment_gateway.sql', '0013_customer_disabled.sql', '0025_email_verification.sql', '0014_rate_limits.sql', '0015_stock_product_short_name.sql',
  '0016_product_box_value.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0028_guest_checkout.sql', '0029_checkout_accounts_confirmed.sql', '0030_new_customer_discount.sql', '0032_days_off.sql', '0033_payment_method.sql', '0051_payment_channel.sql', '0052_owner_orders.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql'];

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'jentis-vouchers-'));
  const db = sqliteD1(join(dir, 'test.db'));
  for (const f of MIGRATIONS) db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  db.raw.exec(`INSERT INTO current_inventory VALUES ('current', 10, 10, 10, 10, 0);`);
  return db;
}

// 18 Oct 2026, 10:00 WIB.
const NOW = jakartaInstant(2026, 9, 18, 10).getTime();
const HOUR = 3600_000;
const address = { recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. Mawar 1', kelurahan: 'Gambir', kecamatan: 'Gambir', city: 'Jakarta Pusat' };
const order = (voucherCode: string | null, items: Record<string, number> = { babiManis: 2 }) => ({ items, address, voucherCode });

let phoneSeq = 0;
async function customer(db: ReturnType<typeof freshDb>, email: string) {
  phoneSeq++;
  const { customer: c } = await registerCustomer(db, { name: email.split('@')[0], email, phone: `08123400${String(phoneSeq).padStart(4, '0')}`, password: 'rahasia123' }, NOW);
  await markEmailVerified(db, c.id, NOW);
  return (await getCustomer(db, c.id))!;
}

const base = {
  name: 'Promo Oktober',
  discountType: 'PERCENT',
  discountValue: '10',
  capAmount: '',
  minOrder: '0',
  startDate: '2026-10-18',
  endDate: '2026-10-31',
  quota: '',
  perCustomerLimit: '',
  perCustomerDailyLimit: '',
};

test('discount: percent with optional cap, fixed amount, minimum order', () => {
  assert.equal(discountFor(300000, { percent: 10, capAmount: null }), 30000);
  assert.equal(discountFor(300000, { percent: 10, capAmount: 20000 }), 20000);
  assert.equal(discountFor(300000, { percent: 0, fixedAmount: 25000, capAmount: null }), 25000);
  assert.equal(discountFor(10000, { percent: 0, fixedAmount: 25000, capAmount: null }), 10000); // never more than the products
  assert.equal(discountFor(150000, { percent: 10, capAmount: null, minOrder: 200000 }), 0);
  assert.equal(discountFor(200000, { percent: 10, capAmount: null, minOrder: 200000 }), 20000);
});

test('general code: works for everyone, case-insensitive, products only; dates and deactivation', async () => {
  const db = freshDb();
  const rini = await customer(db, 'rini@example.com');
  await createCampaign(db, { ...base, type: 'GENERAL', code: 'jentis10', capAmount: '20000' }, NOW);
  await assert.rejects(createCampaign(db, { ...base, type: 'GENERAL', code: 'JENTIS10' }, NOW), /already exists/);

  const { order: o } = await placeOrder(db, rini, order('Jentis10'), null, NOW);
  assert.equal(o.subtotal, 320000);
  assert.equal(o.discount, 20000); // 10% = 32.000, capped at 20.000
  assert.equal(o.deliveryFee, 0);
  assert.equal(o.voucherCode, 'JENTIS10');

  // Not yet started / ended.
  await assert.rejects(placeOrder(db, rini, order('JENTIS10'), null, jakartaInstant(2026, 9, 17, 23, 59).getTime()), /baru berlaku/);
  await assert.rejects(placeOrder(db, rini, order('JENTIS10'), null, jakartaInstant(2026, 10, 1, 0, 0).getTime()), /kedaluwarsa/);
  // Last minute of the end day still works.
  await placeOrder(db, rini, order('JENTIS10'), null, jakartaInstant(2026, 9, 31, 23, 59).getTime());

  const [c] = await listCampaigns(db, NOW);
  assert.equal(c.uses, 2);
  await updateCampaign(db, c.id, { disabled: true }, NOW);
  await assert.rejects(placeOrder(db, rini, order('JENTIS10'), null, NOW), /tidak berlaku/);
  await updateCampaign(db, c.id, { disabled: false }, NOW);
  await placeOrder(db, rini, order('JENTIS10'), null, NOW);

  // The discount is locked once used; other terms can change.
  await assert.rejects(updateCampaign(db, c.id, { ...base, discountValue: '15' }, NOW), /cannot change/);
  const edited = await updateCampaign(db, c.id, { ...base, capAmount: '50000', endDate: '2026-11-30' }, NOW);
  assert.equal(edited.capAmount, 50000);
});

test('minimum order and fixed discount', async () => {
  const db = freshDb();
  const rini = await customer(db, 'rini@example.com');
  await createCampaign(db, { ...base, type: 'GENERAL', code: 'HEMAT25', discountType: 'FIXED', discountValue: '25000', minOrder: '300000' }, NOW);
  await assert.rejects(placeOrder(db, rini, order('HEMAT25', { babiManis: 1 }), null, NOW), /minimal Rp 300\.000/);
  const { order: o } = await placeOrder(db, rini, order('HEMAT25', { babiManis: 2 }), null, NOW);
  assert.equal(o.discount, 25000);
  assert.equal(o.total, 320000 - 25000);
});

test('quota, per-customer and per-day limits; a cancelled order gives the use back', async () => {
  const db = freshDb();
  const a = await customer(db, 'a@example.com');
  const b = await customer(db, 'b@example.com');
  const c = await customer(db, 'c@example.com');
  await createCampaign(db, { ...base, type: 'GENERAL', code: 'FIRST2', quota: '2', perCustomerLimit: '2', perCustomerDailyLimit: '1' }, NOW);

  const first = (await placeOrder(db, a, order('FIRST2'), null, NOW)).order;
  // Same customer, same day: daily limit.
  await assert.rejects(placeOrder(db, a, order('FIRST2'), null, NOW + HOUR), /per hari/);
  await placeOrder(db, b, order('FIRST2'), null, NOW);
  // Quota of 2 reached.
  await assert.rejects(placeOrder(db, c, order('FIRST2'), null, NOW), /Kuota/);

  // Cancelling frees one use.
  await cancelOrder(db, first.orderRowId);
  await onOrderCancelled(db, first.orderRowId, 'ADMIN', links, NOW);
  await placeOrder(db, c, order('FIRST2'), null, NOW);
  assert.equal(Number((db.raw.prepare("SELECT COUNT(*) n FROM shop_orders WHERE campaignId IS NOT NULL AND voucherActive = 1").get() as any).n), 2);
});

test('per-customer limit across days', async () => {
  const db = freshDb();
  const a = await customer(db, 'a@example.com');
  await createCampaign(db, { ...base, type: 'GENERAL', code: 'TWICE', perCustomerLimit: '2' }, NOW);
  await placeOrder(db, a, order('TWICE'), null, NOW);
  await placeOrder(db, a, order('TWICE'), null, NOW + 1);
  await assert.rejects(placeOrder(db, a, order('TWICE'), null, NOW + 24 * HOUR), /2x per akun/);
});

test('limits hold inside the order transaction (race for the last use)', async () => {
  const db = freshDb();
  const a = await customer(db, 'a@example.com');
  const b = await customer(db, 'b@example.com');
  const camp = await createCampaign(db, { ...base, type: 'GENERAL', code: 'LAST1', quota: '1' }, NOW);
  // Simulate another order that took the last use between the check and the save: insert it directly.
  db.raw.exec(`INSERT INTO shop_orders (orderRowId, customerId, recipientName, recipientPhone, street, kelurahan, kecamatan, city,
    unitPrices, subtotal, discount, deliveryFee, total, campaignId, campaignCodeId, voucherActive, createdAt)
    SELECT 'other', '${b.id}', 'x', 'x', 'x', 'x', 'x', 'x', '{}', 0, 0, 0, 0, '${camp.id}', id, 1, ${NOW} FROM shop_voucher_codes`);
  await assert.rejects(placeOrder(db, a, order('LAST1'), null, NOW), /Kuota/);
  assert.equal(Number((db.raw.prepare('SELECT COUNT(*) n FROM orders').get() as any).n), 0); // rolled back
  assert.equal(Number((db.raw.prepare('SELECT COUNT(*) n FROM shop_voucher_guard').get() as any).n), 0);
});

test('unique codes: single use each, deactivate one code, CSV + usage', async () => {
  const db = freshDb();
  const a = await customer(db, 'a@example.com');
  const b = await customer(db, 'b@example.com');
  const camp = await createCampaign(db, { ...base, type: 'UNIQUE', prefix: 'jentisxocbc', count: '50', discountType: 'FIXED', discountValue: '30000' }, NOW);
  assert.equal(camp.prefix, 'JENTISXOCBC');
  const codes = await listCampaignCodes(db, camp.id);
  assert.equal(codes.length, 50);
  assert.equal(new Set(codes.map((k) => k.code)).size, 50);
  for (const k of codes) assert.match(k.code, /^JENTISXOCBC[A-Z2-9]{6}$/);

  const { order: o } = await placeOrder(db, a, order(codes[0].code.toLowerCase()), null, NOW);
  assert.equal(o.discount, 30000);
  await assert.rejects(placeOrder(db, b, order(codes[0].code), null, NOW), /sudah pernah dipakai/);
  await setCodeDisabled(db, camp.id, codes[1].id, true, NOW);
  await assert.rejects(placeOrder(db, b, order(codes[1].code), null, NOW), /tidak berlaku/);
  await placeOrder(db, b, order(codes[2].code), null, NOW);

  const summary = (await listCampaigns(db, NOW))[0];
  assert.equal(summary.codesUsed, 2);
  assert.equal(summary.codesDisabled, 1);

  const list = await campaignCodesCsv(db, camp);
  assert.equal(list.trim().split('\r\n').length, 51);
  const usage = await campaignUsageCsv(db, camp);
  const rows = usage.trim().split('\r\n');
  assert.equal(rows.length, 51);
  assert.match(rows.find((r) => r.startsWith(codes[0].code))!, /,Used,a,a@example\.com,/);
  assert.match(rows.find((r) => r.startsWith(codes[1].code))!, /,Deactivated,/);
  assert.match(rows.find((r) => r.startsWith(codes[3].code))!, /,Not used,/);
});

test('email blast: one code per email, only that account can use it, shown in the account', async () => {
  const db = freshDb();
  const a = await customer(db, 'a@example.com');
  const b = await customer(db, 'b@example.com');
  const camp = await createCampaign(db, { ...base, type: 'BLAST', prefix: 'VIP', recipients: { mode: 'EMAILS', emails: 'A@example.com, new@example.com\nnew@example.com' } }, NOW);
  const codes = await listCampaignCodes(db, camp.id);
  assert.deepEqual(codes.map((k) => k.email).sort(), ['a@example.com', 'new@example.com']);
  const jobs = await unsentBlastJobs(db, camp.id);
  assert.equal(jobs.length, 2);
  assert.equal(jobs.find((j) => j.email === 'a@example.com')!.name, 'a');

  const mine = codes.find((k) => k.email === 'a@example.com')!;
  await assert.rejects(placeOrder(db, b, order(mine.code), null, NOW), /tidak ditemukan untuk akun ini/);
  const wallet = await listCustomerCampaignVouchers(db, a, NOW);
  assert.equal(wallet.length, 1);
  assert.equal(wallet[0].status, 'AVAILABLE');
  assert.equal(wallet[0].label, 'Promo Oktober');
  await placeOrder(db, a, order(mine.code), null, NOW);
  assert.equal((await listCustomerCampaignVouchers(db, a, NOW))[0].status, 'USED');
  assert.equal((await getShopOrder(db, (db.raw.prepare('SELECT orderRowId FROM shop_orders').get() as any).orderRowId))!.voucherCode, mine.code);

  // Adding recipients skips people who already have a code; "all" picks active customers.
  assert.equal(await addBlastRecipients(db, camp.id, { mode: 'ALL' }, NOW), 1); // b
  assert.equal(await addBlastRecipients(db, camp.id, { mode: 'ALL' }, NOW), 0);
  await assert.rejects(createCampaign(db, { ...base, type: 'BLAST', prefix: 'VIP', recipients: { mode: 'EMAILS', emails: 'nope' } }, NOW), /Not valid/);
});

test('admin input checks', async () => {
  const db = freshDb();
  await assert.rejects(createCampaign(db, { ...base, type: 'GENERAL', code: 'X' }, NOW), /3–30/);
  await assert.rejects(createCampaign(db, { ...base, type: 'GENERAL', code: 'OK10', discountValue: '120' }, NOW), /Discount %/);
  await assert.rejects(createCampaign(db, { ...base, type: 'GENERAL', code: 'OK10', endDate: '2026-10-01' }, NOW), /End date/);
  await assert.rejects(createCampaign(db, { ...base, type: 'UNIQUE', prefix: 'AB-CD', count: '5' }, NOW), /Prefix/);
  await assert.rejects(createCampaign(db, { ...base, type: 'UNIQUE', prefix: 'ABCD', count: '0' }, NOW), /Number of codes/);
  assert.equal((await listCampaigns(db, NOW)).length, 0);
});

test('locked ZIP opens with the prefix as password', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jentis-zip-'));
  const csv = 'Code\r\nJENTISXOCBCA7K2QX\r\n';
  writeFileSync(join(dir, 'codes.zip'), buildZip([{ name: 'codes.csv', data: new TextEncoder().encode(csv) }], 'JENTISXOCBC'));
  let unzipAvailable = true;
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
  } catch {
    unzipAvailable = false;
  }
  if (!unzipAvailable) return;
  assert.equal(execFileSync('unzip', ['-p', '-P', 'JENTISXOCBC', join(dir, 'codes.zip')]).toString(), csv);
  assert.throws(() => execFileSync('unzip', ['-p', '-P', 'WRONG', join(dir, 'codes.zip')], { stdio: 'pipe' }));
});

test('automatic voucher settings: new vouchers use them, issued vouchers keep their terms', async () => {
  const db = freshDb();
  assert.deepEqual((await loadVoucherRules(db)).WELCOME, { percent: 20, cap: 100000, label: 'Voucher selamat datang' });
  const old = await customer(db, 'old@example.com');
  await saveVoucherRules(db, { WELCOME: { percent: 40, cap: 150000 }, REFERRAL: { percent: 30, cap: 80000 }, MONTHLY: { percent: 15, cap: 50000 } }, NOW);
  const rules = await loadVoucherRules(db);
  assert.equal(rules.REFERRAL.percent, 30);
  assert.equal(rules.MONTHLY.cap, 50000);

  const fresh = await customer(db, 'new@example.com');
  const welcome = (await listCustomerVouchers(db, fresh.id, NOW)).find((v) => v.kind === 'WELCOME')!;
  assert.deepEqual([welcome.percent, welcome.capAmount], [40, 150000]);
  const oldWelcome = (await listCustomerVouchers(db, old.id, NOW)).find((v) => v.kind === 'WELCOME')!;
  assert.deepEqual([oldWelcome.percent, oldWelcome.capAmount], [20, 100000]);
  const jobs = await issueMonthlyVouchers(db, NOW);
  assert.ok(jobs.every((j) => j.voucher.percent === 15 && j.voucher.capAmount === 50000));

  await assert.rejects(saveVoucherRules(db, { WELCOME: { percent: 0, cap: 1 }, REFERRAL: { percent: 30, cap: 1 }, MONTHLY: { percent: 15, cap: 1 } }, NOW), /1 to 100/);
  await assert.rejects(saveVoucherRules(db, { WELCOME: { percent: 10, cap: 0 }, REFERRAL: { percent: 30, cap: 1 }, MONTHLY: { percent: 15, cap: 1 } }, NOW), /max discount/);
});

test('guests: per-customer limits counted by delivery phone; email-blast code joins that customer\'s order list', async () => {
  const db = freshDb();
  const guest = { guest: true as const, email: null, phone: null };
  const phone = (p: string) => ({ ...address, recipientPhone: p });
  await createCampaign(db, { ...base, type: 'GENERAL', code: 'ONCE', perCustomerLimit: '1' }, NOW);
  await placeOrder(db, guest, { items: { babiManis: 2 }, address: phone('0811 0000 0001'), voucherCode: 'once' }, null, NOW);
  await assert.rejects(
    placeOrder(db, guest, { items: { babiManis: 2 }, address: phone('0811-0000-0001'), voucherCode: 'ONCE' }, null, NOW),
    /1x per nomor HP/,
  );
  await placeOrder(db, guest, { items: { babiManis: 2 }, address: phone('0811 0000 0002'), voucherCode: 'ONCE' }, null, NOW);

  const a = await customer(db, 'a@example.com');
  const camp = await createCampaign(db, { ...base, type: 'BLAST', prefix: 'VIP', recipients: { mode: 'EMAILS', emails: 'a@example.com, nobody@example.com' } }, NOW);
  const codes = await listCampaignCodes(db, camp.id);
  const forA = codes.find((k) => k.email === 'a@example.com')!;
  const forNobody = codes.find((k) => k.email === 'nobody@example.com')!;
  const { order: o } = await placeOrder(db, guest, order(forA.code), null, NOW);
  assert.equal(o.customerId, a.id);
  assert.equal((await listCustomerCampaignVouchers(db, a, NOW))[0].status, 'USED');
  // A code sent to an email without an account: works, the order has no account.
  assert.equal((await placeOrder(db, guest, order(forNobody.code), null, NOW)).order.customerId, '');
});

test('monthly WhatsApp reminder: this month\'s code per customer, used state, refreshed for a new month', async () => {
  const db = freshDb();
  const a = await customer(db, 'a@example.com');
  const b = await customer(db, 'b@example.com');
  await issueMonthlyVouchers(db, NOW);
  let reminders = await monthlyRemindersByCustomer(db, NOW);
  const mine = (await listCustomerVouchers(db, a.id, NOW)).find((v) => v.kind === 'MONTHLY')!;
  assert.equal(reminders[a.id].code, mine.code);
  assert.equal(reminders[a.id].used, false);
  // Used on an order: shown as used.
  await placeOrder(db, a, order(mine.code), null, NOW);
  reminders = await monthlyRemindersByCustomer(db, NOW);
  assert.equal(reminders[a.id].used, true);
  assert.equal(reminders[b.id].used, false);
  // Next month, before "Send": nobody has a reminder; after it, the new codes.
  const NOV = jakartaInstant(2026, 10, 3, 10).getTime();
  assert.deepEqual(await monthlyRemindersByCustomer(db, NOV), {});
  await issueMonthlyVouchers(db, NOV);
  const nov = await monthlyRemindersByCustomer(db, NOV);
  assert.notEqual(nov[a.id].code, mine.code);
  assert.equal(nov[a.id].used, false);

  const text = monthlyVoucherReminderMessage('Rini', { code: 'JK-AB12-CD34', percent: 20, capAmount: 100000, expiresAt: jakartaInstant(2026, 9, 31, 23, 59).getTime() });
  assert.match(text, /^Halo Kak \*Rini\* 👋, ini dari Jentis Kitchen\./);
  assert.match(text, /voucher diskon \*20%\* bulan ini \(maks\. \*Rp100\.000\*\) dengan kode:\n\*JK-AB12-CD34\*/);
  assert.match(text, /Berlaku sampai \*31 Oktober 2026\*\. Yuk pakai untuk pesanan berikutnya di \*jentiskitchen\.id\*/);
});

test('voucher CSV downloads: text that a spreadsheet would run as a formula is shown as plain text', () => {
  assert.equal(csvCell('=HYPERLINK("http://x","klik")'), `"'=HYPERLINK(""http://x"",""klik"")"`);
  assert.equal(csvCell('+62812'), "'+62812");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('-1+2'), "'-1+2");
  assert.equal(csvCell('\t=1'), "'\t=1");
  assert.equal(csvCell('Rini, Bandung'), '"Rini, Bandung"');
  assert.equal(csvCell('JENTIS10'), 'JENTIS10');
  assert.equal(csvCell(-5000), '-5000'); // numbers stay numbers
  assert.equal(csvCell(null), '');
});
