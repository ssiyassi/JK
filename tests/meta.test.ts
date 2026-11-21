// Meta Pixel / Conversions API: attribution parsing and the Purchase event. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildAttribution, fromMetaAd, metaAdFirst } from '../src/lib/shop/attribution.ts';
import { metaPurchaseNotifier, purchaseEvent } from '../src/lib/notify/meta.ts';
import { metaPixelSnippet } from '../src/lib/shop/metaSnippet.ts';
import type { ShopOrder } from '../src/lib/shop/orders.ts';
import { retryTiming } from '../src/lib/notify/retry.ts';

retryTiming.delaysMs = [0, 0]; // no waiting between tries in tests

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const order = {
  orderRowId: 'row1', orderId: '201020260001', customerId: 'c1', orderStatus: 'ACTIVE', paymentStatus: 'PAID', deliveryStatus: 'PENDING',
  recipientName: 'Ani', recipientPhone: '6281234567890', street: 'Jl. A 1', kelurahan: 'K', kecamatan: 'Kc', city: 'Jakarta Barat', notes: null,
  latitude: null, longitude: null,
  lines: [{ product: 'babiManis', name: 'Babi Marinade Manis', price: 160000, qty: 2, stockColumn: 'babiManis' }],
  subtotal: 320000, discount: 100000, deliveryFee: 0, total: 220000, voucherCode: 'W1', proofUploadedAt: null, paidAt: 1, shippedAt: null,
  deliveredAt: null, trackingUrl: null, courierFee: null, cancelReason: null, deliveryDate: null, createdAt: 1,
} as unknown as ShopOrder;
const customer = { id: 'c1', email: ' Ani@Example.com ', phone: '6281234567890', name: 'Ani Wijaya' };

test('Meta ad orders: the ad tag, a bare click ID, or an ad tapped first; a bio-link visit alone is not an ad, even with fbclid', () => {
  const bio = { utm_source: 'instagram', utm_medium: 'bio', fbclid: 'x' };
  assert.equal(fromMetaAd({ utm_source: 'meta', utm_campaign: 'first-kv-oct26' }), true);
  assert.equal(fromMetaAd({ utm_source: 'meta', fbclid: 'x' }), true);
  assert.equal(fromMetaAd({ fbclid: 'x' }), true);
  assert.equal(fromMetaAd(bio), false);
  assert.equal(fromMetaAd({ utm_source: 'whatsapp' }), false);
  assert.equal(fromMetaAd({}), false);
  assert.equal(fromMetaAd(null), false);
  assert.equal(metaAdFirst(bio), false);
  assert.equal(metaAdFirst({ ...bio, ad_campaign: 'first-kv-oct26', ad_at: 1 }), true);
  assert.equal(fromMetaAd({ ...bio, ad_campaign: 'first-kv-oct26', ad_at: 1 }), true);
  assert.equal(metaAdFirst({ utm_source: 'meta', ad_at: 1 }), false); // tapped the ad itself
  const cookie = encodeURIComponent(JSON.stringify({ ...bio, ad_campaign: 'first-kv-oct26', ad_content: 'carousel-v2', ad_at: 1793391430498 }));
  const kept = buildAttribution({ cookie })!;
  assert.deepEqual([kept.ad_campaign, kept.ad_content, kept.ad_at], ['first-kv-oct26', 'carousel-v2', 1793391430498]);
});

test('attribution: utm tags, fbclid and Meta cookies are kept; junk is dropped', () => {
  const cookie = encodeURIComponent(JSON.stringify({ utm_source: 'meta', utm_campaign: 'first-kv', fbclid: 'AbC_123', landing: '/register', at: 1760000000000, evil: 'x' }));
  const a = buildAttribution({ cookie, fbp: 'fb.1.1760000000000.123456', fbc: 'bad value', ip: '1.2.3.4', ua: 'Mozilla' })!;
  assert.equal(a.utm_source, 'meta');
  assert.equal(a.utm_campaign, 'first-kv');
  assert.equal(a.landing, '/register');
  assert.equal(a.fbp, 'fb.1.1760000000000.123456');
  assert.equal(a.fbc, 'fb.1.1760000000000.AbC_123'); // rebuilt from fbclid because the cookie was malformed
  assert.equal((a as Record<string, unknown>).evil, undefined);
  assert.equal(buildAttribution({ cookie: 'not json', ip: 'unknown' }), null);
});

test('Purchase event: hashed customer data, IDR value, event id shared with the browser', async () => {
  const e = await purchaseEvent({ order, customer, attribution: { fbp: 'fb.1.1.2', ip: '1.2.3.4', ua: 'UA', landing: '/register' }, now: 1760000000000 }, 'https://jentiskitchen.id');
  assert.equal(e.event_name, 'Purchase');
  assert.equal(e.event_id, 'purchase-201020260001');
  assert.equal(e.event_time, 1760000000);
  assert.equal(e.event_source_url, 'https://jentiskitchen.id/register');
  assert.deepEqual(e.user_data.em, [sha('ani@example.com')]);
  assert.deepEqual(e.user_data.ph, [sha('6281234567890')]);
  assert.deepEqual(e.user_data.fn, [sha('ani')]);
  assert.deepEqual(e.user_data.ct, [sha('jakartabarat')]);
  assert.equal(e.user_data.client_ip_address, '1.2.3.4');
  assert.equal(JSON.stringify(e).includes('Jl. A'), false); // the address is never sent
  assert.deepEqual(e.custom_data, {
    currency: 'IDR', value: 220000, order_id: '201020260001', content_type: 'product',
    contents: [{ id: 'babiManis', quantity: 2, item_price: 160000 }], num_items: 2,
  });
});

test('notifier: off without Pixel ID or token; posts to the Graph API with the test code', async () => {
  const log = () => {};
  assert.equal(metaPurchaseNotifier({ META_PIXEL_ID: '123' }, async () => new Response('{}'), log), undefined);
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const notify = metaPurchaseNotifier({ META_PIXEL_ID: '123456', META_CAPI_TOKEN: 'tok', META_TEST_EVENT_CODE: 'TEST1' }, async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response('{"events_received":1}');
  }, log)!;
  await notify({ order, customer, attribution: null, now: 1760000000000 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/graph\.facebook\.com\/v\d+\.0\/123456\/events\?access_token=tok$/);
  assert.equal(calls[0].body.test_event_code, 'TEST1');
  // A failing Meta call never throws.
  const failing = metaPurchaseNotifier({ META_PIXEL_ID: '1', META_CAPI_TOKEN: 't' }, async () => { throw new Error('down'); }, log)!;
  await failing({ order, customer, attribution: null, now: 1 });
});

test('Pixel snippet: only for a numeric Pixel ID, email cannot break out of the script', () => {
  assert.equal(metaPixelSnippet('abc', null), null);
  const s = metaPixelSnippet('123456', 'a</script>@x.com')!;
  assert.match(s, /fbq\('init',"123456", \{"em":"a\\u003c\/script>@x.com"\}\)/);
  assert.equal(s.includes('</script>'), false);
});

// --- Meta ad results sync (read-only Marketing API) ---
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { jakartaDate, mapInsight, syncMetaAds } from '../src/lib/marketing/metaAds.ts';

function adsDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-meta-')), 'test.db'));
  for (const f of ['0009_notification_state.sql', '0027_meta_ad_insights.sql']) db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  return db;
}

const row = {
  date_start: '2026-10-19', ad_id: 'ad1', ad_name: 'Hero KV', adset_id: 's1', adset_name: 'Jakarta 25-45', campaign_id: 'c1', campaign_name: 'First KV', objective: 'OUTCOME_SALES',
  spend: '70123.45', impressions: '5000', reach: '4000', clicks: '120', inline_link_clicks: '90',
  actions: [{ action_type: 'landing_page_view', value: '60' }, { action_type: 'omni_add_to_cart', value: '9' }, { action_type: 'add_to_cart', value: '9' }, { action_type: 'omni_purchase', value: '2' }],
  action_values: [{ action_type: 'omni_purchase', value: '440000' }],
};

test('ad insights: IDR spend rounded, funnel actions picked once', () => {
  const m = mapInsight(row, 1);
  assert.equal(m.spend, 70123);
  assert.equal(m.landingPageViews, 60);
  assert.equal(m.addToCart, 9);
  assert.equal(m.purchases, 2);
  assert.equal(m.purchaseValue, 440000);
  assert.equal(jakartaDate(Date.UTC(2026, 9, 19, 18, 0)), '2026-10-20'); // 01:00 WIB next day
});

test('ad sync: backfills once, then only every 6 hours; upserts; errors never throw', async () => {
  const db = adsDb();
  const env = { META_ADS_TOKEN: 'tok', META_AD_ACCOUNT_ID: '993257963827130' };
  const urls: string[] = [];
  const ok = async (url: string) => {
    urls.push(url);
    if (/\/adsets\?/.test(url)) return new Response(JSON.stringify({ data: [{ daily_budget: '70000', campaign_id: 'c1' }] }));
    if (/\/campaigns\?/.test(url)) return new Response(JSON.stringify({ data: [{}] })); // budget on the ad set
    return new Response(JSON.stringify({ data: [row] }));
  };
  const now = Date.UTC(2026, 9, 20, 3, 0);
  assert.deepEqual(await syncMetaAds(db, env, ok, () => {}, now), { synced: true, rows: 1 });
  assert.match(urls[0], /\/act_993257963827130\/insights\?/);
  assert.match(decodeURIComponent(urls[0]), /"since":"2026-07-22"/); // 90-day backfill
  const state = await db.prepare("SELECT value FROM notification_state WHERE key = 'meta:ads-sync'").first<{ value: string }>();
  assert.equal(JSON.parse(state!.value).dailyBudget, 70000);
  assert.deepEqual(JSON.parse(state!.value).campaignBudgets, { c1: 70000 }); // per campaign, for the Ads Report cards
  assert.equal((await syncMetaAds(db, env, ok, () => {}, now + 3600_000)).synced, false); // too soon
  assert.equal((await syncMetaAds(db, env, ok, () => {}, now + 7 * 3600_000)).synced, true);
  assert.match(decodeURIComponent(urls[3]), /"since":"2026-10-13"/); // 7-day refresh
  const count = await db.prepare('SELECT COUNT(*) AS n, SUM(spend) AS s FROM meta_ad_insights').first<{ n: number; s: number }>();
  assert.deepEqual({ ...count }, { n: 1, s: 70123 });

  const errors: string[] = [];
  const failing = async () => new Response(JSON.stringify({ error: { message: 'Invalid token', code: 190 } }), { status: 400 });
  assert.equal((await syncMetaAds(db, env, failing, (_l, e) => errors.push(e), now, true)).synced, false);
  assert.deepEqual(errors, ['meta_ads_sync_failed']);
  assert.equal((await syncMetaAds(db, {}, ok, () => {}, now, true)).synced, false); // not configured
});

// --- Daily marketing report (CMO bot) ---
import { readdirSync } from 'node:fs';
import { buildDailyReport, orderProfit, reportDay, reportDue, markReportSent } from '../src/lib/marketing/adsReport.ts';

function fullDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-report-')), 'test.db'));
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  return db;
}

test('report: profit per order uses HPP, voucher, delivery fee and payment fee', () => {
  const o = { ...order, lines: [{ product: 'babiManis', name: 'x', price: 160000, qty: 1, stockColumn: 'babiManis' }], subtotal: 160000, discount: 56000, deliveryFee: 15000, total: 119000 } as unknown as ShopOrder;
  assert.equal(orderProfit(o, () => 60000, 0.7), 160000 - 56000 + 15000 - 60000 - 833); // 58.167
  assert.equal(orderProfit(o, () => null, 0.7), null);
});

test('report: yesterday in WIB, due once a day from 07:00 WIB', async () => {
  const now = Date.UTC(2026, 9, 22, 1, 0); // 08:00 WIB on 22 Oct
  assert.equal(reportDay(now).key, '2026-10-21');
  assert.equal(reportDay(now).start, Date.UTC(2026, 9, 20, 17, 0)); // 21 Oct 00:00 WIB
  const db = fullDb();
  assert.equal(await reportDue(db, Date.UTC(2026, 9, 21, 23, 0)), false); // 06:00 WIB
  assert.equal(await reportDue(db, now), true);
  await markReportSent(db, now);
  assert.equal(await reportDue(db, now + 3600_000), false);
  assert.equal(await reportDue(db, now + 24 * 3600_000), true);
});

test('report: ads, no orders yet, flags missing nothing it does not know', async () => {
  const db = fullDb();
  const now = Date.UTC(2026, 9, 22, 1, 0);
  await db.prepare(`INSERT INTO meta_ad_insights (date, adId, adName, spend, impressions, linkClicks, landingPageViews, syncedAt) VALUES
    ('2026-10-20', 'a1', 'Hero Diskon 35%', 20000, 500, 6, 4, 1), ('2026-10-21', 'a1', 'Hero Diskon 35%', 60000, 1400, 30, 22, 1),
    ('2026-10-21', 'a2', 'Carousel 4 kartu', 9000, 300, 8, 5, 1)`).run();
  const text = await buildDailyReport(db, now, now - 3600_000);
  assert.match(text, /21\/10\/2026/);
  assert.match(text, /Spend: Rp 69\.000/);
  assert.match(text, /Website visits: 27/);
  assert.match(text, /Paid: 0/);
  assert.match(text, /Ad spend since .*: Rp 89\.000/);
  assert.match(text, /CPA .*no orders yet/);
  assert.doesNotMatch(text, /Checkpoint reached/);
  const empty = await buildDailyReport(fullDb(), now, null);
  assert.match(empty, /No ad data synced yet/);
});

// --- Traffic by source (visit_events) ---
import { parseVisit, recordVisit, sourceFromReferrer, sourcesForDay } from '../src/lib/shop/visits.ts';

test('visits: source from utm tags, else from the referring site', () => {
  assert.deepEqual(sourceFromReferrer('www.google.co.id', 'jentiskitchen.id'), { source: 'google', medium: 'organic' });
  assert.deepEqual(sourceFromReferrer('l.instagram.com', 'jentiskitchen.id'), { source: 'instagram', medium: 'referral' });
  assert.deepEqual(sourceFromReferrer('l.threads.com', 'jentiskitchen.id'), { source: 'threads', medium: 'referral' });
  assert.deepEqual(sourceFromReferrer(null, 'jentiskitchen.id'), { source: 'direct', medium: 'none' });
  assert.equal(sourceFromReferrer('jentiskitchen.id', 'jentiskitchen.id').source, 'internal');
  const tagged = parseVisit({ event: 'visit', sid: 'abc123def456ghi', source: 'Meta', medium: 'paid_social', content: 'carousel-v2', refHost: 'l.instagram.com', landing: '/' }, 'jentiskitchen.id');
  assert.equal(tagged.source, 'meta');
  assert.equal(tagged.content, 'carousel-v2');
  assert.equal(parseVisit({ event: 'visit', sid: 'abc123def456ghi', refHost: 'www.google.com' }, 'jentiskitchen.id').source, 'google');
  assert.throws(() => parseVisit({ event: 'hack', sid: 'abc123def456ghi' }, 'x'));
  assert.throws(() => parseVisit({ event: 'visit', sid: '<script>' }, 'x'));
});

test('visits: per-source sessions, add to cart and checkout; one visit per session; report section', async () => {
  const db = fullDb();
  const now = Date.UTC(2026, 9, 24, 3, 0); // 24 Oct 10:00 WIB
  const meta = { source: 'meta', medium: 'paid_social', campaign: null, content: 'carousel-v2', landing: '/', refHost: null };
  await recordVisit(db, { event: 'visit', sid: 'sessionaaaaaaa1', ...meta }, now);
  await recordVisit(db, { event: 'visit', sid: 'sessionaaaaaaa1', ...meta }, now + 1000); // duplicate ignored
  await recordVisit(db, { event: 'add_to_cart', sid: 'sessionaaaaaaa1', ...meta }, now + 2000);
  await recordVisit(db, { event: 'add_to_cart', sid: 'sessionaaaaaaa1', ...meta }, now + 3000);
  await recordVisit(db, { event: 'checkout', sid: 'sessionaaaaaaa1', ...meta }, now + 4000);
  await recordVisit(db, { event: 'visit', sid: 'sessionbbbbbbb2', ...meta }, now);
  await recordVisit(db, { event: 'visit', sid: 'sessionccccccc3', source: 'google', medium: 'organic', campaign: null, content: null, landing: '/produk/x', refHost: 'www.google.com' }, now);
  const rows = await sourcesForDay(db, '2026-10-24');
  assert.deepEqual(rows, [
    { label: 'Meta ads (carousel-v2)', visits: 2, addToCart: 1, checkout: 1 },
    { label: 'Google search', visits: 1, addToCart: 0, checkout: 0 },
  ]);
  const text = await buildDailyReport(db, Date.UTC(2026, 9, 25, 1, 0), Date.UTC(2026, 9, 25, 0, 0));
  assert.match(text, /TRAFFIC BY SOURCE/);
  assert.match(text, /Meta ads \(carousel-v2\): 2 visits · 1 add to cart · 1 opened checkout · 0 orders \(0 paid\)/);
  assert.match(text, /Google search: 1 visits/);
});

test('report: courier fee paid by the owner is subtracted when given', () => {
  const o = { ...order, lines: [{ product: 'babiManis', name: 'x', price: 160000, qty: 2, stockColumn: 'babiManis' }], subtotal: 320000, discount: 100000, deliveryFee: 0, total: 220000 } as unknown as ShopOrder;
  assert.equal(orderProfit(o, () => 51984, 0.7, 28500), 220000 - 103968 - 1540 - 28500);
  assert.equal(orderProfit(o, () => 51984, 0.7, null), 220000 - 103968 - 1540);
});

test('visits: coming back from the payment page is not a new source', () => {
  assert.equal(sourceFromReferrer('checkout.doku.com', 'jentiskitchen.id').source, 'internal');
  assert.equal(sourceFromReferrer('app-sandbox.duitku.com', 'jentiskitchen.id').source, 'internal');
});

// --- Visitor journeys ("where people stopped") ---
import { journeysForRange, pageLabel } from '../src/lib/marketing/journeys.ts';

test('journeys: funnel counts later steps for earlier ones, exit pages and paths of non-buyers', async () => {
  const db = fullDb();
  const now = Date.parse('2026-10-29T10:00:00+07:00');
  const base = { source: 'meta', medium: 'paid_social', campaign: null, content: 'carousel-v2', landing: '/', refHost: null };
  let t = now;
  const step = (sid: string, event: string, page: string | null, detail: string | null = null) =>
    recordVisit(db, { ...base, event: event as never, sid, page, detail }, t++);
  // A: home only, no scroll → left on Home.
  await step('journeyaaaaaaa1', 'visit', null);
  await step('journeyaaaaaaa1', 'page', '/');
  // B: home → product → add to cart → checkout → left at checkout.
  await step('journeybbbbbbb2', 'visit', null);
  await step('journeybbbbbbb2', 'page', '/');
  await step('journeybbbbbbb2', 'page', '/produk/babi-bbq-manis');
  await step('journeybbbbbbb2', 'add_to_cart', '/produk/babi-bbq-manis');
  await step('journeybbbbbbb2', 'page', '/checkout');
  await step('journeybbbbbbb2', 'checkout', '/checkout');
  // C: buys (buy button straight to checkout, no add_to_cart event).
  await step('journeyccccccc3', 'visit', null);
  await step('journeyccccccc3', 'page', '/');
  await step('journeyccccccc3', 'page', '/checkout');
  await step('journeyccccccc3', 'address', '/checkout');
  await step('journeyccccccc3', 'pay_click', '/checkout');
  await step('journeyccccccc3', 'order_placed', '/checkout', 'qris');
  await step('journeyccccccc3', 'page', '/orders/x1');
  await step('journeyccccccc3', 'paid', '/orders/x1');
  // D: visit from before journey tracking (no page steps) → not counted.
  await step('journeyddddddd4', 'visit', null);

  const j = await journeysForRange(db, '2026-10-29', '2026-10-29');
  assert.equal(j.sessions, 3);
  assert.deepEqual(j.funnel.map((f) => f.sessions), [3, 2, 2, 2, 1, 1, 1, 1]);
  assert.equal(j.funnel[1].lostPct, 33);
  assert.deepEqual(j.exits, [
    { page: 'Home', sessions: 1, pct: 50, hadCart: 0 },
    { page: 'Checkout', sessions: 1, pct: 50, hadCart: 1 },
  ]);
  assert.ok(j.paths.some((p) => p.path === 'Home → Product: Babi Bbq Manis → Add to cart → Checkout → left'));
  assert.match(j.read ?? '', /Too few/);
  assert.equal(pageLabel('/shop/resep-tips/nasi-goreng'), 'Recipe: Nasi Goreng');
});

// --- Past-customers retargeting project ---
import { hashPhone, pastCustomersList, pastCustomersReport, PAST_CUSTOMERS, phone628, setPastCustomerManual } from '../src/lib/marketing/pastCustomers.ts';
import { dayStart } from '../src/lib/marketing/adsReport.ts';

test('past customers: first paid order since the start counts once, by hashed phone; area, win-backs, spend', async () => {
  const db = fullDb();
  assert.equal(phone628('0812-3456-7890'), '6281234567890');
  assert.equal(phone628('81234567890'), '6281234567890');
  assert.equal(phone628('021555123'), null);
  assert.equal(await pastCustomersReport(db, '2026-11-01', '2026-11-01', () => 60000, 0.7), null); // list not loaded

  const add = async (phone: string, inArea: number) =>
    db.prepare('INSERT INTO past_customers (phoneHash, project, inArea, addedAt) VALUES (?, ?, ?, 1)').bind(await hashPhone(phone), PAST_CUSTOMERS.key, inArea).run();
  await add('6281111111111', 1); // comes back through a reseller, was not buying before
  await add('6282222222222', 1); // was already buying through a reseller just before the start
  await add('6283333333333', 0); // outside the delivery area
  await add('6284444444444', 1); // does not come back
  let n = 0;
  const order = (phone: string, day: string, hour: number, paid = 'PAID') =>
    db
      .prepare(
        `INSERT INTO orders (id, orderId, date, customerName, reseller, address, phoneNumber, babiManis, babiAsin, sapiManis, sapiAsin, boxCounter, orderStatus, paymentStatus, deliveryStatus, createdAt, updatedAt)
         VALUES (?, ?, ?, 'Budi Santoso', 'Wieke', 'x', ?, 2, 0, 0, 0, 1, 'ACTIVE', ?, 'PENDING', ?, 1)`,
      )
      .bind(`o${++n}`, `ORD${n}`, dayStart(day), phone, paid, dayStart(day) + hour * 3600_000)
      .run();
  await order('0822-2222-2222', '2026-10-10', 10); // before the start → "already buying"
  await order('081111111111', '2026-11-01', 10, 'UNPAID'); // unpaid: not yet
  await order('081111111111', '2026-11-02', 10);
  await order('081111111111', '2026-11-03', 10); // second order: still one customer
  await order('082222222222', '2026-11-02', 12);
  await order('083333333333', '2026-11-02', 13);
  await db.prepare(`INSERT INTO meta_ad_insights (date, adId, campaignId, spend, syncedAt) VALUES ('2026-10-31', 'p1', ?, 15000, 1), ('2026-11-02', 'p1', ?, 30000, 1), ('2026-11-02', 'm1', 'main', 70000, 1)`).bind(PAST_CUSTOMERS.campaignId, PAST_CUSTOMERS.campaignId).run();

  const r = (await pastCustomersReport(db, '2026-11-02', '2026-11-02', () => 60000, 0.7))!;
  assert.deepEqual([r.listed, r.inArea, r.completed, r.completedOutside, r.winBacks], [4, 3, 2, 1, 1]);
  assert.equal(r.byChannel.reseller, 2);
  assert.deepEqual(r.period.map((c) => [c.orderId, c.name, c.packs, c.activeBefore, c.reseller]).sort(), [['ORD3', 'Budi', 2, false, 'Wieke'], ['ORD5', 'Budi', 2, true, 'Wieke'], ['ORD6', 'Budi', 2, false, 'Wieke']]);
  assert.deepEqual([r.spend, r.periodSpend], [45000, 30000]);
  const before = (await pastCustomersReport(db, '2026-11-01', '2026-11-01', () => 60000, 0.7))!;
  assert.deepEqual([before.completed, before.period.length], [0, 0]);

  // Orders through the ad count for the profit even when the number isn't on the list, but complete nobody
  const shopOrder = async (id: string, phone: string, attribution: string, total: number) => {
    await order(phone, '2026-11-02', 15);
    const row = `o${n}`;
    await db.prepare(`UPDATE orders SET orderId = ? WHERE id = ?`).bind(id, row).run();
    await db
      .prepare(
        `INSERT INTO shop_orders (orderRowId, customerId, recipientName, recipientPhone, street, kelurahan, kecamatan, city, unitPrices, subtotal, discount, deliveryFee, total, voucherActive, createdAt, attribution, stockTakenAt)
         VALUES (?, '', 'Adel', ?, 's', 'k', 'k', 'c', '{"babiManis":100000}', ?, 0, 0, ?, 0, 1, ?, 1)`,
      )
      .bind(row, phone, total, total, attribution)
      .run();
  };
  const fromAd = JSON.stringify({ utm_source: 'meta', utm_campaign: PAST_CUSTOMERS.key, fbclid: 'x' });
  await shopOrder('ADNEW', '6285555555555', fromAd, 200000); // new number
  await shopOrder('NOTAD', '6286666666666', JSON.stringify({ utm_source: 'instagram' }), 200000); // not from the ad: ignored
  const withAd = (await pastCustomersReport(db, '2026-11-02', '2026-11-02', () => 60000, 0))!;
  assert.deepEqual([withAd.completed, withAd.adExtras, withAd.profit], [2, 1, 80000]); // 200.000 − 2 × 60.000
  assert.deepEqual(withAd.period.filter((c) => c.extra).map((c) => [c.orderId, c.extra, c.channel, c.paid, c.profit]), [['ADNEW', 'not-on-list', 'ad', 200000, 80000]]);

  // The list (delivery area only) and a tick by hand for someone who ordered another way
  await db.prepare('UPDATE past_customers SET name = ? WHERE phoneHash = ?').bind('Sari Dewi', await hashPhone('6284444444444')).run();
  const id4 = await hashPhone('6284444444444');
  await setPastCustomerManual(db, id4, true, dayStart('2026-11-02') + 3600_000);
  await assert.rejects(setPastCustomerManual(db, 'nope', true, 1));
  const list = await pastCustomersList(db, dayStart('2026-11-04'));
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((x) => [x.done?.channel, x.manual, x.activeBefore]).sort(), [['manual', true, false], ['reseller', false, false], ['reseller', false, true]]);
  const ticked = (await pastCustomersReport(db, '2026-11-02', '2026-11-02', () => 60000, 0.7))!;
  assert.deepEqual([ticked.completed, ticked.winBacks, ticked.byChannel.manual], [3, 2, 1]);
  assert.ok(ticked.period.some((c) => c.channel === 'manual' && c.name === 'Sari'));
  // unticking removes the hand tick
  await setPastCustomerManual(db, id4, false, 1);
  assert.equal((await pastCustomersReport(db, '2026-11-02', '2026-11-02', () => 60000, 0.7))!.completed, 2);
});
