import { getDB } from '@/lib/server';
import { recipeCards } from '@/lib/shop/articles';
import { listBanners } from '@/lib/shop/banners';
import { faqJsonLd } from '@/lib/shop/productInfo';
import { homeJsonLd, jsonLdScript } from '@/lib/shop/seo';
import ProductGrid from './_components/ProductGrid';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

// One address for the homepage in Google, whatever ad tags (?utm_…, ?fbclid) a visitor arrived with.
export const metadata: Metadata = { alternates: { canonical: '/' } };

/** Arrived from a paid ad: Meta (utm_medium=paid_social or fbclid) or Google search (utm_medium=cpc or gclid). */
const fromAd = (q: Record<string, string | string[] | undefined>) =>
  q.utm_medium === 'paid_social' || q.utm_medium === 'cpc' || Boolean(q.fbclid) || Boolean(q.gclid);

export default async function ShopHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [banners, query] = await Promise.all([listBanners(getDB(), true), searchParams]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd()) }} />
      <ProductGrid banners={banners} recipes={recipeCards()} productsFirst={fromAd(query)} />
    </>
  );
}
