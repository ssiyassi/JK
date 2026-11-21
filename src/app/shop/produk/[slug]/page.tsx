import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDB } from '@/lib/server';
import { recipeCards } from '@/lib/shop/articles';
import { formatRupiah, type CatalogItem } from '@/lib/shop/catalog';
import { loadCatalog } from '@/lib/shop/products';
import { ALLERGENS, COOKING, CUT, MAIN_SEASONING, STORAGE, halalNote, meatOf, productJsonLd, productPath, productSlug } from '@/lib/shop/productInfo';
import { jsonLdScript } from '@/lib/shop/seo';
import { shopBase } from '@/lib/shop/server';
import ProductArt from '../../_components/ProductArt';
import ProductBuyBox from '../../_components/ProductBuyBox';
import ProductLabels from '../../_components/ProductLabels';
import { DeliveryCountdown, ProductSold, SocialProofToast } from '../../_components/SocialProof';
import RecipeStrip from '../../_components/RecipeStrip';
import { CompleteOrder, ProductPhotoButtons } from '../../_components/ProductPhoneParts';
import { playfair } from '../../fonts';

export const dynamic = 'force-dynamic';

async function findProduct(slug: string): Promise<{ item: CatalogItem; others: CatalogItem[] } | null> {
  const catalog = (await loadCatalog(getDB())).filter((p) => p.visible);
  const item = catalog.find((p) => productSlug(p) === slug);
  return item ? { item, others: catalog.filter((p) => p.product !== item.product) } : null;
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await findProduct((await props.params).slug);
  if (!found) return { title: 'Produk tidak ditemukan', robots: { index: false } };
  const { item } = found;
  const meat = meatOf(item);
  const title = `${item.name} ${item.size}${meat ? ' — Khas Dalam Siap Panggang' : ''}`;
  const description = `${item.description} ${meat ? 'Daging khas dalam, full daging tanpa lemak. ' : ''}${formatRupiah(item.price)} per ${item.size}. Pesan online, dikirim ke Jabodetabek & Surabaya.`;
  return {
    title,
    description,
    alternates: { canonical: productPath(item) },
    openGraph: { type: 'website', title, description, url: productPath(item), images: [{ url: item.image, alt: item.name }] },
  };
}

export default async function ProductPage(props: { params: Promise<{ slug: string }> }) {
  const [found, base] = await Promise.all([findProduct((await props.params).slug), shopBase()]);
  if (!found) notFound();
  const { item, others } = found;
  const meat = meatOf(item);
  const link = (path: string) => (path === '/' ? base || '/' : `${base}${path}`);
  // Recipes with this product's meat only (never pork recipes on a beef page).
  const recipes = meat ? recipeCards().filter((r) => r.meat === meat).map((r) => ({ ...r, href: link(r.path) })) : [];

  // Phones: the same meat in the other flavour ("Pilih rasa").
  const flavour = (p: CatalogItem) => p.name.replace(/^(Babi|Sapi)\s+Marinade\s+/i, '');
  const flavours = meat ? [item, ...others.filter((o) => meatOf(o) === meat)].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const discount = item.compareAtPrice && item.compareAtPrice > item.price ? Math.round((1 - item.price / item.compareAtPrice) * 100) : 0;
  const card = 'rounded-[14px] border border-[#eee7df] bg-white px-3.5 py-3';

  const phone = (
    <div className={`${playfair.variable} sm:hidden flex flex-col`}>
      <div className="relative -mx-4 -mt-4">
        <ProductArt item={item} priority className="w-full aspect-square" />
        <ProductPhotoButtons />
      </div>
      <div className="flex flex-col gap-2 pt-4">
        <ProductLabels item={item} />
        <h1 className="font-[family-name:var(--font-heading)] text-[26px] font-extrabold leading-tight text-[#3b1a0c]">{item.name}</h1>
        <p className="text-sm text-[#4b5563]">
          {item.size}
          {meat ? ` · ${CUT}` : ''}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 pt-1">
          <span className="text-2xl font-extrabold text-[#9a3412]">{formatRupiah(item.price)}</span>
          {item.compareAtPrice && <span className="text-sm text-[#9ca3af] line-through">{formatRupiah(item.compareAtPrice)}</span>}
          {discount > 0 && <span className="rounded-full bg-[#ef4444] px-2 py-0.5 text-[11px] font-bold text-white">-{discount}%</span>}
        </p>
        <ProductSold productKey={item.stockColumn ?? item.product} className="!text-[12.5px]" />
        <div className="mt-2 rounded-[14px] border border-[#bbf7d0] bg-[#ecfdf3] px-3 py-2.5">
          <DeliveryCountdown className="!bg-transparent !p-0 !text-[13px] !text-[#111827]" />
          <p className="mt-0.5 text-[11.5px] text-[#4b5563]">Beli 2 box → gratis ongkir (hemat Rp15.000)</p>
        </div>

        {flavours.length > 1 && (
          <>
            <p className="mt-3 text-xs font-bold text-[#111827]">Pilih rasa</p>
            <div className="grid grid-cols-2 gap-2">
              {flavours.map((f) => {
                const on = f.product === item.product;
                return (
                  <Link
                    key={f.product}
                    href={link(productPath(f))}
                    aria-current={on ? 'page' : undefined}
                    className={`rounded-[14px] border-[1.5px] px-3 py-2 ${on ? 'border-[#9a3412] bg-[#fdf3ea]' : 'border-[#eee7df] bg-white'}`}
                  >
                    <b className="block text-[13.5px] text-[#111827]">{flavour(f)}</b>
                    <ProductSold productKey={f.stockColumn ?? f.product} short className="!text-[11.5px] !font-normal !text-[#4b5563] [&>span:first-child]:hidden [&>span:last-child]:hidden" />
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {meat && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ['❄️', 'Freezer', 'tahan 2 bulan', 'bg-[#f5f3ff]'],
              ['🧊', 'Kulkas', 'tahan 2 minggu', 'bg-[#eff6ff]'],
              ['🍳', 'Teflon', 'tanpa minyak', 'bg-[#fdf3ea]'],
            ].map(([icon, title, text, tone]) => (
              <div key={title} className="rounded-[14px] bg-white p-2.5 text-center shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
                <span className={`mx-auto mb-1 grid size-[30px] place-items-center rounded-[10px] text-base ${tone}`} aria-hidden>
                  {icon}
                </span>
                <b className="block text-xs text-[#111827]">{title}</b>
                <span className="text-[10.5px] text-[#4b5563]">{text}</span>
              </div>
            ))}
          </div>
        )}

        <details open className={`group mt-3 ${card}`}>
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-[#111827]">
            Deskripsi <span className="text-[#9a3412] group-open:rotate-45 transition-transform">+</span>
          </summary>
          <p className="mt-2 text-[13px] leading-5 text-[#4b5563]">
            {item.description}
            {meat ? ` ${CUT} — full daging, tanpa lemak. Bumbu utama: ${MAIN_SEASONING.toLowerCase()}. ${ALLERGENS} ${halalNote(meat)}` : ''}
          </p>
        </details>
        {meat && (
          <>
            <details className={`group ${card}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-[#111827]">
                Cara masak <span className="text-[#9a3412] group-open:rotate-45 transition-transform">+</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-[#4b5563]">
                {COOKING.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
            <details className={`group ${card}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-[#111827]">
                Penyimpanan <span className="text-[#9a3412] group-open:rotate-45 transition-transform">+</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-[#4b5563]">
                {STORAGE.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>

      {recipes.length > 0 && (
        <div className="mt-6">
          <RecipeStrip title="Resep dengan produk ini" cards={recipes} allHref={link('/resep-tips')} />
        </div>
      )}

      {others.length > 0 && (
        <section className="mt-6 flex flex-col gap-2.5">
          <div className="flex items-end justify-between">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[#3b1a0c]">Lengkapi pesananmu</h2>
            <span className="text-xs text-[#4b5563]">2 box = gratis ongkir</span>
          </div>
          <CompleteOrder items={others.map((o) => ({ ...o, path: productPath(o) }))} />
        </section>
      )}
    </div>
  );

  return (
    <article className="max-w-5xl mx-auto flex flex-col gap-8">
      <SocialProofToast />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(item)) }} />
      {phone}
      {/* Phones: the bar fixed to the bottom of the screen (its inline buttons are for wide screens only). */}
      <div className="sm:hidden">
        <ProductBuyBox product={item.product} name={item.name} price={item.price} trackView={false} sticky />
      </div>
      <div className="max-sm:hidden flex flex-col gap-8">
      <nav aria-label="Breadcrumb" className="text-sm text-[#6b7280]">
        <Link href={link('/')} className="hover:underline">Beranda</Link> <span aria-hidden>›</span> <span className="text-[#111827]">{item.name}</span>
      </nav>

      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <ProductArt item={item} priority className="w-full aspect-square rounded-[24px]" />
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#111827]">{item.name}</h1>
          <p className="text-[#6b7280]">{item.size}{meat ? ` · ${CUT}` : ''}</p>
          <ProductLabels item={item} />
          <ProductSold productKey={item.stockColumn ?? item.product} />
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-3xl font-bold text-[#111827]">{formatRupiah(item.price)}</span>
            {item.compareAtPrice && <span className="text-[#9ca3af] line-through">{formatRupiah(item.compareAtPrice)}</span>}
          </p>
          <p className="text-[#4b5563] leading-7">{item.description}</p>
          <DeliveryCountdown className="self-start" />
          <ProductBuyBox product={item.product} name={item.name} price={item.price} />
          <p className="text-sm text-[#6b7280]">Pengiriman ke Jabodetabek & Surabaya, Senin sampai Sabtu. Bayar online lewat QRIS.</p>
        </div>
      </div>

      {meat && (
        <section className="grid gap-4 sm:grid-cols-2">
          {[
            ['Detail produk', [`Potongan: ${CUT} — full daging, tanpa lemak.`, `Bumbu utama: ${MAIN_SEASONING.toLowerCase()}.`, ALLERGENS, `Berat: ${item.size}.`]],
            ['Cara masak', COOKING],
            ['Cara simpan', STORAGE],
            ['Info halal', [halalNote(meat)]],
          ].map(([title, lines]) => (
            <div key={title as string} className="rounded-[20px] bg-white border border-[#f3f4f6] p-5">
              <h2 className="font-bold text-lg text-[#111827] mb-2">{title}</h2>
              <ul className="list-disc pl-5 space-y-1 text-[#4b5563]">
                {(lines as string[]).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}

      <RecipeStrip title="Ide masak dengan produk ini" cards={recipes} allHref={link('/resep-tips')} />

      {others.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold text-[#111827]">Produk lainnya</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {others.map((o) => (
              <li key={o.product}>
                <Link href={link(productPath(o))} className="flex flex-col gap-2 rounded-[20px] bg-white border border-[#f3f4f6] p-2 hover:shadow">
                  <ProductArt item={o} className="w-full aspect-square rounded-2xl" />
                  <span className="px-1 pb-1 font-semibold text-sm text-[#111827]">{o.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </article>
  );
}
