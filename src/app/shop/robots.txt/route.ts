import { SITE_URL } from '@/lib/shop/seo';

// jentiskitchen.id/robots.txt (the middleware maps it here). Cloudflare adds its own "content signals" block on top.
// Private pages also send X-Robots-Tag: noindex (next.config.mjs).
export function GET() {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /checkout',
    'Disallow: /account',
    'Disallow: /orders',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    'Disallow: /verify-email',
    'Disallow: /hadiah-reseller',
    'Disallow: /payday-promo',
    'Disallow: /collab/',
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
