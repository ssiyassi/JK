import { listStockMovements, type StockMovement } from '@/lib/core/inventory';
import { loadStockProducts } from '@/lib/core/products';
import { getDB } from '@/lib/server';
import { PageHeader, Pill, STOCK_TABS, Tabs, cx, fmtDateTime, type Tone } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, { label: string; tone: Tone }> = {
  PRODUCTION: { label: 'Production', tone: 'green' },
  ORDER: { label: 'Order', tone: 'blue' },
  CANCEL_ORDER: { label: 'Cancelled order', tone: 'gray' },
  EDIT_ORDER: { label: 'Order edited', tone: 'violet' },
  STOCK_ADJUSTMENT: { label: 'Count fixed', tone: 'amber' },
};

/** Stock changes: every box in or out, shown as before + change = after (red = out, green = in). */
export default async function StockMovementPage() {
  const db = getDB();
  const [products, stockMovements] = await Promise.all([loadStockProducts(db), listStockMovements(db)]);

  const cell = (m: StockMovement, key: string) => {
    const before = Number(m[`${key}Beginning`] ?? 0);
    const change = Number(m[`${key}Changes`] ?? 0);
    const after = Number(m[`${key}Final`] ?? 0);
    return { before, change, after };
  };
  const Math_ = ({ before, change, after }: { before: number; change: number; after: number }) =>
    change === 0 ? (
      <span className="text-[#a1a1aa]">—</span>
    ) : (
      <span className="whitespace-nowrap tabular-nums">
        {before} <b className={change < 0 ? 'text-[#b91c1c]' : 'text-[#15803d]'}>{change > 0 ? `+${change}` : change}</b> = <b className={after < 0 ? 'text-[#b91c1c]' : ''}>{after}</b>
      </span>
    );
  const type = (t: string) => TYPES[t] ?? { label: t, tone: 'gray' as Tone };
  const when = (m: StockMovement) => fmtDateTime((m.createdAt ?? m.date).getTime());

  return (
    <>
      <PageHeader title="Stock changes" sub="Every box in or out: before + change = after." back={{ href: '/inventory', label: 'Stock' }} />
      <Tabs items={STOCK_TABS} active="/inventory/movement" />

      {/* Phone: one card per change */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        {stockMovements.map((m) => (
          <div key={m.id} className="a-card px-3.5 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-[#52525b]">{when(m)}</div>
                <div className="font-semibold">{m.orderId ? `#${m.orderId}` : type(m.type).label}</div>
              </div>
              <Pill tone={type(m.type).tone} dot={false}>{type(m.type).label}</Pill>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3.5 gap-y-2">
              {products
                .map((p) => ({ p, c: cell(m, p.key) }))
                .filter(({ c }) => c.change !== 0)
                .map(({ p, c }) => (
                  <div key={p.key}>
                    <div className="a-k">{p.label}</div>
                    <div className="text-[13.5px] font-semibold"><Math_ {...c} /></div>
                  </div>
                ))}
            </div>
          </div>
        ))}
        {stockMovements.length === 0 && <p className="p-6 text-center text-[#a1a1aa]">No stock changes yet.</p>}
      </div>

      {/* Desktop table (scrolls sideways when there are many products) */}
      <div className="a-card hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="a-th">Time</th>
                <th className="a-th">Type</th>
                <th className="a-th">Order</th>
                {products.map((p) => <th key={p.key} className="a-th">{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {stockMovements.map((m) => (
                <tr key={m.id}>
                  <td className="a-td whitespace-nowrap text-[13px] text-[#52525b]">{when(m)}</td>
                  <td className="a-td"><Pill tone={type(m.type).tone} dot={false}>{type(m.type).label}</Pill></td>
                  <td className={cx('a-td whitespace-nowrap font-semibold tabular-nums', !m.orderId && 'text-[#a1a1aa]')}>{m.orderId ? `#${m.orderId}` : '—'}</td>
                  {products.map((p) => <td key={p.key} className="a-td"><Math_ {...cell(m, p.key)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-2.5 flex gap-3 text-xs text-[#52525b]">
        <span><b className="text-[#b91c1c]">red</b> = boxes out</span>
        <span><b className="text-[#15803d]">green</b> = boxes in</span>
      </div>
    </>
  );
}
