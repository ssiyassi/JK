// Net profit of ONE order, for the order sheet on the admin Orders page (owner, 14 Nov 2026). Same rules as the
// monthly profit (costs.ts monthlyProfit) and the Reports page, without ad spend:
//   income      website: products paid (subtotal − voucher) + delivery fee charged; reseller: boxes + delivery fee charged
//   product cost  HPP of the month the order was placed × packs (free orders too)
//   payment fee   website only: % of the amount paid
//   courier fee   what the owner paid the courier (not entered yet = counted as 0 and flagged)
// Framework-free (tests/shop.test.ts).

export interface OrderProfitInfo {
  income: number;
  productCost: number | null; // null = a product has no HPP yet
  paymentFee: number;
  courierFee: number;
  courierMissing: boolean;
  net: number | null;
}

export function orderNetProfit(input: {
  income: number;
  packs: { key: string; qty: number }[];
  hpp: (key: string) => number | null;
  paymentFeePercent: number; // 0 for reseller orders
  paidAmount: number;
  courierFee: number | null;
}): OrderProfitInfo {
  let productCost: number | null = 0;
  for (const p of input.packs) {
    if (p.qty <= 0) continue;
    const c = input.hpp(p.key);
    if (c === null) {
      productCost = null;
      break;
    }
    productCost += c * p.qty;
  }
  const paymentFee = Math.round((input.paidAmount * input.paymentFeePercent) / 100);
  const courierFee = input.courierFee ?? 0;
  const net = productCost === null ? null : Math.round(input.income - productCost - paymentFee - courierFee);
  return { income: input.income, productCost: productCost === null ? null : Math.round(productCost), paymentFee, courierFee, courierMissing: input.courierFee === null, net };
}
