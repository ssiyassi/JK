// Where a website order came from: the ad / link the customer first arrived with (utm_* tags, Meta's fbclid) and the
// Meta browser IDs needed to match the order to an ad click. Saved on shop_orders.attribution when the order is placed;
// used for the Meta Purchase event and the marketing reports. The browser part is the `jk_attr` cookie written by
// MetaPixel.tsx (src/app/shop/_components).

export const ATTRIBUTION_COOKIE = 'jk_attr';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  landing?: string; // path of the first page with tags, e.g. "/register"
  at?: number; // when the customer arrived with these tags (ms)
  ad_campaign?: string; // the Meta ad tapped before arriving with these other tags
  ad_content?: string;
  ad_at?: number;
  fbp?: string; // Meta browser ID cookie (_fbp)
  fbc?: string; // Meta click ID cookie (_fbc)
  ip?: string;
  ua?: string;
}

/**
 * Tapped a Meta ad directly: the ad's own tag, or a click ID with no tag at all. Instagram and Facebook add fbclid to
 * every outside link, also free ones like the bio link (utm_source=instagram), so fbclid alone proves nothing.
 */
export function directMetaAd(a: Attribution | null | undefined): boolean {
  return a?.utm_source ? a.utm_source === 'meta' : Boolean(a?.fbclid);
}

/** Tapped a Meta ad earlier (MetaPixel.tsx keeps it for 7 days), then came back through another tagged link. */
export const metaAdFirst = (a: Attribution | null | undefined): boolean => !directMetaAd(a) && Boolean(a?.ad_at);

/** Tapped a Google search ad: the campaign's Final URL suffix adds utm_source=google&utm_medium=cpc. */
export const fromGoogleAd = (a: Attribution | null | undefined): boolean => a?.utm_source === 'google' && a.utm_medium === 'cpc';

/** Whether an order counts as a Meta ad order. */
export const fromMetaAd = (a: Attribution | null | undefined): boolean => directMetaAd(a) || metaAdFirst(a);

const clean = (v: unknown, max = 200): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  return s ? s.slice(0, max) : undefined;
};

const META_ID = /^fb\.\d\.\d{10,16}\.[\w.-]{1,400}$/;

/**
 * Builds the attribution saved with an order from the `jk_attr` cookie, Meta's _fbp/_fbc cookies and the request.
 * Anything malformed is dropped; returns null when there is nothing worth saving.
 */
export function buildAttribution(input: {
  cookie?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  ua?: string | null;
}): Attribution | null {
  const a: Attribution = {};
  if (input.cookie) {
    try {
      const raw = JSON.parse(decodeURIComponent(input.cookie)) as Record<string, unknown>;
      for (const key of UTM_KEYS) {
        const v = clean(raw[key]);
        if (v) a[key] = v;
      }
      const fbclid = clean(raw.fbclid, 500);
      if (fbclid && /^[\w.-]+$/.test(fbclid)) a.fbclid = fbclid;
      const landing = clean(raw.landing);
      if (landing?.startsWith('/')) a.landing = landing;
      if (typeof raw.at === 'number' && Number.isFinite(raw.at)) a.at = Math.floor(raw.at);
      if (typeof raw.ad_at === 'number' && Number.isFinite(raw.ad_at)) {
        a.ad_at = Math.floor(raw.ad_at);
        a.ad_campaign = clean(raw.ad_campaign);
        a.ad_content = clean(raw.ad_content);
      }
    } catch {
      /* not our cookie format: ignore */
    }
  }
  if (input.fbp && META_ID.test(input.fbp)) a.fbp = input.fbp;
  if (input.fbc && META_ID.test(input.fbc)) a.fbc = input.fbc;
  // Click ID from the landing URL when the Pixel itself has not written _fbc (e.g. blocked).
  if (!a.fbc && a.fbclid) a.fbc = `fb.1.${a.at ?? Date.now()}.${a.fbclid}`;
  const hasSource = Object.keys(a).length > 0;
  const ip = clean(input.ip, 64);
  if (ip && ip !== 'unknown') a.ip = ip;
  const ua = clean(input.ua, 400);
  if (ua) a.ua = ua;
  return hasSource || a.ip || a.ua ? a : null;
}

export function parseStoredAttribution(json: unknown): Attribution | null {
  if (typeof json !== 'string' || !json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? (v as Attribution) : null;
  } catch {
    return null;
  }
}
