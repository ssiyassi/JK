import type { Metadata } from 'next';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { playfair } from '../fonts';
import StampPortal from './StampPortal';

// Reseller stamp card: resellers type their WhatsApp number and see their four level cards for this period
// (src/lib/notify/stamps.ts). Standalone like the other reseller pages (isStandalonePage).
export const metadata: Metadata = {
  title: 'Kartu Stamp Reseller',
  description: 'Cek kartu stamp reward reseller Jentis Kitchen: berapa box lagi menuju hadiah berikutnya.',
  robots: { index: false },
};

export default function StampPage() {
  return (
    <div className={`${playfair.variable} max-w-md mx-auto`}>
      <div className="flex items-center justify-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/shop/brand/logo.png" alt="" className="h-10 w-auto" />
        <span className="font-[family-name:var(--font-brand)] text-[34px] leading-none text-[#9a3412]">Jentis Kitchen</span>
      </div>
      <h1 className="mt-1 text-center font-[family-name:var(--font-heading)] text-2xl font-bold text-[#3b1a0c]">Kartu Stamp Reseller</h1>
      <StampPortal whatsapp={CONTACT_WHATSAPP} />
    </div>
  );
}
