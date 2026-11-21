'use client';

import { whatsappOrderLink } from '@/lib/shop/catalog';
import { useShop } from './ShopProvider';

/**
 * Phones: buttons fixed to the bottom of an order page (owner, 2026-11-12): WhatsApp help, and "Pesan lagi" (same
 * products into the cart, then checkout) once the order is paid or cancelled.
 */
export default function OrderStickyBar({
  orderId,
  lines,
  reorder,
}: {
  orderId: string;
  lines: { product: string; qty: number; bundle?: { id: string; key: string } }[];
  reorder: boolean;
}) {
  const { catalog, bundles, setQty, addBundle, href } = useShop();
  const available = lines.filter((l) => catalog.some((c) => c.product === l.product));
  const again = () => {
    // A bundle still on sale goes back in as the bundle (same packs); otherwise its packs go in as single products.
    const loose = new Map<string, number>();
    const keys = [...new Set(available.filter((l) => l.bundle).map((l) => l.bundle!.key))];
    for (const key of keys) {
      const own = available.filter((l) => l.bundle?.key === key);
      const bundle = bundles.find((b) => b.id === own[0].bundle!.id);
      const picks = bundle ? fitPicks(own.flatMap((l) => Array(l.qty).fill(l.product) as string[]), bundle.slots, catalog.map((c) => c.product)) : null;
      if (bundle && picks) addBundle(bundle.id, picks);
      else for (const l of own) loose.set(l.product, (loose.get(l.product) ?? 0) + l.qty);
    }
    for (const l of available.filter((x) => !x.bundle)) loose.set(l.product, (loose.get(l.product) ?? 0) + l.qty);
    for (const [product, qty] of loose) setQty(product, Math.min(50, qty));
    // Let the cart save to this browser first.
    setTimeout(() => (window.location.href = href('/checkout')), 150);
  };
  return (
    <>
      <div className="sm:hidden h-20" aria-hidden />
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-[45] flex gap-2.5 border-t border-[#eee7df] bg-white px-3.5 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(59,26,12,0.08)]">
        <a
          href={whatsappOrderLink(orderId)}
          target="_blank"
          rel="noreferrer"
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#16a34a] text-[15px] font-bold text-white"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
          </svg>
          Butuh bantuan
        </a>
        {reorder && available.length > 0 && (
          <button type="button" onClick={again} className="h-12 flex-1 rounded-[14px] bg-[#9a3412] text-[15px] font-bold text-white">
            Pesan lagi
          </button>
        )}
      </div>
    </>
  );
}

/** Puts the packs into the bundle's slots (each slot allows only some products); null when they no longer fit. */
function fitPicks(packs: string[], slots: string[][], onSale: string[]): string[] | null {
  if (packs.length !== slots.length) return null;
  const out: string[] = [];
  const left = [...packs];
  const place = (i: number): boolean => {
    if (i === slots.length) return true;
    for (const p of [...new Set(left)]) {
      if (!slots[i].includes(p) || !onSale.includes(p)) continue;
      left.splice(left.indexOf(p), 1);
      out[i] = p;
      if (place(i + 1)) return true;
      left.push(p);
    }
    return false;
  };
  return place(0) ? out : null;
}
