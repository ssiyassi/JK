// Google Ads: the tag snippet, the conversion target, the script's data and the Google part of the Ads Report.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { buildAttribution, fromGoogleAd, fromMetaAd } from '../src/lib/shop/attribution.ts';
import { buildDailyReport, googlePromoQuestion } from '../src/lib/marketing/adsReport.ts';
import { lastGoogleSync, parseGoogleRows, saveGoogleRows } from '../src/lib/marketing/googleAds.ts';
import { collectDailyReport, collectReport, reportHtml } from '../src/lib/marketing/reportPdf.ts';
import { CHANNELS, OWNER_CONFIRMED, channelOfCampaign, orderChannel } from '../src/lib/marketing/channels.ts';
import { googleSendTo, googleTagSnippet } from '../src/lib/shop/googleTag.ts';
import { sourceLabel } from '../src/lib/shop/visits.ts';

test('the tag snippet only accepts a Google Ads tag ID', () => {
  assert.equal(googleTagSnippet('123456'), null);
  assert.equal(googleTagSnippet("AW-1');alert(1)//"), null);
  const s = googleTagSnippet('AW-18553359472')!;
  assert.match(s, /googletagmanager\.com\/gtag\/js/);
  assert.match(s, /gtag\('config',"AW-18553359472"\)/);
});

test('the conversion target needs a valid tag ID and label', () => {
  assert.equal(googleSendTo('AW-123456', 'Yrw5CPPRhrEd'), 'AW-123456/Yrw5CPPRhrEd');
  assert.equal(googleSendTo('AW-123456', ''), null);
  assert.equal(googleSendTo('nope', 'Yrw5CPPRhrEd'), null);
  assert.equal(googleSendTo('AW-123456', "a'b<c"), null);
});

test('a Google ad click is a Google order with its search word, not a Meta order', () => {
  assert.equal(sourceLabel('google', 'cpc', 'daging bbq'), 'Google ads (daging bbq)');
  assert.equal(sourceLabel('google', 'cpc', null), 'Google ads');
  assert.equal(sourceLabel('google', 'organic', null), 'Google search');
  const cookie = encodeURIComponent(JSON.stringify({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'search', utm_content: 'daging bbq', at: 1 }));
  const a = buildAttribution({ cookie })!;
  assert.equal(fromGoogleAd(a), true);
  assert.equal(fromMetaAd(a), false);
  assert.equal(fromGoogleAd({ utm_source: 'google', utm_medium: 'organic' }), false);
});

const row = (date: string, costMicros: number, extra = {}) => ({ date, campaignId: '24430643707', campaignName: 'Jentis - Search', costMicros, impressions: 100, clicks: 10, conversions: 1, conversionValue: 160000, ...extra });

test('the script payload: cost from micros to rupiah, anything odd is refused', () => {
  assert.equal(parseGoogleRows({ rows: [row('2026-11-03', 30_000_000_000)] })[0].spend, 30000);
  assert.throws(() => parseGoogleRows({ rows: [row('3 Nov', 1)] }));
  assert.throws(() => parseGoogleRows({ rows: [row('2026-11-03', -1)] }));
  assert.throws(() => parseGoogleRows({ rows: [row('2026-11-03', 1, { campaignId: "1' OR 1" })] }));
  assert.throws(() => parseGoogleRows({}));
});

test('the pause reminder for the Google promotion, only once its target is known', () => {
  assert.equal(googlePromoQuestion(900_000, '2026-11-20', null), null);
  const promo = { spend: 1_000_000, until: '2026-12-31' };
  assert.equal(googlePromoQuestion(500_000, '2026-11-20', promo), null);
  assert.match(googlePromoQuestion(800_000, '2026-11-20', promo)!, /does not stop by itself/);
  assert.match(googlePromoQuestion(1_000_000, '2026-11-20', promo)!, /pause Google now/);
  assert.match(googlePromoQuestion(100_000, '2026-12-31', promo)!, /ends 2026-12-31/);
});

function fullDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-google-')), 'test.db'));
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  return db;
}

test('the Ads Report adds Google spend to Meta, and the same day sent twice is not counted twice', async () => {
  const db = fullDb();
  const now = Date.UTC(2026, 10, 7, 1, 0); // 08:00 WIB on 7 Nov, so yesterday is 6 Nov
  const empty = await collectDailyReport(db, now, now);
  assert.match(reportHtml(empty, '/logo.png'), /No Google data yet/);

  await saveGoogleRows(db, parseGoogleRows({ rows: [row('2026-11-05', 30_000_000_000), row('2026-11-06', 10_000_000_000)] }), now);
  await saveGoogleRows(db, parseGoogleRows({ rows: [row('2026-11-06', 20_000_000_000)] }), now);
  assert.equal(await lastGoogleSync(db), now);
  await db.prepare(`INSERT INTO meta_ad_insights (date, adId, adName, spend, impressions, linkClicks, landingPageViews, syncedAt) VALUES ('2026-11-06', 'a1', 'Promo', 40000, 500, 6, 4, 1)`).run();

  const day = await collectDailyReport(db, now, now);
  assert.equal(day.yesterday.spend, 60000);
  assert.equal(day.google.spend, 20000);
  assert.equal(day.google.totalSpend, 50000);
  assert.equal(day.google.since, '2026-11-05');
  const html = reportHtml(day, '/logo.png');
  assert.match(html, /Google ads — yesterday/);
  // One card per campaign: Google against its own Rp 30.000 budget (started 6 Nov: 1 day planned).
  const google = day.channels.find((c) => c.channel.id === 'google')!;
  assert.deepEqual([google.spend, google.planned, google.running], [20000, 30000, true]);
  assert.match(html, /Google · Search[\s\S]*Rp 20\.000<\/b> of Rp 30\.000 planned/);
  // The Meta ad has no campaign name of a channel: "Other campaigns"; its budget is unknown (no sync state).
  assert.equal(day.channels.find((c) => c.channel.id === 'other')!.spend, 40000);
  assert.equal(day.days.length, 7);
  assert.deepEqual(day.days.slice(-2).map((x) => x.spend), [30000, 60000]);

  const range = await collectReport(db, '2026-11-05', '2026-11-07', now, now);
  assert.equal(range.google.spend, 50000);
  assert.equal(range.week.googleSpend, 50000);

  const text = await buildDailyReport(db, now, now);
  assert.match(text, /Jentis - Search: Rp 20\.000/);
});

test('Ads Report campaigns: a Meta campaign and an order find their card by name and ad tag', () => {
  assert.equal(channelOfCampaign('Jentis · Sales · First KV · Okt 2026').id, 'main');
  assert.equal(channelOfCampaign('Jentis · Retarget · Past customers · Okt 2026').id, 'retarget');
  assert.equal(channelOfCampaign('Jentis · Sales · Kota Baru · Nov 2026').id, 'city');
  assert.equal(channelOfCampaign('Jentis · Something new').id, 'other');
  const o = { campaign: null as string | null, fromGoogle: false, fromMeta: false, source: 'direct/unknown' };
  assert.equal(orderChannel({ ...o, campaign: 'outer-cities-nov26', fromMeta: true }).name, 'Outside city');
  assert.equal(orderChannel({ ...o, campaign: 'first-kv-oct26', fromMeta: true }).name, 'Main ads');
  assert.equal(orderChannel({ ...o, fromGoogle: true }).name, 'Google');
  assert.equal(orderChannel({ ...o, campaign: 'organic-oct26', source: 'instagram/brand' }).name, 'Instagram (no ad)');
  assert.equal(orderChannel(o).name, 'Direct / unknown');
  // Every order the owner confirmed points at a real campaign card.
  for (const utm of Object.values(OWNER_CONFIRMED)) assert.ok(CHANNELS.some((c) => c.utm === utm), utm);
});
