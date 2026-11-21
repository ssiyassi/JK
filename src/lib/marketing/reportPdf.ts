// Daily marketing report as a designed one-page document (owner asked 2026-10-27: the Telegram text was too long to
// read). collectDailyReport() gathers the same numbers as the text report (adsReport.ts); reportHtml() lays them out
// as two A4 pages (big picture, one card per campaign with its budget, questions; then the details) that are printed to
// PDF. The admin page Marketing → Ads Report shows the same page for any day or date range (collectReport), live for today.
import type { D1Database } from '../core/d1.ts';
import { loadCostSettings, monthKeyOf } from '../core/costs.ts';
import { sourcesForRange, type SourceRow } from '../shop/visits.ts';
import { addDaysToKey, jakartaDateKey } from '../core/time.ts';
import { journeysForRange, type Journeys } from './journeys.ts';
import { googleRows, lastGoogleSync, type GoogleCampaign } from './googleAds.ts';
import { SYNC_STATE_KEY } from './metaAds.ts';
import { PAST_CUSTOMERS, pastCustomersReport, type PastCustomersReport } from './pastCustomers.ts';
import { CHANNELS, OTHER_META, channelOfCampaign, orderChannel, type Channel } from './channels.ts';
import { courierService, isCourierCity } from '../shop/delivery-cities.ts';
import { DISCOUNT_CHANGE, CHECKPOINT_MIN_ORDERS, CHECKPOINT_SPEND, adRows, googlePromoQuestion, dayStart, hppLookup, paidOrders, placedOrders, reportDay, sum, type AdRow, type OrderProfit } from './adsReport.ts';

export interface DailyReportData {
  day: string; // last day of the period, YYYY-MM-DD (WIB)
  from: string; // first day of the period
  periodLabel: string; // "Yesterday", "Today (live)", "28 Oct", "22 – 28 Oct"
  live: boolean; // the period includes today (numbers still changing)
  generatedAt: number;
  adsSynced: boolean;
  ads: AdRow[];
  adTotals: { spend: number; impressions: number; linkClicks: number; visits: number; addToCart: number; checkout: number; purchases: number };
  orders: OrderProfit[]; // paid in the period
  unpaid: { orderId: string; label: string }[];
  newAccounts: number;
  sources: (SourceRow & { orders: number; paid: number })[];
  since: string | null; // first day with ad spend
  total: { spend: number; orders: number; revenue: number; profit: number | null; metaOrders: number }; // since the ads started
  // Meta's budget week (Sunday–Saturday) that holds the last day, up to that day: Meta may spend 7× the daily budget per week.
  week: { from: string; to: string; spend: number; googleSpend: number; orders: number; revenue: number; profit: number | null; metaOrders: number; googleOrders: number; dailyBudget: number | null };
  yesterday: { spend: number; revenue: number; profit: number | null }; // the period (yesterday in the daily report), Meta + Google spend
  journeys: Journeys; // the period
  pastCustomers: PastCustomersReport | null; // retargeting project (null until the list is loaded)
  // Google search ads (src/lib/marketing/googleAds.ts). Spend in yesterday/week above includes Google; adTotals is Meta only.
  google: {
    lastSync: number | null;
    campaigns: GoogleCampaign[]; // the period
    spend: number; // the period
    orders: OrderProfit[]; // paid in the period through a Google ad
    since: string | null; // first day with Google spend
    totalSpend: number;
    totalOrders: number;
    totalRevenue: number;
    totalProfit: number | null;
  };
  channels: ChannelReport[]; // one card per campaign (channels.ts), the period
  // Before vs after the first-order discount change (DISCOUNT_CHANGE), each from its start up to the last day; null before the change.
  discountCompare: { before: DiscountSide; after: DiscountSide } | null;
  days: { date: string; spend: number; revenue: number; adRevenue: number; adProfit: number | null }[]; // the 7 days ending on the last day: ads (Meta + Google) vs revenue (all website) and adRevenue (orders from ads)
  questions: string[];
  notes: string[];
}

export interface DiscountSide {
  percent: number;
  from: string;
  to: string;
  days: number; // length of the period in days (with decimals: the change day is split at the hour of the change)
  spend: number; // Meta + Google
  orders: number;
  adOrders: number; // through a Meta or Google ad
  revenue: number;
  discount: number;
  boxes: number;
  profit: number | null; // before ads
  adVisits: number; // website sessions from ads (Meta paid_social, Google cpc)
}

export interface ChannelReport {
  channel: Channel;
  spend: number;
  budget: number | null; // daily budget now (Meta: read at the last sync, active ad sets only); null = unknown
  planned: number | null; // budget × days the campaign ran in the period
  start: string | null; // first day with spend (Google: its start day)
  running: boolean; // Meta: has an active daily budget; Google: spent in the period
  visits: number; // Meta landing page views; Google: clicks
  metaPurchases: number; // as Meta counts them
  orders: OrderProfit[]; // paid in the period through this channel's ads
  revenue: number;
  profit: number | null; // profit before ads of its orders; null = HPP missing
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

const profitOf = (list: OrderProfit[]) => (list.some((o) => o.profit === null) ? null : list.reduce((s, o) => s + (o.profit ?? 0), 0));

/** Ad spend, ad visits and paid orders before and after DISCOUNT_CHANGE (`all` = paid orders since the ads started). */
async function compareDiscount(db: D1Database, since: string, to: string, all: OrderProfit[], now: number): Promise<{ before: DiscountSide; after: DiscountSide }> {
  const c = DISCOUNT_CHANGE;
  const spendBetween = async (a: string, b: string) => {
    const [m, g] = await Promise.all([
      db.prepare('SELECT COALESCE(SUM(spend), 0) AS s FROM meta_ad_insights WHERE date >= ? AND date <= ?').bind(a, b).first<{ s: number }>(),
      db.prepare('SELECT COALESCE(SUM(spend), 0) AS s FROM google_ad_insights WHERE date >= ? AND date <= ?').bind(a, b).first<{ s: number }>(),
    ]);
    return Number(m?.s ?? 0) + Number(g?.s ?? 0);
  };
  const visitsBetween = async (start: number, end: number) =>
    Number(
      (
        await db
          .prepare("SELECT COUNT(DISTINCT sid) AS n FROM visit_events WHERE event = 'visit' AND at >= ? AND at < ? AND (medium = 'paid_social' OR medium = 'cpc')")
          .bind(start, end)
          .first<{ n: number }>()
      )?.n ?? 0,
    );
  const end = dayStart(addDaysToKey(to, 1));
  const dayFrom = dayStart(c.day);
  const elapsed = Math.min(now, dayFrom + 86_400_000) - dayFrom;
  const afterShare = elapsed > 0 ? Math.max(0, Math.min(now, dayFrom + 86_400_000) - c.at) / elapsed : 0;
  const changeDaySpend = await spendBetween(c.day, c.day);
  const side = async (percent: number, from: string, last: string, list: OrderProfit[], visitStart: number, visitEnd: number): Promise<DiscountSide> => ({
    percent,
    from,
    to: last,
    days: Math.max(0.05, (Math.min(visitEnd, now) - visitStart) / 86_400_000),
    // Meta reports whole days: the change day's spend is split by the hours before and after the change, up to now.
    spend: (from < c.day ? await spendBetween(from, addDaysToKey(c.day, -1)) : 0) + (last > c.day ? await spendBetween(addDaysToKey(c.day, 1), last) : 0) + changeDaySpend * (from === c.day ? afterShare : 1 - afterShare),
    orders: list.length,
    adOrders: list.filter((o) => o.fromMeta || o.fromGoogle).length,
    revenue: list.reduce((s, o) => s + o.paid, 0),
    discount: list.reduce((s, o) => s + o.discount, 0),
    boxes: list.reduce((s, o) => s + o.items.reduce((n, i) => n + i.qty, 0), 0),
    profit: profitOf(list),
    adVisits: await visitsBetween(visitStart, visitEnd),
  });
  // Placed before the change = the 35% offer, even when it was paid later.
  const placed = (o: OrderProfit) => o.placedAt ?? o.paidAt ?? 0;
  return {
    before: await side(c.before, since, c.day, all.filter((o) => placed(o) < c.at), dayStart(since), c.at),
    after: await side(c.after, c.day, to, all.filter((o) => placed(o) >= c.at), c.at, end),
  };
}

export async function collectDailyReport(db: D1Database, now: number, lastAdSync: number | null): Promise<DailyReportData> {
  const day = reportDay(now).key;
  return collectReport(db, day, day, now, lastAdSync);
}

const shortDay = (key: string) => new Date(`${key}T12:00:00+07:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });

/** Name of a period as the owner reads it: Today (live), Yesterday, 28 Oct, 22 – 28 Oct. */
export function periodLabel(from: string, to: string, now: number): string {
  const today = jakartaDateKey(now);
  if (from !== to) return `${shortDay(from)} – ${shortDay(to)}${to === today ? ' (live)' : ''}`;
  if (to === today) return 'Today (live)';
  if (to === addDaysToKey(today, -1)) return 'Yesterday';
  return shortDay(to);
}

/** Sunday that starts Meta's budget week holding `day` (YYYY-MM-DD). */
export const weekStart = (day: string) => addDaysToKey(day, -new Date(`${day}T12:00:00Z`).getUTCDay());

/** The report for the days from `from` to `to` (YYYY-MM-DD WIB, inclusive). The budget-week cards end on `to`. */
export async function collectReport(db: D1Database, from: string, to: string, now: number, lastAdSync: number | null): Promise<DailyReportData> {
  const day = { key: to, start: dayStart(from), end: dayStart(addDaysToKey(to, 1)) };
  const settings = await loadCostSettings(db);
  const hpp = await hppLookup(db, monthKeyOf(dayStart(to)));
  const weekFrom = weekStart(to);
  const [ads, allAds, weekAds, orders, weekOrders, placed, customers, sources, journeys, syncState, gAds, gWeek, gAll, gLast, gSince] = await Promise.all([
    adRows(db, from, to),
    adRows(db, '2000-01-01', to),
    adRows(db, weekFrom, to),
    paidOrders(db, day.start, day.end, hpp.cost, settings.paymentFeePercent, hpp.complete),
    paidOrders(db, dayStart(weekFrom), day.end, hpp.cost, settings.paymentFeePercent, hpp.complete),
    placedOrders(db, day.start, day.end),
    db.prepare('SELECT COUNT(*) AS n FROM shop_customers WHERE createdAt >= ? AND createdAt < ?').bind(day.start, day.end).first<{ n: number }>(),
    sourcesForRange(db, from, to),
    journeysForRange(db, from, to),
    db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(SYNC_STATE_KEY).first<{ value: string }>(),
    googleRows(db, from, to),
    googleRows(db, weekFrom, to),
    googleRows(db, '2000-01-01', to),
    lastGoogleSync(db),
    db.prepare('SELECT MIN(date) AS d FROM google_ad_insights WHERE spend > 0').first<{ d: string | null }>(),
  ]);
  const gSum = (rows: GoogleCampaign[]) => rows.reduce((s, r) => s + r.spend, 0);
  const chartFrom = addDaysToKey(to, -6);
  const [firstSpend, metaDaily, googleDaily, chartOrders] = await Promise.all([
    db.prepare('SELECT campaignId, MAX(campaignName) AS campaignName, MIN(date) AS d FROM meta_ad_insights WHERE spend > 0 GROUP BY campaignId').all<{ campaignId: string | null; campaignName: string | null; d: string }>(),
    db.prepare('SELECT date, SUM(spend) AS spend FROM meta_ad_insights WHERE date >= ? AND date <= ? GROUP BY date').bind(chartFrom, to).all<{ date: string; spend: number }>(),
    db.prepare('SELECT date, SUM(spend) AS spend FROM google_ad_insights WHERE date >= ? AND date <= ? GROUP BY date').bind(chartFrom, to).all<{ date: string; spend: number }>(),
    paidOrders(db, dayStart(chartFrom), day.end, hpp.cost, settings.paymentFeePercent, hpp.complete),
  ]);
  const pastCustomers = await pastCustomersReport(db, from, to, hpp.cost, settings.paymentFeePercent);
  const syncValue = syncState ? (JSON.parse(syncState.value) as { dailyBudget?: number; campaignBudgets?: Record<string, number> | null }) : null;
  const dailyBudget = Number(syncValue?.dailyBudget ?? 0) || null;
  const campaignBudgets = syncValue?.campaignBudgets ?? null; // null until the first sync after 2026-11-06
  const since = (await db.prepare('SELECT MIN(date) AS d FROM meta_ad_insights WHERE spend > 0').first<{ d: string | null }>())?.d ?? null;
  const all = since ? await paidOrders(db, dayStart(since), day.end, hpp.cost, settings.paymentFeePercent, hpp.complete) : [];
  const googleSince = gSince?.d ?? null;
  const googleAll = googleSince
    ? (since && since <= googleSince ? all : await paidOrders(db, dayStart(googleSince), day.end, hpp.cost, settings.paymentFeePercent, hpp.complete)).filter((o) => o.fromGoogle)
    : [];

  // Traffic by source + the orders placed from each source.
  const labels = [...new Set([...sources.map((r) => r.label), ...placed.map((o) => o.label)])];
  const sourceRows = labels.map((label) => {
    const r = sources.find((x) => x.label === label) ?? { label, visits: 0, addToCart: 0, checkout: 0 };
    const o = placed.filter((p) => p.label === label);
    return { ...r, orders: o.length, paid: o.filter((p) => p.paid).length };
  });

  const total = {
    spend: sum(allAds, 'spend'),
    orders: all.length,
    revenue: all.reduce((s, o) => s + o.paid, 0),
    profit: profitOf(all),
    metaOrders: all.filter((o) => o.fromMeta).length,
  };
  const ySpend = sum(ads, 'spend') + gSum(gAds);
  const week = {
    from: weekFrom,
    to: addDaysToKey(weekFrom, 6),
    spend: sum(weekAds, 'spend'),
    googleSpend: gSum(gWeek),
    orders: weekOrders.length,
    revenue: weekOrders.reduce((s, o) => s + o.paid, 0),
    profit: profitOf(weekOrders),
    metaOrders: weekOrders.filter((o) => o.fromMeta).length,
    googleOrders: weekOrders.filter((o) => o.fromGoogle).length,
    dailyBudget,
  };

  // Questions for the owner (decisions or missing data); the owner decides, nothing changes automatically.
  const questions: string[] = [];
  for (const o of all.filter((x) => x.courierMissing && x.delivered))
    questions.push(`Courier fee for order #${o.orderId} is not entered yet — please add it in the admin so the profit is correct.`);
  const cpa = total.orders ? total.spend / total.orders : null;
  const thin = cpa === null ? [] : orders.filter((o) => o.profit !== null && o.profit < cpa);
  if (thin.length === 1)
    questions.push(`Order #${thin[0].orderId} earned ${rp(thin[0].profit ?? 0)} before ads, below the ad cost per order (${rp(cpa ?? 0)}). Fine as a first order if the customer orders again — keep watching, or do you want options for this case?`);
  else if (thin.length > 1)
    questions.push(`${thin.length} orders (${thin.map((o) => `#${o.orderId} ${rp(o.profit ?? 0)}`).join(', ')}) earned less before ads than the ad cost per order (${rp(cpa ?? 0)}). Fine as first orders if these customers order again — keep watching, or do you want options?`);
  if (total.spend >= CHECKPOINT_SPEND && total.orders < CHECKPOINT_MIN_ORDERS)
    questions.push(`Checkpoint: ${rp(total.spend)} spent with only ${total.orders} paid orders. My advice is to pause and fix before spending more — your decision.`);

  // One card per campaign: spend against its own budget, and the paid orders that came through its ads.
  const planned = (budget: number | null, start: string | null) =>
    budget === null || !start || start > to ? (budget === null ? null : 0) : budget * daysBetween(start > from ? start : from, to);
  const channels: ChannelReport[] = [];
  for (const c of [...CHANNELS, OTHER_META]) {
    if (c.google) {
      const gOrders = orders.filter((o) => o.fromGoogle);
      const start = googleSince ?? c.start ?? null;
      channels.push({
        channel: c, spend: gSum(gAds), budget: c.dailyBudget ?? null, planned: planned(c.dailyBudget ?? null, start), start,
        running: gSum(gAds) > 0, visits: gAds.reduce((s, r) => s + r.clicks, 0), metaPurchases: 0,
        orders: gOrders, revenue: gOrders.reduce((s, o) => s + o.paid, 0), profit: profitOf(gOrders),
      });
      continue;
    }
    const rows = ads.filter((a) => channelOfCampaign(a.campaignName) === c);
    const ids = firstSpend.results.filter((r) => channelOfCampaign(r.campaignName) === c);
    if (c === OTHER_META && !sum(rows, 'spend')) continue;
    const budgets = campaignBudgets ? ids.map((r) => campaignBudgets[r.campaignId ?? ''] ?? 0) : null;
    const budget = budgets ? budgets.reduce((s, b) => s + b, 0) : null;
    const start = ids.length ? ids.map((r) => r.d).sort()[0] : null;
    const cOrders = orders.filter((o) => orderChannel(o).channel === c);
    channels.push({
      channel: c, spend: sum(rows, 'spend'), budget, planned: planned(budget, start), start,
      running: Boolean(budget), visits: sum(rows, 'landingPageViews'), metaPurchases: sum(rows, 'purchases'),
      orders: cOrders, revenue: cOrders.reduce((s, o) => s + o.paid, 0), profit: profitOf(cOrders),
    });
  }
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(chartFrom, i)).map((date) => {
    const spend = [...metaDaily.results, ...googleDaily.results].filter((r) => r.date === date).reduce((s, r) => s + Number(r.spend), 0);
    const adDay = chartOrders.filter((o) => (o.fromMeta || o.fromGoogle) && o.paidAt !== null && jakartaDateKey(o.paidAt) === date);
    const before = profitOf(adDay);
    return {
    date,
    spend,
    revenue: chartOrders.filter((o) => o.paidAt !== null && jakartaDateKey(o.paidAt) === date).reduce((s, o) => s + o.paid, 0),
    adRevenue: adDay.reduce((s, o) => s + o.paid, 0),
    // Profit after ads of the day (owner 14 Nov): ad orders' sales − product cost − fees − that day's ad spend.
    adProfit: before === null ? null : before - spend,
    };
  });
  for (const o of orders.filter((x) => isCourierCity(x.city) && x.courierMissing && !x.delivered))
    questions.unshift(`Courier fee for the ${o.city} order #${o.orderId} is not entered yet. Please add it in Website Orders when you ship it, so its profit is correct (now shown without the courier fee).`);

  const discountCompare = since && to >= DISCOUNT_CHANGE.day ? await compareDiscount(db, since, to, all, now) : null;

  const googlePromo = googlePromoQuestion(gSum(gAll), jakartaDateKey(now));
  if (googlePromo) questions.push(googlePromo);

  const notes: string[] = [];
  const live = to >= jakartaDateKey(now);
  if (gLast && now - gLast > 12 * 3600 * 1000) notes.push('Google numbers may be incomplete (the Google Ads script last sent data more than 12 hours ago).');
  if (live && lastAdSync) notes.push(`Live: today's numbers are still changing. Meta ad numbers as of ${new Date(lastAdSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB (Meta itself can be 15–30 minutes behind).`);
  if (!lastAdSync || now - lastAdSync > 12 * 3600 * 1000) notes.push('Meta numbers may be incomplete (last sync more than 12 hours ago).');
  if (sum(ads, 'purchases') < orders.filter((o) => o.fromMeta).length)
    notes.push('Meta still reports fewer purchases than the real ad orders — its report usually catches up in 1–3 days.');
  if (hpp.usedOwnerFallback.size) notes.push(`HPP for ${[...hpp.usedOwnerFallback].join(', ')} uses the older flat cost (admin HPP incomplete).`);

  return {
    day: day.key,
    from,
    periodLabel: periodLabel(from, to, now),
    live,
    generatedAt: now,
    adsSynced: Boolean(lastAdSync),
    ads,
    adTotals: {
      spend: sum(ads, 'spend'),
      impressions: sum(ads, 'impressions'),
      linkClicks: sum(ads, 'linkClicks'),
      visits: sum(ads, 'landingPageViews'),
      addToCart: sum(ads, 'addToCart'),
      checkout: sum(ads, 'initiateCheckout'),
      purchases: sum(ads, 'purchases'),
    },
    orders,
    unpaid: placed.filter((o) => !o.paid).map((o) => ({ orderId: o.orderId, label: o.label })),
    newAccounts: Number(customers?.n ?? 0),
    sources: sourceRows,
    since,
    total,
    week,
    yesterday: { spend: ySpend, revenue: orders.reduce((s, o) => s + o.paid, 0), profit: profitOf(orders) },
    journeys,
    pastCustomers,
    google: {
      lastSync: gLast,
      campaigns: gAds,
      spend: gSum(gAds),
      orders: orders.filter((o) => o.fromGoogle),
      since: googleSince,
      totalSpend: gSum(gAll),
      totalOrders: googleAll.length,
      totalRevenue: googleAll.reduce((s, o) => s + o.paid, 0),
      totalProfit: profitOf(googleAll),
    },
    channels,
    discountCompare,
    days,
    questions,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
export const num = (n: number) => Math.round(n).toLocaleString('id-ID');
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${rp(Math.abs(n))}`;

export function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00+07:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

export function card(label: string, value: string, sub = '', tone: 'plain' | 'good' | 'bad' = 'plain'): string {
  return `<div class="card ${tone}"><div class="lbl">${esc(label)}</div><div class="val">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

/** Shared look of the daily and weekly reports (A4, brand colours). */
export const REPORT_CSS = `@page { size: A4; margin: 18mm 16mm; }
:root { --brand: #9a3412; --brand-soft: #fdf3ea; --ink: #1f1a17; --muted: #7a6a5e; --line: #eadfd5; --good: #15803d; --bad: #b91c1c; }
* { box-sizing: border-box; }
body { font-family: Inter, 'Helvetica Neue', Arial, sans-serif; color: var(--ink); font-size: 10.5pt; margin: 0; }
@media screen { body { padding: 18mm 16mm; } }
header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid var(--brand); padding-bottom: 8px; margin-bottom: 12px; }
header .brand { display: flex; align-items: center; gap: 10px; }
header img { height: 44px; }
header h1 { font-size: 17pt; margin: 0; color: var(--brand); }
header .date { text-align: right; font-size: 10pt; color: var(--muted); }
header .date b { display: block; font-size: 12pt; color: var(--ink); }
h2 { font-size: 11.5pt; margin: 14px 0 6px; color: var(--brand); text-transform: uppercase; letter-spacing: .04em; }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: #fff; }
.card .lbl { font-size: 8.5pt; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.card .val { font-size: 15pt; font-weight: 800; margin-top: 2px; }
.card .sub { font-size: 8.5pt; color: var(--muted); margin-top: 2px; }
.card.good { background: #f0fdf4; border-color: #bbf7d0; } .card.good .val { color: var(--good); }
.card.bad { background: #fef2f2; border-color: #fecaca; } .card.bad .val { color: var(--bad); }
.period { font-size: 9pt; color: var(--muted); margin: 10px 0 4px; }
.bar { height: 8px; border-radius: 99px; background: #f1e7dd; overflow: hidden; margin-top: 6px; }
.bar > i { display: block; height: 100%; background: var(--brand); }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th { text-align: left; background: var(--brand-soft); color: #5c3a24; font-weight: 700; padding: 5px 6px; border-bottom: 1px solid var(--line); }
td { padding: 5px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
td:not(:first-child), th:not(:first-child) { text-align: right; }
td.l, th.l { text-align: left !important; }
td:not(.l):not(:first-child) { white-space: nowrap; }
tr.tot td { font-weight: 800; background: #faf6f2; }
.pos { color: var(--good); } .neg { color: var(--bad); }
.tag { background: #fde68a; color: #6b230b; border-radius: 4px; padding: 0 4px; font-size: 8pt; font-weight: 700; }
.warn { color: var(--bad); font-weight: 700; }
.empty { color: var(--muted); margin: 4px 0; }
.ask { background: #fff7ed; border: 1px solid #fed7aa; border-left: 5px solid var(--brand); border-radius: 10px; padding: 8px 12px; }
.ask ol { margin: 4px 0 0 18px; padding: 0; } .ask li { margin: 4px 0; }
.ok { color: var(--good); font-weight: 700; margin: 2px 0; }
.journeys { break-before: page; }
.journeys table { break-inside: avoid; }
.funnel td:first-child { width: 46%; }
.funnel .lost { color: var(--bad); font-weight: 700; }
.funnel .barcell { width: 26%; } .funnel .barcell .bar { margin: 3px 0 0; }
.read { background: #eff6ff; border: 1px solid #bfdbfe; border-left: 5px solid #2563eb; border-radius: 10px; padding: 7px 12px; margin: 8px 0; }
.two { display: grid; grid-template-columns: 1fr 1.25fr; gap: 10px; }
h3 { font-size: 9.5pt; margin: 8px 0 4px; color: var(--ink); }
@media screen and (max-width: 640px) {
  body { padding: 12px; font-size: 10pt; }
  header { flex-direction: column; align-items: flex-start; gap: 6px; } header .date { text-align: left; }
  .cards { grid-template-columns: repeat(2, 1fr); } .two { grid-template-columns: 1fr; }
  table { display: block; overflow-x: auto; white-space: nowrap; }
}
.bar.goal { position: relative; } .bar.goal b { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--ink); }
tr.camp td { background: #fffbeb; }
.notes { font-size: 8.5pt; color: var(--muted); margin-top: 12px; border-top: 1px solid var(--line); padding-top: 6px; }
.notes p { margin: 2px 0; }
`;

/**
 * Daily report layout (owner, 2026-11-06). Page 1: the big picture, one card per campaign against its own budget, where
 * the ad money went, new customers, outside-city orders and questions. Page 2: the last 7 days, every paid order, every
 * ad, and where people stopped. The admin page shows the same HTML (narrow screens: one column).
 */
const DAILY_CSS = `@page { size: A4; margin: 13mm 13mm 12mm; }
:root { --brand: #9a3412; --soft: #fdf3ea; --ink: #1f1a17; --muted: #7a6a5e; --line: #eadfd5; --good: #15803d; --bad: #b91c1c; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Inter, 'Helvetica Neue', Arial, sans-serif; color: var(--ink); font-size: 9.5pt; margin: 0; }
@media screen { body { padding: 14mm 13mm; max-width: 210mm; } }
header { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-bottom: 3px solid var(--brand); padding-bottom: 7px; }
header .brand { display: flex; gap: 10px; align-items: center; } header img { height: 40px; }
h1 { margin: 0; color: var(--brand); font-size: 17pt; }
header .date { text-align: right; color: var(--muted); font-size: 9pt; } header .date b { display: block; color: var(--ink); font-size: 11.5pt; }
.live { background: #fde68a; color: #6b230b; border-radius: 4px; padding: 0 5px; font-weight: 800; font-size: 8pt; }
h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .05em; color: var(--brand); margin: 11px 0 5px; }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 7px 9px; }
.card .lbl { font-size: 7.5pt; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.card .val { font-size: 15pt; font-weight: 800; margin-top: 1px; }
.card .sub { font-size: 7.5pt; color: var(--muted); margin-top: 1px; }
.card.good { background: #f0fdf4; border-color: #bbf7d0; } .card.good .val { color: var(--good); }
.card.bad { background: #fef2f2; border-color: #fecaca; } .card.bad .val { color: var(--bad); }
.bar { height: 6px; border-radius: 99px; background: #f1e7dd; overflow: hidden; margin-top: 5px; } .bar i { display: block; height: 100%; border-radius: 99px; background: var(--brand); }
.camps { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.camp { border: 1px solid var(--line); border-top: 4px solid var(--c); border-radius: 10px; padding: 7px 9px; }
.camp .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
.camp .name { font-weight: 800; font-size: 10.5pt; display: flex; align-items: center; gap: 6px; }
.camp .what { color: var(--muted); font-size: 7.5pt; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: none; } .camp .dot { background: var(--c); }
.pill { font-size: 7pt; font-weight: 800; border-radius: 99px; padding: 1px 7px; white-space: nowrap; }
.pill.run { background: #f0fdf4; color: var(--good); } .pill.wait { background: #fef3c7; color: #92400e; } .pill.off { background: #f1e7dd; color: var(--muted); }
.camp .spend { margin-top: 5px; color: var(--muted); font-size: 8pt; } .camp .spend b { color: var(--ink); font-size: 11.5pt; }
.camp .bar i { background: var(--c); }
.stats { display: grid; grid-template-columns: .7fr .7fr 1.2fr 1.3fr; gap: 4px; margin-top: 6px; border-top: 1px solid var(--line); padding-top: 5px; }
.stats div { font-size: 7pt; color: var(--muted); } .stats b { display: block; font-size: 9.5pt; color: var(--ink); }
.stats b.pos { color: var(--good); } .stats b.neg { color: var(--bad); }
.camp .note { font-size: 7.5pt; color: var(--muted); background: var(--soft); border-radius: 6px; padding: 3px 6px; margin-top: 5px; }
.split { display: flex; gap: 2px; height: 14px; border-radius: 6px; overflow: hidden; background: #f1e7dd; } .split span { display: block; height: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 3px 14px; font-size: 8pt; margin-top: 5px; } .legend span { display: inline-flex; align-items: center; gap: 5px; } .legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 9px; }
.box { border: 1px solid var(--line); border-radius: 10px; padding: 7px 9px; } .box h2 { margin: 0 0 2px; }
.big { font-size: 18pt; font-weight: 800; } .big small { font-size: 9pt; color: var(--muted); font-weight: 600; }
.hint { color: var(--muted); font-size: 7.5pt; }
.rows div { display: flex; justify-content: space-between; gap: 6px; padding: 3px 0; border-bottom: 1px solid var(--line); font-size: 8.5pt; } .rows div:last-child { border: 0; } .rows b { white-space: nowrap; }
.rows .k { display: inline-flex; align-items: center; gap: 6px; }
.ask { background: #fff7ed; border: 1px solid #fed7aa; border-left: 5px solid var(--brand); border-radius: 10px; padding: 6px 10px; }
.ask ol { margin: 0; padding-left: 16px; } .ask li { margin: 2px 0; } .ok { color: var(--good); font-weight: 700; margin: 0; }
.pos { color: var(--good); } .neg { color: var(--bad); font-weight: 700; }
.p2 { break-before: page; } .p2 h2 { margin: 9px 0 4px; } .p2 > h2:first-child { margin-top: 0; }
.chart { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
.days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.pair { height: 56px; display: flex; gap: 3px; align-items: flex-end; justify-content: center; border-bottom: 1px solid var(--line); }
.pair i { width: 14px; border-radius: 3px 3px 0 0; } .sp { background: #a8a29e; } .rv { background: var(--good); }
.xl { text-align: center; font-size: 7.5pt; color: var(--muted); margin-top: 3px; } .xl b { color: var(--ink); }
table { width: 100%; border-collapse: collapse; font-size: 7.8pt; }
th { background: var(--soft); color: #5c3a24; text-align: right; padding: 2px 4px; border-bottom: 1px solid var(--line); }
td { padding: 2px 4px; border-bottom: 1px solid var(--line); text-align: right; vertical-align: top; white-space: nowrap; }
.l { text-align: left !important; white-space: normal; } .nw { white-space: nowrap; }
tr.camp-row td { background: #fffbeb; }
.tag { background: #fde68a; color: #6b230b; border-radius: 3px; padding: 0 3px; font-size: 7pt; font-weight: 800; }
.barcell { width: 30%; } .barcell .bar { margin: 3px 0 0; }
.read { background: #eff6ff; border: 1px solid #bfdbfe; border-left: 5px solid #2563eb; border-radius: 10px; padding: 4px 10px; margin-top: 5px; font-size: 8pt; }
.empty { color: var(--muted); margin: 3px 0; }
.foot { font-size: 7pt; color: var(--muted); border-top: 1px solid var(--line); margin-top: 6px; padding-top: 3px; } .foot p { margin: 1px 0; }
@media screen and (max-width: 640px) {
  body { padding: 12px; font-size: 10pt; }
  header { flex-direction: column; align-items: flex-start; } header .date { text-align: left; }
  .cards { grid-template-columns: repeat(2, 1fr); } .camps, .two { grid-template-columns: 1fr; }
  .days { gap: 2px; } .pair i { width: 9px; }
  table { display: block; overflow-x: auto; }
}
`;

const k = (n: number) => `${num(n / 1000)}k`;
const short = (name: string) => name.replace(/^(Meta|Google) · /, '');

function campaignCard(c: ChannelReport, from: string): string {
  const ch = c.channel;
  const n = c.orders.length;
  const pct = c.planned ? (c.spend / c.planned) * 100 : 0;
  const after = c.profit === null ? null : c.profit - c.spend;
  const pill = ch.google
    ? c.running ? '<span class="pill run">● Running</span>' : '<span class="pill wait">No spend yet</span>'
    : c.running ? '<span class="pill run">● Running</span>' : c.budget === null ? '' : '<span class="pill off">Not running now</span>';
  const budget = c.budget === null ? 'budget unknown' : `${rp(c.budget)}/day`;
  const plannedText =
    c.planned === null ? '' : c.planned === 0 ? ' · not started yet in this period' : ` of ${rp(c.planned)} planned${pct > 100 ? ` <span class="neg">${pct.toFixed(0)}%</span>` : ` · ${pct.toFixed(0)}%`}`;
  let note = '';
  if (ch.google && !c.spend) note = 'No spend from Google in this period yet (Google reports a day late).';
  else if (pct > 100) note = 'Meta may spend more on some days, within 7× the daily budget per week.';
  else if (c.start && c.start > from) note = `Started ${shortDay(c.start)}.`;
  if (!n && c.metaPurchases) note += `${note ? ' ' : ''}Meta counts ${c.metaPurchases} purchase${c.metaPurchases > 1 ? 's' : ''} after someone saw this ad; no order came through its link.`;
  else if (n) note += `${note ? ' ' : ''}${rp(c.spend / n)} ads per order.`;
  const result = !n && !c.spend ? '<b>–</b>' : after === null ? '<b>?</b>' : `<b class="${after >= 0 ? 'pos' : 'neg'}">${signed(after)}</b>`;
  return `<div class="camp" style="--c:${ch.color}">
  <div class="top"><div><div class="name"><i class="dot"></i>${esc(ch.name)}</div><div class="what">${esc(ch.what)} · ${budget}</div></div>${pill}</div>
  <div class="spend"><b>${rp(c.spend)}</b>${plannedText}</div>
  <div class="bar"><i style="width:${Math.min(100, pct).toFixed(0)}%"></i></div>
  <div class="stats"><div><b>${num(c.visits)}</b>${ch.google ? 'clicks' : 'visits'}</div><div><b>${n}</b>orders</div><div><b>${n ? rp(c.revenue) : '–'}</b>revenue</div><div>${result}profit after ads</div></div>
  ${note ? `<div class="note">${esc(note)}</div>` : ''}
</div>`;
}
/** "35% vs 20%": the same numbers before and after the first-order discount change, per day where lengths differ. */
function discountSection(d: DailyReportData): string {
  const c = d.discountCompare;
  if (!c) return '';
  const { before: b, after: a } = c;
  const per = (n: number, s: DiscountSide) => n / s.days;
  const cpo = (s: DiscountSide) => (s.adOrders ? s.spend / s.adOrders : null);
  const after = (s: DiscountSide) => (s.profit === null ? null : s.profit - s.spend);
  const rows: [string, (s: DiscountSide) => string][] = [
    ['Days', (s) => `${s.days.toFixed(1)}`],
    ['Ad spend / day', (s) => rp(per(s.spend, s))],
    ['Ad visitors / day', (s) => num(per(s.adVisits, s))],
    ['Paid orders / day', (s) => per(s.orders, s).toFixed(2)],
    ['Visitor → order', (s) => (s.adVisits ? `${((s.adOrders / s.adVisits) * 100).toFixed(1)}%` : '–')],
    ['Ad cost / order', (s) => (cpo(s) === null ? '–' : rp(cpo(s)!))],
    ['Boxes / order', (s) => (s.orders ? (s.boxes / s.orders).toFixed(1) : '–')],
    ['Discount / order', (s) => (s.orders ? rp(s.discount / s.orders) : '–')],
    ['Profit / order', (s) => (s.profit === null ? '?' : s.orders ? rp(s.profit / s.orders) : '–')],
    ['Profit after ads / day', (s) => (after(s) === null ? '?' : `<span class="${after(s)! >= 0 ? 'pos' : 'neg'}">${signed(per(after(s)!, s))}</span>`)],
    ['Orders (total)', (s) => num(s.orders)],
    ['Revenue (total)', (s) => rp(s.revenue)],
  ];
  const dm = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dates = (s: DiscountSide) => `${dm(s.from)} – ${dm(s.to)}`;
  return `<h2>First-order discount ${b.percent}% → ${a.percent}% — before vs after</h2>
<table><thead><tr><th class="l"></th><th>${b.percent}%</th><th>${a.percent}%</th></tr></thead><tbody>
${rows.map(([l, f]) => `<tr><td class="l">${l}</td><td>${f(b)}</td><td>${f(a)}</td></tr>`).join('\n')}
</tbody></table>
<p class="hint">${b.percent}%: ${esc(dates(b))} · ${a.percent}%: ${esc(dates(a))} (changed 11 Nov about 09:15 WIB). Profit / order is before ads. "/ day" because the two periods have different lengths. ${a.days < 7 ? 'The 20% side is still short — judge after at least 7 days.' : ''}</p>`;
}

export function reportHtml(d: DailyReportData, logoUrl: string): string {
  const single = d.from === d.day;
  const period = /^(Yesterday|Today)/.test(d.periodLabel) ? d.periodLabel.toLowerCase() : d.periodLabel;
  const title = single ? 'Daily Marketing Report' : 'Marketing Report';
  const when = single ? dayLabel(d.day) : `${dayLabel(d.from).replace(/^\w+, /, '')} – ${dayLabel(d.day).replace(/^\w+, /, '')}`;
  const spend = d.yesterday.spend;
  const after = d.yesterday.profit === null ? null : d.yesterday.profit - spend;
  const planned = d.channels.every((c) => c.planned !== null) ? d.channels.reduce((s, c) => s + (c.planned ?? 0), 0) : null;
  const plannedPct = planned ? (spend / planned) * 100 : 0;
  const newCustomers = d.orders.filter((o) => o.newCustomerDiscount);
  const cityOrders = d.orders.filter((o) => isCourierCity(o.city));
  const noData = !d.adsSynced ? '<p class="empty">No Meta data yet.</p>' : '';

  // Where the ad money went
  const total = d.channels.reduce((s, c) => s + c.spend, 0);
  const split = d.channels.filter((c) => c.spend).map((c) => `<span style="width:${((c.spend / total) * 100).toFixed(2)}%;background:${c.channel.color}"></span>`).join('');
  const legend = d.channels.map((c) => `<span><i style="background:${c.channel.color}"></i>${esc(c.channel.google ? 'Google' : short(c.channel.name))} ${total ? ((c.spend / total) * 100).toFixed(0) : 0}% · ${rp(c.spend)}</span>`).join('');

  // New customers by source
  const bySource = new Map<string, { color: string; n: number }>();
  for (const o of newCustomers) {
    const s = orderChannel(o);
    bySource.set(s.name, { color: s.color, n: (bySource.get(s.name)?.n ?? 0) + 1 });
  }
  const sourceRows = [...bySource].sort((a, b) => b[1].n - a[1].n).map(([name, s]) => `<div><span class="k"><i class="dot" style="background:${s.color}"></i>${esc(name)}</span><b>${s.n}</b></div>`).join('');

  const cityRows = cityOrders.length
    ? cityOrders
        .map(
          (o) => `<div><span>#${o.orderId} · ${esc(o.city)} · ${esc(courierService(o.city) ?? '')}</span><b>${rp(o.paid)}</b></div>
<div><span>&nbsp;&nbsp;Delivery fee the customer paid</span><b>${o.deliveryFee ? rp(o.deliveryFee) : 'free'}</b></div>
<div><span>&nbsp;&nbsp;Courier fee you paid</span><b>${o.courierFee === null ? (o.courierMissing ? '<span class="neg">not entered</span>' : '–') : rp(o.courierFee)}</b></div>`,
        )
        .join('\n')
    : `<div><span>No orders from the new cities ${single ? 'on this day' : 'in this period'}</span><b>–</b></div>`;

  const questions = d.questions.length ? `<ol>${d.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>` : '<p class="ok">✓ Nothing needs your decision.</p>';

  // Page 2
  const max = Math.max(1, ...d.days.map((x) => Math.max(x.spend, x.revenue)));
  const days = d.days
    .map(
      (x) => `<div><div class="pair"><i class="sp" style="height:${((x.spend / max) * 100).toFixed(1)}%"></i><i class="rv" style="height:${((x.revenue / max) * 100).toFixed(1)}%"></i></div>
<div class="xl"><b>${new Date(`${x.date}T12:00:00+07:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Jakarta' })}</b><br>${x.spend ? k(x.spend) : '–'} · <span class="pos">${x.revenue ? k(x.revenue) : '–'}</span></div></div>`,
    )
    .join('');
  const itemName = (n: string) => esc(n.replace(/^Babi /, 'B. ').replace(/^Sapi /, 'S. ').replace(/ Gurih$/, ''));
  const ordersTable = !d.orders.length
    ? `<p class="empty">No paid website orders ${single ? 'on this day' : 'in this period'}.</p>`
    : `<table><thead><tr><th>Order</th><th class="l" style="width:36%">Items</th><th class="l">From</th><th class="l">City</th><th>Paid</th><th>Discount</th><th>HPP</th><th>Courier</th><th>Profit before ads</th></tr></thead><tbody>
${d.orders
  .map((o) => {
    const s = orderChannel(o);
    return `<tr><td>#${o.orderId}</td><td class="l">${o.items.map((i) => `${itemName(i.name)} ×${i.qty}`).join(', ')}</td><td class="l nw"><i class="dot" style="background:${s.color}"></i> ${esc(s.name)}</td><td class="l">${esc(isCourierCity(o.city) ? o.city : 'Jabodetabek')}</td><td>${rp(o.paid)}</td><td>${o.discount ? `${rp(o.discount)}${o.newCustomerDiscount ? ` <span class="tag">${(o.placedAt ?? o.paidAt ?? 0) < DISCOUNT_CHANGE.at ? DISCOUNT_CHANGE.before : DISCOUNT_CHANGE.after}%</span>` : ''}` : '–'}</td><td>${o.hppTotal === null ? '?' : rp(o.hppTotal)}</td><td>${o.courierFee === null ? (o.courierMissing ? '<span class="neg">not entered</span>' : '–') : rp(o.courierFee)}</td><td class="${o.profit !== null && o.profit < 0 ? 'neg' : 'pos'}"><b>${o.profit === null ? '?' : rp(o.profit)}</b></td></tr>`;
  })
  .join('\n')}</tbody></table>`;

  const adRow = (name: string, a: { spend: number; impressions: number; landingPageViews: number; addToCart: number; purchases: number }, cls = '') =>
    `<tr${cls ? ` class="${cls}"` : ''}><td class="l">${name}</td><td>${rp(a.spend)}</td><td>${num(a.impressions)}</td><td>${num(a.landingPageViews)}</td><td>${num(a.addToCart)}</td><td>${num(a.purchases)}</td></tr>`;
  const adsBody = d.channels
    .filter((c) => !c.channel.google)
    .map((c) => {
      const rows = d.ads.filter((a) => channelOfCampaign(a.campaignName) === c.channel);
      if (!rows.length) return '';
      const tot = { spend: sum(rows, 'spend'), impressions: sum(rows, 'impressions'), landingPageViews: sum(rows, 'landingPageViews'), addToCart: sum(rows, 'addToCart'), purchases: sum(rows, 'purchases') };
      return [adRow(`<i class="dot" style="background:${c.channel.color}"></i> <b>${esc(c.channel.name)}</b>`, tot, 'camp-row'), ...rows.map((a) => adRow(`&nbsp;&nbsp;&nbsp;${esc(a.adName)}`, a))].join('\n');
    })
    .join('\n');
  const adsTable = noData || (!d.ads.length
    ? `<p class="empty">No Meta ad delivery ${single ? 'on this day' : 'in this period'}.</p>`
    : `<table><thead><tr><th class="l">Campaign / ad</th><th>Spend</th><th>Seen</th><th>Visits</th><th>Add to cart</th><th>Purchases*</th></tr></thead><tbody>${adsBody}</tbody></table>`);
  const g = d.google;
  // The Google card already says when there is nothing; the table only when Google ran.
  const googleTable = !g.lastSync
    ? '<p class="empty">No Google data yet (the script in Google Ads has not sent anything).</p>'
    : !g.campaigns.length
      ? ''
      : `<table><thead><tr><th class="l">Campaign</th><th>Spend</th><th>Seen</th><th>Clicks</th><th>Cost per click</th><th>Conversions*</th></tr></thead><tbody>
${g.campaigns.map((r) => `<tr><td class="l">${esc(r.campaignName)}</td><td>${rp(r.spend)}</td><td>${num(r.impressions)}</td><td>${num(r.clicks)}</td><td>${r.clicks ? rp(r.spend / r.clicks) : '–'}</td><td>${r.conversions.toFixed(r.conversions % 1 ? 1 : 0)}</td></tr>`).join('\n')}</tbody></table>`;

  const j = d.journeys;
  const fmax = Math.max(1, j.funnel[0]?.sessions ?? 0);
  const funnel = !j.sessions
    ? `<p class="empty">No visits with journey tracking ${single ? 'on this day' : 'in this period'}.</p>`
    : `<table><thead><tr><th class="l">Step</th><th>Visits</th><th>Lost</th><th class="l"></th></tr></thead><tbody>
${j.funnel.map((f) => `<tr><td class="l">${esc(f.label)}</td><td>${num(f.sessions)}</td><td>${f.lostPct === null ? '' : `<span class="${f.lostPct >= 50 ? 'neg' : ''}">${f.lostPct > 0 ? '−' : ''}${f.lostPct}%</span>`}</td><td class="l barcell"><div class="bar"><i style="width:${((f.sessions / fmax) * 100).toFixed(1)}%"></i></div></td></tr>`).join('\n')}</tbody></table>
${j.read ? `<div class="read"><b>My read:</b> ${esc(j.read)}</div>` : ''}`;

  const p = d.pastCustomers;
  const pastLine = p && p.started
    ? `<p>Past customers project: <b>${num(p.completed)} of ${num(p.inArea)}</b> came back (${p.inArea ? ((p.completed / p.inArea) * 100).toFixed(1) : '0'}%, goal ${PAST_CUSTOMERS.goalPct}% by ${shortDay(PAST_CUSTOMERS.checkpoints[1].day)}) · ${rp(p.spend)} ads since ${shortDay(PAST_CUSTOMERS.start)}.</p>`
    : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} ${single ? d.day : `${d.from} to ${d.day}`}</title>
<style>
${DAILY_CSS}</style></head><body>
<header><div class="brand"><img src="${esc(logoUrl)}" alt=""><h1>${title}</h1></div>
<div class="date"><b>${when}</b>${d.live ? `<span class="live">LIVE</span> numbers still changing · ` : ''}Jentis Kitchen · ${esc(d.periodLabel)}</div></header>

<h2>The big picture</h2>
<div class="cards">
  ${card('Ad spend', rp(spend), planned === null ? `Meta ${rp(d.adTotals.spend)} · Google ${rp(g.spend)}` : `of ${rp(planned)} planned (${plannedPct.toFixed(0)}%)<div class="bar"><i style="width:${Math.min(100, plannedPct).toFixed(0)}%"></i></div>`)}
  ${card('Paid orders', num(d.orders.length), `${newCustomers.length} new customer${newCustomers.length === 1 ? '' : 's'}${d.orders.length ? ` · ${rp(spend / d.orders.length)} ads per order` : ''}${d.unpaid.length ? ` · ${d.unpaid.length} unpaid` : ''}`)}
  ${card('Revenue', rp(d.yesterday.revenue), spend ? `${(d.yesterday.revenue / spend).toFixed(1)}× the ad spend` : 'paid website orders')}
  ${after === null ? card('Profit after ads', '?', 'HPP missing') : card('Profit after ads', signed(after), `${rp(d.yesterday.profit ?? 0)} profit − ${rp(spend)} ads`, after >= 0 ? 'good' : 'bad')}
</div>

${discountSection(d)}
<h2>Budget per campaign</h2>
${noData}<div class="camps">${d.channels.map((c) => campaignCard(c, d.from)).join('\n')}</div>

<h2>Where the ad money went</h2>
<div class="split">${split}</div><div class="legend">${legend}</div>

<div class="two">
<div class="box"><h2>New customers</h2><div class="big">${newCustomers.length} <small>of ${d.orders.length} order${d.orders.length === 1 ? '' : 's'}</small></div>
<div class="hint">first orders with the welcome discount (${rp(newCustomers.reduce((s, o) => s + o.discount, 0))} given)${newCustomers.length ? ` · ${rp(spend / newCustomers.length)} ads per new customer` : ''}</div>
<div class="rows">${sourceRows || '<div><span>No new customers</span><b>–</b></div>'}</div></div>
<div class="box"><h2>Outside city</h2><div class="big">${cityOrders.length} <small>order${cityOrders.length === 1 ? '' : 's'} · ${rp(cityOrders.reduce((s, o) => s + o.paid, 0))}</small></div>
<div class="hint">orders sent by courier to the new cities, from any source</div>
<div class="rows">${cityRows}</div></div>
</div>

<h2>Questions for you</h2>
<div class="ask">${questions}</div>

<div class="p2">
<h2>Last 7 days — ad spend vs revenue</h2>
<div class="chart"><div class="legend" style="margin:0 0 6px"><span><i style="background:#a8a29e"></i>Ad spend (Meta + Google)</span><span><i style="background:#15803d"></i>Revenue (paid orders)</span></div>
<div class="days">${days}</div></div>

<h2>Every paid order — ${esc(period)}</h2>
${ordersTable}
${d.unpaid.length ? `<p class="empty">Placed but not paid: ${d.unpaid.map((u) => `#${u.orderId} (${esc(u.label)})`).join(', ')}</p>` : ''}

<h2>Meta ads, ad by ad — ${esc(period)}</h2>
${adsTable}

${googleTable ? `<h2>Google ads — ${esc(period)}</h2>\n${googleTable}` : ''}

<h2>Where people stopped — ${esc(period)}</h2>
${funnel}

<div class="foot">
${pastLine}
<p>* Purchases as Meta counts them (it also counts people who saw an ad and bought later), conversions as Google counts them. Orders, revenue and profit come from the website.</p>
<p>Profit before ads = paid − HPP − courier fee − payment fee. "Planned" = today's daily budget × days the campaign ran in this period.</p>
${d.notes.map((n) => `<p>${esc(n)}</p>`).join('\n')}
</div>
</div>
</body></html>`;
}
