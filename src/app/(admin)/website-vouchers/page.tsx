import { getDB } from '@/lib/server';
import { listCampaigns } from '@/lib/shop/campaigns';
import { listCustomersForAdmin } from '@/lib/shop/customers';
import { loadVoucherRules, monthlyVoucherStats } from '@/lib/shop/vouchers';
import AutoVoucherSettings from '@/components/AutoVoucherSettings';
import MonthlyVoucherBox from '@/components/MonthlyVoucherBox';
import { PageHeader, Tabs, PROMO_TABS } from '@/components/admin/ui';
import WebsiteVouchersPanel from '@/components/WebsiteVouchersPanel';

export const dynamic = 'force-dynamic';

export default async function WebsiteVouchersPage() {
  const db = getDB();
  const now = Date.now();
  const [campaigns, customers, stats, rules] = await Promise.all([
    listCampaigns(db, now),
    listCustomersForAdmin(db),
    monthlyVoucherStats(db, now),
    loadVoucherRules(db),
  ]);
  return (
    <div className="">
      <PageHeader title="Vouchers" sub={"Discount codes, automatic vouchers and monthly vouchers."} />
      <Tabs items={PROMO_TABS} active="/website-vouchers" />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          Discount codes for jentiskitchen.id: the automatic welcome ({rules.WELCOME.percent}%), referral ({rules.REFERRAL.percent}%) and
          monthly ({rules.MONTHLY.percent}%) vouchers, and your own codes below. Customers use one voucher per order, on product prices only.
        </p>
        <div className="mt-6 space-y-6">
          <AutoVoucherSettings rules={rules} />
          <MonthlyVoucherBox stats={stats} percent={rules.MONTHLY.percent} />
        </div>
        <WebsiteVouchersPanel
          campaigns={campaigns}
          customers={customers.filter((c) => c.disabledAt === null).map((c) => ({ id: c.id, name: c.name, email: c.email, confirmed: c.emailVerifiedAt !== null }))}
        />
      </div>
    </div>
  );
}
