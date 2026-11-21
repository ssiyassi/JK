// The "Kota" dropdown at checkout (owner, 2026-11-03). Cities where we deliver ourselves keep the same-day rule of
// websiteDeliveryDateKey; the new cities go by courier. The date a customer picks is always the day we send the order
// (so the 19:00 Telegram list works for every city): for courier cities the soonest is tomorrow, and checkout says the
// package takes 1 more business day to arrive.
// Hidden until the owner says the new delivery is ready: switched on by NEW_CITY_DELIVERY=on (newCityDelivery in server.ts).
export const SAME_DAY_CITIES = ['Jakarta', 'Tangerang', 'Bekasi', 'Depok'] as const;
export const COURIER_CITIES = ['Badung', 'Bandung', 'Bogor', 'Denpasar', 'Malang', 'Medan', 'Palembang', 'Semarang', 'Sidoarjo', 'Surabaya', 'Yogyakarta'] as const;
export const DELIVERY_CITIES: readonly string[] = [...SAME_DAY_CITIES, ...COURIER_CITIES];

/** Courier cities' delivery fee (owner, 2026-11-06): Rp 25.000 below 4 packs, free from 4. Other cities: deliveryFee. */
export const COURIER_FEE = 25000;
export const COURIER_FREE_FROM = 4;

export const isCourierCity = (city: string | undefined): boolean => Boolean(city) && (COURIER_CITIES as readonly string[]).includes(city!);

/** Courier the owner uses per city (owner, 2026-11-06): shown at checkout and in the Telegram delivery list. */
export const TIKI_ONS_CITIES = ['Badung', 'Denpasar', 'Medan'] as const;
export const courierService = (city: string | null | undefined): string | null =>
  !city || !isCourierCity(city) ? null : (TIKI_ONS_CITIES as readonly string[]).includes(city) ? 'TIKI One Night Service' : 'Paxel Nextday';

/** Soonest sending day for the courier cities, in days after the order. */
export const COURIER_LEAD_DAYS = 1;

export const isDeliveryCity = (city: string): boolean => DELIVERY_CITIES.includes(city);

/** Days after the order before the soonest sending day: 0 = the usual same-day rule. */
export const cityLeadDays = (city: string): number => ((COURIER_CITIES as readonly string[]).includes(city) ? COURIER_LEAD_DAYS : 0);
