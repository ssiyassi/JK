// What a reseller order costs (the owner's rule, 13 Nov 2026). Nothing is stored: it is worked out from the boxes.
//   Payday promo: every 3 boxes = Rp350.000, each box left over = Rp140.000.
//   Otherwise:    every box = Rp140.000.
//   Delivery: Rp15.000 when the order is exactly 1 box, free for 2 or more.
//   Free product (reward boxes): Rp0, no delivery fee.

export const RESELLER_BOX_PRICE = 140_000;
export const RESELLER_PAYDAY_3_BOXES = 350_000;
export const RESELLER_ONE_BOX_DELIVERY = 15_000;

export function resellerOrderCharge({ boxes, payday, free }: { boxes: number; payday: boolean; free: boolean }): {
  price: number;
  deliveryFee: number;
  total: number;
} {
  const n = Math.max(0, Math.round(boxes));
  if (free || n === 0) return { price: 0, deliveryFee: 0, total: 0 };
  const price = payday ? Math.floor(n / 3) * RESELLER_PAYDAY_3_BOXES + (n % 3) * RESELLER_BOX_PRICE : n * RESELLER_BOX_PRICE;
  const deliveryFee = n === 1 ? RESELLER_ONE_BOX_DELIVERY : 0;
  return { price, deliveryFee, total: price + deliveryFee };
}
