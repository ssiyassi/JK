// All business dates are interpreted in Asia/Jakarta (WIB, UTC+7, no daylight saving).
//
// Why: the app originally ran on a laptop set to WIB and used the server's local clock for
// order IDs, "today", reseller weeks and reward periods. Cloudflare runs in UTC, so without
// this module every one of those boundaries would silently shift by 7 hours.
// These helpers reproduce the laptop behaviour regardless of where the code runs.

export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface JakartaParts {
  year: number;
  month: number; // 0-11
  day: number; // 1-31
  weekday: number; // 0 = Sunday
}

/** Calendar parts of an instant, as seen on a wall clock in Jakarta. */
export function jakartaParts(instant: Date | number): JakartaParts {
  const shifted = new Date(new Date(instant).getTime() + JAKARTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant at which the given Jakarta wall-clock time occurs. Out-of-range values roll over like Date. */
export function jakartaInstant(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): Date {
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds, ms) - JAKARTA_OFFSET_MS);
}

/** YYYY-MM-DD of the Jakarta calendar day containing the instant. */
export function jakartaDateKey(instant: Date | number): string {
  const p = jakartaParts(instant);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Order ID prefix DDMMYYYY for the Jakarta day of the instant (format unchanged from the original app). */
export function orderIdPrefix(instant: Date | number): string {
  const p = jakartaParts(instant);
  return `${String(p.day).padStart(2, '0')}${String(p.month + 1).padStart(2, '0')}${p.year}`;
}

/**
 * Interpret the reseller-sales `date` query parameter.
 * The page sends YYYY-MM-DD; `new Date('YYYY-MM-DD')` is UTC midnight, which on the WIB laptop
 * fell on that same Jakarta calendar day. We resolve it to noon Jakarta time on that day so the
 * calendar day is unambiguous.
 */
export function parseBaseDate(param: string | null, now: Date = new Date()): Date {
  if (param) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param.trim());
    if (m) return jakartaInstant(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    const parsed = new Date(param);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return now;
}

/** Monday 00:00 to Sunday 23:59:59.999 (Jakarta) of the week containing baseDate. */
export function jakartaWeek(baseDate: Date): { monday: Date; sunday: Date; startKey: string; endKey: string } {
  const p = jakartaParts(baseDate);
  const daysToMonday = p.weekday === 0 ? -6 : 1 - p.weekday;
  const monday = jakartaInstant(p.year, p.month, p.day + daysToMonday);
  const sunday = new Date(monday.getTime() + 7 * DAY_MS - 1);
  return { monday, sunday, startKey: jakartaDateKey(monday), endKey: jakartaDateKey(sunday) };
}

/** The Sunday recaps go out at 12:00 WIB (custom-worker.ts, cron "0 5 * * SUN"). */
export const RECAP_HOUR = 12;

/**
 * Recap week for reseller sales (owner, 2026-11-01): from Sunday 12:00 WIB to the next Sunday 12:00 WIB, by the moment an
 * order was marked delivered. The week is the one ending on the first Sunday 12:00 at or after baseDate, so a delivery
 * marked on Sunday evening counts for the next week's recap. start is exclusive, end inclusive.
 */
export function jakartaRecapWeek(baseDate: Date): { start: Date; end: Date; startKey: string; endKey: string } {
  const p = jakartaParts(baseDate);
  let end = jakartaInstant(p.year, p.month, p.day + ((7 - p.weekday) % 7), RECAP_HOUR);
  if (end.getTime() < baseDate.getTime()) end = new Date(end.getTime() + 7 * DAY_MS);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  return { start, end, startKey: jakartaDateKey(start), endKey: jakartaDateKey(end) };
}

const PERIOD_NAMES = [
  'January & February',
  'March & April',
  'May & June',
  'July & August',
  'September & October',
  'November & December',
];

/**
 * Two-month reward period containing baseDate, in Jakarta time.
 * Same periods and names as the original. One deliberate fix: the January & February period now
 * ends on the true last day of February (the original stopped at 28 Feb, dropping 29 Feb in leap years).
 */
export function rewardPeriod(baseDate: Date): { start: Date; end: Date; name: string } {
  const p = jakartaParts(baseDate);
  const index = Math.floor(p.month / 2);
  const startMonth = index * 2;
  const start = jakartaInstant(p.year, startMonth, 1);
  // Day 0 of the month after the period = last day of the period's second month.
  const end = jakartaInstant(p.year, startMonth + 2, 0, 23, 59, 59, 999);
  return { start, end, name: PERIOD_NAMES[index] };
}

export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Website orders placed before this Jakarta hour can be delivered the same day (owner's rule, 2026-10-24). */
export const SAME_DAY_CUTOFF_HOUR = 14;

/**
 * Earliest delivery day of a website order: the same Jakarta day when placed before 14:00 WIB, otherwise the next day;
 * moved to Monday when that is a Sunday (no Sunday deliveries). Returns YYYY-MM-DD.
 */
export function websiteDeliveryDateKey(orderedAt: Date | number): string {
  const today = jakartaDateKey(orderedAt);
  const hour = new Date(new Date(orderedAt).getTime() + JAKARTA_OFFSET_MS).getUTCHours();
  const first = hour < SAME_DAY_CUTOFF_HOUR ? today : addDaysToKey(today, 1);
  const [y, m, d] = first.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0 ? addDaysToKey(first, 1) : first;
}

/** Delivery dates are stored as midnight UTC of the delivery day (same as the admin order form). */
export function deliveryDateFromKey(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`);
}

/** The Telegram delivery list for tomorrow goes out at 19:00 WIB (DAILY_SUMMARY_CRON in shop/scheduled.ts). */
const DELIVERY_LIST_HOUR = 19;

/**
 * What the owner should know before moving an order to this day by hand (Website Orders). These never block the change:
 * a Sunday or a day off is the owner's call, and an order moved to a day whose list already went out must be remembered.
 */
export function deliveryDayWarnings(dateKey: string, daysOff: readonly { startDate: string; endDate: string }[], now: Date | number): string[] {
  const warnings: string[] = [];
  if (new Date(deliveryDateFromKey(dateKey)).getUTCDay() === 0) warnings.push('This is a Sunday. Customers cannot pick Sundays at checkout.');
  if (daysOff.some((d) => d.startDate <= dateKey && dateKey <= d.endDate)) warnings.push('This is a store day off.');
  const today = jakartaDateKey(now);
  const hour = new Date(new Date(now).getTime() + JAKARTA_OFFSET_MS).getUTCHours();
  if (dateKey === today || (dateKey === addDaysToKey(today, 1) && hour >= DELIVERY_LIST_HOUR)) {
    warnings.push('The 19:00 Telegram delivery list for this day has already gone out, so this order will not be on it.');
  }
  return warnings;
}

/** How many delivery days a customer can pick from at checkout (from the earliest day, Sundays skipped). */
export const WEBSITE_DELIVERY_CHOICES = 14;

/**
 * Delivery days a customer can choose for a website order placed now: the earliest day first, no Sundays and none of
 * the owner's days off (`closedDays`, YYYY-MM-DD, Schedule → Store Days Off). Days off push the earliest day to the next open day.
 * `leadDays` > 0 (courier cities, shop/delivery-cities.ts): the earliest day is that many days after today, at any hour of the order.
 */
export function websiteDeliveryOptions(
  orderedAt: Date | number,
  closedDays: readonly string[] = [],
  count = WEBSITE_DELIVERY_CHOICES,
  leadDays = 0,
): string[] {
  const closed = new Set(closedDays);
  const days: string[] = [];
  const first = leadDays > 0 ? addDaysToKey(jakartaDateKey(orderedAt), leadDays) : websiteDeliveryDateKey(orderedAt);
  for (let key = first; days.length < count; key = addDaysToKey(key, 1)) {
    const [y, m, d] = key.split('-').map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0 && !closed.has(key)) days.push(key);
  }
  return days;
}

/** Indonesian month names, January first. */
export const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
