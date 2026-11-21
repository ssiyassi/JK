// Browser side of the Meta Pixel (see src/app/shop/_components/MetaPixel.tsx). Every call is a no-op when the Pixel
// is not switched on (no META_PIXEL_ID) or blocked by the browser. AddToCart / InitiateCheckout are also counted for
// our own "traffic by source" report (sendVisitEvent), which works even when the Pixel is blocked.

const SESSION_ID = 'jk_sid';
const SESSION_SOURCE = 'jk_src';

/** Source tags of this tab session, set once on landing by MetaPixel.tsx. */
export function visitSession(): { sid: string; src: Record<string, string | null> } | null {
  try {
    const sid = sessionStorage.getItem(SESSION_ID);
    const src = sessionStorage.getItem(SESSION_SOURCE);
    return sid && src ? { sid, src: JSON.parse(src) } : null;
  } catch {
    return null;
  }
}

export function startVisitSession(src: Record<string, string | null>): { sid: string; isNew: boolean } | null {
  try {
    let sid = sessionStorage.getItem(SESSION_ID);
    if (sid && sessionStorage.getItem(SESSION_SOURCE)) return { sid, isNew: false };
    sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36);
    sessionStorage.setItem(SESSION_ID, sid);
    sessionStorage.setItem(SESSION_SOURCE, JSON.stringify(src));
    return { sid, isNew: true };
  } catch {
    return null; // storage blocked: not counted
  }
}

export type VisitStep = 'visit' | 'add_to_cart' | 'checkout' | 'page' | 'scroll' | 'address' | 'pay_click' | 'order_placed' | 'paid' | 'wa_help' | 'reseller_wa' | 'wa_cart' | 'wa_chat';

/** Sends one step for the traffic-by-source report and the visitor journeys (with the current page). Never throws. */
export function sendVisitEvent(event: VisitStep, sid: string, src: Record<string, string | null>, detail: string | null = null) {
  try {
    const body = JSON.stringify({ event, sid, ...src, page: window.location.pathname, detail });
    // /shop/api/track works on every host (on jentiskitchen.id the middleware passes /shop/* through unchanged).
    const sent = navigator.sendBeacon?.('/shop/api/track', new Blob([body], { type: 'application/json' }));
    if (!sent) void fetch('/shop/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    /* never break the page for tracking */
  }
}

/** One journey step of this tab session (page view, scroll, checkout step); skipped when the visit was not counted. */
export function trackStep(event: VisitStep, detail: string | null = null) {
  if (typeof window === 'undefined') return;
  const session = visitSession();
  if (session) sendVisitEvent(event, session.sid, session.src, detail);
}

const FUNNEL_STEP: Record<string, VisitStep> = { AddToCart: 'add_to_cart', InitiateCheckout: 'checkout', Purchase: 'paid' };

type Fbq = (...args: unknown[]) => void;

/** Sends a standard Meta event (PageView, ViewContent, AddToCart, InitiateCheckout, CompleteRegistration, Purchase). */
export function trackMeta(event: string, params: Record<string, unknown> = {}, eventId?: string) {
  if (typeof window === 'undefined') return;
  const step = FUNNEL_STEP[event];
  if (step) trackStep(step);
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (typeof fbq !== 'function') return;
  try {
    if (eventId) fbq('track', event, params, { eventID: eventId });
    else fbq('track', event, params);
  } catch {
    /* never break the page for tracking */
  }
}

/** Like trackMeta, but at most once per browser for this key (e.g. a Purchase when the order page is reopened). */
export function trackMetaOnce(key: string, event: string, params: Record<string, unknown> = {}, eventId?: string) {
  try {
    const k = `jk_meta_${key}`;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, '1');
  } catch {
    /* storage blocked: Meta still de-duplicates by eventId */
  }
  trackMeta(event, params, eventId);
}
