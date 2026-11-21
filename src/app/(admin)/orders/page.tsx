import { listOrders } from '@/lib/core/orders';
import { loadStockProducts } from '@/lib/core/products';
import { listResellersAlphabetical } from '@/lib/core/resellers';
import { addDaysToKey, jakartaDateKey } from '@/lib/core/time';
import { getDB } from '@/lib/server';
import { listDaysOff } from '@/lib/shop/days-off';
import { fullAddress, listWebsiteOrders } from '@/lib/shop/orders';
import { expireUnpaidOrders } from '@/lib/shop/events';
import { afterAction, emailLinks, ownerEmail, paymentGateways, metaPurchase, telegram } from '@/lib/shop/server';
import OrdersPanel from '@/components/OrdersPanel';
import { loadCostSettings, monthKeyOf } from '@/lib/core/costs';
import { orderNetProfit } from '@/lib/core/orderProfit';
import { resellerOrderCharge } from '@/lib/core/resellerPrice';
import { hppLookup } from '@/lib/marketing/adsReport';

// Always read live data.
export const dynamic = 'force-dynamic';

const ms = (d: Date | null) => (d ? d.getTime() : null);

/** Orders: website orders and reseller orders in one list (newest first). */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const db = getDB();
  // Also cancel expired unpaid website orders now (the scheduled job does this every 15 minutes too).
  const gateways = paymentGateways();
  if (gateways.length) {
    afterAction('expire_unpaid', async () => (await expireUnpaidOrders(db, gateways, emailLinks(), ownerEmail(), Date.now(), telegram(), metaPurchase())).emails);
  }
  const products = await loadStockProducts(db);
  const [website, allOrders, resellers, daysOff] = await Promise.all([listWebsiteOrders(db), listOrders(db, products), listResellersAlphabetical(db), listDaysOff(db, Date.now())]);
  // Reseller label name + phone for the shipping label ("DARI"); resellers are unique per name + parent.
  const byKey = new Map(resellers.map((r) => [`${r.reseller}|${r.parentReseller ?? ''}`, r]));
  const today = jakartaDateKey(Date.now());
  // Net profit per order (owner 14 Nov): HPP of the month the order was placed, looked up once per month.
  const settings = await loadCostSettings(db);
  const hppByMonth = new Map<string, Awaited<ReturnType<typeof hppLookup>>>();
  const hppFor = async (at: number) => {
    const key = monthKeyOf(at);
    if (!hppByMonth.has(key)) hppByMonth.set(key, await hppLookup(db, key));
    return hppByMonth.get(key)!.cost;
  };
  for (const o of website) await hppFor(o.createdAt);
  for (const o of allOrders) await hppFor(o.date.getTime());
  const hppAt = (at: number) => hppByMonth.get(monthKeyOf(at))!.cost;

  return (
    <OrdersPanel
      initialQuery={typeof q === 'string' ? q.slice(0, 80) : ''}
      today={today}
      tomorrow={addDaysToKey(today, 1)}
      gatewayLabel={gateways[0]?.label ?? null}
      qris={gateways.some((g) => g.name === 'doku')}
      daysOff={daysOff}
      products={products.map((p) => ({ key: p.key, label: p.label, boxValue: p.boxValue }))}
      // Website orders are also copied into the reseller order table (fromWebsite): they are shown once, from the shop.
      resellerOrders={allOrders
        .filter((o) => !o.fromWebsite)
        .map((o) => {
          const r = byKey.get(`${o.reseller}|${o.parentReseller ?? ''}`);
          return {
            id: o.id,
            orderId: o.orderId,
            createdAt: o.date.getTime(),
            customerName: o.customerName,
            reseller: o.reseller,
            parentReseller: o.parentReseller,
            address: o.address,
            phoneNumber: o.phoneNumber,
            quantities: o.quantities,
            isPaydayPromo: o.isPaydayPromo,
            orderStatus: o.orderStatus,
            paymentStatus: o.paymentStatus,
            deliveryStatus: o.deliveryStatus,
            deliveryDate: ms(o.deliveryDate),
            courierFee: o.courierFee,
            profit: orderNetProfit({
              income: resellerOrderCharge({
                boxes: products.reduce((n, p) => n + (o.quantities[p.key] ?? 0) * p.boxValue, 0),
                payday: o.isPaydayPromo,
                free: o.paymentStatus === 'FREE',
              }).total,
              packs: products.map((p) => ({ key: p.key, qty: o.quantities[p.key] ?? 0 })),
              hpp: hppAt(o.date.getTime()),
              paymentFeePercent: 0,
              paidAmount: 0,
              courierFee: o.courierFee,
            }),
            resellerPhone: r?.phone ?? null,
            resellerLabelName: r?.labelName ?? null,
          };
        })}
      orders={website.map((o) => ({
        id: o.orderRowId,
        orderId: o.orderId,
        createdAt: o.createdAt,
        customerEmail: o.customerEmail,
        customerName: o.customerName,
        deliveryDate: o.deliveryDate,
        recipientName: o.recipientName,
        recipientPhone: o.recipientPhone,
        address: fullAddress(o),
        notes: o.notes,
        latitude: o.latitude,
        longitude: o.longitude,
        // Bundle packs show with the bundle's name; a product split over two lines (bundle price rounding) is merged.
        lines: o.lines.reduce<{ name: string; qty: number; websiteOnly: boolean; key: string | null }[]>((out, l) => {
          const name = l.bundle ? `${l.name} (${l.bundle.name})` : l.name;
          const same = out.find((x) => x.name === name);
          if (same) same.qty += l.qty;
          else out.push({ name, qty: l.qty, websiteOnly: !l.stockColumn, key: l.stockColumn });
          return out;
        }, []),
        subtotal: o.subtotal,
        discount: o.discount,
        deliveryFee: o.deliveryFee,
        total: o.total,
        voucherCode: o.voucherCode,
        proofUploadedAt: o.proofUploadedAt,
        paymentMethod: o.paymentMethod,
        placedByOwner: o.placedByOwner,
        paidInvoice: o.paidInvoice,
        paidVia: o.paidVia,
        shippedAt: o.shippedAt,
        deliveredAt: o.deliveredAt,
        trackingUrl: o.trackingUrl,
        courier: o.courier,
        trackingNumber: o.trackingNumber,
        courierFee: o.courierFee,
        profit: orderNetProfit({
          income: o.subtotal - o.discount + o.deliveryFee,
          packs: o.lines.map((l) => ({ key: l.stockColumn ?? l.product, qty: l.qty })),
          hpp: hppAt(o.createdAt),
          paymentFeePercent: settings.paymentFeePercent,
          paidAmount: o.total,
          courierFee: o.courierFee,
        }),
        cancelReason: o.cancelReason,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        deliveryStatus: o.deliveryStatus,
      }))}
    />
  );
}
