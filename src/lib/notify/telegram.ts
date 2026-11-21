// Telegram bots for the owner, one per topic (see TELEGRAM_BOTS): low-stock alert (below 5), paid website
// orders, the 19:00 WIB delivery list, the Sunday parent reseller recap, and later the marketing (CMO) reports.
// Framework-free (runs from the Worker's Cron Trigger, see custom-worker.ts).
//
// Setup (secrets, never in wrangler.jsonc): one token per bot from @BotFather and TELEGRAM_CHAT_ID of the
// owner's chat (the same for every bot in a private chat). A bot without its own token falls back to
// TELEGRAM_BOT_TOKEN (the Stock Alert bot); without that or the chat ID nothing is sent.
import type { D1Database, Quantities } from '../core/d1.ts';
import { getInventory } from '../core/inventory.ts';
import { loadStockProducts, roundBoxes, type StockProduct } from '../core/products.ts';
import { listOrders, type Order } from '../core/orders.ts';
import { resellerSalesReport } from '../core/resellers.ts';
import { addDaysToKey, jakartaDateKey } from '../core/time.ts';
import { courierService } from '../shop/delivery-cities.ts';
import { fullAddress, mapsLink, type ShopOrder } from '../shop/orders.ts';
import { packLines } from '../shop/bundles.ts';
import { displayPhone } from '../shop/util.ts';
import { errorText, reportFailure, RetryAfterError, withRetry, type ReportEnv } from './retry.ts';

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string; // Jentis Stock Alert (the original bot)
  TELEGRAM_ORDERS_BOT_TOKEN?: string; // Jentis Incoming Order
  TELEGRAM_SHIPPING_BOT_TOKEN?: string; // Jentis Shipping
  TELEGRAM_REPORTING_BOT_TOKEN?: string; // Jentis Reporting
  TELEGRAM_CMO_BOT_TOKEN?: string; // Jentis CMO
  TELEGRAM_CHAT_ID?: string;
}

/** Which bot sends what, and the secret holding its token. */
export const TELEGRAM_BOTS = {
  stock: 'TELEGRAM_BOT_TOKEN',
  orders: 'TELEGRAM_ORDERS_BOT_TOKEN',
  shipping: 'TELEGRAM_SHIPPING_BOT_TOKEN',
  reporting: 'TELEGRAM_REPORTING_BOT_TOKEN',
  cmo: 'TELEGRAM_CMO_BOT_TOKEN',
} as const satisfies Record<string, keyof TelegramEnv>;

export type TelegramBot = keyof typeof TELEGRAM_BOTS;

/** The bot's own token, else the Stock Alert bot's, so nothing is lost before a new bot is set up. */
export function botToken(env: TelegramEnv, bot: TelegramBot): string | undefined {
  return env[TELEGRAM_BOTS[bot]] || env.TELEGRAM_BOT_TOKEN;
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
type Log = (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Messages (pure functions, tested in tests/telegram.test.ts)
// ---------------------------------------------------------------------------

/** "Wednesday, 14 October 2026" for a YYYY-MM-DD key. */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** Active, not yet delivered orders whose delivery date is the given Jakarta day. Same rule as the Orders page. */
export function ordersForDelivery(orders: Order[], dayKey: string): Order[] {
  return orders
    .filter((o) =>
      o.orderStatus === 'ACTIVE' &&
      o.deliveryStatus === 'PENDING' &&
      // Delivery dates are stored as midnight UTC of the chosen day.
      o.deliveryDate !== null && o.deliveryDate.toISOString().slice(0, 10) === dayKey,
    )
    .sort((a, b) => a.orderId.localeCompare(b.orderId));
}

/** One message (chat bubble) per order. Name, address and phone have no labels so they can be copied as one block. */
export function deliveryMessage(order: Order, index: number, total: number, dayKey: string, products: StockProduct[]): string {
  const items = products.filter((p) => order.quantities[p.key] > 0).map((p) => `${order.quantities[p.key]} x ${p.label}`);
  const courier = courierService(order.websiteCity);
  return [
    `🚚 Delivery ${formatDayKey(dayKey)} (${index + 1}/${total})`,
    `Order ${order.orderId}`,
    // Out-of-town website orders: which courier to book (delivery-cities.ts).
    ...(courier ? [`📦 Send with: ${courier.toUpperCase()} (${order.websiteCity})`] : []),
    '',
    order.customerName,
    order.address,
    order.phoneNumber,
    '',
    'Order list:',
    ...items,
    '',
    order.paymentStatus === 'PAID' ? 'Payment: ✅ Paid' : order.paymentStatus === 'FREE' ? 'Payment: 🎁 FREE (reward)' : 'Payment: ⚠️ NOT PAID YET',
  ].join('\n');
}

/** Summary of the orders for tomorrow that are still unpaid, or null when every order is paid. */
export function unpaidMessage(orders: Order[], dayKey: string): string | null {
  const unpaid = orders.filter((o) => o.paymentStatus === 'PENDING');
  if (!unpaid.length) return null;
  return [
    `⚠️ ${unpaid.length} order${unpaid.length > 1 ? 's' : ''} NOT PAID yet but must be delivered ${formatDayKey(dayKey)}:`,
    '',
    ...unpaid.map((o) => `• ${o.orderId} — ${o.customerName} (${o.phoneNumber}), reseller ${o.reseller}`),
  ].join('\n');
}

/** Telegram warns when stock is below this, so production can start in time (Telegram only; the admin banner keeps <= 0). */
export const LOW_STOCK_LIMIT = 5;

export function lowStockProducts(inventory: Quantities, products: StockProduct[]): StockProduct[] {
  return products.filter((p) => inventory[p.key] < LOW_STOCK_LIMIT);
}

export function stockMessage(inventory: Quantities, products: StockProduct[]): string | null {
  const low = lowStockProducts(inventory, products);
  if (!low.length) return null;
  return [
    `🏭 Stock below ${LOW_STOCK_LIMIT} — production needed:`,
    '',
    ...low.map((p) => `• ${p.label}: ${inventory[p.key]}`),
    '',
    'Current stock: ' + products.map((p) => `${p.label} ${inventory[p.key]}`).join(', '),
  ].join('\n');
}

/** All messages of the evening run, in sending order (stock has its own bot, see checkLowStock). */
export function dailyMessages(orders: Order[], now: Date | number, products: StockProduct[]): string[] {
  const tomorrowKey = addDaysToKey(jakartaDateKey(now), 1);
  const due = ordersForDelivery(orders, tomorrowKey);
  const messages = due.length
    ? due.map((o, i) => deliveryMessage(o, i, due.length, tomorrowKey, products))
    : [`🚚 No deliveries for ${formatDayKey(tomorrowKey)}.`];
  const unpaid = unpaidMessage(due, tomorrowKey);
  if (unpaid) messages.push(unpaid);
  return messages;
}

/** What the owner transfers to a parent reseller per box of their resellers' delivered orders. */
export const PARENT_FEE_PER_BOX = 5000;

export function formatRupiah(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

/** Sent when a customer uploads a manual-transfer proof: the owner checks BCA and clicks "Confirm paid". */
export function websiteOrderProofMessage(o: ShopOrder, adminOrdersUrl: string, replaced: boolean): string {
  return [
    replaced ? `📎 New transfer proof (replaced) · order ${o.orderId}` : `📎 Transfer proof uploaded · order ${o.orderId}`,
    '',
    o.recipientName,
    displayPhone(o.recipientPhone),
    `Amount to check in BCA: ${formatRupiah(o.total)}`,
    '',
    `View the proof and click "Confirm paid": ${adminOrdersUrl}`,
  ].join('\n');
}

/** Sent once, the moment a website order is paid (unpaid website orders are never announced). */
export function websiteOrderPaidMessage(o: ShopOrder, customerEmail: string | null): string {
  const address = fullAddress(o);
  return [
    `🛒 New website order (PAID)`,
    `Order ${o.orderId}`,
    ...(courierService(o.city) ? [`📦 Send with: ${courierService(o.city)!.toUpperCase()} (${o.city})`] : []),
    '',
    // No labels: name, address (+ notes) and phone are copied as one block, like the delivery messages.
    o.recipientName,
    address,
    ...(o.notes ? [o.notes] : []),
    displayPhone(o.recipientPhone),
    '',
    ...(o.latitude !== null && o.longitude !== null ? [`Map: ${mapsLink(o.latitude, o.longitude)}`] : []),
    ...(o.guestKey ? ['Guest checkout (no login)'] : []),
    ...(customerEmail ? [`Customer email: ${customerEmail}`] : []),
    '',
    'Order list:',
    ...packLines(o.lines).map((l) => `${l.qty} x ${l.name}`),
    '',
    ...(o.discount ? [`Discount${o.voucherCode ? ` (${o.voucherCode})` : ''}: -${formatRupiah(o.discount)}`] : []),
    `Delivery fee: ${o.deliveryFee ? formatRupiah(o.deliveryFee) : 'free'}`,
    `Total paid: ${formatRupiah(o.total)}`,
    ...(o.deliveryDate !== null ? [`Delivery: ${formatDayKey(new Date(o.deliveryDate).toISOString().slice(0, 10))}`] : []),
  ].join('\n');
}

/** Sent once when a website order is still not paid 15 minutes after it was placed (Incoming Order bot). */
export function websiteOrderUnpaidMessage(o: ShopOrder, now: number, openedPayment: boolean, adminOrdersUrl: string): string {
  const minutes = Math.max(0, Math.round((now - o.createdAt) / 60000));
  const placed = new Date(o.createdAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
  return [
    `⏳ Website order NOT PAID yet (${minutes} min)`,
    `Order ${o.orderId} · placed ${placed} WIB`,
    '',
    o.recipientName,
    displayPhone(o.recipientPhone),
    '',
    'Order list:',
    ...packLines(o.lines).map((l) => `${l.qty} x ${l.name}`),
    `Total: ${formatRupiah(o.total)}`,
    '',
    ...(o.paymentMethod === 'TRANSFER'
      ? ['The customer chose manual BCA transfer and has not uploaded a transfer proof yet (24 hours to do so).', `Website Orders: ${adminOrdersUrl}`]
      : [
          openedPayment ? `The customer got the ${o.paymentMethod === 'OVO' ? 'OVO' : o.paymentMethod === 'SHOPEEPAY' ? 'ShopeePay' : o.paymentMethod === 'DANA' ? 'DANA' : 'QRIS'} payment page but has not paid.` : 'No payment page opened yet.',
          `Get the QRIS for this order (button "QRIS"): ${adminOrdersUrl}`,
        ]),
  ].join('\n');
}

type WeeklyReport = Awaited<ReturnType<typeof resellerSalesReport>>;

/** Sunday recap: weekly box total per parent reseller (same numbers as the admin Reseller Sales page) x Rp 5.000. */
export function parentRecapMessage(report: WeeklyReport): string {
  const range = `${formatDayKey(report.weekRange.start)} – ${formatDayKey(report.weekRange.end)}`;
  const parents = report.parentResellers
    .filter((p) => p.weeklySales > 0)
    .sort((a, b) => b.weeklySales - a.weeklySales || a.parentReseller.localeCompare(b.parentReseller));
  const header = [`💰 Parent reseller recap`, range, '(orders marked delivered, Sunday 12:00 to Sunday 12:00)'];
  if (!parents.length) return [...header, '', 'No delivered orders from resellers with a parent this week.'].join('\n');

  const totalBoxes = roundBoxes(parents.reduce((sum, p) => sum + p.weeklySales, 0));
  return [
    ...header,
    '',
    ...parents.flatMap((p, i) => {
      const children = p.children.filter((c) => c.weeklySales > 0).map((c) => `${c.reseller} ${c.weeklySales}`);
      return [
        `${i + 1}. ${p.parentReseller}`,
        `   ${p.weeklySales} box${p.weeklySales === 1 ? '' : 'es'} x ${formatRupiah(PARENT_FEE_PER_BOX)} = ${formatRupiah(p.weeklySales * PARENT_FEE_PER_BOX)}`,
        ...(children.length ? [`   (${children.join(', ')})`] : []),
        '',
      ];
    }),
    `Total to transfer: ${formatRupiah(totalBoxes * PARENT_FEE_PER_BOX)} (${totalBoxes} boxes)`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export function telegramConfigured(env: TelegramEnv, bot: TelegramBot): boolean {
  return Boolean(botToken(env, bot) && env.TELEGRAM_CHAT_ID);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTimeout = (error: unknown) => error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * Sends the messages one by one, in order (Telegram allows about one message per second per chat). Each message
 * gets up to 3 tries (see withRetry); `onSent` runs after each one went out, so a later retry can skip it.
 */
export async function sendTelegramMessages(
  env: TelegramEnv,
  bot: TelegramBot,
  messages: string[],
  fetchFn: FetchFn,
  pauseMs = 1000,
  opts: { attempts?: number; onSent?: () => Promise<void> } = {},
): Promise<number> {
  if (!telegramConfigured(env, bot)) return 0;
  const url = `https://api.telegram.org/bot${botToken(env, bot)}/sendMessage`;
  let sent = 0;
  for (const [i, text] of messages.entries()) {
    if (i > 0 && pauseMs) await sleep(pauseMs);
    await withRetry(async () => {
      let res: Response;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
        });
      } catch (error) {
        // A slow answer (our 10 s timeout) usually means Telegram DID deliver it: retrying sent the same order alert 3
        // times on 14 Nov 2026 and used up the time left for the emails after it. Count it as sent, never retry it.
        if (isTimeout(error)) return;
        throw error;
      }
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { description?: string; parameters?: { retry_after?: number } };
      const message = `Telegram sendMessage failed (${res.status}): ${body.description ?? 'unknown error'}`;
      if (res.status === 429) throw new RetryAfterError(message, ((body.parameters?.retry_after ?? 1) + 1) * 1000);
      throw new Error(message);
    }, opts.attempts);
    sent++;
    await opts.onSent?.();
  }
  return sent;
}

/**
 * Sends one message (3 tries); a message that still fails is reported on the Reporting bot and never thrown, so an
 * alert can never break the action behind it. Resolves to whether it went out.
 */
export type TelegramNotify = (text: string) => Promise<boolean | void>;

export function telegramNotifier(env: ReportEnv, bot: TelegramBot, fetchFn: FetchFn, log: Log): TelegramNotify {
  return async (text) => {
    try {
      return (await sendTelegramMessages(env, bot, [text], fetchFn, 0)) > 0;
    } catch (error) {
      log('error', 'telegram_send_failed', { bot, message: errorText(error) });
      const what = bot === 'orders' ? 'Telegram order alert (Incoming Order bot)' : `Telegram message (${bot} bot)`;
      await reportFailure(env, { job: `telegram-${bot}`, what, error }, { fetchFn, log });
      return false;
    }
  };
}

// ---------------------------------------------------------------------------
// Jobs (called from the Cron Trigger)
// ---------------------------------------------------------------------------

/** 19:00 WIB (Shipping bot): one bubble per order to deliver tomorrow, then the unpaid list. */
export async function sendDailySummary(
  env: TelegramEnv & { DB: D1Database },
  fetchFn: FetchFn,
  now = Date.now(),
  pauseMs = 1000,
  resume: { skip?: number; onSent?: () => Promise<void> } = {},
): Promise<number> {
  if (!telegramConfigured(env, 'shipping')) return 0;
  const products = await loadStockProducts(env.DB);
  const orders = await listOrders(env.DB, products);
  // A retry skips the bubbles an earlier try already sent.
  const messages = dailyMessages(orders, now, products).slice(resume.skip ?? 0);
  return sendTelegramMessages(env, 'shipping', messages, fetchFn, pauseMs, { onSent: resume.onSent });
}

/** Sunday 12:00 WIB (Reporting bot): what to transfer to each parent reseller for the week that just ended (Sunday 12:00 to Sunday 12:00). */
export async function sendParentRecap(env: TelegramEnv & { DB: D1Database }, fetchFn: FetchFn, now = Date.now()): Promise<number> {
  if (!telegramConfigured(env, 'reporting')) return 0;
  const report = await resellerSalesReport(env.DB, jakartaDateKey(now));
  return sendTelegramMessages(env, 'reporting', [parentRecapMessage(report)], fetchFn);
}

// Key name kept from when the limit was 0, so already-sent alerts are remembered.
const STOCK_STATE_KEY = 'telegram:negative-stock';

/**
 * Every 15 minutes (Stock Alert bot): alert once when a product drops below LOW_STOCK_LIMIT, and again only if it drops further.
 * The last alerted values are kept in notification_state, so the same shortage is not repeated every 15 minutes.
 */
export async function checkLowStock(
  env: TelegramEnv & { DB: D1Database },
  fetchFn: FetchFn,
  log: Log,
  now = Date.now(),
): Promise<boolean> {
  if (!telegramConfigured(env, 'stock')) return false;
  const products = await loadStockProducts(env.DB);
  const inventory = (await getInventory(env.DB, products)).quantities;
  const row = await env.DB
    .prepare('SELECT value FROM notification_state WHERE key = ?')
    .bind(STOCK_STATE_KEY)
    .first<{ value: string }>();
  const alerted = (row ? JSON.parse(row.value) : {}) as Partial<Record<string, number>>;

  const next: Partial<Record<string, number>> = {};
  let worse = false;
  for (const { key } of lowStockProducts(inventory, products)) {
    const before = alerted[key];
    if (before === undefined || inventory[key] < before) worse = true;
    next[key] = before === undefined ? inventory[key] : Math.min(before, inventory[key]);
  }

  if (worse) {
    const text = stockMessage(inventory, products);
    if (text) await sendTelegramMessages(env, 'stock', [text], fetchFn);
    log('info', 'telegram_low_stock', { products: Object.keys(next) });
  }
  if (JSON.stringify(next) !== JSON.stringify(alerted)) {
    await env.DB
      .prepare(
        `INSERT INTO notification_state (key, value, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      )
      .bind(STOCK_STATE_KEY, JSON.stringify(next), now)
      .run();
  }
  return worse;
}
