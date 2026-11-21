import { getDB } from '@/lib/server';
import { listDayOffHistory, listDaysOff } from '@/lib/shop/days-off';
import { jakartaDateKey } from '@/lib/core/time';
import { PageHeader } from '@/components/admin/ui';
import DaysOffPanel from '@/components/DaysOffPanel';

export const dynamic = 'force-dynamic';

export default async function StoreDaysOffPage() {
  const db = getDB();
  const now = Date.now();
  const today = jakartaDateKey(now);
  const [daysOff, history] = await Promise.all([listDaysOff(db, now), listDayOffHistory(db)]);
  return (
    <div className="">
      <PageHeader title="Store days off" sub={`Days you don't deliver. The shop shows them as "Penuh".`} />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          Days with no website delivery. From <b>2 days before</b> a day off, customers see its days as <b>“Penuh”</b> in the
          checkout calendar and cannot pick them; the days before it stay normal delivery days. When the soonest delivery
          falls on a day off, checkout shows a blue notice that orders are full with the first open day after it (never a
          Sunday). Earlier than 2 days before, customers can still pick those days, so check Website Orders for deliveries
          booked on your days off. Customers can always order, and never see the note.
        </p>
        <DaysOffPanel daysOff={daysOff} history={history.filter((d) => d.endDate < today)} today={today} />
      </div>
    </div>
  );
}
