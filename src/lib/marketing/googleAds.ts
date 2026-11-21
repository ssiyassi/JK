// Daily Google Ads results, pushed by a small script inside the Google Ads account (scripts/google-ads-script.js) to
// /shop/api/google-ads-sync, so the reports can show Google spend next to real website orders. The script only reads
// reports; nothing here can change a campaign or budget.
import { AppError, type D1Database } from '../core/d1.ts';

export const GOOGLE_SYNC_STATE_KEY = 'google:ads-sync';
const MAX_ROWS = 500;

export interface GoogleAdRow {
  date: string;
  campaignId: string;
  campaignName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

const count = (v: unknown, field: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new AppError(400, `Invalid ${field}`);
  return n;
};

/** Checks the script's payload. Google gives cost in millionths of the currency (micros). */
export function parseGoogleRows(body: unknown): GoogleAdRow[] {
  const rows = (body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new AppError(400, 'Invalid rows');
  return rows.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new AppError(400, 'Invalid date');
    const campaignId = String(r.campaignId ?? '');
    if (!/^\d{1,30}$/.test(campaignId)) throw new AppError(400, 'Invalid campaign');
    return {
      date: r.date,
      campaignId,
      campaignName: typeof r.campaignName === 'string' ? r.campaignName.slice(0, 200) : null,
      spend: Math.round(count(r.costMicros, 'cost') / 1_000_000),
      impressions: Math.round(count(r.impressions, 'impressions')),
      clicks: Math.round(count(r.clicks, 'clicks')),
      conversions: count(r.conversions, 'conversions'),
      conversionValue: count(r.conversionValue, 'conversion value'),
    };
  });
}

export async function saveGoogleRows(db: D1Database, rows: GoogleAdRow[], now: number): Promise<void> {
  const sql = `INSERT INTO google_ad_insights (date, campaignId, campaignName, spend, impressions, clicks, conversions, conversionValue, syncedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (date, campaignId) DO UPDATE SET campaignName = excluded.campaignName, spend = excluded.spend, impressions = excluded.impressions,
      clicks = excluded.clicks, conversions = excluded.conversions, conversionValue = excluded.conversionValue, syncedAt = excluded.syncedAt`;
  for (let i = 0; i < rows.length; i += 50) {
    await db.batch(rows.slice(i, i + 50).map((r) => db.prepare(sql).bind(r.date, r.campaignId, r.campaignName, r.spend, r.impressions, r.clicks, r.conversions, r.conversionValue, now)));
  }
  // Recorded even with no rows: "the script ran and Google had nothing" is different from "the script stopped".
  await db
    .prepare(
      `INSERT INTO notification_state (key, value, updatedAt) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    )
    .bind(GOOGLE_SYNC_STATE_KEY, JSON.stringify({ lastSuccess: now, rows: rows.length }), now)
    .run();
}

/** Google spend and results per campaign for the days from `from` to `to` (inclusive). */
export async function googleRows(db: D1Database, from: string, to: string): Promise<GoogleCampaign[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(MAX(campaignName), campaignId) AS campaignName, SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks,
              SUM(conversions) AS conversions, SUM(conversionValue) AS conversionValue
       FROM google_ad_insights WHERE date >= ? AND date <= ? GROUP BY campaignId ORDER BY spend DESC`,
    )
    .bind(from, to)
    .all<GoogleCampaign>();
  return results.map((r) => ({ ...r, spend: Number(r.spend), impressions: Number(r.impressions), clicks: Number(r.clicks), conversions: Number(r.conversions), conversionValue: Number(r.conversionValue) }));
}

export interface GoogleCampaign {
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

/** When the script last reached the site (ms), or null if it never has. */
export async function lastGoogleSync(db: D1Database): Promise<number | null> {
  const state = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(GOOGLE_SYNC_STATE_KEY).first<{ value: string }>();
  return state ? Number(JSON.parse(state.value).lastSuccess ?? 0) || null : null;
}
