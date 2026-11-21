// Server-only glue for the online shop: session cookie, email sending, config.
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '../core/d1';
import { getDB, log } from '../server';
import { customerForSession, SESSION_DAYS, type Customer } from './customers';
import { canViewOrder, getShopOrder, type OrderViewer, type ShopOrder } from './orders';
import type { Email, EmailLinks } from './email';
import { dokuConfigFromEnv, duitkuConfigFromEnv, duitkuSandboxConfigFromEnv, emailLinksFromEnv, gatewayForCustomer, gatewayForMethod as gatewayForMethodFromEnv, paymentGatewaysFromEnv, type ShopEnv } from './config';
import { sendEmailsWith } from './mailer';
import type { DokuConfig } from './doku';
import type { DuitkuConfig } from './duitku';
import type { FetchLike, PaymentGateway, WalletChannel } from './gateway';
import { metaPurchaseNotifier, type MetaEnv, type MetaPurchaseNotify } from '../notify/meta';
import { telegramNotifier, type TelegramEnv, type TelegramNotify } from '../notify/telegram';
import { googleSendTo } from './googleTag';
import { OWNER_COOKIE, OWNER_SESSION_HOURS, ownerForSession } from './ownerOrders';

export const SESSION_COOKIE = 'jk_session';

interface GoogleAdsEnv {
  GOOGLE_ADS_TAG_ID?: string; // public, e.g. "AW-123"
  CLARITY_PROJECT_ID?: string; // public Microsoft Clarity project ID
  GOOGLE_ADS_PURCHASE_LABEL?: string; // public, the label of the Purchase conversion action
}

function env(): ShopEnv & TelegramEnv & MetaEnv & GoogleAdsEnv & { META_DOMAIN_VERIFICATION?: string } {
  return getCloudflareContext().env as unknown as ShopEnv & TelegramEnv & MetaEnv & GoogleAdsEnv & { META_DOMAIN_VERIFICATION?: string };
}

/** The owner's paid website order alert on the Incoming Order bot (does nothing when the bot secrets are not set). */
export function telegram(): TelegramNotify {
  return telegramNotifier(env(), 'orders', (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) }), log);
}

/** Marketing alerts on the CMO bot (influencer collab accepted / new sign-up). */
export function telegramCmo(): TelegramNotify {
  return telegramNotifier(env(), 'cmo', (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) }), log);
}

/** Meta Conversions API Purchase sender, or undefined when META_PIXEL_ID / META_CAPI_TOKEN are not set. */
export function metaPurchase(): MetaPurchaseNotify | undefined {
  // 6 s per try (Meta usually answers in < 1 s): 3 tries still finish well inside the background time, before the emails.
  return metaPurchaseNotifier(env(), (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(6000) }), log);
}

/** Public Meta settings for the shop pages: Pixel ID and the domain verification code (empty = off). */
export function metaPublic(): { pixelId: string | null; domainVerification: string | null } {
  const e = env();
  return { pixelId: e.META_PIXEL_ID?.trim() || null, domainVerification: e.META_DOMAIN_VERIFICATION?.trim() || null };
}

/** Public Google Ads settings for the shop pages: tag ID and the Purchase conversion target (empty = off). */
export function googleAdsPublic(): { tagId: string | null; purchaseSendTo: string | null } {
  const e = env();
  const tagId = e.GOOGLE_ADS_TAG_ID?.trim() || null;
  const label = e.GOOGLE_ADS_PURCHASE_LABEL?.trim() || null;
  return { tagId, purchaseSendTo: tagId && label ? googleSendTo(tagId, label) : null };
}

/** Microsoft Clarity project ID (public), or null when not set. */
export function clarityProjectId(): string | null {
  return env().CLARITY_PROJECT_ID?.trim() || null;
}

export function emailLinks(): EmailLinks {
  return emailLinksFromEnv(env());
}

/** DOKU settings, or null when not configured. */
export function dokuConfig(): DokuConfig | null {
  return dokuConfigFromEnv(env());
}

/** Duitku settings, or null when not configured. */
export function duitkuConfig(): DuitkuConfig | null {
  return duitkuConfigFromEnv(env());
}

/** Duitku sandbox settings for test accounts, or null when not configured. */
export function duitkuSandboxConfig(): DuitkuConfig | null {
  return duitkuSandboxConfigFromEnv(env());
}

/** fetch for payment gateway calls, with a time limit so a slow gateway never hangs a page. */
const gatewayFetch: FetchLike = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8000) });

/** Every configured payment gateway, the one for new payments first. Empty = manual bank transfer. */
export function paymentGateways(): PaymentGateway[] {
  return paymentGatewaysFromEnv(env(), gatewayFetch);
}

/**
 * The gateway for new payments, or null when the shop uses manual bank transfer. Test accounts (SANDBOX_TEST_EMAILS)
 * get the Duitku sandbox.
 */
export function activeGateway(customerEmail?: string | null): PaymentGateway | null {
  return gatewayForCustomer(env(), customerEmail, gatewayFetch);
}

/** The "Kota" dropdown at checkout and the courier cities (delivery-cities.ts): off until the owner says delivery is ready. */
export function newCityDelivery(): boolean {
  return env().NEW_CITY_DELIVERY === 'on';
}

/** The gateway for QRIS (DOKU) or an e-wallet (OVO/ShopeePay: Duitku, DANA: DOKU) for this customer; null = not available. */
export function gatewayForMethod(method: 'QRIS' | WalletChannel, customerEmail?: string | null): PaymentGateway | null {
  return gatewayForMethodFromEnv(env(), method, customerEmail, gatewayFetch);
}

/** The e-wallets this customer can pick in the payment pop-up (each needs its gateway set up). */
export function availableWallets(customerEmail?: string | null): WalletChannel[] {
  return (['OVO', 'SHOPEEPAY', 'DANA'] as const).filter((w) => gatewayForMethod(w, customerEmail));
}

/** Google Places key for the checkout address search, or null when not set (then the search box is hidden). */
export function placesKey(): string | null {
  return env().GOOGLE_PLACES_API_KEY?.trim() || null;
}

export function ownerEmail(): string | null {
  return env().OWNER_EMAIL || null;
}

/**
 * Where the shop lives in the URL. On jentiskitchen.id the middleware maps "/" to the shop, so links have no
 * prefix; anywhere else (admin host, preview) the shop pages are under /shop.
 */
export async function shopBase(): Promise<string> {
  return (await headers()).get('x-shop-base') === 'root' ? '' : '/shop';
}

/** The signed-in customer for a page or route, or null. */
export async function currentCustomer(): Promise<Customer | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return customerForSession(getDB(), token, Date.now());
}

/** Admin mode ("Buat pesanan untuk pelanggan", opened from the admin): the admin's login, or null for everyone else. */
export async function currentOwner(): Promise<string | null> {
  const token = (await cookies()).get(OWNER_COOKIE)?.value;
  return ownerForSession(getDB(), token, Date.now());
}

export function setOwnerCookie(response: NextResponse, request: NextRequest, token: string | null) {
  response.cookies.set(OWNER_COOKIE, token ?? '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: token ? OWNER_SESSION_HOURS * 3600 : 0,
  });
}

export async function requireCustomer(): Promise<Customer> {
  const customer = await currentCustomer();
  if (!customer) throw new AppError(401, 'Silakan masuk terlebih dahulu');
  return customer;
}

/** Cookie holding a guest's order key in the browser that placed the order: jk_o_<orderRowId>. */
const GUEST_ORDER_COOKIE = 'jk_o_';
const GUEST_ORDER_DAYS = 180;

export function setGuestOrderCookie(response: NextResponse, request: NextRequest, order: ShopOrder) {
  if (!order.guestKey) return;
  response.cookies.set(`${GUEST_ORDER_COOKIE}${order.orderRowId}`, order.guestKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: GUEST_ORDER_DAYS * 86400,
  });
}

/** The signed-in customer (if any) and the guest key this browser holds for the order. */
export async function orderViewer(orderRowId: string): Promise<OrderViewer & { customer: Customer | null }> {
  const customer = await currentCustomer();
  const guestKey = (await cookies()).get(`${GUEST_ORDER_COOKIE}${orderRowId}`)?.value ?? null;
  return { customer, customerId: customer?.id ?? null, guestKey };
}

/** An order this visitor may open (their account's, or placed as a guest in this browser), or null. */
/** Guests: the orders placed in this browser (one key cookie per order), newest first, at most `max`. */
export async function guestOrdersInBrowser(max = 20): Promise<ShopOrder[]> {
  const jar = await cookies();
  const db = getDB();
  const found: ShopOrder[] = [];
  for (const c of jar.getAll()) {
    if (!c.name.startsWith(GUEST_ORDER_COOKIE)) continue;
    const order = await getShopOrder(db, c.name.slice(GUEST_ORDER_COOKIE.length));
    if (order && canViewOrder(order, { customerId: null, guestKey: c.value })) found.push(order);
  }
  return found.sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
}

export async function viewableOrder(orderRowId: string): Promise<{ order: ShopOrder; customer: Customer | null; viewer: OrderViewer } | null> {
  const viewer = await orderViewer(orderRowId);
  const order = await getShopOrder(getDB(), orderRowId);
  if (!order || !canViewOrder(order, viewer)) return null;
  return { order, customer: viewer.customer, viewer: { customerId: viewer.customerId, guestKey: viewer.guestKey } };
}

export function setSessionCookie(response: NextResponse, request: NextRequest, token: string, maxAgeSeconds = SESSION_DAYS * 86400) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

/** Blocks form posts from other websites (the browser always sends Origin on POST). */
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  let originHost = '';
  try {
    originHost = origin ? new URL(origin).host : '';
  } catch {
    /* malformed Origin: refused below */
  }
  if (!originHost || !host || originHost !== host) throw new AppError(403, 'Permintaan ditolak');
}

/** The visitor's IP address as Cloudflare saw it (used for attempt limits). */
export function clientIp(request: NextRequest): string {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
}

/** Sends emails one by one; vouchers are marked as emailed only when their email went out. */
export async function sendEmails(emails: Email[]): Promise<number> {
  return sendEmailsWith(env(), getDB(), emails, log);
}

/** Sends after the response, so a slow or failing email never blocks the customer or the admin. */
export function sendEmailsInBackground(emails: Email[]) {
  if (!emails.length) return;
  getCloudflareContext().ctx.waitUntil(sendEmails(emails));
}

/**
 * Runs shop follow-up work (emails, referral rewards) after an action has succeeded (admin click, online payment).
 * Runs after the response and never turns a successful action into an error.
 */
export function afterAction(event: string, work: () => Promise<Email[]>) {
  getCloudflareContext().ctx.waitUntil(
    work()
      .then(sendEmails)
      .catch((error) =>
        log('error', 'shop_event_failed', { event, message: error instanceof Error ? error.message : String(error) }),
      ),
  );
}
