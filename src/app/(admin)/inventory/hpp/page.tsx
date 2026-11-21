import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { PageHeader, STOCK_TABS, Tabs } from '@/components/admin/ui';
import DeleteRowButton from '@/components/DeleteRowButton';
import { CostSettingsForm, MeatPriceForm } from '@/components/HppForms';
import HppLockScreen, { HppLockButton } from '@/components/HppLockScreen';
import { maskedEmail } from '@/lib/core/hpp-lock';
import { hppUnlocked } from '@/lib/hpp-lock-server';
import {
  MEATS,
  MEAT_LABELS,
  SETTING_LABELS,
  addMonths,
  listMeatPurchases,
  monthKeyOf,
  monthLabel,
  monthlyProfit,
  AD_TAX_PERCENT,
  parseMonthKey,
  type CostSettings,
} from '@/lib/core/costs';
import { jakartaDateKey } from '@/lib/core/time';
import { getDB } from '@/lib/server';
import { syncMetaIfStale } from '@/lib/marketing/liveSync';

export const dynamic = 'force-dynamic';

const rp = (n: number | null) => (n === null ? '—' : `Rp ${Math.round(n).toLocaleString('id-ID')}`);
const dmy = (key: string) => key.split('-').reverse().join('/');
const card = 'a-card p-4 lg:p-[18px] text-gray-900';

export default async function HppPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  if (!(await hppUnlocked())) {
    return (
      <>
        <PageHeader title="Cost & recipes" sub="Cost per box (HPP), monthly profit and the secret recipes share one lock." back={{ href: '/inventory', label: 'Stock' }} />
        <Tabs items={STOCK_TABS} active="/inventory/hpp" />
        <HppLockScreen email={maskedEmail()} />
      </>
    );
  }
  const db = getDB();
  const now = Date.now();
  const thisMonth = monthKeyOf(now);
  const requested = parseMonthKey((await searchParams).month);
  const month = requested && requested <= thisMonth ? requested : thisMonth;
  // Ad spend in the profit is live: Meta is read again when the last read is over 5 minutes old (this month and last
  // month only — older months are final). Usually already done by the lock screen while the code was on its way.
  if (month >= addMonths(thisMonth, -1)) await syncMetaIfStale(db, now);
  const [profit, meatRows] = await Promise.all([monthlyProfit(db, month), listMeatPurchases(db, month)]);
  const { hpp } = profit;
  const settingFields = (Object.keys(SETTING_LABELS) as (keyof CostSettings)[]).map((key) => ({
    key,
    label: SETTING_LABELS[key],
    value: hpp.settings[key],
    rupiah: !['meatKgPerPack', 'paymentFeePercent'].includes(key),
  }));
  const soFar = month === thisMonth ? ' (so far)' : '';

  return (
    <>
      <PageHeader title="Cost & recipes" sub="Unlocked. Locks again by itself after a while." back={{ href: '/inventory', label: 'Stock' }} actions={<HppLockButton />} />
      <Tabs items={STOCK_TABS} active="/inventory/hpp" />
      <div className="mb-4 flex gap-2">
        <span className="a-chip a-chip-on">Cost / box &amp; profit</span>
        <Link href="/inventory/hpp/recipes" className="a-chip">Recipes</Link>
        <span className="ml-auto lg:hidden"><HppLockButton /></span>
      </div>
      <div className="space-y-5">
        {/* Month picker */}
        <div className="flex items-center justify-center gap-3">
          <Link href={`/inventory/hpp?month=${addMonths(month, -1)}`} aria-label="Previous month" className="p-2 rounded-lg bg-white text-gray-900 shadow hover:bg-gray-50"><ChevronLeftIcon className="h-5 w-5" /></Link>
          <div className="text-lg font-bold text-gray-900 min-w-[160px] text-center">{monthLabel(month)}</div>
          {month < thisMonth ? (
            <Link href={`/inventory/hpp?month=${addMonths(month, 1)}`} aria-label="Next month" className="p-2 rounded-lg bg-white text-gray-900 shadow hover:bg-gray-50"><ChevronRightIcon className="h-5 w-5" /></Link>
          ) : (
            <span className="p-2 w-9" />
          )}
        </div>

        {/* HPP per product */}
        <div className={card}>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Cost / box, by product</h2>
          <p className="text-gray-600 text-sm mb-4">Meat (monthly average) + ingredients (newest price) + packaging &amp; courier.</p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {hpp.products.map((p) => (
              <div key={p.key} className="rounded-xl border border-[#ebe8e3] bg-[#fcfbf9] p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-bold text-gray-900">{p.label}</h3>
                  <div className="text-xl font-bold text-[#9a3412]">{rp(p.total)}</div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  <div><dt className="a-k">Meat{p.meat ? ` (${MEAT_LABELS[p.meat]})` : ''}</dt><dd className="font-semibold">{rp(p.meatCost)}</dd></div>
                  <div><dt className="a-k">Ingredients</dt><dd className="font-semibold">{rp(p.ingredientCost)}</dd></div>
                  <div><dt className="a-k">Packaging + courier</dt><dd className="font-semibold">{rp(p.packaging)}</dd></div>
                  <div><dt className="a-k">Cost / box</dt><dd className="font-bold text-[#9a3412]">{rp(p.total)}</dd></div>
                </dl>
                {p.missing.length > 0 && <p className="mt-2 text-xs text-red-600">Missing: {p.missing.join(', ')}</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
            {MEATS.map((m) => {
              const c = hpp.meat[m];
              return (
                <p key={m}>
                  <b>{MEAT_LABELS[m]}:</b>{' '}
                  {c.perPack === null
                    ? 'no meat price yet'
                    : `${rp(c.spent)} ÷ ${c.packs} packs = ${rp(c.perPack)} per pack${c.fromMonth !== month ? ` (from ${monthLabel(c.fromMonth!)}, no price this month)` : ''}`}
                </p>
              );
            })}
          </div>
        </div>

        {/* Profit */}
        <div className={card}>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Profit {monthLabel(month)}{soFar}</h2>
          <dl className="text-sm sm:text-base space-y-1.5">
            <div className="flex justify-between"><dt>Reseller sales ({profit.resellerOrders} orders)</dt><dd>{rp(profit.resellerSales)}</dd></div>
            <div className="flex justify-between"><dt>Website sales ({profit.websiteOrders} orders)</dt><dd>{rp(profit.websiteSales)}</dd></div>
            <div className="flex justify-between font-semibold border-t pt-1.5"><dt>Total sales</dt><dd>{rp(profit.sales)}</dd></div>
            <div className="flex justify-between text-red-700"><dt>HPP of packs sold ({profit.lines.reduce((t, l) => t + l.soldPacks, 0)} packs)</dt><dd>− {rp(profit.hppSold)}</dd></div>
            <div className="flex justify-between text-red-700"><dt>Free reward boxes ({profit.lines.reduce((t, l) => t + l.freePacks, 0)} packs)</dt><dd>− {rp(profit.freeBoxCost)}</dd></div>
            <div className="flex justify-between text-red-700"><dt>Payment fee ({hpp.settings.paymentFeePercent}% website)</dt><dd>− {rp(profit.paymentFees)}</dd></div>
            <div className="flex justify-between"><dt>Delivery fees paid by website customers</dt><dd>+ {rp(profit.deliveryCharged)}</dd></div>
            <div className="flex justify-between text-red-700"><dt>Delivery fees you paid</dt><dd>− {rp(profit.courierFees)}</dd></div>
            <div className="flex justify-between text-red-700"><dt>Ad spend Meta + Google (incl. {AD_TAX_PERCENT}% PPN {rp(profit.adTax)})</dt><dd>− {rp(profit.adSpend + profit.adTax)}</dd></div>
            <div className={`flex justify-between text-lg font-bold border-t pt-2 ${profit.profit < 0 ? 'text-red-700' : 'text-green-700'}`}><dt>Profit</dt><dd>{rp(profit.profit)}</dd></div>
          </dl>
          {profit.missingHpp.length > 0 && <p className="mt-3 text-sm text-red-600">No complete HPP for {profit.missingHpp.join(', ')}: counted as 0, so the profit is too high.</p>}
          {profit.missingCourierFee.length > 0 && (
            <p className="mt-3 text-sm text-red-600">
              {profit.missingCourierFee.length} delivered/shipped {profit.missingCourierFee.length === 1 ? 'order has' : 'orders have'} no delivery fee yet
              (#{profit.missingCourierFee.join(', #')}): counted as 0. Open the order on the <a href="/orders" className="underline">Orders</a> page to add it.
            </p>
          )}
          <p className="mt-3 text-xs text-gray-500">Orders by order date, cancelled orders left out, website orders once paid. Cash rewards are not included. Emailed on the 1st of every month for the month before.</p>
        </div>

        {/* Meat prices of the month */}
        <div className={card}>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Meat prices · {monthLabel(month)}</h2>
          <p className="text-gray-600 text-sm mb-4">Saved with every production. Add one here only for a production entered without a price.</p>
          {meatRows.length === 0 ? (
            <p className="text-gray-600 mb-4">No meat prices this month.</p>
          ) : (
            <div className="mb-5 flex flex-col gap-2">
              {meatRows.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-[#ebe8e3] bg-white px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{MEAT_LABELS[m.meat]} · {dmy(m.purchaseDate)}</div>
                    <div className="text-xs text-[#52525b]">Price <b className="text-[#18181b]">{rp(m.price)}</b></div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{m.packs} packs</div>
                    <div className="text-xs text-[#52525b]"><b className="text-[#18181b]">{rp(m.price / m.packs)}</b> / pack</div>
                  </div>
                  <DeleteRowButton url={`/api/hpp?meat=${encodeURIComponent(m.id)}`} confirmText={`Delete ${MEAT_LABELS[m.meat]} ${dmy(m.purchaseDate)} ${rp(m.price)}?`} />
                </div>
              ))}
            </div>
          )}
          <MeatPriceForm today={jakartaDateKey(now)} />
        </div>

        {/* Settings */}
        <div className={card}>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Settings</h2>
          <CostSettingsForm fields={settingFields} />
        </div>
      </div>
    </>
  );
}
