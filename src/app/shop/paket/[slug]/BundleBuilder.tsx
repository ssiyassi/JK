'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { trackMeta } from '@/lib/client/metaPixel';
import { bundleTotals, shortProductName, slotOptions, type Bundle } from '@/lib/shop/bundles';
import { formatRupiah, type CatalogItem } from '@/lib/shop/catalog';
import { useShop } from '../../_components/ShopProvider';
import { bundlePhotos } from '../../_components/BundleCard';
import { ProductSold } from '../../_components/SocialProof';
import ProductArt from '../../_components/ProductArt';
import BundleCountdown, { useWeeklyNote } from '../../_components/BundleCountdown';
import { Testimonials } from '../../_components/QuickMenu';

const rp = (n: number) => formatRupiah(n).replace(/\s/g, '');
const heading = 'font-[family-name:var(--font-heading)] font-extrabold text-[#3b1a0c]';
const shadow = 'shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]';

/**
 * Picks for a bundle (owner-approved design, 2026-11-13): price and perks on top, then "Pilih pack ke-x" with every
 * product (+ Pilih, or − n + once picked; products a pick does not allow are greyed with "Tidak bisa untuk pack x"),
 * then "Isi paket kamu" with one box per pick, and a sticky bar with the progress and the add-to-cart button.
 * Picks fill the first empty slot; "−" or the × on a box empties a slot again. ?ubah=<n> edits bundle n of the cart.
 */
export default function BundleBuilder({ bundle }: { bundle: Bundle }) {
  const router = useRouter();
  const { catalog, cartBundles, addBundle, setBundleAt, href } = useShop();
  const n = bundle.slots.length;
  const [picks, setPicks] = useState<(string | null)[]>(() => Array(n).fill(null));
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // "Ubah isi" from checkout: start from what that bundle holds now.
  useEffect(() => {
    const i = Number(new URLSearchParams(window.location.search).get('ubah'));
    const item = Number.isInteger(i) && i >= 0 ? cartBundles[i] : undefined;
    if (item && item.bundleId === bundle.id) {
      setEditing(i);
      setPicks(item.picks);
    }
    // Once, when the saved cart is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartBundles.length]);

  useEffect(() => {
    trackMeta('ViewContent', { content_type: 'product_group', content_ids: [`bundle:${bundle.id}`], value: bundle.price, currency: 'IDR' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekly = useWeeklyNote(bundle);
  const { compareAt } = bundleTotals(bundle, catalog);
  const saves = compareAt - bundle.price;
  const photos = bundlePhotos(bundle, catalog);
  const products = useMemo(() => catalog.filter((p) => bundle.slots.some((s) => s.includes(p.product))), [catalog, bundle.slots]);
  const next = picks.indexOf(null); // slot being chosen now (-1 = full)
  const count = picks.filter(Boolean).length;
  const full = next === -1;
  const allowedNow = (p: CatalogItem) => !full && slotOptions(bundle.slots[next], catalog).some((o) => o.product === p.product);
  // A pick that only allows some products: the note under the heading.
  const limitedNow = !full && slotOptions(bundle.slots[next], catalog).length < products.length;
  const limitText = (slot: string[]) => slotOptions(slot, catalog).map(shortProductName).join(' atau ');

  const add = (p: string) => setPicks((cur) => cur.map((x, i) => (i === cur.indexOf(null) ? p : x)));
  const removeOne = (p: string) => setPicks((cur) => {
    const i = cur.lastIndexOf(p);
    return cur.map((x, j) => (j === i ? null : x));
  });
  const clearSlot = (i: number) => setPicks((cur) => cur.map((x, j) => (j === i ? null : x)));

  function submit() {
    if (!full || busy) return;
    setBusy(true);
    const chosen = picks as string[];
    if (editing !== null) setBundleAt(editing, chosen);
    else addBundle(bundle.id, chosen);
    router.push(href('/checkout'));
  }

  const title = full ? (editing !== null ? 'Isi paket sudah lengkap' : 'Mau ganti? Kurangi dulu') : next === 0 && count === 0 ? 'Pilih pack pertama' : `Pilih pack ke-${next + 1}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col pb-40">
      <div className={`-mx-4 -mt-4 grid gap-[3px] sm:mx-0 sm:mt-0 sm:overflow-hidden sm:rounded-2xl ${photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {photos.map((p, i) => (
          <ProductArt key={i} item={p} priority={i === 0} className="aspect-[1/1.1] w-full" />
        ))}
      </div>

      <div className="mt-3.5">
        <div className="flex items-start justify-between gap-2">
          <h1 className={`${heading} min-w-0 text-[26px] leading-tight sm:text-3xl`}>{bundle.name}</h1>
          <div className="mt-1"><BundleCountdown bundle={bundle} tone="light" /></div>
        </div>
        {bundle.tagline && <p className="mt-1 text-[13px] text-[#4b5563]">{bundle.tagline}</p>}
        <p className="mt-3 flex items-baseline gap-2">
          <b className="text-[26px] font-extrabold text-[#9a3412]">{rp(bundle.price)}</b>
          {saves > 0 && <s className="text-[15px] text-[#9ca3af]">{rp(compareAt)}</s>}
        </p>
        <div className="mt-2 flex gap-[5px] overflow-x-auto [scrollbar-width:none]">
          {weekly && <span className="shrink-0 whitespace-nowrap rounded-full bg-[#3b1a0c] px-[7px] py-[5px] text-[11px] font-bold text-white">⏰ {weekly}</span>}
          {saves > 0 && <span className="shrink-0 whitespace-nowrap rounded-full bg-[#fdf3ea] px-[7px] py-[5px] text-[11px] font-bold text-[#9a3412]">💰 Hemat {rp(saves)}</span>}
          {bundle.freeDelivery && <span className="shrink-0 whitespace-nowrap rounded-full bg-[#ecfdf3] px-[7px] py-[5px] text-[11px] font-bold text-[#15803d]">🚚 Gratis ongkir</span>}
          {!bundle.voucherAllowed && <span className="shrink-0 whitespace-nowrap rounded-full bg-[#f3f4f6] px-[7px] py-[5px] text-[11px] font-bold text-[#4b5563]">Tanpa voucher</span>}
        </div>
      </div>

      <div className="mb-2.5 mt-[22px]">
        <h2 className={`${heading} text-[19px]`}>{title}</h2>
        {limitedNow && (
          <p className="mt-1 rounded-xl bg-[#fdf3ea] px-2.5 py-2 text-xs font-semibold text-[#9a3412]">
            Pack {next + 1} khusus {limitText(bundle.slots[next])}
          </p>
        )}
      </div>
      <div className="grid gap-2.5">
        {products.map((p) => {
          const c = picks.filter((x) => x === p.product).length;
          const ok = allowedNow(p);
          const blocked = !full && !ok;
          return (
            <div key={p.product} className={`flex items-center gap-3 rounded-2xl bg-white py-2 pl-2 pr-2.5 ${shadow}`}>
              <ProductArt item={p} className={`size-16 shrink-0 rounded-xl ${blocked || (full && !c) ? 'opacity-50' : ''}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold leading-tight ${blocked ? 'text-[#9ca3af]' : 'text-[#111827]'}`}>{p.name}</p>
                <p className="text-[11px] text-[#4b5563]">
                  {p.size} · 3-4 porsi makan
                </p>
                {c > 0 ? (
                  <p className="text-[11.5px] font-bold text-[#15803d]">✓ {c}× di paket</p>
                ) : !blocked ? (
                  <ProductSold productKey={p.stockColumn ?? p.product} short className="!text-[11px]" />
                ) : null}
                {blocked && <p className="text-[11px] font-semibold text-[#4b5563]">Tidak bisa untuk pack {next + 1}</p>}
              </div>
              {c > 0 ? (
                <div className="flex h-9 shrink-0 items-center gap-0.5 rounded-xl bg-[#fdf3ea] px-1 font-extrabold text-[#9a3412]">
                  <button type="button" aria-label={`Kurangi ${p.name}`} onClick={() => removeOne(p.product)} className="w-7 text-lg">
                    −
                  </button>
                  <b className="min-w-4 text-center text-[#111827]">{c}</b>
                  <button type="button" aria-label={`Tambah ${p.name}`} disabled={!ok} onClick={() => add(p.product)} className="w-7 text-lg disabled:opacity-30">
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!ok}
                  onClick={() => add(p.product)}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-[#9a3412] px-3.5 text-[13px] font-bold text-white disabled:bg-[#e5e7eb] disabled:text-[#9ca3af]"
                >
                  <span className="text-base leading-none">+</span>Pilih
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-2.5 mt-[22px] flex items-end justify-between">
        <h2 className={`${heading} text-[19px]`}>Isi paket kamu</h2>
        <span className="text-xs text-[#4b5563]">
          {count}/{n}
        </span>
      </div>
      <div className={`grid gap-2 ${n === 2 ? 'grid-cols-2' : n === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {picks.map((p, i) => {
          const item = p ? catalog.find((c) => c.product === p) : null;
          const limited = slotOptions(bundle.slots[i], catalog).length < products.length;
          return item ? (
            <div key={i} className={`relative rounded-2xl bg-white p-1.5 text-center text-[11.5px] font-bold ${shadow}`}>
              <ProductArt item={item} className="mb-1 aspect-square w-full rounded-[11px]" />
              <span className="absolute left-2.5 top-2.5 grid size-[22px] place-items-center rounded-full bg-[#9a3412] text-[11px] text-white">{i + 1}</span>
              <button type="button" aria-label={`Hapus pack ${i + 1}`} onClick={() => clearSlot(i)} className="absolute right-2.5 top-2.5 grid size-[22px] place-items-center rounded-full bg-black/55 text-[13px] text-white">
                ×
              </button>
              <span className="line-clamp-2">{shortProductName(item)}</span>
            </div>
          ) : (
            <div
              key={i}
              className={`flex aspect-[1/1.2] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-center text-[11.5px] font-bold text-[#9a3412] ${i === next ? 'border-[#9a3412] bg-[#fdf3ea]' : 'border-[#e2c9b4]'}`}
            >
              <span className="grid size-[30px] place-items-center rounded-full bg-[#9a3412] text-lg leading-none text-white">+</span>
              Pack {i + 1}
              {limited && <span className="-mt-0.5 px-1 text-[11px] text-[#4b5563]">{limitText(bundle.slots[i])} saja</span>}
            </div>
          );
        })}
      </div>

      <div className={`mt-4 rounded-[18px] bg-white p-3.5 text-xs leading-relaxed text-[#4b5563] ${shadow}`}>
        <b className="text-[#111827]">Info paket</b>
        <br />• {n} pack, dikirim bersama dalam 1 pengiriman
        {bundle.freeDelivery && (
          <>
            <br />• Gratis ongkir ke semua kota pengiriman kami
          </>
        )}
        {!bundle.voucherAllowed && (
          <>
            <br />• Harga paket sudah termasuk diskon, jadi voucher tidak bisa dipakai untuk paket ini
          </>
        )}
      </div>

      <Testimonials className="mt-6" />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eee7df] bg-white px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_20px_rgba(59,26,12,0.08)]">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-xs">
            {full ? (
              <>
                <span>
                  <b className="text-[#15803d]">✓ Paket lengkap!</b> <span className="text-[#4b5563]">{n} dari {n}</span>
                </span>
                {saves > 0 && (
                  <span className="text-[#4b5563]">
                    Hemat <b className="text-[#15803d]">{rp(saves)}</b>
                  </span>
                )}
              </>
            ) : (
              <>
                <span>
                  <b>{count} dari {n}</b> <span className="text-[#4b5563]">pack dipilih</span>
                </span>
                <span className="text-[#4b5563]">
                  {rp(bundle.price)} {saves > 0 && <s className="text-[#9ca3af]">{rp(compareAt)}</s>}
                </span>
              </>
            )}
          </div>
          <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-[#f1e4d8]">
            <i
              className={`block h-full rounded-full ${full ? 'bg-[linear-gradient(90deg,#22c55e,#15803d)]' : 'bg-[linear-gradient(90deg,#c2410c,#9a3412)]'}`}
              style={{ width: `${Math.round((count / n) * 100)}%` }}
            />
          </div>
          <button
            type="button"
            disabled={!full || busy}
            onClick={submit}
            className="h-[52px] w-full rounded-[14px] bg-[#9a3412] text-base font-bold text-white shadow-[0_6px_16px_rgba(154,52,18,0.28)] disabled:bg-[#e7e1db] disabled:text-[#8b7f75] disabled:shadow-none"
          >
            {full ? `${editing !== null ? 'Simpan isi paket' : 'Masukkan keranjang'} · ${rp(bundle.price)}` : count === 0 ? `Pilih ${n} pack dulu` : `Pilih ${n - count} pack lagi`}
          </button>
        </div>
      </div>
    </div>
  );
}
