import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '../core/d1';
import { log } from '@/lib/server';
import { SYNC_STATE_KEY, syncMetaAds, type MetaAdsEnv } from './metaAds';

/** Meta is asked again when the last read is older than this (live ad spend on Reports and HPP & Profit). */
export const LIVE_SYNC_MS = 5 * 60 * 1000;

/** When Meta ad numbers were last read successfully (ms), or null. */
export async function lastMetaSync(db: D1Database): Promise<number | null> {
  const state = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(SYNC_STATE_KEY).first<{ value: string }>();
  return state ? Number(JSON.parse(state.value).lastSuccess ?? 0) || null : null;
}

/** Reads Meta's ad spend again if the last read is older than LIVE_SYNC_MS. Never throws. */
export async function syncMetaIfStale(db: D1Database, now = Date.now()): Promise<void> {
  try {
    const last = await lastMetaSync(db);
    if (last && now - last <= LIVE_SYNC_MS) return;
    const env = getCloudflareContext().env as unknown as MetaAdsEnv;
    await syncMetaAds(db, env, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }), log, now, true);
  } catch (error) {
    log('warn', 'meta_live_sync_failed', { message: error instanceof Error ? error.message : String(error) });
  }
}
