'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { trackMeta } from '@/lib/client/metaPixel';
import QtyStepper from './QtyStepper';
import { CONTACT_WHATSAPP, formatRupiah, whatsappLink } from '@/lib/shop/catalog';
import { useShop } from './ShopProvider';

/** Product page (and recipe pages): add to cart / change quantity, then go to checkout. */
/** `sticky`: product pages on phones get the buttons in a bar fixed to the bottom of the screen (app layout, 2026-11-12). */
export default function ProductBuyBox({
  product,
  name,
  price,
  trackView = true,
  sticky = false,
}: {
  product: string;
  name: string;
  price: number;
  trackView?: boolean;
  sticky?: boolean;
}) {
  const { cart, setQty, href } = useShop();
  const qty = cart[product] ?? 0;

  // Meta: this product was seen.
  useEffect(() => {
    if (trackView) trackMeta('ViewContent', { content_type: 'product', content_ids: [product], value: price, currency: 'IDR' });
  }, [product, price, trackView]);

  const bar = sticky && (
    // Above the snack bar's layer, below pop-ups.
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-[45] flex items-center gap-2.5 border-t border-[#eee7df] bg-white px-3.5 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(59,26,12,0.08)]">
      <a
        href={whatsappLink(CONTACT_WHATSAPP, `Halo Jentis Kitchen, saya mau tanya tentang ${name}.`)}
        target="_blank"
        rel="noreferrer"
        aria-label="Tanya lewat WhatsApp"
        className="size-12 shrink-0 rounded-[14px] bg-[#dcfce7] text-[#16a34a] grid place-items-center"
      >
        <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
        </svg>
      </a>
      {qty === 0 ? (
        <button type="button" onClick={() => setQty(product, 1)} className="h-12 flex-1 rounded-[14px] bg-[#9a3412] text-white text-[15px] font-bold shadow-[0_6px_16px_rgba(154,52,18,0.28)]">
          Tambah · {formatRupiah(price)}
        </button>
      ) : (
        <>
          <QtyStepper variant="mini" value={qty} max={50} onChange={(n) => setQty(product, n)} label={name} />
          <Link href={href('/checkout')} className="h-12 flex-1 rounded-[14px] bg-[#9a3412] text-white text-[15px] font-bold grid place-items-center shadow-[0_6px_16px_rgba(154,52,18,0.28)]">
            Checkout
          </Link>
        </>
      )}
    </div>
  );

  return (
    <>
    <div className={`flex flex-col gap-3 ${sticky ? 'max-sm:hidden' : ''}`}>
      {qty === 0 ? (
        <button
          type="button"
          onClick={() => setQty(product, 1)}
          className="w-full py-4 rounded-2xl bg-[#9a3412] hover:bg-[#7c2d12] text-white text-lg font-bold"
        >
          Tambah ke keranjang
        </button>
      ) : (
        <>
          <QtyStepper value={qty} max={50} onChange={(n) => setQty(product, n)} label={name} />
          <Link href={href('/checkout')} className="w-full py-4 rounded-2xl bg-[#9a3412] hover:bg-[#7c2d12] text-white text-lg font-bold text-center">
            Checkout
          </Link>
        </>
      )}
    </div>
    {bar}
    </>
  );
}
