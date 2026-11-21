import type { CatalogItem } from '@/lib/shop/catalog';
import { HOT_LABEL, HOT_PRODUCTS, MEAT_LABELS, meatOf } from '@/lib/shop/productInfo';

const COLORS = {
  green: 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]',
  blue: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]',
  red: 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]',
};

/** "3-4 porsi makan" (green) and "100% tanpa lemak" (blue) pills on meat products (product cards and product pages), plus
 * "Cepat habis" (red) first on the HOT_PRODUCTS. */
export default function ProductLabels({ item, className = '' }: { item: Pick<CatalogItem, 'product' | 'stockColumn' | 'name'>; className?: string }) {
  if (!meatOf(item)) return null;
  const labels = HOT_PRODUCTS.has(item.stockColumn ?? item.product) ? [HOT_LABEL, ...MEAT_LABELS] : MEAT_LABELS;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Keterangan produk">
      {labels.map((l) => (
        <li
          key={l.text}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] sm:text-xs font-semibold leading-5 ${COLORS[l.color]}`}
        >
          <span aria-hidden>{l.icon}</span>
          {l.text}
        </li>
      ))}
    </ul>
  );
}
