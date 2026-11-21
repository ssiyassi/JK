'use client';

import { useEffect } from 'react';

type Gtag = (...args: unknown[]) => void;

/**
 * Google Ads Purchase from the browser, shown on the order page once it is paid. At most once per browser, and Google
 * also ignores a repeated transaction_id. Only counts when the customer opens the order page after paying; the shop's
 * own report (src/lib/marketing/adsReport.ts) counts every paid order.
 */
export default function GooglePurchase({ sendTo, orderId, value }: { sendTo: string; orderId: string; value: number }) {
  useEffect(() => {
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;
    if (typeof gtag !== 'function') return;
    try {
      const key = `jk_gads_${orderId}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      /* storage blocked: Google still de-duplicates by transaction_id */
    }
    try {
      gtag('event', 'conversion', { send_to: sendTo, value, currency: 'IDR', transaction_id: orderId });
    } catch {
      /* never break the page for tracking */
    }
  }, [sendTo, orderId, value]);
  return null;
}
