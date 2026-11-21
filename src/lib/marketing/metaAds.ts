// Copies daily ad results from the Meta Marketing API into meta_ad_insights (migration 0027), so reports can put ad
// spend next to real website orders and profit. Read-only: the token (META_ADS_TOKEN, a system user with ads_read
// only) cannot create ads or change budgets. Runs from the 15-minute cron at most every SYNC_EVERY_MS.
import type { D1Database } from '../core/d1.ts';
import { META_GRAPH_VERSION } from '../notify/meta.ts';

export interface MetaAdsEnv {
  META_ADS_TOKEN?: string; // secret
  META_AD_ACCOUNT_ID?: string; // e.g. act_993257963827130
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
type Log = (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void;

export const SYNC_STATE_KEY = 'meta:ads-sync';
export const SYNC_EVERY_MS = 6 * 3600 * 1000;
/** Meta keeps adjusting recent days (late conversions), so every sync re-reads this many days. */
export const REFRESH_DAYS = 7;
/** First sync: how far back to fetch. */
export const BACKFILL_DAYS = 90;

const FIELDS = [
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'objective',
  'spend', 'impressions', 'reach', 'clicks', 'inline_link_clicks', 'actions', 'action_values',
].join(',');

interface MetaAction { action_type: string; value: string }
export interface InsightRow {
  date_start: string;
  ad_id: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** First matching action type wins (Meta reports the same conversion under several names). */
function actionValue(list: MetaAction[] | undefined, types: string[]): number {
  for (const t of types) {
    const hit = list?.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
}

const PURCHASE = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

export function mapInsight(r: InsightRow, now: number) {
  return {
    date: r.date_start,
    adId: r.ad_id,
    adName: r.ad_name ?? null,
    adsetId: r.adset_id ?? null,
    adsetName: r.adset_name ?? null,
    campaignId: r.campaign_id ?? null,
    campaignName: r.campaign_name ?? null,
    objective: r.objective ?? null,
    spend: Math.round(num(r.spend)),
    impressions: Math.round(num(r.impressions)),
    reach: Math.round(num(r.reach)),
    clicks: Math.round(num(r.clicks)),
    linkClicks: Math.round(num(r.inline_link_clicks)),
    landingPageViews: Math.round(actionValue(r.actions, ['landing_page_view', 'omni_landing_page_view'])),
    addToCart: Math.round(actionValue(r.actions, ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'])),
    initiateCheckout: Math.round(actionValue(r.actions, ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'])),
    registrations: Math.round(actionValue(r.actions, ['omni_complete_registration', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration'])),
    purchases: Math.round(actionValue(r.actions, PURCHASE)),
    purchaseValue: Math.round(actionValue(r.action_values, PURCHASE)),
    actions: r.actions ? JSON.stringify(r.actions) : null,
    syncedAt: now,
  };
}

/** YYYY-MM-DD in Jakarta time, `daysAgo` days before `now`. */
export function jakartaDate(now: number, daysAgo = 0): string {
  return new Date(now + 7 * 3600 * 1000 - daysAgo * 86400 * 1000).toISOString().slice(0, 10);
}

/** Reads one ad account's daily ad-level results for [since, until] (inclusive), following Meta's pages. */
export async function fetchInsights(env: MetaAdsEnv, since: string, until: string, fetchFn: FetchFn): Promise<InsightRow[]> {
  const account = env.META_AD_ACCOUNT_ID!.startsWith('act_') ? env.META_AD_ACCOUNT_ID! : `act_${env.META_AD_ACCOUNT_ID}`;
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields: FIELDS,
    limit: '500',
    access_token: env.META_ADS_TOKEN!,
  });
  let url: string | null = `https://graph.facebook.com/${META_GRAPH_VERSION}/${account}/insights?${params}`;
  const rows: InsightRow[] = [];
  for (let page = 0; url && page < 20; page++) {
    const res = await fetchFn(url);
    const body = (await res.json()) as { data?: InsightRow[]; paging?: { next?: string }; error?: { message?: string; code?: number } };
    if (!res.ok || body.error) throw new Error(`Meta insights ${res.status}: ${body.error?.message ?? 'unknown error'} (code ${body.error?.code ?? '-'})`);
    rows.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }
  return rows;
}

/**
 * Today's daily budget: the active ad sets' daily budgets plus active campaigns with a campaign budget (IDR, whole
 * rupiah), in total and per campaign id (the Ads Report shows each campaign against its own budget). Meta may spend up
 * to 7× this per Sunday–Saturday week. null when Meta can't be read or no active daily budget exists.
 */
export async function fetchDailyBudget(env: MetaAdsEnv, fetchFn: FetchFn): Promise<{ total: number; byCampaign: Record<string, number> } | null> {
  const account = env.META_AD_ACCOUNT_ID!.startsWith('act_') ? env.META_AD_ACCOUNT_ID! : `act_${env.META_AD_ACCOUNT_ID}`;
  let total = 0;
  const byCampaign: Record<string, number> = {};
  for (const [level, fields] of [['adsets', 'daily_budget,campaign_id'], ['campaigns', 'daily_budget,id']] as const) {
    const params = new URLSearchParams({ fields, effective_status: '["ACTIVE"]', limit: '100', access_token: env.META_ADS_TOKEN! });
    const res = await fetchFn(`https://graph.facebook.com/${META_GRAPH_VERSION}/${account}/${level}?${params}`);
    const body = (await res.json()) as { data?: { daily_budget?: string; campaign_id?: string; id?: string }[]; error?: unknown };
    if (!res.ok || body.error || !Array.isArray(body.data)) return null;
    for (const r of body.data) {
      const budget = num(r.daily_budget);
      const campaign = level === 'adsets' ? r.campaign_id : r.id;
      total += budget;
      if (budget && campaign) byCampaign[campaign] = (byCampaign[campaign] ?? 0) + budget;
    }
  }
  return total > 0 ? { total: Math.round(total), byCampaign } : null;
}

export async function saveInsights(db: D1Database, rows: ReturnType<typeof mapInsight>[]): Promise<void> {
  const cols = ['date', 'adId', 'adName', 'adsetId', 'adsetName', 'campaignId', 'campaignName', 'objective', 'spend', 'impressions', 'reach', 'clicks', 'linkClicks', 'landingPageViews', 'addToCart', 'initiateCheckout', 'registrations', 'purchases', 'purchaseValue', 'actions', 'syncedAt'] as const;
  const sql = `INSERT INTO meta_ad_insights (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
    ON CONFLICT ("date", "adId") DO UPDATE SET ${cols.filter((c) => c !== 'date' && c !== 'adId').map((c) => `"${c}" = excluded."${c}"`).join(', ')}`;
  for (let i = 0; i < rows.length; i += 50) {
    await db.batch(rows.slice(i, i + 50).map((r) => db.prepare(sql).bind(...cols.map((c) => r[c]))));
  }
}

/**
 * Syncs when due (never synced, or last success more than SYNC_EVERY_MS ago): the last REFRESH_DAYS days, or
 * BACKFILL_DAYS on the first run. Does nothing without the token / account. Never throws.
 */
export async function syncMetaAds(db: D1Database, env: MetaAdsEnv, fetchFn: FetchFn, log: Log, now = Date.now(), force = false): Promise<{ synced: boolean; rows?: number; error?: string }> {
  if (!env.META_ADS_TOKEN || !env.META_AD_ACCOUNT_ID) return { synced: false };
  try {
    const state = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(SYNC_STATE_KEY).first<{ value: string }>();
    const last = state ? Number(JSON.parse(state.value).lastSuccess ?? 0) : 0;
    if (!force && last && now - last < SYNC_EVERY_MS) return { synced: false };
    const since = jakartaDate(now, last ? REFRESH_DAYS : BACKFILL_DAYS);
    const until = jakartaDate(now);
    const rows = (await fetchInsights(env, since, until, fetchFn)).map((r) => mapInsight(r, now));
    await saveInsights(db, rows);
    const budget = await fetchDailyBudget(env, fetchFn).catch(() => null);
    await db
      .prepare(
        `INSERT INTO notification_state (key, value, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      )
      .bind(SYNC_STATE_KEY, JSON.stringify({ lastSuccess: now, since, until, rows: rows.length, dailyBudget: budget?.total ?? null, campaignBudgets: budget?.byCampaign ?? null }), now)
      .run();
    log('info', 'meta_ads_sync', { since, until, rows: rows.length });
    return { synced: true, rows: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', 'meta_ads_sync_failed', { message });
    return { synced: false, error: message };
  }
}
