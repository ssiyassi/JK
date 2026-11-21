'use client';

import UnfinishedCheckouts from '@/components/UnfinishedCheckouts';
import { CUSTOMER_TABS, PageHeader, Tabs } from '@/components/admin/ui';

/** Customers → Unfinished checkouts (also reachable from Today and the Ads report). */
export default function CheckoutsPage() {
  return (
    <>
      <PageHeader title="Unfinished checkouts" sub="People who started checkout but did not pay." back={{ href: '/website-customers', label: 'Customers' }} />
      <Tabs items={CUSTOMER_TABS} active="/website-customers/checkouts" />
      <UnfinishedCheckouts inline onClose={() => {}} />
    </>
  );
}
