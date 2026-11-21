'use client';

import Link from 'next/link';
import { formatRupiah, type CatalogItem } from '@/lib/shop/catalog';
import ProductArt from './ProductArt';
import { useShop } from './ShopProvider';

const round = 'size-10 rounded-xl bg-white/90 text-[#111827] grid place-items-center shadow-[0_2px_8px_rgba(0,0,0,0.15)]';

/** Phones: back, share and cart buttons on top of the product photo (approved design 2026-11-12). */
export function ProductPhotoButtons() {
  const { href, cartCount, cartReady } = useShop();
  const back = () => (window.history.length > 1 ? window.history.back() : (window.location.href = href('/')));
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* closed */
    }
  };
  return (
    <div className="absolute left-3 right-3 top-3 flex gap-2">
      <button type="button" onClick={back} aria-label="Kembali" className={round}>
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 6-6 6 6 6" />
        </svg>
      </button>
      <span className="flex-1" />
      <button type="button" onClick={() => void share()} aria-label="Bagikan" className={round}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5" />
          <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
      </button>
      <Link href={href('/checkout')} aria-label={`Keranjang, ${cartCount} item`} className={`${round} relative`}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
        </svg>
        {cartReady && cartCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ef4444] border-2 border-white text-white text-[10px] font-extrabold grid place-items-center">
            {cartCount}
          </span>
        )}
      </Link>
    </div>
  );
}

/** Phones: "Lengkapi pesananmu", the other products with a one-tap "+". */
export function CompleteOrder({ items }: { items: (CatalogItem & { path: string })[] }) {
  const { cart, setQty, href } = useShop();
  if (!items.length) return null;
  return (
    <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {items.map((o) => {
        const qty = cart[o.product] ?? 0;
        return (
          <div key={o.product} className="w-[150px] shrink-0 overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
            <div className="relative">
              <Link href={href(o.path)} aria-label={o.name}>
                <ProductArt item={o} className="w-full aspect-square" />
              </Link>
              <button
                type="button"
                onClick={() => setQty(o.product, qty + 1)}
                aria-label={`Tambah ${o.name}`}
                className="absolute right-2 -bottom-[18px] size-10 rounded-full border-[3px] border-white bg-[#9a3412] text-white grid place-items-center shadow-[0_4px_12px_rgba(154,52,18,0.35)]"
              >
                {qty > 0 ? (
                  <span className="text-sm font-extrabold">{qty}</span>
                ) : (
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
              </button>
            </div>
            <div className="px-2.5 pt-3 pb-3">
              <p className="min-h-[34px] pr-7 text-[13px] font-bold leading-tight text-[#111827]">{o.name}</p>
              <p className="mt-1 text-[15px] font-extrabold text-[#9a3412]">{formatRupiah(o.price)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
