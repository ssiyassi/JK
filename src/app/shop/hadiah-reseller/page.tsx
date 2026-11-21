import type { Metadata } from 'next';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { shopBase } from '@/lib/shop/server';
import { playfair } from '../fonts';
import Link from 'next/link';

// Public reseller reward poster (Nov–Dec 2026). Its link goes at the end of the Sunday WhatsApp recap, so WhatsApp
// shows the wide preview image in the chat. Standalone: no shop header or footer (isStandalonePage), the only ways
// out are back to WhatsApp or the product photos. Preview tags need absolute URLs, hence the fixed domain.
const SITE = 'https://jentiskitchen.id';
const POSTER = '/shop/reseller/hadiah-nov-des-2026-status.jpg';
const PREVIEW = '/shop/reseller/hadiah-nov-des-2026-preview-v2.jpg';
const TITLE = 'Hadiah Reseller November – Desember 2026';
const DESCRIPTION = '15 box GRATIS 1 box · 25 box GRATIS 2 box LAGI · 65 box CASH Rp650.000 · 100 box CASH Rp2.350.000 LAGI';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL(SITE),
  alternates: { canonical: '/hadiah-reseller' },
  openGraph: {
    type: 'website',
    url: '/hadiah-reseller',
    siteName: 'Jentis Kitchen',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: PREVIEW, width: 1200, height: 630, alt: TITLE }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [PREVIEW] },
};

const TIERS = [
  ['15 box', 'GRATIS 1 box'],
  ['25 box', 'GRATIS 2 box LAGI'],
  ['65 box', 'CASH Rp650.000'],
  ['100 box', 'CASH Rp2.350.000 LAGI'],
];

const BUTTON = 'flex-1 text-center rounded-full font-semibold px-5 py-3';

export default async function ResellerRewardPage() {
  const base = await shopBase();
  return (
    <div className={`${playfair.variable} max-w-xl mx-auto`}>
      <h1 className="font-[family-name:var(--font-heading)] text-center text-2xl sm:text-3xl font-bold text-[#3b1a0c] mb-4">{TITLE}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={POSTER} width={1080} height={1920} alt={TITLE} className="w-full h-auto rounded-2xl shadow-md" />
      <p className="mt-2 text-center text-xs text-[#8a7a6d]">Ketuk dan tahan foto untuk menyimpan.</p>
      <div className="mt-4 rounded-2xl bg-[#fdf3ea] p-4 sm:p-5 text-sm">
        <ul className="space-y-1.5">
          {TIERS.map(([q, r]) => (
            <li key={q}>
              <b>{q}</b> → {r}
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1 text-[#5c4d42] list-disc pl-5">
          <li>Dihitung dari semua order 1 November – 31 Desember 2026.</li>
          <li>Paket Payday: setiap 3 box dihitung 2 box. Box gratis tidak ikut dihitung.</li>
          <li>Setelah 100 box, hitungan mulai lagi dari 0 dan hadiah bisa didapat lagi.</li>
          <li>Progres kamu kami kirim lewat WhatsApp setiap hari Minggu.</li>
        </ul>
      </div>
      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        <a href={`https://wa.me/${CONTACT_WHATSAPP}`} className={`${BUTTON} bg-[#25D366] text-white`}>
          Kembali ke WhatsApp
        </a>
        <Link href={`${base}/hadiah-reseller/foto`} className={`${BUTTON} border-2 border-[#9a3412] text-[#9a3412]`}>
          Foto produk untuk promosi
        </Link>
      </div>
    </div>
  );
}
