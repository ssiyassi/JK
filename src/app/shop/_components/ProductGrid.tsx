'use client';

import Link from 'next/link';
import { Fragment, useEffect } from 'react';
import { trackMeta } from '@/lib/client/metaPixel';
import type { RecipeCard } from '@/lib/shop/articles';
import { formatRupiah, type Banner } from '@/lib/shop/catalog';
import { FAQ, HOT_LABEL, HOT_PRODUCTS, meatOf, productPath } from '@/lib/shop/productInfo';
import BannerCarousel from './BannerCarousel';
import CartBar from './CartBar';
import BundleCards from './BundleCard';
import ProductArt from './ProductArt';
import QtyStepper from './QtyStepper';
import ProductLabels from './ProductLabels';
import RecipeStrip from './RecipeStrip';
import { DeliveryCountdown, ProductSold, SocialProofToast, SoldCount } from './SocialProof';
import { FirstOrderBanner, MonthlyVoucherBanner } from './PromoBanners';
import { useShop } from './ShopProvider';
import { playfair } from '../fonts';
import QuickMenu, { Testimonials } from './QuickMenu';

/**
 * Homepage. Visitors who arrive from an ad (productsFirst, see src/app/shop/page.tsx) get the products in the first phone
 * screen with a short intro, and the banners and promo pictures below them (owner, 2026-11-07: 95% of ad visitors left
 * within ~6 seconds without scrolling, when the first "Tambah" was 1.5 screens down).
 */
export default function ProductGrid({ banners, recipes = [], productsFirst = false }: { banners: Banner[]; recipes?: RecipeCard[]; productsFirst?: boolean }) {
  const { catalog, cart, setQty, href, customer, welcomeVoucher } = useShop();

  // Meta: the product list was seen (each product page sends its own ViewContent too).
  useEffect(() => {
    if (catalog.length) trackMeta('ViewContent', { content_type: 'product', content_ids: catalog.map((p) => p.product), currency: 'IDR' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const intro = (
        <section className="flex flex-col gap-3 sm:gap-4 sm:pt-8">
          {/* One line on every screen: the size follows the screen width. */}
          <div className="flex flex-col gap-1 sm:gap-2">
            {/* Main heading with the words people search for; the brand tagline sits under it. */}
            <h1 className="text-center text-balance text-[clamp(16px,4.8vw,28px)] leading-tight sm:text-5xl sm:leading-[48px] font-bold text-[#111827]">
              Daging BBQ Marinasi Siap Panggang
            </h1>
            <p className="text-center font-[family-name:var(--font-brand)] text-[28px] sm:text-[40px] leading-none text-[#9a3412]">Taste is Our Utmost Priority</p>
            <p className="text-center text-base sm:text-xl sm:leading-7 text-[#6b7280]">
              Gratis ongkir untuk 2 pack atau lebih
              <br />1 pack akan dikenakan ongkir Rp15.000
            </p>
            {/* Real numbers only (src/lib/shop/socialProof.ts): boxes sold and the same-day delivery countdown. */}
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <DeliveryCountdown />
              <SoldCount />
            </div>
          </div>
          {/* Guests: the first-order discount (applied at checkout automatically, information only) and, next to it,
              the monthly voucher that comes with an account (links to the register page). Stacked on phones. */}
          {!customer && (
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              <FirstOrderBanner />
              <MonthlyVoucherBanner href={href('/register')} />
            </div>
          )}
        </section>
  );

  const grid = (
        <div id="produk" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-8 scroll-mt-24">
          {catalog.map((item) => {
            const qty = cart[item.product] ?? 0;
            const hot = HOT_PRODUCTS.has(item.stockColumn ?? item.product);
            return (
              <Fragment key={item.product}>
              {/* Phones: app-style 2-column cards (owner, 2026-11-12): big photo, "+" on the photo that turns into − n +. */}
              <article className="sm:hidden flex flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
                <div className="relative">
                  <Link href={href(productPath(item))} aria-label={`Lihat detail ${item.name}`} className="block">
                    <ProductArt item={item} className="w-full aspect-square" />
                  </Link>
                  {hot && (
                    <span className="absolute left-2 top-2 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold leading-4 text-[#b91c1c] shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
                      {HOT_LABEL.icon} {HOT_LABEL.text}
                    </span>
                  )}
                  {item.compareAtPrice && item.compareAtPrice > item.price && (
                    <span className="absolute right-2 top-2 rounded-lg bg-[#ef4444] px-1.5 py-0.5 text-[11px] font-extrabold leading-4 text-white">
                      -{Math.round((1 - item.price / item.compareAtPrice) * 100)}%
                    </span>
                  )}
                  {qty === 0 ? (
                    <button
                      type="button"
                      onClick={() => setQty(item.product, 1)}
                      aria-label={`Tambah ${item.name} ke keranjang`}
                      className="absolute right-2 -bottom-[18px] size-10 rounded-full border-[3px] border-white bg-[#9a3412] text-white grid place-items-center shadow-[0_4px_12px_rgba(154,52,18,0.35)]"
                    >
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" aria-hidden>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  ) : (
                    <div className="absolute right-2 bottom-2 flex h-10 items-center rounded-full border-[3px] border-white bg-[#9a3412] px-1 text-white font-extrabold shadow-[0_4px_12px_rgba(154,52,18,0.35)]">
                      <button type="button" onClick={() => setQty(item.product, qty - 1)} aria-label={`Kurangi ${item.name}`} className="size-7 grid place-items-center text-lg leading-none">
                        −
                      </button>
                      <span className="min-w-4 text-center tabular-nums" aria-live="polite">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(item.product, Math.min(50, qty + 1))}
                        aria-label={`Tambah ${item.name}`}
                        className="size-7 grid place-items-center text-lg leading-none"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 px-2.5 pt-3 pb-3">
                  <h2 className="min-h-[35px] pr-8 text-[14px] font-bold leading-[1.25] text-[#111827]">
                    <Link href={href(productPath(item))}>{item.name}</Link>
                  </h2>
                  <p className="text-[11.5px] leading-4 text-[#4b5563]">
                    {item.size}
                    {meatOf(item) ? ' · 3-4 porsi · tanpa lemak' : ''}
                  </p>
                  <ProductSold productKey={item.stockColumn ?? item.product} short className="!text-[11px] !gap-0.5" />
                  <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-0.5">
                    <span className="whitespace-nowrap text-[15px] font-extrabold text-[#9a3412]">{formatRupiah(item.price)}</span>
                    {item.compareAtPrice && <span className="text-[11px] text-[#9ca3af] line-through">{formatRupiah(item.compareAtPrice)}</span>}
                  </p>
                </div>
              </article>
              <article
                className="hidden sm:flex bg-white border border-[#f3f4f6] rounded-[24px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-hidden flex-col"
              >
                <Link href={href(productPath(item))} aria-label={`Lihat detail ${item.name}`}>
                  <ProductArt item={item} className="w-full aspect-square lg:aspect-auto lg:h-[308px]" />
                </Link>
                <div className="p-3 sm:p-6 flex flex-col flex-1">
                  <h2 className="font-bold text-base leading-6 sm:text-xl sm:leading-7 text-[#111827] pb-1">
                    <Link href={href(productPath(item))} className="hover:underline">{item.name}</Link>
                  </h2>
                  <p className="text-sm sm:text-base text-[#9ca3af] pb-1">{item.size}</p>
                  <ProductSold productKey={item.stockColumn ?? item.product} className="pb-2" />
                  <ProductLabels item={item} className="pb-2 sm:pb-3" />
                  <p className="text-xs sm:text-sm leading-5 sm:leading-[22.75px] text-[#6b7280] flex-1 min-h-[40px] sm:min-h-[69.5px]">{item.description}</p>
                  <div className="flex flex-col gap-3 sm:gap-4 pt-2">
                    <p className="flex flex-wrap items-baseline gap-x-2 leading-8">
                      <span className="font-bold text-lg sm:text-2xl text-[#111827]">{formatRupiah(item.price)}</span>
                      {item.compareAtPrice && <span className="text-xs sm:text-sm text-[#9ca3af] line-through">{formatRupiah(item.compareAtPrice)}</span>}
                    </p>
                    {qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => setQty(item.product, 1)}
                        className="w-full py-3 sm:py-4 rounded-2xl bg-[#9a3412] hover:bg-[#7c2d12] text-white text-base sm:text-lg leading-7 font-bold drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                      >
                        Tambah
                      </button>
                    ) : (
                      <QtyStepper value={qty} max={50} onChange={(n) => setQty(item.product, n)} label={item.name} />
                    )}
                  </div>
                </div>
              </article>
              </Fragment>
            );
          })}
        </div>
  );

  // Order of the blocks. Phones (app layout, owner 2026-11-12): banner → first-order 20% → products; ad visitors get
  // 20% → products → banner. Wide screens keep the earlier layout (banner + intro, or the short ad intro first).
  const o = productsFirst
    ? { banner: 'order-4 sm:order-3', first: 'order-1', head: 'order-2', grid: 'order-3 sm:order-2', intro: 'sm:order-4', adIntro: 'sm:order-1' }
    : { banner: 'order-1', first: 'order-2', head: 'order-3', grid: 'order-4 sm:order-3', intro: 'sm:order-2', adIntro: '' };

  return (
    <div className={`${playfair.variable} flex flex-col gap-5 sm:gap-12`}>
      <SocialProofToast />
      {productsFirst && (
        <div className={`hidden sm:block ${o.adIntro}`}>
          <AdIntro newCustomer={!customer} percent={welcomeVoucher.percent} />
        </div>
      )}
      <div className={o.banner}>
        <BannerCarousel banners={banners} />
      </div>
      <div className={`hidden sm:block ${o.intro}`}>{intro}</div>
      {/* Phones: the first-order discount right under the banner (or first of all for ad visitors), guests only. */}
      {!customer && (
        <div className={`sm:hidden ${o.first}`}>
          <FirstOrderBanner className="rounded-2xl" />
        </div>
      )}
      <div className={`sm:hidden ${o.head} -mb-2 flex flex-col gap-0.5`}>
        <h2 className="font-[family-name:var(--font-heading)] text-[22px] font-extrabold leading-7 text-[#3b1a0c]">Menu Kami</h2>
        <SoldCount className="self-start !bg-transparent !px-0 !py-0 !text-[12.5px]" />
      </div>
      <div className={`${o.grid} flex flex-col gap-3 sm:gap-8`}>
        <BundleCards />
        {grid}
      </div>
      <QuickMenu className="order-5 sm:hidden" />
      {!customer && (
        <div className="order-6 sm:hidden">
          <MonthlyVoucherBanner href={href('/register')} />
        </div>
      )}

      <div className="order-7 flex flex-col gap-5 sm:gap-12">
      {/* Recipe ideas right under the products: buyers see what they can cook with a pack (small cards, not product-sized). */}
      <RecipeStrip
        title="Mau masak apa hari ini?"
        subtitle="1 pack daging BBQ bisa jadi banyak menu."
        cards={recipes.map((r) => ({ ...r, href: href(r.path) }))}
        allHref={href('/resep-tips')}
      />

      <Testimonials className="sm:hidden" />

      {/* What the business is and how buying works (payment gateways ask for a description on the homepage). */}
      <section className="rounded-[24px] bg-[#fdf3ea] px-5 py-6 sm:px-10 sm:py-10 flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-2 max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] max-sm:font-[family-name:var(--font-heading)] max-sm:text-xl max-sm:font-extrabold max-sm:text-[#3b1a0c]">Tentang Jentis Kitchen</h2>
          <p className="text-sm sm:text-base leading-6 sm:leading-7 text-[#4b5563]">
            Jentis Kitchen adalah usaha kuliner asal Jakarta yang menjual daging marinade siap masak dengan bumbu manis
            dan asin gurih. Tinggal masak di rumah, rasa tetap konsisten. Semua pesanan bisa
            dilakukan langsung di website ini dan dibayar online dengan aman.
          </p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3 sm:gap-6">
          {[
            ['Pilih produk', 'Tambahkan produk ke keranjang, lalu tekan Checkout.'],
            ['Bayar online', 'Isi alamat pengiriman dan bayar lewat halaman pembayaran yang aman.'],
            ['Pesanan diantar', 'Kami antar ke alamat Anda, Senin sampai Sabtu.'],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-3 rounded-2xl bg-white p-4">
              <span className="size-8 shrink-0 rounded-full bg-[#9a3412] text-white font-bold flex items-center justify-center">{i + 1}</span>
              <span className="flex flex-col">
                <span className="font-bold text-[#111827]">{title}</span>
                <span className="text-sm text-[#6b7280]">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Answers to what people search for (shared with Google's FAQ data on the homepage). */}
      <section id="faq" className="flex flex-col gap-4 max-w-3xl w-full mx-auto scroll-mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] text-center max-sm:text-left max-sm:font-[family-name:var(--font-heading)] max-sm:text-xl max-sm:font-extrabold max-sm:text-[#3b1a0c]">Pertanyaan yang sering ditanyakan</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl bg-white border border-[#f3f4f6] px-5 py-4">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-semibold text-[#111827]">
                {f.q}
                <span className="text-[#9a3412] text-xl leading-none group-open:rotate-45 transition-transform" aria-hidden>+</span>
              </summary>
              <p className="mt-2 text-[#4b5563] leading-7">{f.a}</p>
            </details>
          ))}
        </div>
        <Link href={href('/resep-tips')} className="self-center font-semibold text-[#9a3412] hover:underline">
          Lihat resep & tips memasak →
        </Link>
      </section>

      </div>
      <CartBar />
    </div>
  );
}

/** Short intro above the products for ad visitors: what it is, the first-order discount, delivery and the countdown. */
function AdIntro({ newCustomer, percent }: { newCustomer: boolean; percent: number }) {
  return (
    <section className="flex flex-col items-center gap-1.5 text-center">
      <h1 className="text-balance text-[22px] leading-7 sm:text-4xl sm:leading-[44px] font-bold text-[#111827]">Daging BBQ Marinasi Siap Panggang</h1>
      <p className="text-sm sm:text-lg text-[#6b7280]">
        {newCustomer && (
          <>
            <b className="text-[#15803d]">Diskon {percent}%</b> pembelian pertama ·{' '}
          </>
        )}
        Gratis ongkir mulai 2 pack
      </p>
      <DeliveryCountdown />
    </section>
  );
}
