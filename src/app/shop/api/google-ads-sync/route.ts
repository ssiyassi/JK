import { timingSafeEqual } from 'node:crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import { getDB, log } from '@/lib/server';
import { parseGoogleRows, saveGoogleRows } from '@/lib/marketing/googleAds';

function secretMatches(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Receives daily results from the script in the Google Ads account (scripts/google-ads-script.js). This has to be on the
// public shop host because Google's servers cannot pass the admin login; the secret header is what protects it.
export async function POST(request: NextRequest) {
  const { GOOGLE_ADS_SYNC_SECRET: secret } = getCloudflareContext().env as unknown as { GOOGLE_ADS_SYNC_SECRET?: string };
  if (!secret || !secretMatches(request.headers.get('x-sync-secret'), secret)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  try {
    const rows = parseGoogleRows(await request.json().catch(() => null));
    await saveGoogleRows(getDB(), rows, Date.now());
    return NextResponse.json({ saved: rows.length });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status >= 500) log('error', 'google_ads_sync_failed', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: status >= 500 ? 'Could not save' : (error as Error).message }, { status });
  }
}
