'use client';

import { useEffect } from 'react';
import { rememberGuestOrder } from '@/lib/client/guestOrders';

/** On a guest's order page: remembers the order in this browser so the login page can link back to it. */
export default function RememberGuestOrder({ id, orderId }: { id: string; orderId: string }) {
  useEffect(() => rememberGuestOrder(id, orderId), [id, orderId]);
  return null;
}
