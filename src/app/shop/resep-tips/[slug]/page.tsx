import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDB } from '@/lib/server';
import { ALL_ARTICLES, articleJsonLd, articlePath } from '@/lib/shop/articles';
import { loadCatalog } from '@/lib/shop/products';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import { formatRupiah } from '@/lib/shop/catalog';
import { meatOf, productPath } from '@/lib/shop/productInfo';
import { jsonLdScript } from '@/lib/shop/seo';
import { shopBase } from '@/lib/shop/server';
import ProductArt from '../../_components/ProductArt';
import ProductBuyBox from '../../_components/ProductBuyBox';
import { playfair } from '../../fonts';

export const dynamic = 'force-dynamic';

const find = (slug: string) => ALL_ARTICLES.find((a) => a.slug === slug) ?? null;

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = find((await props.params).slug);
  if (!a) return { title: 'Artikel tidak ditemukan', robots: { index: false } };
  return {
    title: a.title,
    description: a.description,
    alternates: { canonical: articlePath(a) },
    openGraph: { type: 'article', title: a.title, description: a.description, url: articlePath(a), images: [{ url: a.image, alt: a.imageAlt }], publishedTime: a.date },
  };
}

export default async function ArticlePage(props: { params: Promise<{ slug: string }> }) {
  const a = find((await props.params).slug);
  if (!a) notFound();
  const [base, catalog, rules] = await Promise.all([shopBase(), loadCatalog(getDB()), loadVoucherRules(getDB())]);
  const welcome = rules.WELCOME.percent;
  const products = catalog.filter((p) => p.visible);
  const r = a.recipe;
  // A recipe only sells the meat it uses — never pork on a beef recipe.
  const recipeProducts = r ? products.filter((p) => meatOf(p) === r.meat) : [];
  const link = (path: string) => (path === '/' ? base || '/' : `${base}${path}`);
  const dateText = new Date(`${a.date}T00:00:00+07:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

  return (
    <article className={`${playfair.variable} max-w-3xl mx-auto flex flex-col gap-6 py-2`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(articleJsonLd(a)) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-[#6b7280]">
        <Link href={link('/')} className="hover:underline">Beranda</Link> <span aria-hidden>›</span>{' '}
        <Link href={link('/resep-tips')} className="hover:underline">Resep & Tips</Link>
      </nav>
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-[#3b1a0c] leading-tight">{a.title}</h1>
        <p className="text-sm text-[#8a7a6d]">Jentis Kitchen · {dateText}</p>
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.image} alt={a.imageAlt} fetchPriority="high" className="w-full max-h-[520px] object-cover rounded-[24px]" />
      <p className="text-lg leading-8 text-[#374151]">{a.intro}</p>
      {r && (
        <>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Porsi', r.yield],
              ['Persiapan', `${r.prepMinutes} menit`],
              ['Memasak', `${r.cookMinutes} menit`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[20px] bg-[#fdf3ea] px-2 py-3">
                <dt className="text-xs text-[#8a7a6d]">{k}</dt>
                <dd className="font-bold text-[#3b1a0c]">{v}</dd>
              </div>
            ))}
          </dl>
          <section className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold text-[#111827]">Bahan</h2>
            <ul className="list-disc pl-6 space-y-2 leading-7 text-[#374151]">{r.ingredients.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
          {recipeProducts.length > 0 && (
            <section className="rounded-[24px] bg-[#fdf3ea] p-4 sm:p-5 flex flex-col gap-3">
              <h2 className="text-xl font-bold text-[#111827]">Beli dagingnya di sini</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {recipeProducts.map((p) => (
                  <li key={p.product} className="flex flex-col gap-3 rounded-[20px] bg-white p-3">
                    <Link href={link(productPath(p))} className="flex items-center gap-3">
                      <ProductArt item={p} className="w-20 h-20 rounded-2xl shrink-0" />
                      <span className="flex flex-col">
                        <span className="font-semibold text-[#111827]">{p.name}</span>
                        <span className="text-sm text-[#6b7280]">{p.size} · {formatRupiah(p.price)}</span>
                      </span>
                    </Link>
                    <ProductBuyBox product={p.product} name={p.name} price={p.price} trackView={false} />
                  </li>
                ))}
              </ul>
              <p className="text-sm text-[#6b7280]">Pembelian pertama otomatis diskon {welcome}% di checkout (maks. Rp100.000, khusus produk).</p>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold text-[#111827]">Cara membuat</h2>
            <ol className="list-decimal pl-6 space-y-3 leading-7 text-[#374151]">{r.steps.map((t, i) => <li key={t} id={`langkah-${i + 1}`} className="scroll-mt-24">{t}</li>)}</ol>
          </section>
        </>
      )}
      {a.blocks.map((b, i) => (
        <section key={i} className="flex flex-col gap-2">
          {b.h2 && <h2 className="text-2xl font-bold text-[#111827]">{b.h2}</h2>}
          {b.p?.map((t) => <p key={t} className="leading-8 text-[#374151]">{t}</p>)}
          {b.list &&
            (b.ordered ? (
              <ol className="list-decimal pl-6 space-y-2 leading-7 text-[#374151]">{b.list.map((t) => <li key={t}>{t}</li>)}</ol>
            ) : (
              <ul className="list-disc pl-6 space-y-2 leading-7 text-[#374151]">{b.list.map((t) => <li key={t}>{t}</li>)}</ul>
            ))}
        </section>
      ))}

      {!r && products.length > 0 && (
        <section className="rounded-[24px] bg-[#fdf3ea] p-5 sm:p-6 flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-[#111827]">Coba langsung di rumah</h2>
          <p className="text-[#4b5563]">Daging khas dalam, sudah dimarinasi — tinggal panggang. Pembelian pertama otomatis diskon {welcome}% di checkout, tanpa perlu daftar (maks. Rp100.000, khusus produk).</p>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {products.map((p) => (
              <li key={p.product}>
                <Link href={link(productPath(p))} className="flex flex-col gap-2 rounded-[20px] bg-white p-2 hover:shadow">
                  <ProductArt item={p} className="w-full aspect-square rounded-2xl" />
                  <span className="px-1 pb-1 font-semibold text-sm text-[#111827]">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
