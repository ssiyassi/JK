import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { shopBase } from '@/lib/shop/server';
import { playfair } from '../../fonts';
import { getDB } from '@/lib/server';
import { getPaydayPromo, paydayMonth } from '@/lib/shop/payday';
import { listPromoPhotos } from '@/lib/shop/promo-photos';
import PhotoGrid, { type Photo } from './PhotoGrid';

// Photos resellers can save for their own promotion (managed in Website → Promo Photos), opened from the reward and
// Payday pages. Standalone like those pages (isStandalonePage): the only ways out are the poster and WhatsApp.
export const metadata: Metadata = {
  title: 'Foto Produk untuk Promosi',
  robots: { index: false },
};

const BUTTON = 'flex-1 text-center rounded-full font-semibold px-5 py-3';

export default async function ResellerPhotosPage() {
  const db = getDB();
  const [base, promo, stored] = await Promise.all([shopBase(), getPaydayPromo(db), listPromoPhotos(db)]);
  // The current Payday poster first (Website → Payday), then the photos from Website → Promo Photos.
  const photos: Photo[] = [{ full: promo.image, thumb: promo.image, label: `Poster Payday Promo ${paydayMonth(promo)}` }, ...stored];
  return (
    <div className={`${playfair.variable} max-w-xl mx-auto`}>
      <h1 className="font-[family-name:var(--font-heading)] text-center text-2xl sm:text-3xl font-bold text-[#3b1a0c]">Foto Produk untuk Promosi</h1>
      <p className="mt-2 mb-4 text-center text-sm text-[#5c4d42]">Ketuk foto untuk menyimpan ke galeri.</p>
      <PhotoGrid photos={photos} />
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <a href={`https://wa.me/${CONTACT_WHATSAPP}`} className={`${BUTTON} bg-[#25D366] text-white`}>
          Kembali ke WhatsApp
        </a>
        <Link href={`${base}/hadiah-reseller`} className={`${BUTTON} border-2 border-[#9a3412] text-[#9a3412]`}>
          Lihat poster hadiah
        </Link>
      </div>
    </div>
  );
}
