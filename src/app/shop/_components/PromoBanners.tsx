'use client';

import Link from 'next/link';
import { shopAsset } from '@/lib/shop/catalog';
import { useShop } from './ShopProvider';

// Promo banners for guests, made by the owner (2026-10-24; 1200×401 transparent webp in public/shop/brand). The texts
// are part of the images, so a change of the voucher terms in the admin needs new images.

const img = 'block w-full h-auto select-none';

/** New-customer discount (20% since 2026-11-11; the number is in the image), applied automatically at checkout: information only. */
export function FirstOrderBanner({ className = '' }: { className?: string }) {
  const { welcomeVoucher } = useShop();
  return (
    <img
      src={shopAsset('/brand/promo-first-order-20.webp')}
      alt={`Pembelian pertama? Diskon ${welcomeVoucher.percent}% langsung di checkout. Tanpa perlu daftar, maks. Rp100.000.`}
      width={1200}
      height={401}
      className={`${img} ${className}`}
    />
  );
}

/** Monthly 20% voucher for accounts: links to the register page (`href`). */
export function MonthlyVoucherBanner({ href, className = '' }: { href: string; className?: string }) {
  return (
    <Link href={href} className={`block transition-transform hover:-translate-y-0.5 ${className}`}>
      <img
        src={shopAsset('/brand/promo-monthly-voucher.webp')}
        alt="Daftar akun: dapat voucher 20% setiap bulan. Dikirim ke email, maks. Rp100.000, berlaku s.d. akhir bulan."
        width={1200}
        height={401}
        className={img}
      />
    </Link>
  );
}
