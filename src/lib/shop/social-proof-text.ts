// Client-safe part of src/lib/shop/socialProof.ts: the data shape and the "2 jam lalu" text.

export interface RecentOrder {
  name: string | null; // masked first name, e.g. "Ri***" (maskedName); null = unknown
  area: string | null;
  qty: number;
  product: string; // one product of the order: an order of 2 products is 2 lines (owner, 2026-11-06)
  order: number; // which order the line belongs to (lines of one order are never shown one after another)
  at: number;
}

export interface SocialProof {
  recent: RecentOrder[];
  soldBoxes: number; // boxes in real orders over the last SOLD_DAYS days
  soldByProduct: { key: string; name: string; boxes: number }[]; // same window, most sold first; key = stock column (babiManis…)
  todayOrders: number; // real orders placed today (Jakarta day)
  closedDays: string[];
  full: boolean;
}

/** "baru saja", "12 menit lalu", "3 jam lalu", "kemarin", "4 hari lalu". */
export function timeAgo(at: number, now: number): string {
  const min = Math.max(0, Math.floor((now - at) / 60_000));
  if (min < 5) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'kemarin' : `${days} hari lalu`;
}
