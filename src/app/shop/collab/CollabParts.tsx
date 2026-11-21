// Shared look of the influencer pages (jentiskitchen.id/collab and /collab/<slug>): cream background with dots,
// taped polaroid photos, round stickers — the same style as the printed proposal cover.

import Link from 'next/link';
import { deliveryFee, FREE_DELIVERY_FROM, formatRupiah, type CatalogItem } from '@/lib/shop/catalog';
import { productPath } from '@/lib/shop/productInfo';
import ProductArt from '../_components/ProductArt';
import ProductLabels from '../_components/ProductLabels';

export const BROWN = '#3b1a0c';

/** Cream panel with a light dot pattern. */
export function DotPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`relative overflow-hidden rounded-3xl bg-[#fdf3ea] ${className}`}
      style={{ backgroundImage: 'radial-gradient(#ecd5bf 1.5px, transparent 1.6px)', backgroundSize: '20px 20px' }}
    >
      {children}
    </section>
  );
}

function Polaroid({ src, caption, className, captionAlign = 'text-center' }: { src: string; caption: string; className: string; captionAlign?: string }) {
  return (
    <figure className={`absolute bg-white p-2 pb-8 rounded-md shadow-[0_12px_28px_rgba(59,26,12,.28)] ${className}`}>
      <span aria-hidden className="absolute -top-3 left-1/2 -ml-10 h-6 w-20 -rotate-3 bg-[#d9b99f]/80" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover rounded-sm" loading="eager" />
      <figcaption className={`absolute inset-x-3 bottom-1 ${captionAlign} font-[family-name:var(--font-brand)] text-2xl leading-7 text-[#7c2d12]`}>{caption}</figcaption>
    </figure>
  );
}

/** Three taped photos with two stickers; fixed height, scales down on small phones. */
export function PhotoCollage({ stickerTop, stickerBottom }: { stickerTop: React.ReactNode; stickerBottom: React.ReactNode }) {
  return (
    <div className="relative mx-auto h-[360px] w-full max-w-[400px] sm:h-[420px]" aria-hidden>
      <Polaroid src="/shop/collab/grill.jpg" caption="panggang" captionAlign="text-left" className="left-[2%] top-6 h-[230px] w-[48%] -rotate-6 sm:h-[270px]" />
      <Polaroid src="/shop/collab/plate.jpg" caption="full daging" captionAlign="text-right" className="right-[2%] top-0 h-[230px] w-[48%] rotate-6 sm:h-[270px]" />
      <Polaroid src="/shop/collab/stack.jpg" caption="siap makan" className="left-[27%] top-[150px] z-10 h-[200px] w-[46%] -rotate-2 sm:top-[170px] sm:h-[230px]" />
      <div className="absolute -left-1 bottom-2 z-20 flex h-[104px] w-[104px] -rotate-12 flex-col items-center justify-center rounded-full bg-[#f4b740] text-center text-[#3b1a0c] shadow-[0_5px_0_#c98a1a]">
        {stickerBottom}
      </div>
      <div className="absolute -right-1 bottom-0 z-20 sm:bottom-10 flex h-[112px] w-[112px] rotate-12 flex-col items-center justify-center rounded-full border-[3px] border-dashed border-[#f6dcc4] bg-[#7c2d12] text-center text-white outline outline-[5px] outline-[#7c2d12]">
        {stickerTop}
      </div>
    </div>
  );
}

export function SectionTitle({ kicker, children }: { kicker?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      {kicker && <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#9a3412]">{kicker}</p>}
      <h2 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-bold text-[#3b1a0c]">{children}</h2>
    </div>
  );
}

export function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd]">
      <p className="text-3xl" aria-hidden>
        {icon}
      </p>
      <p className="mt-2 font-bold text-[#3b1a0c]">{title}</p>
      <div className="mt-1 text-sm text-[#5c4d42] leading-6">{children}</div>
    </div>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 text-[15px] leading-6 text-[#5c4d42]">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#9a3412]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The products on sale with live prices (from Website → Products): normal price, crossed-out price and what a new
 * customer pays for one box with the first-order discount.
 */
export function ProductShowcase({
  title,
  products,
  base,
  welcome,
  note,
}: {
  title: string;
  products: CatalogItem[];
  base: string;
  welcome: { percent: number; cap: number };
  note?: string;
}) {
  const newCustomerPrice = (price: number) => price - Math.min(Math.floor((price * welcome.percent) / 100), welcome.cap);
  return (
    <section>
      <SectionTitle kicker="Produk kami">{title}</SectionTitle>
      <p className="-mt-2 mb-4 max-w-3xl text-[15px] leading-7 text-[#5c4d42]">
        Daging BBQ marinasi siap panggang. Full daging, sudah dibumbui resep rumahan kami dan dibekukan. Tinggal panggang, goreng, atau masak di teflon.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {products.map((item) => (
          <article key={item.product} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#f1e7dd]">
            <Link href={`${base}${productPath(item)}`} aria-label={`Lihat detail ${item.name}`}>
              <ProductArt item={item} className="aspect-square w-full" />
            </Link>
            <div className="flex flex-1 flex-col p-3 sm:p-4">
              <h3 className="text-[15px] font-bold leading-5 sm:text-base">
                <Link href={`${base}${productPath(item)}`} className="hover:underline">
                  {item.name}
                </Link>
              </h3>
              <p className="pb-2 pt-1 text-sm text-[#8a7a6d]">{item.size}</p>
              <ProductLabels item={item} className="pb-2" />
              <div className="mt-auto pt-1">
                {item.compareAtPrice && <p className="text-xs text-[#9ca3af] line-through">{formatRupiah(item.compareAtPrice)}</p>}
                <p className="font-[family-name:var(--font-heading)] text-xl font-bold text-[#9a3412] sm:text-2xl">{formatRupiah(item.price)}</p>
                <p className="mt-2 rounded-lg bg-[#fdf3ea] px-2 py-1.5 text-xs leading-4 text-[#5c4d42]">
                  Pelanggan baru: <b className="whitespace-nowrap text-[#3b1a0c]">{formatRupiah(newCustomerPrice(item.price))}</b>
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#8a7a6d]">
        Harga pelanggan baru untuk pembelian 1 box dengan diskon {welcome.percent}% (maks. {formatRupiah(welcome.cap)} per pesanan). Ongkir {formatRupiah(deliveryFee(1))} untuk 1 box,
        gratis mulai {FREE_DELIVERY_FROM} box.
      </p>
      {note && <p className="mt-2 rounded-xl bg-[#fdf3ea] px-3 py-2 text-sm leading-6 text-[#5c4d42]">{note}</p>}
    </section>
  );
}

export const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
/** 10000 → "10rb" for the sticker. */
export const shortRupiah = (n: number) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}rb` : rupiah(n));
