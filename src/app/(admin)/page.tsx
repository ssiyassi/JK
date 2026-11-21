import Link from 'next/link';
import { getInventory as readInventory } from '@/lib/core/inventory';
import { loadStockProducts } from '@/lib/core/products';
import { addDaysToKey, jakartaDateKey } from '@/lib/core/time';
import { loadCostSettings, monthKeyOf } from '@/lib/core/costs';
import { dayStart, hppLookup, paidOrders } from '@/lib/marketing/adsReport';
import { signed } from '@/lib/marketing/reportPdf';
import { getDB } from '@/lib/server';
import { formatRupiah } from '@/lib/shop/catalog';
import { listCheckoutLeads } from '@/lib/shop/checkoutLeads';
import { listWebsiteOrders } from '@/lib/shop/orders';
import OwnerOrderButton from '@/components/admin/OwnerOrderButton';
import { Card, Icon, Kpi, PRODUCT_COLORS, fmtDate, fmtDay, cx } from '@/components/admin/ui';

// Always read live data (never pre-rendered at build time).
export const dynamic = 'force-dynamic';

const DAY = 86400000;

/** Today: what needs the owner now, the day's numbers and the stock. Reads only, changes nothing. */
export default async function TodayPage() {
  const db = getDB();
  const now = Date.now();
  const todayKey = jakartaDateKey(now);
  const yesterdayKey = jakartaDateKey(now - DAY);
  const [products, orders, leads, meta, google] = await Promise.all([
    loadStockProducts(db),
    listWebsiteOrders(db, 300),
    listCheckoutLeads(db, now).catch(() => []),
    db.prepare('SELECT date, SUM(spend) AS spend FROM meta_ad_insights WHERE date >= ? GROUP BY date').bind(yesterdayKey).all<{ date: string; spend: number }>().catch(() => ({ results: [] })),
    db.prepare('SELECT date, SUM(spend) AS spend FROM google_ad_insights WHERE date >= ? GROUP BY date').bind(yesterdayKey).all<{ date: string; spend: number }>().catch(() => ({ results: [] })),
  ]);
  const { quantities: stock } = await readInventory(db, products);

  const active = orders.filter((o) => o.orderStatus === 'ACTIVE');
  const paidOn = (key: string) => active.filter((o) => o.paymentStatus === 'PAID' && o.paidAt !== null && jakartaDateKey(o.paidAt) === key);
  const boxes = (list: typeof orders) => list.reduce((n, o) => n + o.lines.filter((l) => l.stockColumn).reduce((m, l) => m + l.qty, 0), 0);
  const sum = (list: typeof orders) => list.reduce((n, o) => n + o.total, 0);
  const today = paidOn(todayKey);
  const yesterday = paidOn(yesterdayKey);
  const spendOn = (key: string) =>
    (meta.results.find((r) => r.date === key)?.spend ?? 0) + (google.results.find((r) => r.date === key)?.spend ?? 0);
  const spendToday = spendOn(todayKey);
  // Profit after ads today (owner 14 Nov): all paid website orders of today (sales − product cost − payment fee −
  // courier fee, the same sum as the Reports page) minus today's ad spend. null when a product has no HPP yet.
  const profitToday = await (async () => {
    try {
      const [settings, hpp] = await Promise.all([loadCostSettings(db), hppLookup(db, monthKeyOf(dayStart(todayKey)))]);
      const list = await paidOrders(db, dayStart(todayKey), dayStart(addDaysToKey(todayKey, 1)), hpp.cost, settings.paymentFeePercent, hpp.complete);
      return list.some((o) => o.profit === null) ? null : list.reduce((n, o) => n + (o.profit ?? 0), 0);
    } catch {
      return null;
    }
  })();
  const afterAds = profitToday === null ? null : profitToday - spendToday;

  const unpaid = active.filter((o) => o.paymentStatus === 'PENDING' && now - o.createdAt > 15 * 60000);
  const toDeliver = active.filter((o) => o.paymentStatus === 'PAID' && o.deliveryStatus === 'PENDING' && !o.shippedAt);
  const nextDay = toDeliver.reduce<number | null>((d, o) => (o.deliveryDate !== null && (d === null || o.deliveryDate < d) ? o.deliveryDate : d), null);
  const nextList = nextDay === null ? toDeliver : toDeliver.filter((o) => o.deliveryDate === nextDay);
  const low = products.filter((p) => stock[p.key] <= 10).sort((a, b) => stock[a.key] - stock[b.key]);
  const openLeads = leads.filter((l) => !l.contactedAt);
  const totalBoxes = products.reduce((n, p) => n + stock[p.key], 0);

  const week = Array.from({ length: 7 }, (_, i) => {
    const key = jakartaDateKey(now - (6 - i) * DAY);
    return { key, total: sum(paidOn(key)) };
  });
  const weekMax = Math.max(1, ...week.map((d) => d.total));
  const delta = (a: number, b: number) => (a === b ? null : a > b ? `+${a - b}` : `${a - b}`);
  const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100));
  const salesPct = pct(sum(today), sum(yesterday));

  const tasks: { icon: string; tone: string; title: string; sub: string; href: string; action: string; primary?: boolean }[] = [];
  if (unpaid.length)
    tasks.push({
      icon: 'clock',
      tone: 'bg-[#fff7e6] text-[#b45309]',
      title: `${unpaid.length} order${unpaid.length > 1 ? 's' : ''} unpaid for more than 15 minutes`,
      sub: unpaid.slice(0, 3).map((o) => `#${o.orderId} ${o.recipientName} · ${formatRupiah(o.total)}`).join('  ·  '),
      href: '/orders',
      action: 'Open',
    });
  if (toDeliver.length)
    tasks.push({
      icon: 'truck',
      tone: 'bg-[#eff6ff] text-[#1d4ed8]',
      title: `${nextList.length} order${nextList.length > 1 ? 's' : ''} to deliver on ${fmtDay(nextDay)}`,
      sub: `${boxes(nextList)} boxes${toDeliver.length > nextList.length ? ` · ${toDeliver.length} to deliver in total` : ''}`,
      href: '/orders',
      action: 'Open list',
      primary: true,
    });
  for (const p of low.slice(0, 2))
    tasks.push({
      icon: 'alert',
      tone: 'bg-[#fef2f2] text-[#b91c1c]',
      title: `${p.label} is ${stock[p.key] < 1 ? 'out of stock' : 'running low'} — ${stock[p.key]} boxes left`,
      sub: 'Add a production when you make more.',
      href: '/inventory/production',
      action: 'Add production',
    });
  if (openLeads.length)
    tasks.push({
      icon: 'cart',
      tone: 'bg-[#f5f3ff] text-[#6d28d9]',
      title: `${openLeads.length} ${openLeads.length > 1 ? 'people' : 'person'} left checkout without paying`,
      sub: `${formatRupiah(openLeads.reduce((n, l) => n + l.subtotal, 0))} in carts`,
      href: '/website-customers/checkouts',
      action: 'See who',
    });

  return (
    <>
      <div className="lg:hidden sticky top-0 z-20 -mx-4 mb-1 flex items-center gap-2.5 bg-[#f6f5f2]/95 px-4 py-3 backdrop-blur">
        <span className="grid size-[34px] place-items-center rounded-[9px] bg-[#9a3412] font-serif font-extrabold text-white">J</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-[#52525b]">{fmtDate(now)}</div>
          <div className="text-base font-bold">Jentis Kitchen admin</div>
        </div>
      </div>
      <div className="mb-5 hidden items-end lg:flex">
        <div>
          <div className="text-[13px] font-semibold text-[#52525b]">{fmtDate(now)}</div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Today</h1>
          <p className="text-[#52525b]">{tasks.length ? `${tasks.length} thing${tasks.length > 1 ? 's' : ''} need you. Everything else runs on its own.` : 'Nothing needs you right now.'}</p>
        </div>
        <OwnerOrderButton className="ml-auto" />
      </div>
      <OwnerOrderButton className="mb-3 lg:hidden" />

      <div className="mb-[18px] grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
        <Kpi
          label={`Website sales · ${fmtDate(now)}`}
          value={formatRupiah(sum(today))}
          note={salesPct === null ? `${fmtDate(now - DAY)}: ${formatRupiah(sum(yesterday))}` : <span className={salesPct >= 0 ? 'font-semibold text-[#15803d]' : 'font-semibold text-[#b91c1c]'}>{salesPct >= 0 ? '↗' : '↘'} {Math.abs(salesPct)}% vs {fmtDate(now - DAY)}</span>}
        />
        <Link href="/marketing-report" className="contents">
          <Kpi
            label={<span className="flex items-center">Ad spend · {fmtDate(now)}<Icon name="right" className="ml-auto size-4 text-[#9a3412]" /></span>}
            value={formatRupiah(spendToday)}
            note={
              afterAds === null ? (
                <span>Profit after ads: HPP missing</span>
              ) : (
                <span>
                  Profit after ads <b className={afterAds >= 0 ? 'text-[#15803d]' : 'text-[#b91c1c]'}>{signed(afterAds)}</b>
                </span>
              )
            }
          />
        </Link>
        <div className="hidden lg:block">
          <Kpi label="Paid orders" value={today.length} note={delta(today.length, yesterday.length) ? `${delta(today.length, yesterday.length)} vs ${fmtDate(now - DAY)}` : `same as ${fmtDate(now - DAY)}`} />
        </div>
        <div className="hidden lg:block">
          <Kpi label="Boxes sold" value={boxes(today)} note={`${fmtDate(now - DAY)}: ${boxes(yesterday)}`} />
        </div>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Card title={<>Needs you {tasks.length > 0 && <span className="a-pill ml-1.5 bg-[#fef2f2] text-[#b91c1c]">{tasks.length}</span>}</>}>
            {tasks.length === 0 && <p className="px-[18px] py-6 text-center text-[#a1a1aa]">All done. 🎉</p>}
            {tasks.length > 0 && <div className="flex flex-col gap-2 p-3">{tasks.map((t, i) => (
              <div key={i} className="flex items-center gap-3.5 rounded-xl border border-[#ebe8e3] bg-white px-3.5 py-3">
                <span className={cx('grid size-[38px] shrink-0 place-items-center rounded-[10px]', t.tone)}>
                  <Icon name={t.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.title}</div>
                  <div className="truncate text-[12.5px] text-[#52525b]">{t.sub}</div>
                </div>
                <Link href={t.href} className={cx('a-btn a-btn-sm shrink-0', t.primary && 'a-btn-pri')}>
                  {t.action}
                </Link>
              </div>
            ))}</div>}
          </Card>

          {nextList.length > 0 && (
            <Card title={<>Deliveries on {fmtDay(nextDay)}</>} right={<Link href="/orders" className="flex items-center gap-1 text-[13px] font-semibold text-[#9a3412]">All orders<Icon name="right" className="size-4" /></Link>}>
              <div className="flex flex-col gap-2 p-3">
                {nextList.slice(0, 8).map((o) => (
                  <div key={o.orderRowId} className="flex items-center gap-3 rounded-xl border border-[#ebe8e3] bg-white px-3.5 py-2.5 text-sm">
                    <span className="w-[120px] shrink-0 font-semibold tabular-nums">#{o.orderId}</span>
                    <span className="min-w-0 flex-1 truncate">{o.recipientName}</span>
                    <span className="hidden text-[#52525b] sm:inline">{o.city}</span>
                    <span className="tabular-nums text-[#52525b]">{o.lines.filter((l) => l.stockColumn).reduce((m, l) => m + l.qty, 0)} boxes</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <Card title={<>Stock <span className="ml-1 text-xs font-normal text-[#a1a1aa]">boxes in the freezer</span></>} right={<Link href="/inventory" className="flex items-center gap-1 text-[13px] font-semibold text-[#9a3412]">Stock<Icon name="right" className="size-4" /></Link>}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 p-4 lg:grid-cols-1 lg:p-[18px]">
              {products.map((p, i) => {
                const n = stock[p.key];
                return (
                  <div key={p.key}>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 rounded-[3px]" style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                      <span className="font-semibold">{p.label}</span>
                      <b className={cx('ml-auto tabular-nums', n <= 0 ? 'text-[#b91c1c]' : n <= 10 ? 'text-[#b45309]' : '')}>{n}</b>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f3f1ed]">
                      <i className={cx('block h-full rounded-full', n <= 0 ? 'bg-[#ef4444]' : n <= 10 ? 'bg-[#f59e0b]' : 'bg-[#15803d]')} style={{ width: `${Math.max(2, Math.min(100, (n / 50) * 100))}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="col-span-2 border-t border-[#f3f1ed] pt-3 text-[13px] text-[#52525b] lg:col-span-1">{totalBoxes} boxes in stock</div>
            </div>
          </Card>

          <Card className="hidden lg:block" title="Website sales, last 7 days" right={<b className="tabular-nums">{formatRupiah(week.reduce((n, d) => n + d.total, 0))}</b>}>
            <div className="flex h-[170px] items-end gap-2.5 px-[18px] pb-4 pt-3">
              {week.map((d, i) => (
                <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <i className={cx('block w-full max-w-[34px] rounded-t-md', i === 6 ? 'bg-[#9a3412]' : 'bg-[#e9d5c3]')} style={{ height: `${Math.max(3, (d.total / weekMax) * 100)}%` }} title={formatRupiah(d.total)} />
                  <span className={cx('whitespace-nowrap text-[10px]', i === 6 ? 'font-bold text-[#18181b]' : 'text-[#a1a1aa]')}>{d.key.slice(8, 10)}/{d.key.slice(5, 7)}/{d.key.slice(0, 4)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
