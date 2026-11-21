import Link from 'next/link';
import { getInventory as readInventory } from '@/lib/core/inventory';
import { loadStockProducts } from '@/lib/core/products';
import { getDB } from '@/lib/server';
import { Icon, PRODUCT_COLORS, PageHeader, Pill, STOCK_TABS, Tabs, cx } from '@/components/admin/ui';

// Always read live data (never pre-rendered at build time).
export const dynamic = 'force-dynamic';

const DAYS = 14;

// Reads the live inventory directly. If it cannot be read, the error page is shown:
// the page never displays made-up stock numbers.
export default async function InventoryPage() {
  const db = getDB();
  const products = await loadStockProducts(db);
  const { quantities: stock } = await readInventory(db, products);
  // Boxes that left through orders in the last 14 days, per product: "about N days left" at that pace.
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const { results } = await db
    .prepare(`SELECT * FROM stock_movement_history WHERE type = 'ORDER' AND date >= ?`)
    .bind(since)
    .all<Record<string, unknown>>()
    .catch(() => ({ results: [] as Record<string, unknown>[] }));
  const sold = Object.fromEntries(products.map((p) => [p.key, results.reduce((n, r) => n + Math.max(0, -Number(r[`${p.key}Changes`] ?? 0)), 0)]));
  const daysLeft = (key: string) => {
    const perDay = sold[key] / DAYS;
    return perDay > 0 ? Math.floor(stock[key] / perDay) : null;
  };
  const sorted = [...products].sort((a, b) => stock[a.key] - stock[b.key]);
  const total = products.reduce((n, p) => n + stock[p.key], 0);

  return (
    <>
      <PageHeader
        title="Stock"
        sub="Boxes in the freezer right now, and how long they will last."
        actions={
          <>
            <Link href="/inventory/adjustment" className="a-btn"><Icon name="edit" className="size-4" />Fix a count</Link>
            <Link href="/inventory/production" className="a-btn a-btn-pri"><Icon name="plus" className="size-4" />Add production</Link>
          </>
        }
        phoneAction={<span className="text-sm text-[#52525b]">{total} boxes</span>}
      />
      <Tabs items={STOCK_TABS} active="/inventory" />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3.5">
        {sorted.map((p) => {
          const i = products.indexOf(p);
          const n = stock[p.key];
          const d = daysLeft(p.key);
          const level = n <= 0 || (d !== null && d <= 2) ? 'red' : n <= 10 || (d !== null && d <= 5) ? 'amber' : 'green';
          return (
            <div key={p.key} className={cx('a-card p-4', level === 'red' && 'border-[#fecaca] shadow-[0_0_0_3px_#fef2f2]')}>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-[3px]" style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.label}</span>
                <Pill tone={level === 'red' ? 'red' : level === 'amber' ? 'amber' : 'green'}>{level === 'red' ? 'Make now' : level === 'amber' ? 'Plan soon' : 'Good'}</Pill>
              </div>
              <div className="my-3 flex items-end">
                <span className={cx('text-[40px] font-bold leading-none tracking-tight tabular-nums', level === 'red' && 'text-[#b91c1c]')}>{n}</span>
                <span className="mb-1 ml-1.5 text-sm text-[#52525b]">boxes</span>
                <span className={cx('mb-1 ml-auto text-sm', level === 'red' ? 'font-semibold text-[#b91c1c]' : 'text-[#52525b]')}>{d === null ? 'no sales lately' : `~${d} day${d === 1 ? '' : 's'} left`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#f3f1ed]">
                <i className={cx('block h-full rounded-full', level === 'red' ? 'bg-[#ef4444]' : level === 'amber' ? 'bg-[#f59e0b]' : 'bg-[#15803d]')} style={{ width: `${Math.max(2, Math.min(100, (n / 50) * 100))}%` }} />
              </div>
              <div className="mt-3 text-xs text-[#a1a1aa]">Sold {sold[p.key]} in the last {DAYS} days</div>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-xs text-[#a1a1aa]">Lowest first. &quot;Days left&quot; uses orders of the last {DAYS} days.</p>

      <div className="mt-[18px]">
        <div className="grid gap-2.5 lg:grid-cols-4 lg:gap-3">
          {[
            ['/inventory/production', 'plus', 'Add production', 'Boxes you made'],
            ['/inventory/movement', 'clock', 'Stock changes', 'Every box in or out'],
            ['/inventory/ingredients', 'cart', 'Ingredients', 'What you pay for them'],
            ['/inventory/hpp', 'lock', 'Cost & recipes', 'HPP, profit, recipes'],
          ].map(([href, icon, title, sub]) => (
            <Link key={href} href={href} className="a-card flex items-center gap-3 px-4 py-3.5 hover:bg-[#fcfbf9]">
              <span className="grid size-9 place-items-center rounded-[10px] bg-[#fdf3ea] text-[#9a3412]"><Icon name={icon} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-xs text-[#a1a1aa]">{sub}</span>
              </span>
              <Icon name="right" className="size-4 text-[#a1a1aa]" />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
