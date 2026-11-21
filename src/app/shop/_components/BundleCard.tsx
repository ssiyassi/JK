'use client';

import Link from 'next/link';
import { bundleTotals, slotOptions, type Bundle } from '@/lib/shop/bundles';
import { formatRupiah, type CatalogItem } from '@/lib/shop/catalog';
import BundleCountdown, { useWeeklyNote } from './BundleCountdown';
import ProductArt from './ProductArt';
import { useShop } from './ShopProvider';

const rp = (n: number) => formatRupiah(n).replace(/\s/g, '');

/** Up to 3 product photos for a bundle: the first product allowed in each pick, different ones when possible. */
export function bundlePhotos(b: Bundle, catalog: CatalogItem[]): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const slot of b.slots) {
    const options = slotOptions(slot, catalog);
    const pick = options.find((o) => !out.includes(o)) ?? options[0];
    if (pick) out.push(pick);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * "PAKET HEMAT" cards at the top of Menu Kami (owner, 2026-11-13): dark card, 3 stacked photos, price with the
 * crossed-out total, free delivery and the saving on one line, and "Pilih isi paket →" to the bundle page.
 */
export default function BundleCards() {
  const { bundles, catalog, href } = useShop();
  if (!bundles.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
      {bundles.map((b) => {
        const { compareAt } = bundleTotals(b, catalog);
        const saves = compareAt - b.price;
        const photos = bundlePhotos(b, catalog);
        return (
          <Link
            key={b.id}
            href={href(`/paket/${b.slug}`)}
            className="block overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,#3b1a0c,#7c2d12)] text-white shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]"
          >
            <div className="flex items-center gap-3 p-3.5">
              <div className="relative h-[92px] w-[96px] shrink-0">
                {photos.map((p, i) => (
                  <ProductArt
                    key={i}
                    item={p}
                    className={`absolute size-[62px] rounded-[14px] border-[2.5px] border-white shadow-[0_4px_10px_rgba(0,0,0,0.3)] ${
                      ['left-0 top-0', 'left-[34px] top-1.5 z-[2]', 'left-[16px] top-[30px] z-[3]'][i]
                    }`}
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1.5">
                  <span className="mt-0.5 inline-block whitespace-nowrap rounded-full bg-[#fbbf24] px-2 py-[3px] text-[10.5px] font-extrabold tracking-[0.02em] text-[#3b1a0c]">PAKET HEMAT</span>
                  <BundleCountdown bundle={b} tone="dark" />
                </div>
                <p className="mt-1.5 truncate font-[family-name:var(--font-heading)] text-[19px] font-extrabold leading-tight">{b.tagline ? b.tagline.split(',')[0] : b.name}</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <b className="text-lg font-extrabold">{rp(b.price)}</b>
                  {saves > 0 && <s className="text-xs opacity-60">{rp(compareAt)}</s>}
                </p>
                <p className="mt-0.5 whitespace-nowrap text-[11.5px] opacity-90">
                  {b.freeDelivery && '🚚 Gratis ongkir'}
                  {b.freeDelivery && saves > 0 && ' · '}
                  {saves > 0 && <b>Hemat {rp(saves)}</b>}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between bg-white/10 px-3.5 py-2.5 text-[13px] font-bold">
              <BundleNote bundle={b} />
              <span className="rounded-full bg-white px-3 py-1.5 text-[12.5px] text-[#9a3412]">Pilih isi paket →</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** "Hanya Kamis–Minggu" while a weekly bundle counts down, else the usual line. */
function BundleNote({ bundle }: { bundle: Bundle }) {
  const weekly = useWeeklyNote(bundle);
  return <span>{weekly ? `⏰ ${weekly}` : 'Campur rasa sesukamu'}</span>;
}
