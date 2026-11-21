import { getDB } from '@/lib/server';
import { listCustomersForAdmin } from '@/lib/shop/customers';
import { monthlyRemindersByCustomer } from '@/lib/shop/vouchers';
import { PageHeader, Tabs, CUSTOMER_TABS } from '@/components/admin/ui';
import WebsiteCustomersPanel from '@/components/WebsiteCustomersPanel';

export const dynamic = 'force-dynamic';

export default async function WebsiteCustomersPage() {
  const db = getDB();
  // This month's vouchers, read on every visit: after "Send" for a new month the WhatsApp reminders use the new codes.
  const [customers, monthly] = await Promise.all([listCustomersForAdmin(db), monthlyRemindersByCustomer(db, Date.now())]);
  return (
    <div className="">
      <PageHeader title="Customers" sub={"Everyone who bought on the website."} />
      <Tabs items={CUSTOMER_TABS} active="/website-customers" />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          Accounts registered on jentiskitchen.id. You can correct a customer&apos;s name, email or phone number, or deactivate
          the account: a deactivated customer is signed out, cannot sign in or reset the password and gets no monthly voucher.
          Their orders and vouchers are kept, and you can reactivate them at any time.
        </p>
        <WebsiteCustomersPanel customers={customers} monthly={monthly} />
      </div>
    </div>
  );
}
