'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { sendVisitEvent, startVisitSession, trackMeta, trackStep, visitSession } from '@/lib/client/metaPixel';
import { waCode, withWaCode } from '@/lib/shop/waCode';

const ATTRIBUTION_COOKIE = 'jk_attr'; // read by src/lib/shop/attribution.ts
const TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
const KEEP_DAYS = 30;
const AD_FIRST_DAYS = 7; // same as Meta's 7-day click window

/** A Meta ad tapped in the last 7 days, from the tags saved so far. */
function earlierAd(now: number): Record<string, unknown> {
  const raw = document.cookie.split('; ').find((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));
  if (!raw) return {};
  const old = JSON.parse(decodeURIComponent(raw.slice(ATTRIBUTION_COOKIE.length + 1))) as Record<string, unknown>;
  const ad = old.utm_source ? old.utm_source === 'meta' : Boolean(old.fbclid);
  const adAt = ad ? old.at : old.ad_at;
  if (typeof adAt !== 'number' || now - adAt > AD_FIRST_DAYS * 86400 * 1000) return {};
  return ad ? { ad_campaign: old.utm_campaign, ad_content: old.utm_content, ad_at: adAt } : { ad_campaign: old.ad_campaign, ad_content: old.ad_content, ad_at: adAt };
}

/**
 * Remembers the ad / link tags the visitor arrived with (utm_*, fbclid) for 30 days, so the order they place later
 * can be credited to that ad. The newest tagged visit wins, but a Meta ad tapped in the last 7 days is kept next to
 * it (ad_*), for someone who taps an ad and comes back through e.g. the Instagram bio link. Works with or without the
 * Meta Pixel.
 */
/** Opened from Reports → Links ("Open" button, ?jk_preview=1): the owner checking a link, not a real ad visit. */
const isPreview = () => {
  try {
    return new URLSearchParams(window.location.search).has('jk_preview');
  } catch {
    return false;
  }
};

function rememberAttribution() {
  if (isPreview()) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const tags: Record<string, unknown> = {};
    for (const key of TAGS) {
      const v = params.get(key);
      if (v) tags[key] = v.slice(0, key === 'fbclid' ? 500 : 200);
    }
    if (!Object.keys(tags).length) return;
    tags.landing = window.location.pathname;
    tags.at = Date.now();
    if (tags.utm_source ? tags.utm_source !== 'meta' : !tags.fbclid) Object.assign(tags, earlierAd(tags.at as number));
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(tags))}; Max-Age=${KEEP_DAYS * 86400}; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked */
  }
}

/**
 * Where this visit came from (traffic-by-source report, src/lib/shop/visits.ts): the utm tags of the landing URL, Meta's
 * click id, or else the referring site. Counted once per tab session.
 */
function recordVisit() {
  if (isPreview()) return;
  const params = new URLSearchParams(window.location.search);
  let refHost: string | null = null;
  try {
    refHost = document.referrer ? new URL(document.referrer).hostname : null;
  } catch {
    /* no referrer */
  }
  const src: Record<string, string | null> = {
    source: params.get('utm_source') ?? (params.get('fbclid') ? 'meta' : null),
    medium: params.get('utm_medium') ?? (params.get('fbclid') ? 'paid_social' : null),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
    landing: window.location.pathname,
    refHost,
  };
  // Without tags the server works out the source from the referring site (sourceFromReferrer in visits.ts).
  const session = startVisitSession(src);
  if (session?.isNew) sendVisitEvent('visit', session.sid, src);
}

/** Visitor journeys: how far down this page the visitor scrolled (50% and 90%, once each per page view). */
function watchScroll(): () => void {
  const sent = new Set<string>();
  const onScroll = () => {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    const depth = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 100;
    for (const mark of ['50', '90']) {
      if (depth >= Number(mark) && !sent.has(mark)) {
        sent.add(mark);
        trackStep('scroll', mark);
      }
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}

/**
 * Ad tag capture, a journey step for every page (where visitors go and where they leave, daily report), scroll depth,
 * and a Meta PageView on every page change after the first (the first is sent by the Pixel snippet).
 */
/**
 * Every tap on a WhatsApp button that opens a chat with us (owner 14 Nov 2026: "where did this WhatsApp chat come
 * from?") is a wa_chat step: it carries this tab's source (ad, bio, …), the page, and the button's text as detail.
 * One listener for the whole shop, so new WhatsApp buttons are counted without extra code. Share links (wa.me/?text=)
 * have no number and are not counted.
 */
function watchWhatsApp() {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.href;
    if (!/^https:\/\/(wa\.me\/\d|api\.whatsapp\.com\/send\?phone=\d)/.test(href)) return;
    const label = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
    trackStep('wa_chat', label.slice(0, 40) || 'whatsapp');
    // Owner 15 Nov: a one-letter code at the end of the message shows where the customer came from (waCode.ts).
    a.href = withWaCode(href, waCode(visitSession()?.src));
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

export default function MetaPixel() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => watchWhatsApp(), []);
  useEffect(() => watchScroll(), [pathname]);
  useEffect(() => {
    rememberAttribution();
    if (first.current) recordVisit();
    trackStep('page');
    if (first.current) {
      first.current = false;
      return;
    }
    trackMeta('PageView');
  }, [pathname]);
  return null;
}
