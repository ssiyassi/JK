import { getDB } from '@/lib/server';
import { getPaydayPromo, paydayLink } from '@/lib/shop/payday';
import { listPaydayPosters, POSTER_KINDS } from '@/lib/shop/paydayPosters';
import PaydayPromoPanel from '@/components/PaydayPromoPanel';
import { Card, fmtDateTime, PageHeader, Tabs, PROMO_TABS } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const day = (iso: string) => iso.split('-').reverse().join('/');

export default async function WebsitePaydayPage() {
  const db = getDB();
  const [promo, posters] = await Promise.all([getPaydayPromo(db), listPaydayPosters(db)]);
  return (
    <div className="">
      <PageHeader title="Payday promo" sub={"The payday poster and message resellers get."} />
      <Tabs items={PROMO_TABS} active="/website-payday" />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          The page jentiskitchen.id/payday-promo and the WhatsApp message behind the <b>Payday</b> button on My Resellers. Change
          the poster, dates and texts here every month.
        </p>
        <PaydayPromoPanel key={promo.updatedAt} promo={promo} link={paydayLink(promo)} />
        <h2 className="mt-6 mb-2.5 text-base font-bold lg:hidden">Posters made by resellers ({posters.length})</h2>
        {/* Phone: one card per poster. Computer: the table. */}
        <ul className="flex flex-col gap-2.5 lg:hidden">
          {posters.map((p) => (
            <li key={p.id} className="a-card px-4 py-3">
              <div className="flex items-center gap-2">
                <b className="min-w-0 flex-1 truncate">{p.name}</b>
                <span className="shrink-0 rounded-full bg-[#fdf3ea] px-2.5 py-0.5 text-xs font-semibold text-[#9a3412]">{POSTER_KINDS[p.kind] ?? p.kind}</span>
              </div>
              <div className="mt-0.5 text-sm tabular-nums">
                {p.phone} · Delivery {day(p.deliveryDate)}
              </div>
              <div className="text-xs tabular-nums text-[#a1a1aa]">Requested {fmtDateTime(p.createdAt)}</div>
            </li>
          ))}
          {!posters.length && <li className="a-card p-6 text-center text-sm text-[#a1a1aa]">No posters made yet.</li>}
        </ul>
        <Card className="mt-6 hidden lg:block" title={`Posters made by resellers (${posters.length})`}>
          {posters.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#ebe8e3] text-left text-xs font-semibold text-[#71717a]">
                    <th className="px-4 py-2.5">Request date</th>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Phone</th>
                    <th className="px-4 py-2.5">Delivery date</th>
                    <th className="px-4 py-2.5">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {posters.map((p) => (
                    <tr key={p.id} className="border-b border-[#f3f1ed] last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-[#52525b]">{fmtDateTime(p.createdAt)}</td>
                      <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{p.phone}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{day(p.deliveryDate)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">{POSTER_KINDS[p.kind] ?? p.kind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-[#a1a1aa]">No posters made yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
