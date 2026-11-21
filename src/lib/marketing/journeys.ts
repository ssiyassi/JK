// Visitor journeys for the daily report ("where people stopped", owner asked 2026-10-29): how far each visit got in the
// shop (funnel), the page people were on when they left, and the most common paths of visits that did not buy. Built
// from visit_events (migration 0036: page views, scroll depth, checkout steps). Only visits with page steps count, so
// visits from before the tracking started don't distort the numbers.
import type { D1Database } from '../core/d1.ts';

export const FUNNEL = [
  { key: 'visit', label: 'Visited the website' },
  { key: 'browse', label: 'Looked around (scrolled half a page or opened 2+ pages)' },
  { key: 'add_to_cart', label: 'Added to cart' },
  { key: 'checkout', label: 'Opened checkout' },
  { key: 'address', label: 'Filled in the address' },
  { key: 'pay_click', label: 'Tapped "Bayar"' },
  { key: 'order_placed', label: 'Placed the order' },
  { key: 'paid', label: 'Paid' },
] as const;

export interface FunnelStep {
  label: string;
  sessions: number;
  lostPct: number | null; // share of the previous step that did not reach this one
}

export interface Journeys {
  sessions: number;
  funnel: FunnelStep[];
  exits: { page: string; sessions: number; pct: number; hadCart: number }[]; // visits that did not pay
  paths: { path: string; sessions: number }[]; // most common journeys of visits that did not pay
  read: string | null; // one-line reading of the biggest drop
}

/** Readable name of a shop path (also on hosts where the shop lives under /shop). */
export function pageLabel(path: string | null): string {
  if (!path) return '?';
  const p = path.replace(/^\/shop(?=\/|$)/, '') || '/';
  const title = (slug: string) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (p === '/') return 'Home';
  if (p === '/checkout') return 'Checkout';
  if (p.startsWith('/orders/')) return 'Order page';
  if (p === '/resep-tips') return 'Recipes';
  let m = p.match(/^\/resep-tips\/([^/]+)/);
  if (m) return `Recipe: ${title(m[1])}`;
  m = p.match(/^\/produk\/([^/]+)/);
  if (m) return `Product: ${title(m[1])}`;
  m = p.match(/^\/collab\/([^/]+)/);
  if (m) return `Collab: ${title(m[1])}`;
  return title(p.slice(1).split('/')[0]);
}

const READS: Record<string, string> = {
  browse: 'Most visitors leave from the first screen without scrolling: the top of {page} needs a stronger first impression (photo, headline, offer).',
  add_to_cart: 'Visitors look around but do not add to cart: check how clear the products, photos and "Tambah" buttons are on {page}.',
  checkout: 'Visitors add to cart but do not open checkout: the cart bar may be easy to miss.',
  address: 'Visitors open checkout but do not fill in the address: the form may feel long or they hesitate at this step.',
  pay_click: 'Address filled but "Bayar" not tapped: something on the checkout page (total, delivery day, voucher) may hold them back.',
  order_placed: 'Visitors tap "Bayar" but do not place the order: the payment choice pop-up may be confusing.',
  paid: 'Orders are placed but not paid: something on the payment page; the 15-minute unpaid alert lets you follow up on WhatsApp.',
};

/** Journeys of the visits that started from `from` to `to` (YYYY-MM-DD, inclusive), excluding returns from payment. */
export async function journeysForRange(db: D1Database, from: string, to: string): Promise<Journeys> {
  const { results } = await db
    .prepare(
      `SELECT e.sid, e.event, e.page, e.detail
       FROM visit_events v JOIN visit_events e ON e.sid = v.sid
       WHERE v.event = 'visit' AND v.day >= ? AND v.day <= ? AND v.source != 'internal'
         AND v.source NOT LIKE '%doku.com' AND v.source NOT LIKE '%duitku.com'
       ORDER BY e.sid, e.at, e.id`,
    )
    .bind(from, to)
    .all<{ sid: string; event: string; page: string | null; detail: string | null }>();

  const bySid = new Map<string, { event: string; page: string | null; detail: string | null }[]>();
  for (const r of results) {
    const list = bySid.get(r.sid) ?? [];
    list.push(r);
    bySid.set(r.sid, list);
  }

  const reached = FUNNEL.map(() => 0);
  const exits = new Map<string, { sessions: number; hadCart: number }>();
  const paths = new Map<string, number>();
  let sessions = 0;
  for (const steps of bySid.values()) {
    const pages = steps.filter((s) => s.event === 'page');
    if (!pages.length) continue; // visit from before the journey tracking
    sessions++;
    const has = (e: string) => steps.some((s) => s.event === e);
    const done: Record<string, boolean> = {
      visit: true,
      browse: new Set(pages.map((p) => p.page)).size >= 2 || steps.some((s) => s.event === 'scroll'),
      add_to_cart: has('add_to_cart'),
      checkout: has('checkout') || pages.some((p) => pageLabel(p.page) === 'Checkout'),
      address: has('address'),
      pay_click: has('pay_click'),
      order_placed: has('order_placed'),
      paid: has('paid'),
    };
    // A later step counts for every earlier one (e.g. a buy button straight to checkout also "added to cart").
    let deepest = 0;
    FUNNEL.forEach((f, i) => {
      if (done[f.key]) deepest = i;
    });
    for (let i = 0; i <= deepest; i++) reached[i]++;
    if (done.paid) continue;

    const lastPage = pageLabel(pages[pages.length - 1].page);
    const exit = exits.get(lastPage) ?? { sessions: 0, hadCart: 0 };
    exit.sessions++;
    if (done.add_to_cart) exit.hadCart++;
    exits.set(lastPage, exit);

    const trail: string[] = [];
    for (const s of steps) {
      const label = s.event === 'page' ? pageLabel(s.page) : s.event === 'add_to_cart' ? 'Add to cart' : s.event === 'order_placed' ? 'Order placed' : s.event === 'wa_chat' ? 'WhatsApp chat' : null;
      if (label && trail[trail.length - 1] !== label) trail.push(label);
    }
    const shown = trail.length > 5 ? [...trail.slice(0, 2), '…', ...trail.slice(-2)] : trail;
    const path = `${shown.join(' → ')} → left`;
    paths.set(path, (paths.get(path) ?? 0) + 1);
  }

  const funnel = FUNNEL.map((f, i) => ({
    label: f.label,
    sessions: reached[i],
    lostPct: i === 0 || !reached[i - 1] ? null : Math.round((1 - reached[i] / reached[i - 1]) * 100),
  }));
  const notPaid = sessions - reached[FUNNEL.length - 1];
  const exitRows = [...exits.entries()]
    .map(([page, e]) => ({ page, sessions: e.sessions, pct: notPaid ? Math.round((e.sessions / notPaid) * 100) : 0, hadCart: e.hadCart }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);
  const pathRows = [...paths.entries()].map(([path, n]) => ({ path, sessions: n })).sort((a, b) => b.sessions - a.sessions).slice(0, 5);

  // The step that loses the most people (only where at least 5 visits arrived, so one visitor doesn't decide it).
  let worst: number | null = null;
  funnel.forEach((f, i) => {
    if (i > 0 && f.lostPct !== null && reached[i - 1] >= 5 && (worst === null || f.lostPct > (funnel[worst].lostPct ?? 0))) worst = i;
  });
  let read: string | null = null;
  if (sessions < 10) read = sessions ? 'Too few tracked visits yet for a firm conclusion — read this as an early signal only.' : null;
  else if (worst !== null) {
    const w = worst as number;
    read = `Biggest drop: ${funnel[w - 1].label.toLowerCase().replace(/ \(.*\)/, '')} → ${funnel[w].label.toLowerCase()} (${funnel[w].lostPct}% lost). ${READS[FUNNEL[w].key].replace('{page}', exitRows[0]?.page ?? 'the landing page')}`;
  }
  return { sessions, funnel, exits: exitRows, paths: pathRows, read };
}
