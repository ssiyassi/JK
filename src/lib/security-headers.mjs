// Browser security headers for every page and API response (shared by next.config.mjs and src/middleware.ts):
// - pages cannot be shown inside another website's frame (stops "clickjacking" tricks),
// - browsers always use HTTPS for the domain, and do not guess file types,
// - only scripts, styles and images from this site run (plus the OpenStreetMap tiles of the map pin and
//   Cloudflare's visitor statistics script, which Cloudflare adds to every page, and the Meta Pixel and Google tag for ads measurement, and Microsoft Clarity recordings),
// - the location permission is only for this site (map pin); camera and microphone are off.
// Next.js puts small inline scripts in each page, hence 'unsafe-inline'; `next dev` also needs 'unsafe-eval'.
// Static files (public/) get theirs from public/_headers.

const production = process.env.NODE_ENV === 'production';

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://connect.facebook.net https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://www.clarity.ms https://*.clarity.ms${production ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://www.facebook.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://www.google.co.id https://*.clarity.ms https://c.bing.com",
  "font-src 'self' data:",
  "connect-src 'self' https://cloudflareinsights.com https://www.facebook.com https://connect.facebook.net https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://*.clarity.ms https://c.bing.com",
  "frame-src 'self' https://td.doubleclick.net https://www.googletagmanager.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** @type {{ key: string, value: string }[]} */
export const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];
