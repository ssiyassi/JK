import { getDB } from '@/lib/server';
import { affiliateCommissions, listAffiliates } from '@/lib/shop/affiliates';
import { emailLinks } from '@/lib/shop/server';
import { PageHeader, Tabs, PROMO_TABS } from '@/components/admin/ui';
import AffiliatesPanel from '@/components/AffiliatesPanel';

export const dynamic = 'force-dynamic';

export default async function WebsiteAffiliatesPage() {
  const db = getDB();
  const affiliates = await listAffiliates(db);
  const report = await affiliateCommissions(db, affiliates, Date.now());
  return (
    <div className="">
      <PageHeader title="Affiliates" sub={"People who share their link and earn Rp10.000 per box, for life."} />
      <Tabs items={PROMO_TABS} active="/website-affiliates" />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          People who signed up on <b>jentiskitchen.id/affiliate</b>. Each gets a link at once. A customer whose <b>first</b> paid order came through
          that link belongs to the affiliate for good: that order and every later paid order earn Rp10.000 per box. Transfer every Sunday (Telegram
          on the CMO bot at 12:00). Customers who had bought before, and the affiliate&apos;s own orders, do not count.
        </p>
        <AffiliatesPanel affiliates={affiliates} report={report} shopUrl={emailLinks().shopUrl} />
      </div>
    </div>
  );
}
