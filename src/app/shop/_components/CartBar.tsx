'use client';

import Link from 'next/link';
import { trackStep } from '@/lib/client/metaPixel';
import { cartWhatsAppText, CONTACT_WHATSAPP, formatRupiah, FREE_DELIVERY_FROM, shopAsset, whatsappLink } from '@/lib/shop/catalog';
import { useShop } from './ShopProvider';
import { bundlePicksText } from '@/lib/shop/bundles';

/** WhatsApp logo (same drawing as the phone header). */
export function WhatsAppIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-current`} aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
    </svg>
  );
}

/**
 * Floating cart summary at the bottom of the homepage, with the free-delivery progress message.
 * The small "Tanya via WA" link in the strip (owner, 2026-11-13) opens a chat with the cart already typed, for shoppers who are unsure
 * and would otherwise leave; each tap is counted as a wa_cart step.
 */
export default function CartBar() {
  const { catalog, cart, cartBundles, cartCount, cartReady, cartSubtotal, cartOriginal, cartFreeDelivery, href } = useShop();
  if (!cartReady || cartCount === 0) return null;
  const subtotal = cartSubtotal;
  // "Harga coret": what the same packs would cost at their original prices (bundles: their crossed-out total).
  const original = cartOriginal;
  const saving = original - subtotal;
  const free = cartFreeDelivery || cartCount >= FREE_DELIVERY_FROM;
  const missing = FREE_DELIVERY_FROM - cartCount;
  const lines = [
    ...cartBundles.map((x) => ({ name: `${x.bundle.name} (${bundlePicksText(x.picks, catalog)})`, qty: 1 })),
    ...catalog.filter((i) => (cart[i.product] ?? 0) > 0).map((i) => ({ name: i.name, qty: cart[i.product] ?? 0 })),
  ];
  const waHref = whatsappLink(CONTACT_WHATSAPP, cartWhatsAppText(lines));
  const checkout = href('/checkout');

  return (
    <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] sm:bottom-0 inset-x-0 z-30 px-4 sm:px-8 pb-2.5 sm:pb-4 pointer-events-none">
      <div className="pointer-events-auto max-w-[1856px] mx-auto rounded-xl overflow-hidden shadow-[0px_2px_8px_rgba(0,0,0,0.18)]">
        <div
          className={`flex items-center gap-3 pl-6 pr-4 py-2 text-xs font-semibold text-white ${
            free ? 'bg-[#16a34a]' : 'bg-[#9a3412] bg-[radial-gradient(ellipse_at_60%_120%,rgba(222,130,100,0.55),transparent_70%)]'
          }`}
        >
          <Link href={checkout} className="flex-1 min-w-0 truncate">
            {free ? 'Kamu dapat FREE ONGKIR ✓' : `Tambah ${missing} box lagi, gratis ongkir!`}
          </Link>
          {/* Quiet WhatsApp link in the strip (owner 13 Nov: the big green pill next to the price was too disturbing). */}
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackStep('wa_cart', 'cart_bar')}
            className="shrink-0 flex items-center gap-1 text-white/90 underline underline-offset-2 decoration-white/50"
          >
            <WhatsAppIcon className="size-3.5" />
            Tanya via WA
          </a>
        </div>
        <div className="bg-white pl-6 pr-4 py-2.5 flex items-center justify-between gap-3">
          <Link href={checkout} className="flex-1 min-w-0 flex flex-col gap-[5px]">
            <span className="text-xs leading-[14px] text-[#15181b] whitespace-nowrap">Subtotal ({cartCount} Barang)</span>
            <span className="flex items-end gap-2.5 text-[#15181b]">
              <span className="text-lg leading-[18px] font-bold whitespace-nowrap">{formatRupiah(subtotal)}</span>
              {saving > 0 && <span className="text-[10px] line-through">{formatRupiah(original)}</span>}
            </span>
            {saving > 0 && <span className="text-[10px] leading-[14px] font-medium text-[#48ad37]">Kamu Hemat {formatRupiah(saving)}!</span>}
          </Link>
          <Link
            href={checkout}
            aria-label="Lanjut ke checkout"
            className="size-[42px] shrink-0 rounded-full bg-[#bf6344] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.08)] flex items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shopAsset('/icons/bag-round.svg')} alt="" width={18} height={22} />
          </Link>
        </div>
      </div>
    </div>
  );
}
