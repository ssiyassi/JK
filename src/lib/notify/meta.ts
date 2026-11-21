// Meta (Facebook/Instagram ads) Conversions API: tells Meta about each paid website order from the server, so ads can
// be optimised for real purchases even when the browser Pixel is blocked. The browser Pixel sends the same Purchase
// with the same event_id (`purchase-<order number>`), and Meta counts it once.
//
// Privacy: email, phone, customer id, first name and city are sent only as SHA-256 hashes (Meta's matching format);
// the address is never sent. Nothing is sent without META_PIXEL_ID + META_CAPI_TOKEN, or for test-account orders.
import type { Attribution } from '../shop/attribution.ts';
import type { ShopOrder } from '../shop/orders.ts';
import { errorText, reportFailure, withRetry, type ReportEnv } from './retry.ts';

export interface MetaEnv {
  META_PIXEL_ID?: string; // public (also used by the browser Pixel)
  META_CAPI_TOKEN?: string; // secret
  /** From Events Manager → Test events; set only while testing, so events show there instead of counting. */
  META_TEST_EVENT_CODE?: string;
  SHOP_URL?: string;
}

export const META_GRAPH_VERSION = 'v23.0';

export const purchaseEventId = (orderId: string) => `purchase-${orderId}`;

export interface PurchaseInput {
  order: ShopOrder;
  customer: { id: string; email: string; phone: string; name: string } | null;
  attribution: Attribution | null;
  now: number;
}

export type MetaPurchaseNotify = (input: PurchaseInput) => Promise<void>;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const hashed = async (value: string | null | undefined): Promise<string[] | undefined> =>
  value ? [await sha256(value)] : undefined;

/** The Purchase event in Conversions API format (https://developers.facebook.com/docs/marketing-api/conversions-api). */
export async function purchaseEvent({ order, customer, attribution, now }: PurchaseInput, shopUrl: string) {
  const a = attribution ?? {};
  const phone = customer?.phone.replace(/\D/g, '') || null;
  const firstName = customer?.name.trim().split(/\s+/)[0]?.toLowerCase() || null;
  const city = order.city.toLowerCase().replace(/[^a-z]/g, '') || null;
  const userData: Record<string, unknown> = {
    em: await hashed(customer?.email.trim().toLowerCase()),
    ph: await hashed(phone),
    external_id: await hashed(customer?.id),
    fn: await hashed(firstName),
    ct: await hashed(city),
    country: await hashed('id'),
    fbp: a.fbp,
    fbc: a.fbc,
    client_ip_address: a.ip,
    client_user_agent: a.ua,
  };
  for (const key of Object.keys(userData)) if (userData[key] === undefined) delete userData[key];
  return {
    event_name: 'Purchase',
    event_time: Math.floor(now / 1000),
    event_id: purchaseEventId(order.orderId),
    action_source: 'website',
    event_source_url: `${shopUrl.replace(/\/$/, '')}${a.landing ?? '/'}`,
    user_data: userData,
    custom_data: {
      currency: 'IDR',
      value: order.total,
      order_id: order.orderId,
      content_type: 'product',
      contents: order.lines.map((l) => ({ id: l.product, quantity: l.qty, item_price: l.price })),
      num_items: order.lines.reduce((sum, l) => sum + l.qty, 0),
    },
  };
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
type Log = (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void;

/** Sends Purchase events to Meta (3 tries); undefined when the Pixel ID or token is not set. Never throws. */
export function metaPurchaseNotifier(env: MetaEnv & ReportEnv, fetchFn: FetchFn, log: Log): MetaPurchaseNotify | undefined {
  const pixelId = env.META_PIXEL_ID?.trim();
  const token = env.META_CAPI_TOKEN?.trim();
  if (!pixelId || !token) return undefined;
  return async (input) => {
    try {
      const body: Record<string, unknown> = { data: [await purchaseEvent(input, env.SHOP_URL || 'https://jentiskitchen.id')] };
      if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
      // Same event_id on every try, so Meta counts the purchase once even if a "failed" try did arrive.
      await withRetry(async () => {
        const res = await fetchFn(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        );
        if (!res.ok) throw new Error(`Meta Conversions API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      });
      log('info', 'meta_capi_purchase', { orderId: input.order.orderId, value: input.order.total, test: Boolean(env.META_TEST_EVENT_CODE) });
    } catch (error) {
      log('error', 'meta_capi_failed', { orderId: input.order.orderId, message: errorText(error) });
      await reportFailure(env, { job: 'meta-capi', what: 'Purchase event to Meta ads (Conversions API)', error }, { fetchFn, log });
    }
  };
}
