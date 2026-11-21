'use client';

import Link from 'next/link';
import { shopAsset } from '@/lib/shop/catalog';
import { useShop } from './ShopProvider';

/**
 * Login page promo box: "Belum punya akun? Daftar sekarang, dapat voucher" (welcome %), links to the register page.
 * (The homepage uses the owner's image banners instead, see PromoBanners.tsx.)
 * `compact` keeps the phone sizes on every screen (narrow columns such as the login page); otherwise it grows on wider
 * screens.
 */
export default function RegisterPromo({ href, compact = false, className = '' }: { href: string; compact?: boolean; className?: string }) {
  const { welcomeVoucher } = useShop();
  const wide = (cls: string) => (compact ? '' : cls);
  return (
    <Link
      href={href}
      className={`group relative isolate flex items-center gap-3 ${wide('sm:gap-6 sm:rounded-3xl sm:py-3 sm:pl-4 sm:pr-8')} overflow-hidden rounded-2xl border border-[#f6dcc5] bg-[#fdf4ea] py-2 pl-2 pr-4 shadow-[0_4px_14px_-6px_rgba(154,52,18,0.15)] ${className}`}
    >
      <span aria-hidden className={`absolute -right-10 -top-16 -z-10 size-44 ${wide('sm:size-60')} rounded-full bg-[#fbe6d2]/70`} />
      <span aria-hidden className="absolute -left-6 -bottom-10 -z-10 size-24 rounded-full bg-[#fbeadb]/60" />
      <img
        src={shopAsset('/icons/voucher-promo.webp')}
        alt=""
        width={196}
        height={180}
        className={`h-[76px] ${wide('sm:h-[120px]')} w-auto shrink-0 [mask-image:radial-gradient(ellipse_at_center,black_58%,transparent_74%)]`}
      />
      <span className="flex-1 min-w-0">
        <span className={`block text-sm ${wide('sm:text-xl')} text-[#2b211b]`}>Belum punya akun?</span>
        <span className={`block text-base leading-snug ${wide('sm:text-[28px] sm:leading-9')} font-bold text-[#9a3412]`}>
          Daftar sekarang, dapat voucher {welcomeVoucher.percent}%
        </span>
      </span>
      <span
        className={`shrink-0 flex items-center justify-center size-10 ${wide('sm:size-14')} rounded-full bg-[#fbe3cf] text-[#9a3412] transition-transform group-hover:translate-x-0.5`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`size-5 ${wide('sm:size-6')}`}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}
