import type { Metadata } from 'next';
import Link from 'next/link';
import { getDB } from '@/lib/server';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { getPaydayPromo, paydayEnded, paydayMonth, paydayPeriod, PAYDAY_PATH, PAYDAY_SITE } from '@/lib/shop/payday';
import { shopBase } from '@/lib/shop/server';
import { playfair } from '../fonts';
import PosterMaker, { PosterMakerTopButton } from './PosterMaker';

// Public Payday Promo page, edited each month in Website → Payday. Its link goes into the WhatsApp message to resellers,
// so WhatsApp shows the poster as the preview. Standalone like the reseller reward page (isStandalonePage): the only
// ways out are back to WhatsApp or the product photos.
export async function generateMetadata(): Promise<Metadata> {
  const promo = await getPaydayPromo(getDB());
  const title = `Payday Promo ${paydayMonth(promo)} — ${paydayPeriod(promo)}`;
  const description = promo.caption.split('\n')[0];
  return {
    title,
    description,
    metadataBase: new URL(PAYDAY_SITE),
    alternates: { canonical: PAYDAY_PATH },
    openGraph: { type: 'website', url: PAYDAY_PATH, siteName: 'Jentis Kitchen', title, description, images: [{ url: promo.image, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [promo.image] },
  };
}

const BUTTON = 'flex-1 text-center rounded-full font-semibold px-5 py-3';

export default async function PaydayPromoPage() {
  const [promo, base] = await Promise.all([getPaydayPromo(getDB()), shopBase()]);
  const ended = paydayEnded(promo, Date.now());
  const lines = promo.caption.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className={`${playfair.variable} max-w-xl mx-auto`}>
      <h1 className="font-[family-name:var(--font-heading)] text-center text-2xl sm:text-3xl font-bold text-[#3b1a0c]">
        Payday Promo {paydayMonth(promo)}
      </h1>
      <p className="mt-1 mb-4 text-center font-semibold text-[#9a3412]">{paydayPeriod(promo)}</p>
      {ended && (
        <div className="mb-4 rounded-2xl bg-[#3b1a0c] px-4 py-3 text-center text-sm text-white">
          <b>Promo sudah berakhir.</b> Nantikan Payday Promo bulan depan ya!
        </div>
      )}
      <PosterMakerTopButton />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={promo.image} alt={`Payday Promo ${paydayMonth(promo)}`} className={`w-full h-auto rounded-2xl shadow-md ${ended ? 'opacity-60' : ''}`} />
      <p className="mt-2 text-center text-xs text-[#8a7a6d]">Ketuk dan tahan foto untuk menyimpan.</p>
      {lines.length > 0 && (
        <div className="mt-4 rounded-2xl bg-[#fdf3ea] p-4 sm:p-5 text-sm">
          <ul className="space-y-1.5 list-disc pl-5">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      <PosterMaker />
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
