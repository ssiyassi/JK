import ShopIngredientsForm from '@/components/ShopIngredientsForm';
import DeleteRowButton from '@/components/DeleteRowButton';
import { ingredientBasePrices, listIngredientPurchases, listIngredients } from '@/lib/core/costs';
import { jakartaDateKey } from '@/lib/core/time';
import { getDB } from '@/lib/server';
import { Card, PageHeader, STOCK_TABS, Tabs, cx } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
const num = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
const dmy = (key: string) => key.split('-').reverse().join('/');

export default async function ShopIngredientsPage() {
  const db = getDB();
  const today = jakartaDateKey(Date.now());
  const [ingredients, base, history] = await Promise.all([listIngredients(db), ingredientBasePrices(db, today), listIngredientPurchases(db)]);
  const names = Object.fromEntries(ingredients.map((i) => [i.key, i]));
  // Price change vs the purchase before the newest one (per unit, so a different pack size still compares).
  const change = (key: string): number | null => {
    const b = base[key];
    if (!b) return null;
    const prev = history.find((h) => h.ingredient === key && h.id !== b.id && h.shopDate <= b.shopDate);
    if (!prev || !prev.size) return null;
    const before = prev.price / prev.size;
    return before ? Math.round(((b.perUnit - before) / before) * 100) : null;
  };

  return (
    <>
      <PageHeader title="Ingredients" sub="Latest price of every ingredient and packaging." back={{ href: '/inventory', label: 'Stock' }} />
      <Tabs items={STOCK_TABS} active="/inventory/ingredients" />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
        {ingredients.map((ing) => {
          const b = base[ing.key];
          const c = change(ing.key);
          const cls = c === null || c === 0 ? 'text-[#52525b]' : c > 0 ? 'text-[#b91c1c]' : 'text-[#15803d]';
          const pct = c === null ? '' : c === 0 ? '0%' : `${c > 0 ? '+' : '−'}${Math.abs(c)}%`;
          return (
            <div key={ing.key} className="a-card px-3.5 py-3">
              {/* Desktop: name left, price + change right */}
              <div className="hidden items-start lg:flex">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{ing.name}</div>
                  <div className="text-xs text-[#a1a1aa]">{b ? `${num(b.size)} ${ing.unit} · ${dmy(b.shopDate)}` : 'No price yet'}</div>
                </div>
                {b && (
                  <div className="text-right">
                    <div className="text-base font-bold tabular-nums">{rp(b.price)}</div>
                    <div className={cx('text-xs font-semibold', cls)}>{pct}</div>
                  </div>
                )}
              </div>
              {/* Phone: stacked */}
              <div className="lg:hidden">
                <div className="font-semibold">{ing.name}</div>
                <div className="text-xs text-[#a1a1aa]">{b ? `${num(b.size)} ${ing.unit} · ${dmy(b.shopDate)}` : 'No price yet'}</div>
                {b && (
                  <>
                    <div className={cx('mt-2 text-xs font-semibold', cls)}>{c === null ? 'first purchase' : c === 0 ? '0% same price' : `${pct} vs last trip`}</div>
                    <div className="text-[17px] font-bold tabular-nums">{rp(b.price)}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <ShopIngredientsForm ingredients={ingredients} today={today} />
        <Card title="Price history">
          {history.length === 0 ? (
            <p className="p-5 text-[#a1a1aa]">No purchases yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="a-th">Date</th>
                    <th className="a-th">Ingredient</th>
                    <th className="a-th text-right">Size</th>
                    <th className="a-th text-right">Price</th>
                    <th className="a-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="a-td whitespace-nowrap">{dmy(h.shopDate)}</td>
                      <td className="a-td">{names[h.ingredient]?.name ?? h.ingredient}</td>
                      <td className="a-td whitespace-nowrap text-right">{num(h.size)} {names[h.ingredient]?.unit}</td>
                      <td className="a-td whitespace-nowrap text-right font-semibold">{rp(h.price)}</td>
                      <td className="a-td text-right">
                        <DeleteRowButton url={`/api/ingredients?id=${encodeURIComponent(h.id)}`} confirmText={`Delete ${names[h.ingredient]?.name ?? h.ingredient} ${dmy(h.shopDate)}?`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
