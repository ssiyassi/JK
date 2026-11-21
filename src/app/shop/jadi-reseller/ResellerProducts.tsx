'use client';

import { halalNote, meatOf } from '@/lib/shop/productInfo';
import ProductArt from '../_components/ProductArt';
import { useShop } from '../_components/ShopProvider';

/**
 * The meat boxes a reseller sells, with the pork / not-halal note on each, so everyone (e.g. Muslim buyers) knows
 * what they would be selling before they ask on WhatsApp. Same catalog as the homepage.
 */
export default function ResellerProducts() {
  const { catalog } = useShop();
  const items = catalog.filter((item) => meatOf(item) && /500/.test(item.size ?? ''));
  if (!items.length) return null;
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3">
      {items.map((item) => {
        const meat = meatOf(item)!;
        return (
          <li key={item.product} className="overflow-hidden rounded-2xl border border-[#f3d9c4] bg-white">
            <ProductArt item={item} className="w-full aspect-square" />
            <div className="p-3">
              <p className="font-bold leading-5">{item.name}</p>
              <p className="text-xs text-[#8a7a6d]">{item.size}</p>
              <p className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${meat === 'babi' ? 'bg-[#fee2e2] text-[#b91c1c]' : 'bg-[#fef3c7] text-[#92400e]'}`}>
                {meat === 'babi' ? 'Babi · non-halal' : 'Sapi · belum bersertifikat halal'}
              </p>
              <p className="mt-1.5 text-[11px] leading-4 text-[#5c4d42]">{halalNote(meat)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
