import { NextRequest, NextResponse } from 'next/server';
import { getDB, log, readJson } from '@/lib/server';
import { ATTRIBUTION_COOKIE, buildAttribution, fromMetaAd } from '@/lib/shop/attribution';
import { saveCheckoutLead } from '@/lib/shop/checkoutLeads';
import { loadCatalog } from '@/lib/shop/products';
import { hitRateLimits } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, currentCustomer } from '@/lib/shop/server';

// A guest typed their phone number at checkout (src/lib/shop/checkoutLeads.ts). Always answers 204, so it never shows
// an error to a shopper.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (await currentCustomer()) return new NextResponse(null, { status: 204 });
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [{ key: `lead:ip:${clientIp(request)}`, max: 60, windowMs: 3600 * 1000 }], now);
    const a = buildAttribution({ cookie: request.cookies.get(ATTRIBUTION_COOKIE)?.value });
    const source = fromMetaAd(a) ? 'Meta ad' : (a?.utm_source ?? 'Direct');
    await saveCheckoutLead(db, await readJson(request), await loadCatalog(db), source, now);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (!status || status >= 500) log('warn', 'checkout_lead_failed', { message: error instanceof Error ? error.message : String(error) });
  }
  return new NextResponse(null, { status: 204 });
}
