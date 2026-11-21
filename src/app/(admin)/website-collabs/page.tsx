import { getDB } from '@/lib/server';
import { COLLAB_DEFAULTS, listApplications, listCollabs } from '@/lib/shop/collabs';
import { collabCommissions } from '@/lib/shop/collab-report';
import { emailLinks } from '@/lib/shop/server';
import { jakartaDateKey } from '@/lib/core/time';
import { PageHeader, Tabs, PROMO_TABS } from '@/components/admin/ui';
import CollabsPanel from '@/components/CollabsPanel';

export const dynamic = 'force-dynamic';

export default async function WebsiteCollabsPage() {
  const db = getDB();
  const [collabs, applications] = await Promise.all([listCollabs(db), listApplications(db)]);
  const commission = await collabCommissions(db, collabs, Date.now());
  return (
    <div className="">
      <PageHeader title="Collabs" sub={"Influencer deals: what they promised, what they brought."} />
      <Tabs items={PROMO_TABS} active="/website-collabs" />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          Influencer offer pages. Each page shows the influencer their own shop link (first orders count for them through
          it) and the voucher code they will get. <b>No voucher is created here</b>: when they accept on the page you get a
          Telegram message, then create the code yourself in Website → Vouchers.
        </p>
        <CollabsPanel
          collabs={collabs}
          applications={applications}
          defaults={COLLAB_DEFAULTS}
          shopUrl={emailLinks().shopUrl}
          today={jakartaDateKey(Date.now())}
          commission={commission}
        />
      </div>
    </div>
  );
}
