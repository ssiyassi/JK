// Website visits and shopping steps per traffic source (migration 0031). The browser sends one "visit" per tab session
// plus "add_to_cart" / "checkout" steps, and since migration 0036 every page view, scroll depth and checkout step with
// its page path (visitor journeys, src/lib/marketing/journeys.ts) (src/app/shop/_components/MetaPixel.tsx, src/lib/client/metaPixel.ts); the
// daily CMO report groups them by source. No personal data: only a random session id and the source tags.
import type { D1Database } from '../core/d1.ts';
import { AppError } from '../core/d1.ts';
import { jakartaDateKey } from '../core/time.ts';

export const VISIT_EVENTS = ['visit', 'add_to_cart', 'checkout', 'page', 'scroll', 'address', 'pay_click', 'order_placed', 'paid', 'wa_help', 'reseller_wa', 'wa_cart', 'wa_chat'] as const;
export type VisitEvent = (typeof VISIT_EVENTS)[number];
export const KEEP_DAYS = 180;

const tag = (v: unknown, max = 100): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/[^a-z0-9._\-/ ]/g, '').slice(0, max);
  return s || null;
};

/** Where a visit came from, for visits without utm tags: from the referrer's host name. */
export function sourceFromReferrer(refHost: string | null, ownHost: string): { source: string; medium: string } {
  const h = (refHost ?? '').toLowerCase();
  if (!h) return { source: 'direct', medium: 'none' };
  if (h === ownHost || h.endsWith(`.${ownHost}`)) return { source: 'internal', medium: 'none' };
  // Coming back from the payment page is the same visit, not a new source.
  if (/(^|\.)(doku|duitku)\.com$/.test(h)) return { source: 'internal', medium: 'none' };
  if (/(^|\.)google\./.test(h)) return { source: 'google', medium: 'organic' };
  if (/(^|\.)bing\.com$|duckduckgo|yahoo\./.test(h)) return { source: h.split('.').slice(-2)[0], medium: 'organic' };
  if (/instagram\.com$/.test(h)) return { source: 'instagram', medium: 'referral' };
  if (/threads\.(net|com)$/.test(h)) return { source: 'threads', medium: 'referral' };
  if (/facebook\.com$|fb\.com$|fb\.me$/.test(h)) return { source: 'facebook', medium: 'referral' };
  if (/whatsapp|wa\.me$/.test(h)) return { source: 'whatsapp', medium: 'referral' };
  if (/tiktok\.com$/.test(h)) return { source: 'tiktok', medium: 'referral' };
  return { source: h.replace(/^www\./, '').slice(0, 60), medium: 'referral' };
}

export interface VisitInput {
  event: VisitEvent;
  sid: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  landing: string | null;
  refHost: string | null;
  page?: string | null;
  detail?: string | null;
}

/** Validates what the browser sent (throws 400 on anything malformed); no utm tags → source from the referrer. */
export function parseVisit(body: Record<string, unknown>, ownHost: string): VisitInput {
  const event = body.event as VisitEvent;
  if (!VISIT_EVENTS.includes(event)) throw new AppError(400, 'bad event');
  const sid = typeof body.sid === 'string' && /^[a-z0-9]{12,40}$/.test(body.sid) ? body.sid : null;
  if (!sid) throw new AppError(400, 'bad sid');
  const landing = typeof body.landing === 'string' && body.landing.startsWith('/') ? body.landing.slice(0, 120) : null;
  const page = typeof body.page === 'string' && body.page.startsWith('/') ? body.page.slice(0, 120) : null;
  const refHost = tag(body.refHost, 100);
  const tagged = tag(body.source, 60);
  const derived = tagged ? null : sourceFromReferrer(refHost, ownHost);
  return {
    event,
    sid,
    source: tagged ?? derived!.source,
    medium: tagged ? tag(body.medium, 60) : derived!.medium,
    campaign: tag(body.campaign),
    content: tag(body.content),
    landing,
    refHost,
    page,
    detail: tag(body.detail, 40),
  };
}

export async function recordVisit(db: D1Database, v: VisitInput, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO visit_events (at, day, sid, event, source, medium, campaign, content, landing, refHost, page, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(now, jakartaDateKey(now), v.sid, v.event, v.source, v.medium, v.campaign, v.content, v.landing, v.refHost, v.page ?? null, v.detail ?? null)
    .run();
}

export async function pruneVisits(db: D1Database, now: number): Promise<void> {
  await db.prepare('DELETE FROM visit_events WHERE at < ?').bind(now - KEEP_DAYS * 86400 * 1000).run();
}

/** Human label for a source line in reports. */
export function sourceLabel(source: string, medium: string | null, content: string | null): string {
  const m = medium ?? '';
  if (source === 'meta' || m === 'paid_social') return `Meta ads${content ? ` (${content})` : ''}`;
  if (source === 'instagram' && m === 'bio') return 'Instagram bio (brand)';
  if (source === 'instagram' && m === 'story') return `Instagram story (brand)${content ? ` (${content})` : ''}`;
  if (source === 'instagram' && m === 'personal') return 'Your personal Instagram story';
  if (source === 'threads' && m === 'personal') return 'Your personal Threads';
  if (source === 'instagram') return 'Instagram (other)';
  if (source === 'threads') return 'Threads (other)';
  if (source === 'google') return m === 'organic' ? 'Google search' : m === 'cpc' ? `Google ads${content ? ` (${content})` : ''}` : `Google (${m})`;
  if (source === 'facebook') return 'Facebook (organic)';
  if (source === 'whatsapp') return 'WhatsApp';
  if (source === 'direct') return 'Direct / unknown';
  return `${source}${m && m !== 'referral' ? `/${m}` : ''}${content ? ` (${content})` : ''}`;
}

export interface SourceRow {
  label: string;
  visits: number;
  addToCart: number;
  checkout: number;
}

/** Sessions per source for one day: visits, sessions that added to cart, sessions that opened checkout. */
export async function sourcesForDay(db: D1Database, day: string): Promise<SourceRow[]> {
  return sourcesForRange(db, day, day);
}

/** Same as sourcesForDay, for the days from `from` to `to` (YYYY-MM-DD, inclusive). */
export async function sourcesForRange(db: D1Database, from: string, to: string): Promise<SourceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT v.source, v.medium, v.content,
              COUNT(DISTINCT v.sid) AS visits,
              COUNT(DISTINCT CASE WHEN e.event = 'add_to_cart' THEN e.sid END) AS atc,
              COUNT(DISTINCT CASE WHEN e.event = 'checkout' THEN e.sid END) AS co
       FROM visit_events v LEFT JOIN visit_events e ON e.sid = v.sid AND e.event IN ('add_to_cart', 'checkout')
       WHERE v.event = 'visit' AND v.day >= ? AND v.day <= ? AND v.source != 'internal'
         AND v.source NOT LIKE '%doku.com' AND v.source NOT LIKE '%duitku.com' -- returns from the payment page (rows before 26 Oct)
       GROUP BY v.source, v.medium, v.content ORDER BY visits DESC`,
    )
    .bind(from, to)
    .all<{ source: string; medium: string | null; content: string | null; visits: number; atc: number; co: number }>();
  const merged = new Map<string, SourceRow>();
  for (const r of results) {
    const label = sourceLabel(r.source, r.medium, r.content);
    const row = merged.get(label) ?? { label, visits: 0, addToCart: 0, checkout: 0 };
    row.visits += Number(r.visits);
    row.addToCart += Number(r.atc);
    row.checkout += Number(r.co);
    merged.set(label, row);
  }
  return [...merged.values()].sort((a, b) => b.visits - a.visits);
}
