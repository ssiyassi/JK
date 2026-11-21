import { getCloudflareContext } from '@opennextjs/cloudflare';
import ReportsView from '@/components/ReportsView';
import { getDB, log } from '@/lib/server';
import { addDaysToKey, jakartaDateKey } from '@/lib/core/time';
import { SYNC_STATE_KEY, syncMetaAds, type MetaAdsEnv } from '@/lib/marketing/metaAds';
import { collectReport, reportHtml } from '@/lib/marketing/reportPdf';
import { reportView } from '@/lib/marketing/reportView';
import { affiliateCommissions, listAffiliates } from '@/lib/shop/affiliates';
import { collabCommissions } from '@/lib/shop/collab-report';
import { listCollabs } from '@/lib/shop/collabs';
import { linkLog } from '@/lib/marketing/linkLog';

export const dynamic = 'force-dynamic';

// When the chosen days include today, Meta is asked again if the last read is older than this (live ad spend).
const LIVE_SYNC_MS = 5 * 60 * 1000;
const isDay = (v: string | undefined): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/**
 * Reports: the numbers of the daily Telegram PDF (src/lib/marketing/reportPdf.ts) for one day or a date range (default
 * today, live), in tabs: Sales, Ads, Profit, Affiliates & collabs, Customers.
 */
export default async function MarketingReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const now = Date.now();
  const today = jakartaDateKey(now);
  let to = isDay(params.to) && params.to <= today ? params.to : today;
  let from = isDay(params.from) ? params.from : to;
  if (from > to) [from, to] = [to, from];

  const db = getDB();
  const readSync = async () => {
    const state = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(SYNC_STATE_KEY).first<{ value: string }>();
    return state ? Number(JSON.parse(state.value).lastSuccess ?? 0) || null : null;
  };
  let lastSync = await readSync();
  // Meta updates its numbers for the last days too, so a range ending yesterday also benefits from a fresh read.
  if (to >= addDaysToKey(today, -1) && (!lastSync || now - lastSync > LIVE_SYNC_MS)) {
    const env = getCloudflareContext().env as unknown as MetaAdsEnv;
    await syncMetaAds(db, env, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }), log, now, true);
    lastSync = await readSync();
  }

  const [data, affiliates, collabs, links] = await Promise.all([collectReport(db, from, to, now, lastSync), listAffiliates(db), listCollabs(db), linkLog(db, now)]);
  const [aff, col] = await Promise.all([affiliateCommissions(db, affiliates, now), collabCommissions(db, collabs, now)]);
  const name = new Map([...affiliates.map((a) => [a.id, a.name] as const), ...collabs.map((c) => [c.id, c.name] as const)]);
  const partners = [
    ...aff.affiliates.map((a) => ({ kind: 'Affiliate' as const, name: name.get(a.affiliateId) ?? '?', orders: a.orders })),
    ...col.collabs.map((c) => ({ kind: 'Collab' as const, name: name.get(c.collabId) ?? '?', orders: c.orders })),
  ];
  // The PDF keeps its own design (Save as PDF prints it); the page shows the same numbers in the admin look.
  return <ReportsView view={reportView(data, partners)} links={links} today={today} pdfHtml={reportHtml(data, '/shop/brand/logo.png')} />;
}
