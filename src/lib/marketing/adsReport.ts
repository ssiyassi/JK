// Daily marketing report for the owner (Telegram "Jentis CMO" bot, 07:00 WIB): yesterday's Meta ad results next to
// the website's real orders and the contribution profit after ad spend. Facts only; missing data is said, never 0.
//
// Profit per paid website order = (products − voucher discount) + delivery fee paid by the customer
//   − HPP of the packs − payment fee (% of the amount paid) − what the owner paid the courier (orders.courierFee,
//   entered when shipping; "not entered yet" is shown, never assumed 0 silently).
// HPP: the admin HPP of the month (src/lib/core/costs.ts: meat + ingredients + packaging, no courier) when complete;
// otherwise the owner's older flat cost per pack (OWNER_HPP, 2026-10-14, which already included packaging and courier,
// so the courier fee is then not subtracted again). Ad spend comes from meta_ad_insights.
import type { D1Database } from '../core/d1.ts';
import { hppForMonth, loadCostSettings, monthKeyOf } from '../core/costs.ts';
import { addDaysToKey, jakartaDateKey, jakartaInstant } from '../core/time.ts';
import { fromGoogleAd, fromMetaAd, metaAdFirst, parseStoredAttribution } from '../shop/attribution.ts';
import { googleRows, lastGoogleSync } from './googleAds.ts';
import { OWNER_CONFIRMED } from './channels.ts';
import { getShopOrder, type ShopOrder } from '../shop/orders.ts';
import { isTestOrder } from '../shop/payments.ts';
import { sourceLabel, sourcesForDay } from '../shop/visits.ts';

export const REPORT_STATE_KEY = 'cmo:daily-report';
/** Sent once a day, from the first 15-minute run at or after this hour (WIB). */
export const REPORT_HOUR_WIB = 7;
/** The "pause and rethink" checkpoint. (The Rp2.000.000 test budget cap was dropped by the owner on 2026-11-11.) */
export const CHECKPOINT_SPEND = 1_000_000;
export const CHECKPOINT_MIN_ORDERS = 5;

const OWNER_HPP: { match: RegExp; cost: number }[] = [
  { match: /^babi/i, cost: 60_000 },
  { match: /^sapi/i, cost: 78_000 },
];

/**
 * Google Ads new-account promotion the owner wants to use, then pause (owner, 2026-11-06: "remember to pause it when
 * the time comes"). null until the promotion's spend target and deadline are known from Google Ads → Billing → Promotions.
 */
/** First-order discount change (owner, 2026-11-11): ads and website switched to 20% at about 09:15 WIB. The report compares the two. */
export const DISCOUNT_CHANGE = { at: Date.parse('2026-11-11T09:15:00+07:00'), day: '2026-11-11', before: 35, after: 20 };

export const GOOGLE_PROMO: { spend: number; until: string } | null = null;

/** Reminder to pause Google once the promotion's spend target is reached or its deadline is near; null otherwise. */
export function googlePromoQuestion(spend: number, today: string, promo = GOOGLE_PROMO): string | null {
  if (!promo) return null;
  if (spend >= promo.spend) return `Google has spent ${rp(spend)}, reaching the ${rp(promo.spend)} needed for the Google promotion credit. You asked to pause it at this point: pause Google now, or keep it running?`;
  if (today >= promo.until) return `The Google promotion ends ${promo.until} and Google has spent ${rp(spend)} of the ${rp(promo.spend)} needed. Pause it now, or keep it running?`;
  if (spend >= promo.spend * 0.8) return `Google has spent ${rp(spend)} of the ${rp(promo.spend)} needed for the promotion credit (until ${promo.until}). It does not stop by itself.`;
  return null;
}

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–');

export interface AdRow {
  adName: string;
  campaignId?: string | null;
  campaignName?: string | null;
  spend: number;
  impressions: number;
  linkClicks: number;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number;
}

export interface OrderProfit {
  orderId: string;
  fromMeta: boolean;
  fromGoogle: boolean; // tapped a Google search ad (utm_source=google, utm_medium=cpc)
  adFirst: boolean; // tapped an ad earlier, then came back through another link
  source: string;
  paid: number;
  profit: number | null; // null when a product has no HPP
  courierMissing: boolean; // admin HPP in use but the courier fee was not entered yet
  // Details for the PDF report
  items: { name: string; qty: number; stockKey: string }[];
  discount: number;
  newCustomerDiscount: boolean;
  hppTotal: number | null;
  courierFee: number | null;
  paymentFee: number;
  delivered: boolean;
  campaign: string | null; // utm_campaign of the ad (or link) the customer came through (channels.ts)
  city: string;
  deliveryFee: number; // paid by the customer
  paidAt: number | null;
  placedAt?: number; // when the customer placed it (decides 35% or 20%)
}

/** Midnight (WIB) at the start of a YYYY-MM-DD day. */
export function dayStart(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return jakartaInstant(y, m - 1, d).getTime();
}

/** Yesterday (WIB) as [start, end) instants and its date key. */
export function reportDay(now: number): { key: string; start: number; end: number } {
  const key = addDaysToKey(jakartaDateKey(now), -1);
  return { key, start: dayStart(key), end: dayStart(addDaysToKey(key, 1)) };
}

export async function hppLookup(db: D1Database, monthKey: string): Promise<{ cost: (key: string) => number | null; usedOwnerFallback: Set<string>; complete: boolean }> {
  const report = await hppForMonth(db, monthKey).catch(() => null);
  const admin = new Map((report?.products ?? []).filter((p) => p.total !== null).map((p) => [p.key, p.total as number]));
  const usedOwnerFallback = new Set<string>();
  return {
    usedOwnerFallback,
    complete: (report?.products ?? []).length > 0 && (report?.products ?? []).every((p) => p.total !== null),
    cost(key) {
      if (admin.has(key)) return admin.get(key)!;
      const fallback = OWNER_HPP.find((h) => h.match.test(key));
      if (fallback) usedOwnerFallback.add(key);
      return fallback?.cost ?? null;
    },
  };
}

/** Profit of one paid order; `courierFee` = what the owner paid the courier (null = not entered, counted as 0). */
export function orderProfit(order: ShopOrder, hpp: (key: string) => number | null, feePercent: number, courierFee: number | null = null): number | null {
  let cost = courierFee ?? 0;
  for (const l of order.lines) {
    const c = hpp(l.stockColumn ?? l.product);
    if (c === null) return null;
    cost += c * l.qty;
  }
  return order.subtotal - order.discount + order.deliveryFee - cost - (order.total * feePercent) / 100;
}

export async function paidOrders(db: D1Database, start: number, end: number, hpp: (key: string) => number | null, feePercent: number, subtractCourier: boolean): Promise<OrderProfit[]> {
  const { results } = await db
    .prepare(
      `SELECT s.orderRowId, s.attribution FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
       WHERE o.orderStatus = 'ACTIVE' AND o.paymentStatus = 'PAID' AND s.stockTakenAt >= ? AND s.stockTakenAt < ?`,
    )
    .bind(start, end)
    .all<{ orderRowId: string; attribution: string | null }>();
  const out: OrderProfit[] = [];
  for (const r of results) {
    if (await isTestOrder(db, r.orderRowId)) continue;
    const order = await getShopOrder(db, r.orderRowId);
    if (!order) continue;
    const confirmed = OWNER_CONFIRMED[order.orderId];
    // The owner's word replaces the link tags for the report (channels.ts OWNER_CONFIRMED).
    const a = confirmed ? { ...parseStoredAttribution(r.attribution), utm_source: 'meta', utm_campaign: confirmed, utm_content: 'owner-confirmed' } : parseStoredAttribution(r.attribution);
    const fromMeta = fromMetaAd(a);
    out.push({
      orderId: order.orderId,
      fromMeta,
      fromGoogle: fromGoogleAd(a),
      adFirst: metaAdFirst(a),
      source: a?.utm_source ? `${a.utm_source}${a.utm_content ? `/${a.utm_content}` : ''}` : a?.fbclid ? 'meta (click id)' : 'direct/unknown',
      paid: order.total,
      profit: orderProfit(order, hpp, feePercent, subtractCourier ? order.courierFee : null),
      courierMissing: subtractCourier && order.courierFee === null,
      items: order.lines.map((l) => ({ name: l.name.replace(/ Marinade/i, ''), qty: l.qty, stockKey: l.stockColumn ?? l.product })),
      discount: order.discount,
      newCustomerDiscount: order.newCustomerDiscount,
      hppTotal: order.lines.every((l) => hpp(l.stockColumn ?? l.product) !== null)
        ? order.lines.reduce((s, l) => s + (hpp(l.stockColumn ?? l.product) ?? 0) * l.qty, 0)
        : null,
      courierFee: subtractCourier ? order.courierFee : null,
      paymentFee: (order.total * feePercent) / 100,
      delivered: order.deliveryStatus === 'DELIVERED' || order.shippedAt !== null,
      campaign: a?.ad_campaign ?? a?.utm_campaign ?? null, // an ad tapped before another link counts for that ad
      city: order.city,
      deliveryFee: order.deliveryFee,
      paidAt: order.paidAt,
      placedAt: order.createdAt,
    });
  }
  return out;
}

/** Orders placed on the day (paid or not), test accounts excluded, with where they came from. */
export async function placedOrders(db: D1Database, start: number, end: number): Promise<{ orderId: string; paid: boolean; source: string; fromMeta: boolean; fromGoogle: boolean; label: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT s.orderRowId, o.orderId, o.paymentStatus, s.attribution FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
       WHERE s.createdAt >= ? AND s.createdAt < ? ORDER BY s.createdAt`,
    )
    .bind(start, end)
    .all<{ orderRowId: string; orderId: string; paymentStatus: string; attribution: string | null }>();
  const out = [];
  for (const r of results) {
    if (await isTestOrder(db, r.orderRowId)) continue;
    const a = parseStoredAttribution(r.attribution);
    out.push({
      orderId: r.orderId,
      paid: r.paymentStatus === 'PAID',
      fromMeta: fromMetaAd(a),
      fromGoogle: fromGoogleAd(a),
      source: a?.utm_source ? `${a.utm_source}${a.utm_content ? `/${a.utm_content}` : ''}` : a?.fbclid ? 'meta (click id)' : 'no ad tag',
      label: a?.utm_source || a?.fbclid
        ? sourceLabel(a?.utm_source ?? 'meta', a?.utm_medium ?? (a?.fbclid ? 'paid_social' : null), a?.utm_content ?? null)
        : 'Direct / unknown',
    });
  }
  return out;
}

export async function adRows(db: D1Database, from: string, to: string): Promise<AdRow[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(adName, adId) AS adName, MAX(campaignId) AS campaignId, MAX(campaignName) AS campaignName, SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(linkClicks) AS linkClicks,
              SUM(landingPageViews) AS landingPageViews, SUM(addToCart) AS addToCart, SUM(initiateCheckout) AS initiateCheckout,
              SUM(purchases) AS purchases, SUM(purchaseValue) AS purchaseValue
       FROM meta_ad_insights WHERE date >= ? AND date <= ? GROUP BY adId ORDER BY spend DESC`,
    )
    .bind(from, to)
    .all<AdRow>();
  return results;
}

export const sum = (rows: AdRow[], k: keyof Omit<AdRow, 'adName' | 'campaignName' | 'campaignId'>) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

/** Builds the report text for the day before `now` (WIB). */
export async function buildDailyReport(db: D1Database, now: number, lastAdSync: number | null): Promise<string> {
  const day = reportDay(now);
  const settings = await loadCostSettings(db);
  const hpp = await hppLookup(db, monthKeyOf(day.start));

  const [yAds, allAds, yOrders, placed, customers] = await Promise.all([
    adRows(db, day.key, day.key),
    adRows(db, '2000-01-01', day.key),
    paidOrders(db, day.start, day.end, hpp.cost, settings.paymentFeePercent, hpp.complete),
    placedOrders(db, day.start, day.end),
    db.prepare('SELECT COUNT(*) AS n FROM shop_customers WHERE createdAt >= ? AND createdAt < ?').bind(day.start, day.end).first<{ n: number }>(),
  ]);
  const firstAdDay = (await db.prepare('SELECT MIN(date) AS d FROM meta_ad_insights WHERE spend > 0').first<{ d: string | null }>())?.d ?? null;
  const toDateOrders = firstAdDay
    ? await paidOrders(db, dayStart(firstAdDay), day.end, hpp.cost, settings.paymentFeePercent, hpp.complete)
    : [];

  const lines: string[] = [];
  const [y, m, d] = day.key.split('-');
  lines.push(`📊 DAILY MARKETING REPORT — ${d}/${m}/${y} (WIB)`);

  // Ads
  lines.push('', '📣 META ADS (Meta-reported)');
  if (!lastAdSync) lines.push('• No ad data synced yet.');
  else if (!yAds.length) lines.push('• No ad delivery recorded for this day.');
  else {
    const spend = sum(yAds, 'spend');
    const lpv = sum(yAds, 'landingPageViews');
    lines.push(
      `• Spend: ${rp(spend)}`,
      `• Seen: ${sum(yAds, 'impressions').toLocaleString('id-ID')} · Link clicks: ${sum(yAds, 'linkClicks')} (${pct(sum(yAds, 'linkClicks'), sum(yAds, 'impressions'))})`,
      `• Website visits: ${lpv}${lpv ? ` (${rp(spend / lpv)} each)` : ''}`,
      `• Add to cart: ${sum(yAds, 'addToCart')} · Opened checkout: ${sum(yAds, 'initiateCheckout')} · Purchases: ${sum(yAds, 'purchases')}`,
    );
    for (const r of yAds) lines.push(`   – ${r.adName}: ${rp(r.spend)}, ${r.linkClicks} clicks, ${r.landingPageViews} visits, ${r.purchases} purchases`);
  }

  // Google search ads (pushed hourly by the script in the Google Ads account)
  const [lastGoogle, yGoogle, allGoogle] = await Promise.all([lastGoogleSync(db), googleRows(db, day.key, day.key), googleRows(db, '2000-01-01', day.key)]);
  const googleY = yOrders.filter((o) => o.fromGoogle);
  lines.push('', '🔎 GOOGLE ADS (Google-reported)');
  if (!lastGoogle) lines.push('• No Google data yet (the Google Ads script has not sent anything).');
  else if (!yGoogle.length) lines.push('• No ad delivery recorded for this day.');
  else for (const r of yGoogle) lines.push(`• ${r.campaignName}: ${rp(r.spend)}, ${r.impressions.toLocaleString('id-ID')} seen, ${r.clicks} clicks`);
  if (lastGoogle) {
    const gSpend = allGoogle.reduce((s, r) => s + r.spend, 0);
    const gAll = toDateOrders.filter((o) => o.fromGoogle);
    lines.push(`• Real paid orders from Google ads: ${googleY.length} yesterday, ${gAll.length} in total · Google spend in total ${rp(gSpend)}${gAll.length ? ` (${rp(gSpend / gAll.length)} per order)` : ''}`);
  }

  // Website (real orders)
  const metaY = yOrders.filter((o) => o.fromMeta);
  lines.push(
    '',
    '🛒 WEBSITE (real orders)',
    `• New accounts: ${customers?.n ?? 0} · Orders placed: ${placed.length} (from Meta ads: ${placed.filter((o) => o.fromMeta).length}) · Paid: ${yOrders.length} (${rp(yOrders.reduce((s, o) => s + o.paid, 0))})`,
    `• Paid orders from Meta ads: ${metaY.length}`,
  );
  const unpaid = placed.filter((o) => !o.paid);
  if (unpaid.length) lines.push(`• Placed but not paid: ${unpaid.map((o) => `#${o.orderId} (${o.source})`).join(', ')}`);
  for (const o of yOrders)
    lines.push(`   – #${o.orderId} ${rp(o.paid)} · from ${o.source} · profit before ads ${o.profit === null ? 'HPP missing' : rp(o.profit)}${o.courierMissing ? ' (courier fee not entered yet)' : ''}`);

  // Traffic by source (our own visit tracking: real browsers only, one visit per tab session)
  const sources = await sourcesForDay(db, day.key);
  lines.push('', '🌐 TRAFFIC BY SOURCE (real visitors)');
  if (!sources.length && !placed.length) lines.push('• No visits recorded.');
  const labels = new Set([...sources.map((r) => r.label), ...placed.map((o) => o.label)]);
  for (const label of labels) {
    const r = sources.find((x) => x.label === label) ?? { visits: 0, addToCart: 0, checkout: 0 };
    const orders = placed.filter((o) => o.label === label);
    lines.push(`• ${label}: ${r.visits} visits · ${r.addToCart} add to cart · ${r.checkout} opened checkout · ${orders.length} orders (${orders.filter((o) => o.paid).length} paid)`);
  }


  const profitOf = (list: OrderProfit[]) => (list.some((o) => o.profit === null) ? null : list.reduce((s, o) => s + (o.profit ?? 0), 0));
  const ySpend = sum(yAds, 'spend');
  const yMetaProfit = profitOf(metaY);
  lines.push('', '💰 PROFIT AFTER ADS (Meta orders only)');
  lines.push(
    `• Yesterday: ${yMetaProfit === null ? 'HPP missing for a product' : `${rp(yMetaProfit)} profit − ${rp(ySpend)} ads = ${rp(yMetaProfit - ySpend)}`}`,
  );
  const allSpend = sum(allAds, 'spend');
  const metaAll = toDateOrders.filter((o) => o.fromMeta);
  const allProfit = profitOf(metaAll);
  if (firstAdDay) {
    lines.push(
      `• Since ${firstAdDay}: ${metaAll.length} paid Meta orders · ${allProfit === null ? 'HPP missing' : `${rp(allProfit)} profit − ${rp(allSpend)} ads = ${rp(allProfit - allSpend)}`}`,
      `• CPA (ads ÷ paid Meta orders): ${metaAll.length ? rp(allSpend / metaAll.length) : 'no orders yet'}`,
      `• All paid website orders since ${firstAdDay} (incl. ones without an ad tag, e.g. after a WhatsApp chat): ${toDateOrders.length} · ${(() => {
        const p = profitOf(toDateOrders);
        return p === null ? 'HPP missing' : `${rp(p)} profit − ${rp(allSpend)} ads = ${rp(p - allSpend)}`;
      })()}`,
      `• Ad spend since ${firstAdDay}: ${rp(allSpend)}`,
    );
  }

  // Flags (agreed rules); the owner decides.
  const flags: string[] = [];
  const allLpv = sum(allAds, 'landingPageViews');
  if (allLpv >= 40 && sum(allAds, 'addToCart') === 0) flags.push(`${allLpv} ad visitors so far and nobody added to cart → check website/offer`);
  const allCheckouts = sum(allAds, 'initiateCheckout');
  if (allCheckouts >= 3 && metaAll.length === 0) flags.push(`${allCheckouts} ad visitors opened checkout but none paid → checkout/offer drop-off`);
  if (allSpend >= CHECKPOINT_SPEND && metaAll.length < CHECKPOINT_MIN_ORDERS)
    flags.push(`Checkpoint reached: ${rp(allSpend)} spent with ${metaAll.length} paid Meta orders (< ${CHECKPOINT_MIN_ORDERS}) → my advice is to pause and fix before spending more. Your decision.`);
  if (lastAdSync && now - lastAdSync > 12 * 3600 * 1000) flags.push('Meta data is more than 12 hours old (sync problem) — numbers may be incomplete.');
  if (lastGoogle && now - lastGoogle > 12 * 3600 * 1000) flags.push('Google data is more than 12 hours old (the Google Ads script may have stopped) — numbers may be incomplete.');
  const googleFlag = googlePromoQuestion(allGoogle.reduce((s, r) => s + r.spend, 0), jakartaDateKey(now));
  if (googleFlag) flags.push(googleFlag);
  lines.push('', flags.length ? '⚠️ NEEDS ATTENTION' : '✅ Nothing needs your decision today.');
  for (const f of flags) lines.push(`• ${f}`);

  const notes: string[] = ['Meta counts purchases with its own attribution (7-day click / 1-day view); "real orders" are from the website database.'];
  if (hpp.usedOwnerFallback.size) notes.push(`HPP for ${[...hpp.usedOwnerFallback].join(', ')} = owner's flat cost (admin HPP not complete for this month).`);
  lines.push('', ...notes.map((n) => `ℹ️ ${n}`));
  return lines.join('\n');
}

/** True when today's report (WIB) is due and has not been sent yet. */
export async function reportDue(db: D1Database, now: number): Promise<boolean> {
  const wibHour = new Date(now + 7 * 3600 * 1000).getUTCHours();
  if (wibHour < REPORT_HOUR_WIB) return false;
  const state = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(REPORT_STATE_KEY).first<{ value: string }>();
  return state?.value !== jakartaDateKey(now);
}

export async function markReportSent(db: D1Database, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notification_state (key, value, updatedAt) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    )
    .bind(REPORT_STATE_KEY, jakartaDateKey(now), now)
    .run();
}
