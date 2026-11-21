'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CONTACT_WHATSAPP, isStandalonePage, shopAsset, whatsappLink } from '@/lib/shop/catalog';
import { trackStep } from '@/lib/client/metaPixel';
import { useShop } from './ShopProvider';

/** First name for the header, at most 8 characters ("Christopher" -> "Christo…"). */
function shortFirstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.length > 8 ? `${first.slice(0, 7)}…` : first;
}

export default function ShopHeader() {
  const { href, customer, cartCount } = useShop();
  // The account page has a wallpaper that starts behind the header: see-through at the top, soft cream once scrolled.
  const pathname = usePathname();
  const overWallpaper = pathname.endsWith('/account');
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!overWallpaper) return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overWallpaper]);
  if (isStandalonePage(pathname)) return null;
  // Phones: app-style top bars from the approved designs (2026-11-12). Product pages put their buttons on the photo.
  const rel = pathname.slice(href('/').length - 1) || '/';
  const bar: { title?: string; back?: boolean; backHome?: boolean; logo?: boolean; right: 'wa' | 'help' | 'share' | null } | null =
    rel === '/checkout'
      ? { back: true, logo: true, right: 'wa' }
      : /^\/orders\/[^/]+$/.test(rel)
        ? { back: true, title: 'Detail pesanan', right: 'share' }
        : /^\/paket\/[^/]+$/.test(rel)
          // Shared/ad link, often opened directly (no real history to go back to): always go to the homepage.
          ? { back: true, backHome: true, title: 'Paket Hemat', right: 'share' }
        : rel === '/voucher'
          ? { back: true, title: 'Voucher saya', right: 'help' }
          : rel === '/pesanan'
            ? { title: 'Pesanan saya', right: 'wa' }
            : rel === '/account'
              ? { title: 'Akun', right: 'wa' }
              : rel === '/affiliate'
                ? { title: 'Affiliate', right: 'help' }
                : /^\/affiliate\/[^/]+$/.test(rel)
                  ? { title: 'Affiliate saya', right: 'wa' }
                  : null;
  const productPage = /^\/produk\/[^/]+$/.test(rel);
  const waHref = whatsappLink(CONTACT_WHATSAPP, 'Halo Customer Care Jentis Kitchen, saya butuh bantuan.');
  const roundBtn = 'size-10 shrink-0 rounded-xl grid place-items-center';
  const back = () => {
    if (bar?.backHome || window.history.length <= 1) window.location.href = href('/');
    else window.history.back();
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* closed */
    }
  };
  const phoneBar = bar && (
    <div className="sm:hidden h-16 px-3 flex items-center gap-1.5">
      {bar.back && (
        <button type="button" onClick={back} aria-label="Kembali" className={`${roundBtn} text-[#111827]`}>
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
      )}
      {bar.logo ? (
        <Link href={href('/')} className="flex-1 flex items-center justify-center gap-1.5 min-w-0" aria-label="Jentis Kitchen, beranda">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shopAsset('/brand/logo.png')} alt="" width={22} height={28} className="h-7 w-auto" />
          <span className="font-[family-name:var(--font-brand)] text-[#9a3412] text-[26px] leading-none mt-1 whitespace-nowrap">Jentis Kitchen</span>
        </Link>
      ) : (
        <span className={`flex-1 truncate text-[17px] font-bold text-[#111827] ${bar.back ? '' : 'pl-1'}`}>{bar.title}</span>
      )}
      {bar.right === 'wa' && (
        <a href={waHref} target="_blank" rel="noreferrer" onClick={() => rel === '/checkout' && trackStep('wa_help')} aria-label="Chat Customer Care di WhatsApp" className={`${roundBtn} bg-[#dcfce7] text-[#16a34a]`}>
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
          </svg>
        </a>
      )}
      {bar.right === 'help' && (
        <Link href={`${href('/')}#faq`} aria-label="Pertanyaan umum" className={`${roundBtn} bg-[#fdf3ea] text-[#9a3412]`}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 2.2-2.4 3.9M12 17h.01" />
          </svg>
        </Link>
      )}
      {bar.right === 'share' && (
        <button type="button" onClick={() => void share()} aria-label="Bagikan" className={`${roundBtn} bg-[#fdf3ea] text-[#9a3412]`}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12M7 8l5-5 5 5" />
            <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          </svg>
        </button>
      )}
    </div>
  );
  const look = !overWallpaper
    ? 'bg-white border-[#f3f4f6]'
    : scrolled
      ? 'bg-[#fdf6ee]/90 backdrop-blur border-[#f3f4f6]'
      : 'bg-transparent border-transparent';
  return (
    <header className={`${productPage ? 'max-sm:hidden ' : ''}sticky top-0 z-30 border-b transition-colors ${look} max-sm:bg-white max-sm:border-[#eee7df]`}>
      {phoneBar}
      <div className={`${bar ? 'max-sm:hidden ' : ''}max-w-[1920px] mx-auto px-4 sm:px-8 py-3 sm:py-6 flex items-center justify-between gap-3`}>
        <Link href={href('/')} className="flex items-center gap-2 sm:gap-[15px] min-w-0" aria-label="Jentis Kitchen, beranda">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shopAsset('/brand/logo.png')} alt="" width={33} height={42} className="h-[34px] w-auto sm:h-[42px] shrink-0" />
          {/* Very small phones (under 340px) show only the logo, so the name pill and cart still fit. */}
          <span className="hidden min-[340px]:inline font-[family-name:var(--font-brand)] text-[#9a3412] text-[27px] min-[400px]:text-[32px] sm:text-[40px] leading-8 tracking-[-0.6px] whitespace-nowrap">
            Jentis Kitchen
          </span>
        </Link>
        {/* Phones: account and cart are in the bottom menu (AppTabBar); WhatsApp help stays up here. */}
        <a
          href={whatsappLink(CONTACT_WHATSAPP, 'Halo Customer Care Jentis Kitchen, saya butuh bantuan.')}
          target="_blank"
          rel="noreferrer"
          onClick={() => pathname.endsWith('/checkout') && trackStep('wa_help')}
          aria-label="Chat Customer Care di WhatsApp"
          className="sm:hidden size-10 shrink-0 rounded-xl bg-[#dcfce7] text-[#16a34a] grid place-items-center"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
          </svg>
        </a>
        <nav className="hidden sm:flex items-center gap-2 min-[400px]:gap-3 sm:gap-8 shrink-0">
          <Link
            href={href(customer ? '/account' : '/login')}
            className={
              customer
                ? 'flex items-center gap-1 sm:gap-1.5 rounded-full border border-[#f3d9c4] bg-[#fdf3ea] hover:bg-[#fbe7d6] pl-1.5 pr-2.5 sm:pl-2 sm:pr-3 py-1.5 text-[#7c2d12] font-bold text-sm sm:text-base'
                : 'flex items-center gap-2 text-[#374151] font-bold text-base'
            }
            aria-label={customer ? `Akun saya (${customer.name})` : 'Masuk'}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shopAsset('/icons/user.svg')} alt="" width={20} height={20} className="size-5" />
            {customer ? <span className="whitespace-nowrap">{shortFirstName(customer.name)}</span> : <span className="hidden sm:inline">Masuk</span>}
          </Link>
          <Link
            href={href('/checkout')}
            className="flex items-center gap-2 sm:gap-3 bg-[#9a3412] hover:bg-[#7c2d12] text-white font-bold text-base sm:text-lg leading-7 px-3 sm:px-4 py-2 sm:py-3 rounded-xl drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
            aria-label={`Keranjang, ${cartCount} item`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shopAsset('/icons/bag.svg')} alt="" width={14} height={16} className="w-[14px] h-4" />
            <span className="hidden sm:inline">Keranjang</span>
            <span>({cartCount})</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
