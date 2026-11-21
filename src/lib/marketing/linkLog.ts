// Reports → Links (owner 15 Nov 2026: "add the UTM links to the dashboard so I don't have to keep asking"): every
// WhatsApp tap on the website with the ad / link the person came from (find a chat by its time), and every tagged
// link people used lately, ready to copy. Only visit tags — no names or phone numbers are kept or shown.
import type { D1Database } from '../core/d1.ts';
import { WA_CODE_LEGEND, waCode } from '../shop/waCode.ts';

export type LinkTags = { source: string | null; medium: string | null; campaign: string | null; content: string | null };
export interface WhatsAppTap extends LinkTags { at: number; page: string | null; button: string | null; code: string; where: string; link: string | null }
export interface TrackedLink extends LinkTags { people: number; lastAt: number; code: string; where: string; link: string }
export interface LinkLog { taps: WhatsAppTap[]; links: TrackedLink[]; legend: [string, string][] }

const SHOP = 'https://jentiskitchen.id/';

/** The link with its tags (null when the visit had none). */
export function utmLink(t: LinkTags): string | null {
  const pairs = [['utm_source', t.source], ['utm_medium', t.medium], ['utm_campaign', t.campaign], ['utm_content', t.content]].filter(([, v]) => v);
  if (!t.campaign && !t.content) return null;
  return `${SHOP}?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')}`;
}

const legend = new Map(WA_CODE_LEGEND);
const where = (t: LinkTags) => {
  const code = waCode(t);
  const name = legend.get(code) ?? '';
  return { code, where: t.content ? `${name} · ${t.content}` : name };
};

export async function linkLog(db: D1Database, now: number): Promise<LinkLog> {
  const [taps, links] = await Promise.all([
    db
      .prepare(
        `SELECT at, page, detail, source, medium, campaign, content FROM visit_events
         WHERE event = 'wa_chat' AND at >= ? ORDER BY at DESC LIMIT 100`,
      )
      .bind(now - 14 * 86_400_000)
      .all<{ at: number; page: string | null; detail: string | null } & LinkTags>(),
    db
      .prepare(
        `SELECT source, medium, campaign, content, COUNT(DISTINCT sid) AS people, MAX(at) AS lastAt FROM visit_events
         WHERE event = 'visit' AND at >= ? AND (campaign IS NOT NULL OR content IS NOT NULL)
         GROUP BY source, medium, campaign, content ORDER BY lastAt DESC LIMIT 60`,
      )
      .bind(now - 30 * 86_400_000)
      .all<LinkTags & { people: number; lastAt: number }>(),
  ]);
  return {
    taps: taps.results.map((r) => ({ ...r, at: Number(r.at), button: r.detail, ...where(r), link: utmLink(r) })),
    links: links.results.map((r) => ({ ...r, people: Number(r.people), lastAt: Number(r.lastAt), ...where(r), link: utmLink(r)! })),
    legend: WA_CODE_LEGEND,
  };
}
