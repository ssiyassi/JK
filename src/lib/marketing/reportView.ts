// The admin Reports page (redesign, 13 Nov 2026): the numbers of collectReport() (the same as the morning PDF) turned
// into plain values for the page's tabs: Sales, Ads, Profit, Affiliates & collabs, Customers. Nothing new is counted
// here except the affiliate / collab orders of the chosen days.
import { orderChannel } from './channels.ts';
import { dayStart } from './adsReport.ts';
import { addDaysToKey } from '../core/time.ts';
import { PAST_CUSTOMERS } from './pastCustomers.ts';
import type { DailyReportData } from './reportPdf.ts';

export interface ReportCampaign {
  id: string;
  name: string;
  platform: 'Meta' | 'Google';
  what: string;
  color: string;
  running: boolean;
  spend: number;
  budget: number | null; // per day
  visits: number; // Meta landing page views / Google clicks
  orders: number;
  revenue: number;
  profit: number | null; // before ads
}

export interface ReportOrder {
  orderId: string;
  items: string;
  boxes: number;
  city: string;
  source: string;
  color: string;
  fromAd: boolean;
  paid: number;
  discount: number;
  deliveryFee: number;
  hpp: number | null;
  courierFee: number | null;
  paymentFee: number;
  profit: number | null;
  courierMissing: boolean;
  paidAt: number | null;
}

export interface PartnerRow {
  kind: 'Affiliate' | 'Collab';
  name: string;
  orders: number;
  boxes: number;
  sales: number;
  commission: number;
}

export interface ReportView {
  from: string;
  to: string;
  periodLabel: string;
  live: boolean;
  questions: string[];
  notes: string[];
  ads: { spend: number; metaSpend: number; googleSpend: number; visitors: number; orders: number; revenue: number; profit: number | null };
  days: { date: string; spend: number; revenue: number; adRevenue: number; adProfit: number | null }[];
  funnel: { label: string; n: number }[];
  campaigns: ReportCampaign[];
  sales: { orders: number; revenue: number; boxes: number; discount: number; newAccounts: number; unpaid: number };
  orders: ReportOrder[];
  sources: { label: string; visits: number; addToCart: number; checkout: number; orders: number; paid: number }[];
  journey: { label: string; sessions: number; lostPct: number | null }[];
  journeyRead: string | null;
  exits: { page: string; sessions: number; pct: number }[];
  week: { from: string; to: string; spend: number; revenue: number; profit: number | null; orders: number; budget: number | null };
  total: { since: string | null; spend: number; orders: number; revenue: number; profit: number | null };
  partners: PartnerRow[];
  past: { inArea: number; completed: number; pct: number; goalPct: number; goalDay: string; spend: number; period: { orderId: string; name: string; day: string; packs: number; paid: number | null }[] } | null;
}

interface PartnerOrders {
  kind: PartnerRow['kind'];
  name: string;
  orders: { paidAt: number; boxes: number; commission: number; total: number }[];
}

const profitOf = (list: { profit: number | null }[]) => (list.some((o) => o.profit === null) ? null : list.reduce((s, o) => s + (o.profit ?? 0), 0));

export function reportView(d: DailyReportData, partners: PartnerOrders[]): ReportView {
  const adOrders = d.orders.filter((o) => o.fromMeta || o.fromGoogle);
  const metaSpend = d.adTotals.spend;
  const googleSpend = d.google.spend;
  // Real website sessions that came from an ad link (visit tracking), as the ad funnel.
  const adSources = d.sources.filter((s) => s.label.startsWith('Meta ads') || s.label.startsWith('Google ads'));
  const visitors = adSources.reduce((n, s) => n + s.visits, 0);
  const start = dayStart(d.from);
  const end = dayStart(addDaysToKey(d.day, 1));
  const p = d.pastCustomers;

  return {
    from: d.from,
    to: d.day,
    periodLabel: d.periodLabel,
    live: d.live,
    questions: d.questions,
    notes: d.notes,
    ads: { spend: metaSpend + googleSpend, metaSpend, googleSpend, visitors, orders: adOrders.length, revenue: adOrders.reduce((s, o) => s + o.paid, 0), profit: profitOf(adOrders) },
    days: d.days,
    funnel: [
      { label: 'Visited the shop', n: visitors },
      { label: 'Added to cart', n: adSources.reduce((n, s) => n + s.addToCart, 0) },
      { label: 'Opened checkout', n: adSources.reduce((n, s) => n + s.checkout, 0) },
      { label: 'Paid', n: adOrders.length },
    ],
    campaigns: d.channels.map((c): ReportCampaign => ({
      id: c.channel.id,
      name: c.channel.name.replace(/^(Meta|Google) · /, ''),
      platform: c.channel.google ? 'Google' : 'Meta',
      what: c.channel.what,
      color: c.channel.color,
      running: c.running,
      spend: c.spend,
      budget: c.budget,
      visits: c.visits,
      orders: c.orders.length,
      revenue: c.revenue,
      profit: c.profit,
    }))
      // Running campaigns first, the ones that are off at the bottom (owner 14 Nov); otherwise the usual order.
      .sort((a, b) => Number(b.running) - Number(a.running)),
    sales: {
      orders: d.orders.length,
      revenue: d.orders.reduce((s, o) => s + o.paid, 0),
      boxes: d.orders.reduce((s, o) => s + o.items.reduce((n, i) => n + i.qty, 0), 0),
      discount: d.orders.reduce((s, o) => s + o.discount, 0),
      newAccounts: d.newAccounts,
      unpaid: d.unpaid.length,
    },
    orders: d.orders
      .map((o) => {
        const ch = orderChannel(o);
        return {
          orderId: o.orderId,
          items: o.items.map((i) => `${i.qty}× ${i.name}`).join(', '),
          boxes: o.items.reduce((n, i) => n + i.qty, 0),
          city: o.city,
          source: ch.name,
          color: ch.color,
          fromAd: o.fromMeta || o.fromGoogle,
          paid: o.paid,
          discount: o.discount,
          deliveryFee: o.deliveryFee,
          hpp: o.hppTotal,
          courierFee: o.courierFee,
          paymentFee: o.paymentFee,
          profit: o.profit,
          courierMissing: o.courierMissing,
          paidAt: o.paidAt,
        };
      })
      .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0)),
    sources: [...d.sources].sort((a, b) => b.visits - a.visits),
    journey: d.journeys.funnel,
    journeyRead: d.journeys.read,
    exits: d.journeys.exits.slice(0, 6).map((e) => ({ page: e.page, sessions: e.sessions, pct: e.pct })),
    week: {
      from: d.week.from,
      to: d.week.to,
      spend: d.week.spend + d.week.googleSpend,
      revenue: d.week.revenue,
      profit: d.week.profit,
      orders: d.week.orders,
      budget: d.week.dailyBudget,
    },
    total: { since: d.since, spend: d.total.spend + d.google.totalSpend, orders: d.total.orders, revenue: d.total.revenue, profit: d.total.profit },
    partners: partners
      .map((x) => {
        const list = x.orders.filter((o) => o.paidAt >= start && o.paidAt < end);
        return {
          kind: x.kind,
          name: x.name,
          orders: list.length,
          boxes: Math.round(list.reduce((s, o) => s + o.boxes, 0) * 100) / 100,
          sales: list.reduce((s, o) => s + o.total, 0),
          commission: list.reduce((s, o) => s + o.commission, 0),
        };
      })
      .filter((x) => x.orders > 0)
      .sort((a, b) => b.sales - a.sales),
    past: p
      ? {
          inArea: p.inArea,
          completed: p.completed,
          pct: p.inArea ? (p.completed / p.inArea) * 100 : 0,
          goalPct: PAST_CUSTOMERS.goalPct,
          goalDay: PAST_CUSTOMERS.checkpoints[1].day,
          spend: p.spend,
          period: p.period.map((c) => ({ orderId: c.orderId, name: c.name, day: c.day, packs: c.packs, paid: c.paid })),
        }
      : null,
  };
}
