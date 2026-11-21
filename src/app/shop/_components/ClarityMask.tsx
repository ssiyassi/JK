'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isPrivatePage } from '@/lib/shop/clarity';

/** Masks the whole page in Clarity recordings on pages with personal details (checkout, orders, account…). */
export default function ClarityMask() {
  const pathname = usePathname();
  useEffect(() => {
    const body = document.body;
    if (isPrivatePage(pathname)) body.setAttribute('data-clarity-mask', 'True');
    else body.removeAttribute('data-clarity-mask');
  }, [pathname]);
  return null;
}
