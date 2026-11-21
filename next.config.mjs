import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import { securityHeaders } from './src/lib/security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A package-lock.json in a parent folder makes Next guess the wrong root; pin it to this project.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // No "X-Powered-By: Next.js" header: it only tells attackers which framework to probe.
  poweredByHeader: false,
  // Browser security headers on every page and API (see src/lib/security-headers.mjs).
  // Search engines: private shop pages (cart/checkout, account, order pages, sign-in, reseller pages,
  // influencer offer pages) and the whole
  // admin site are never indexed (X-Robots-Tag). Public pages are listed in /sitemap.xml (src/app/shop/sitemap.xml).
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    const privateShopPaths = [
      '/checkout', '/account/:path*', '/orders/:path*', '/login', '/register', '/forgot-password', '/reset-password',
      '/verify-email', '/hadiah-reseller/:path*', '/payday-promo', '/api/:path*', '/pesanan', '/voucher',
      // Influencer offer pages /collab/<slug> (the sign-up page /collab itself is public).
      '/collab/:slug+',
    ];
    return [
      { source: '/:path*', headers: securityHeaders },
      ...privateShopPaths.map((source) => ({ source, headers: noindex })),
      { source: '/:path*', has: [{ type: 'host', value: 'admin.jentiskitchen.id' }], headers: noindex },
    ];
  },
  typescript: {
    // Unchanged from the original project. Run `npm run typecheck` separately; see DEPLOYMENT.md.
    ignoreBuildErrors: true,
  },
};

// Gives `next dev` access to the local D1 database and vars defined in wrangler.jsonc.
initOpenNextCloudflareForDev();

export default nextConfig;
