import { NextResponse, type NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { securityHeaders } from './lib/security-headers.mjs';

/**
 * Every request must carry a valid Cloudflare Access token.
 *
 * Cloudflare Access (Zero Trust) sits in front of the site and handles login (one-time email code
 * or Google). This middleware is the second lock: it verifies the signed token Access attaches, so
 * the app stays closed even if someone reaches the Worker by another route or Access is misconfigured.
 *
 * Required configuration (wrangler.jsonc "vars", per environment):
 *   CF_ACCESS_TEAM_DOMAIN  e.g. "jentiskitchen.cloudflareaccess.com"
 *   CF_ACCESS_AUD          the Application Audience (AUD) tag of the Access application
 * Local development only (.dev.vars, never deployed):
 *   ALLOW_LOCAL_WITHOUT_ACCESS=true   — skips the check for requests to localhost/127.0.0.1
 *
 * The public online shop is the one exception. Requests to a host listed in SHOP_HOSTS (e.g. "jentiskitchen.id")
 * skip the login, and every path is mapped under /shop: "/checkout" serves src/app/shop/checkout. Because of
 * that prefix, nothing outside src/app/shop (admin pages, admin APIs) can be reached from the shop host.
 *
 * Next.js 16 calls this file convention deprecated in favour of `proxy.ts`. It is kept on purpose: `proxy.ts` always
 * runs on the Node.js runtime, which @opennextjs/cloudflare still marks experimental, while this edge middleware is
 * its supported path. Revisit when OpenNext supports `proxy.ts` officially.
 */

// The headers for normal pages and APIs come from next.config.mjs (the deployed Worker only applies those);
// responses made here (login refused, redirects) get them directly.
function secure(response: NextResponse): NextResponse {
  for (const { key, value } of securityHeaders) response.headers.set(key, value);
  return response;
}

/**
 * Admin changes (POST, PUT, PATCH, DELETE) must come from the admin's own pages. A browser always says which site
 * a request comes from (Origin / Sec-Fetch-Site); a request started by another website is refused even though the
 * browser would attach the owner's Cloudflare Access login to it.
 */
function crossSiteChange(request: NextRequest, host: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false; // not a browser (e.g. a script with a service token)
  try {
    return new URL(origin).host.toLowerCase() !== host;
  } catch {
    return true;
  }
}

function shopHosts(): string[] {
  return (process.env.SHOP_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function serveShop(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete('x-jentis-user');
  headers.set('x-shop-base', 'root');
  // Paths already under /shop (images in public/shop, which Cloudflare serves before this runs in production)
  // are left as they are; everything else is mapped into the shop.
  const path = request.nextUrl.pathname;
  if (path === '/shop' || path.startsWith('/shop/')) return NextResponse.next({ request: { headers } });
  const url = request.nextUrl.clone();
  url.pathname = path === '/' ? '/shop' : `/shop${path}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeam = '';

function keySet(team: string) {
  if (!jwks || jwksTeam !== team) {
    jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    jwksTeam = team;
  }
  return jwks;
}

function deny(status: number, message: string) {
  return secure(
    new NextResponse(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    }),
  );
}

export async function middleware(request: NextRequest) {
  // The Host header is the address the visitor used (nextUrl.hostname is "localhost" under `next dev`).
  const requestedHost = (request.headers.get('host') || request.nextUrl.host).replace(/:\d+$/, '').toLowerCase();
  if (shopHosts().includes(requestedHost)) return serveShop(request);
  // www.jentiskitchen.id/anything -> jentiskitchen.id/anything (permanent).
  if (requestedHost.startsWith('www.') && shopHosts().includes(requestedHost.slice(4))) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${requestedHost.slice(4)}`);
    return secure(NextResponse.redirect(target, 301));
  }

  if (crossSiteChange(request, (request.headers.get('host') || request.nextUrl.host).toLowerCase())) {
    console.warn(JSON.stringify({ level: 'warn', event: 'cross_site_change_blocked', path: request.nextUrl.pathname, origin: request.headers.get('origin') }));
    return deny(403, 'Request blocked');
  }

  const host = request.nextUrl.hostname;

  // Never in a deployed Worker, even if the variable were set there by mistake.
  const isLocal = (host === 'localhost' || host === '127.0.0.1') && process.env.NODE_ENV !== 'production';
  if (isLocal && process.env.ALLOW_LOCAL_WITHOUT_ACCESS === 'true') {
    const headers = new Headers(request.headers);
    headers.delete('x-shop-base');
    headers.set('x-jentis-user', 'local-dev');
    return NextResponse.next({ request: { headers } });
  }

  const team = process.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CF_ACCESS_AUD;
  if (!team || !audience) {
    console.error(JSON.stringify({ level: 'error', event: 'auth_not_configured' }));
    return deny(503, 'Authentication is not configured'); // fail closed
  }

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return deny(401, 'Sign-in required');

  try {
    const { payload } = await jwtVerify(token, keySet(team), {
      issuer: `https://${team}`,
      audience,
    });
    const headers = new Headers(request.headers);
    headers.delete('x-jentis-user'); // never trust a client-supplied value
    headers.delete('x-shop-base');
    headers.set('x-jentis-user', typeof payload.email === 'string' ? payload.email : 'service-token');
    return NextResponse.next({ request: { headers } });
  } catch (error) {
    console.warn(JSON.stringify({ level: 'warn', event: 'auth_rejected', reason: error instanceof Error ? error.message : 'invalid token' }));
    return deny(403, 'Access denied');
  }
}

export const config = {
  // Everything except static build assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
