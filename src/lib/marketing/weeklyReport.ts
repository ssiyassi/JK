// Weekly marketing recap (Monday–Sunday, WIB), sent every Monday with the daily report. Numbers come from the same
// sources as the daily report; the "Review" part (what worked, what to improve, experiments to propose, decisions) is
// written by the marketing assistant each week and passed in as `review` — experiments and promotions are only
// proposals until the owner approves them.
import type { D1Database } from '../core/d1.ts';
import { loadCostSettings, monthKeyOf } from '../core/costs.ts';
import { addDaysToKey } from '../core/time.ts';
import { sourcesForRange, type SourceRow } from '../shop/visits.ts';
import { adRows, dayStart, hppLookup, paidOrders, sum, type AdRow, type OrderProfit } from './adsReport.ts';
import { REPORT_CSS, card, dayLabel, esc, num, rp, signed } from './reportPdf.ts';

export interface WeekDay {
  day: string;
  spend: number;
  clicks: number;
  visits: number;
  addToCart: number;
  checkout: number;
  orders: number;
  revenue: number;
  profit: number | null;
}

export interface WeeklyReportData {
  from: string; // Monday
  to: string; // Sunday
  days: WeekDay[];
  ads: AdRow[];
  orders: OrderProfit[];
  sources: SourceRow[];
  week: { spend: number; orders: number; revenue: number; profit: number | null };
  prevWeek: { spend: number; orders: number; revenue: number; profit: number | null } | null;
  sinceStart: { since: string | null; spend: number; orders: number; revenue: number; profit: number | null };
}

export interface WeeklyReview {
  summary: string;
  worked: string[];
  improve: string[];
  experiments: { title: string; why: string; how: string; cost: string; measure: string }[];
  decisions: string[];
}

const profitOf = (list: OrderProfit[]) => (list.some((o) => o.profit === null) ? null : list.reduce((s, o) => s + (o.profit ?? 0), 0));

/** Data for the week starting on `monday` (YYYY-MM-DD). */
export async function collectWeeklyReport(db: D1Database, monday: string): Promise<WeeklyReportData> {
  const sunday = addDaysToKey(monday, 6);
  const settings = await loadCostSettings(db);
  const hpp = await hppLookup(db, monthKeyOf(dayStart(monday)));
  const fee = settings.paymentFeePercent;
  const ordersBetween = (from: string, toIncl: string) => paidOrders(db, dayStart(from), dayStart(addDaysToKey(toIncl, 1)), hpp.cost, fee, hpp.complete);

  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDaysToKey(monday, i);
    const [ads, orders] = await Promise.all([adRows(db, day, day), ordersBetween(day, day)]);
    days.push({
      day,
      spend: sum(ads, 'spend'),
      clicks: sum(ads, 'linkClicks'),
      visits: sum(ads, 'landingPageViews'),
      addToCart: sum(ads, 'addToCart'),
      checkout: sum(ads, 'initiateCheckout'),
      orders: orders.length,
      revenue: orders.reduce((s, o) => s + o.paid, 0),
      profit: profitOf(orders),
    });
  }
  const [ads, orders, sources] = await Promise.all([adRows(db, monday, sunday), ordersBetween(monday, sunday), sourcesForRange(db, monday, sunday)]);
  const prevMonday = addDaysToKey(monday, -7);
  const [prevAds, prevOrders] = await Promise.all([adRows(db, prevMonday, addDaysToKey(monday, -1)), ordersBetween(prevMonday, addDaysToKey(monday, -1))]);
  const since = (await db.prepare('SELECT MIN(date) AS d FROM meta_ad_insights WHERE spend > 0').first<{ d: string | null }>())?.d ?? null;
  const [allAds, allOrders] = since ? await Promise.all([adRows(db, since, sunday), ordersBetween(since, sunday)]) : [[], []];

  return {
    from: monday,
    to: sunday,
    days,
    ads,
    orders,
    sources,
    week: { spend: sum(ads, 'spend'), orders: orders.length, revenue: orders.reduce((s, o) => s + o.paid, 0), profit: profitOf(orders) },
    prevWeek: prevAds.length || prevOrders.length
      ? { spend: sum(prevAds, 'spend'), orders: prevOrders.length, revenue: prevOrders.reduce((s, o) => s + o.paid, 0), profit: profitOf(prevOrders) }
      : null,
    sinceStart: { since, spend: sum(allAds, 'spend'), orders: allOrders.length, revenue: allOrders.reduce((s, o) => s + o.paid, 0), profit: profitOf(allOrders) },
  };
}

const short = (key: string) => new Date(`${key}T12:00:00+07:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
const change = (now: number, before: number | undefined) =>
  before === undefined ? '' : before === 0 ? (now ? 'new' : '') : `${now >= before ? '▲' : '▼'} ${Math.abs(((now - before) / before) * 100).toFixed(0)}% vs last week`;

export function weeklyHtml(d: WeeklyReportData, review: WeeklyReview, logoUrl: string): string {
  const w = d.week;
  const after = w.profit === null ? null : w.profit - w.spend;
  const s = d.sinceStart;
  const sAfter = s.profit === null ? null : s.profit - s.spend;
  const p = d.prevWeek;

  const dayRows = d.days
    .map((x) => {
      const pa = x.profit === null ? null : x.profit - x.spend;
      return `<tr><td>${short(x.day)}</td><td>${rp(x.spend)}</td><td>${num(x.clicks)}</td><td>${num(x.visits)}</td><td>${num(x.addToCart)}</td><td>${num(x.checkout)}</td><td>${num(x.orders)}</td><td>${rp(x.revenue)}</td><td class="${pa !== null && pa < 0 ? 'neg' : 'pos'}"><b>${pa === null ? '?' : signed(pa)}</b></td></tr>`;
    })
    .join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Weekly Marketing Recap ${d.from}</title>
<style>${REPORT_CSS}
.review h3 { font-size: 10.5pt; margin: 10px 0 4px; }
.review ul { margin: 2px 0 0 18px; padding: 0; } .review li { margin: 3px 0; }
.summary { font-size: 11pt; line-height: 1.5; background: var(--brand-soft); border-radius: 10px; padding: 10px 12px; }
.exp { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin: 6px 0; break-inside: avoid; }
.exp b.t { color: var(--brand); }
.exp dl { display: grid; grid-template-columns: 90px 1fr; gap: 2px 8px; margin: 4px 0 0; font-size: 9.5pt; }
.exp dt { color: var(--muted); } .exp dd { margin: 0; }
.pagebreak { break-before: page; }
</style></head><body>
<header>
  <div class="brand"><img src="${esc(logoUrl)}" alt=""><h1>Weekly Marketing Recap</h1></div>
  <div class="date"><b>${short(d.from)} – ${short(d.to)} 2026</b>Jentis Kitchen · jentiskitchen.id</div>
</header>

<div class="summary">${esc(review.summary)}</div>

<h2>This week</h2>
<div class="cards">
  ${card('Ad spend', rp(w.spend), change(w.spend, p?.spend))}
  ${card('Paid orders', num(w.orders), change(w.orders, p?.orders))}
  ${card('Revenue', rp(w.revenue), change(w.revenue, p?.revenue))}
  ${after === null ? card('Profit after ads', '?', 'HPP missing') : card('Profit after ads', signed(after), `ROAS ${w.spend ? (w.revenue / w.spend).toFixed(2) : '–'}× · ${w.orders ? rp(w.spend / w.orders) : '–'} per order`, after >= 0 ? 'good' : 'bad')}
</div>
<p class="period">Since the ads started (${s.since ? dayLabel(s.since) : '–'}): ${num(s.orders)} orders · ${rp(s.revenue)} revenue · profit after ads <b class="${sAfter !== null && sAfter < 0 ? 'neg' : 'pos'}">${sAfter === null ? '?' : signed(sAfter)}</b> · ad spend ${rp(s.spend)}</p>

<h2>Day by day</h2>
<table><thead><tr><th>Day</th><th>Ad spend</th><th>Clicks</th><th>Visits</th><th>Add to cart</th><th>Checkout</th><th>Orders</th><th>Revenue</th><th>Profit after ads</th></tr></thead><tbody>
${dayRows}
<tr class="tot"><td>Week</td><td>${rp(w.spend)}</td><td>${num(d.days.reduce((a, x) => a + x.clicks, 0))}</td><td>${num(d.days.reduce((a, x) => a + x.visits, 0))}</td><td>${num(d.days.reduce((a, x) => a + x.addToCart, 0))}</td><td>${num(d.days.reduce((a, x) => a + x.checkout, 0))}</td><td>${num(w.orders)}</td><td>${rp(w.revenue)}</td><td><b>${after === null ? '?' : signed(after)}</b></td></tr>
</tbody></table>

<h2>Ads this week</h2>
<table><thead><tr><th>Ad</th><th>Spend</th><th>Seen</th><th>Clicks</th><th>Visits</th><th>Add to cart</th><th>Purchases*</th></tr></thead><tbody>
${d.ads.map((a) => `<tr><td>${esc(a.adName)}</td><td>${rp(a.spend)}</td><td>${num(a.impressions)}</td><td>${num(a.linkClicks)}</td><td>${num(a.landingPageViews)}</td><td>${num(a.addToCart)}</td><td>${num(a.purchases)}</td></tr>`).join('\n')}
</tbody></table>

<h2>Paid orders this week</h2>
<table><thead><tr><th>Order</th><th class="l">Items</th><th>Paid</th><th>Discount</th><th>HPP</th><th>Courier</th><th>Profit before ads</th></tr></thead><tbody>
${d.orders.map((o) => `<tr><td>#${o.orderId}</td><td class="l">${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(', ')}</td><td>${rp(o.paid)}</td><td>${o.discount ? rp(o.discount) : '–'}</td><td>${o.hppTotal === null ? '?' : rp(o.hppTotal)}</td><td>${o.courierFee === null ? '–' : rp(o.courierFee)}</td><td class="${o.profit !== null && o.profit < 0 ? 'neg' : 'pos'}"><b>${o.profit === null ? '?' : rp(o.profit)}</b></td></tr>`).join('\n') || '<tr><td colspan="7">No paid orders.</td></tr>'}
</tbody></table>

${d.sources.length ? `<h2>Where visitors came from</h2>
<table><thead><tr><th>Source</th><th>Visits</th><th>Add to cart</th><th>Opened checkout</th></tr></thead><tbody>
${d.sources.map((r) => `<tr><td>${esc(r.label)}</td><td>${num(r.visits)}</td><td>${num(r.addToCart)}</td><td>${num(r.checkout)}</td></tr>`).join('\n')}
</tbody></table>` : ''}

<div class="review">
<h2>Review</h2>
<h3>✅ What worked</h3><ul>${review.worked.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<h3>🔧 What to improve</h3><ul>${review.improve.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<h2>Experiments I propose (need your OK)</h2>
${review.experiments
  .map(
    (e, i) => `<div class="exp"><b class="t">${i + 1}. ${esc(e.title)}</b><dl><dt>Why</dt><dd>${esc(e.why)}</dd><dt>How</dt><dd>${esc(e.how)}</dd><dt>Cost</dt><dd>${esc(e.cost)}</dd><dt>We measure</dt><dd>${esc(e.measure)}</dd></dl></div>`,
  )
  .join('')}
<h2>Questions for you</h2>
<div class="ask"><ol>${review.decisions.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
</div>

<div class="notes">
  <p>* Purchases as counted by Meta (own attribution, lags 1–3 days). Orders, revenue and profit come from the website database. Visits per source are tracked since 24 Oct.</p>
  <p>Profit before ads = paid − HPP (admin) − courier fee − 0.7% payment fee. Profit after ads = profit before ads − ad spend.</p>
</div>
</body></html>`;
}
