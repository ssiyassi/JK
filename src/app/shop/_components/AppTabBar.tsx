'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isStandalonePage } from '@/lib/shop/catalog';
import { readAffiliatePage } from '@/lib/client/affiliatePage';
import { useShop } from './ShopProvider';

/**
 * Phone-only bottom menu, like an app (owner, 2026-11-12): Beranda · Affiliate · Keranjang (raised centre button) ·
 * Pesanan · Akun. Hidden on pages with their own bottom bar (checkout, product pages, an order) and on the standalone
 * reseller pages. Wide screens keep the header links.
 */
export const TAB_BAR_HIDDEN = (path: string) =>
  /\/(checkout|produk\/[^/]+|paket\/[^/]+|orders\/[^/]+)$/.test(path) || isStandalonePage(path);

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...stroke} />,
  affiliate: (
    <g {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.2c-.5-.8-1.5-1.2-2.8-1.2-1.6 0-2.8.8-2.8 2s1.2 1.7 2.8 2 2.8.8 2.8 2-1.2 2-2.8 2c-1.3 0-2.3-.4-2.8-1.2M12 6.5V8M12 16v1.5" />
    </g>
  ),
  orders: (
    <g {...stroke}>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </g>
  ),
  account: (
    <g {...stroke}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </g>
  ),
  bag: (
    <g {...stroke}>
      <path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </g>
  ),
};

function Icon({ name, className = 'size-6' }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export default function AppTabBar() {
  const { href, customer, cartCount, cartReady } = useShop();
  const pathname = usePathname();
  // Affiliates who opened their own page in this browser go straight back to it.
  const [affiliateHref, setAffiliateHref] = useState(href('/affiliate'));
  useEffect(() => {
    const own = readAffiliatePage();
    if (own) setAffiliateHref(href(`/affiliate/${own}`));
  }, [href]);
  if (TAB_BAR_HIDDEN(pathname)) return null;

  const at = (path: string) => (path === '/' ? pathname === href('/') : pathname === href(path) || pathname.startsWith(`${href(path)}/`));
  const tabs = [
    { key: 'home', label: 'Beranda', to: href('/'), on: at('/') },
    { key: 'affiliate', label: 'Affiliate', to: affiliateHref, on: at('/affiliate') },
    { key: 'orders', label: 'Pesanan', to: href('/pesanan'), on: at('/pesanan') },
    { key: 'account', label: 'Akun', to: href(customer ? '/account' : '/login'), on: at('/account') || at('/login') || at('/register') || at('/voucher') },
  ];
  const tab = (t: (typeof tabs)[number]) => (
    <Link
      key={t.key}
      href={t.to}
      aria-current={t.on ? 'page' : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${t.on ? 'text-[#9a3412]' : 'text-[#9b8f86]'}`}
    >
      {t.on && <span className="absolute top-0 h-[3px] w-7 rounded-b bg-[#9a3412]" aria-hidden />}
      <Icon name={t.key} />
      {t.label}
    </Link>
  );

  return (
    <nav
      aria-label="Menu utama"
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 h-[64px] bg-white border-t border-[#eee7df] shadow-[0_-6px_20px_rgba(59,26,12,0.06)] pb-[env(safe-area-inset-bottom)] box-content"
    >
      {tabs.slice(0, 2).map(tab)}
      <Link href={href('/checkout')} aria-label={`Keranjang, ${cartCount} item`} className="relative flex flex-col items-center justify-end gap-0.5 pb-1.5 text-[10.5px] font-semibold text-[#9b8f86]">
        <span className="-mt-6 size-[52px] rounded-[18px] border-4 border-white bg-[#9a3412] text-white grid place-items-center shadow-[0_8px_18px_rgba(154,52,18,0.38)]">
          <Icon name="bag" />
        </span>
        {cartReady && cartCount > 0 && (
          <span className="absolute -top-5 left-[calc(50%+10px)] min-w-[18px] h-[18px] px-1 rounded-full bg-[#ef4444] border-2 border-white text-white text-[10px] font-extrabold grid place-items-center">
            {cartCount}
          </span>
        )}
        Keranjang
      </Link>
      {tabs.slice(2).map(tab)}
    </nav>
  );
}
