import { getDB } from '@/lib/server';
import { loadCatalog } from '@/lib/shop/products';
import { ALL_ARTICLES, articlePath } from '@/lib/shop/articles';
import { productPath } from '@/lib/shop/productInfo';
import { SITE_URL } from '@/lib/shop/seo';

// jentiskitchen.id/sitemap.xml: the public pages Google should index — homepage, every visible product page, recipes,
// the influencer sign-up page (/collab, not the private /collab/<slug> offer pages), privacy.
// Add new public pages to STATIC_PAGES. Built per request (reads the product list from the database).
export const dynamic = 'force-dynamic';

const STATIC_PAGES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/kebijakan-privasi', priority: '0.2', changefreq: 'yearly' },
];

export async function GET() {
  const products = (await loadCatalog(getDB())).filter((p) => p.visible);
  const pages = [
    STATIC_PAGES[0],
    ...products.map((p) => ({ path: productPath(p), priority: '0.9', changefreq: 'weekly' })),
    { path: '/resep-tips', priority: '0.6', changefreq: 'weekly' },
    ...ALL_ARTICLES.map((a) => ({ path: articlePath(a), priority: '0.6', changefreq: 'monthly' })),
    { path: '/collab', priority: '0.4', changefreq: 'monthly' },
    { path: '/affiliate', priority: '0.4', changefreq: 'monthly' },
    ...STATIC_PAGES.slice(1),
  ];
  const urls = pages
    .map((p) => `  <url><loc>${SITE_URL}${p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
