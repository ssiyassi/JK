'use client';

import { useEffect } from 'react';
import { trackMetaOnce } from '@/lib/client/metaPixel';

/**
 * Meta Purchase from the browser, shown on the order page once it is paid. The server sends the same event with the
 * same eventId (src/lib/notify/meta.ts), and Meta counts it once.
 */
export default function MetaPurchase({ orderId, eventId, value, items }: { orderId: string; eventId: string; value: number; items: { id: string; quantity: number }[] }) {
  useEffect(() => {
    trackMetaOnce(eventId, 'Purchase', {
      currency: 'IDR',
      value,
      order_id: orderId,
      content_type: 'product',
      contents: items,
      content_ids: items.map((i) => i.id),
      num_items: items.reduce((sum, i) => sum + i.quantity, 0),
    }, eventId);
  }, [orderId, eventId, value, items]);
  return null;
}
