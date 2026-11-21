import Link from 'next/link';
import { getDB } from '@/lib/server';
import { bundleStats, bundleTotals, loadBundles } from '@/lib/shop/bundles';
import { loadCatalog } from '@/lib/shop/products';
import { emailLinks } from '@/lib/shop/server';
import { Icon, PageHeader, Tabs, PROMO_TABS } from '@/components/admin/ui';
import BundlesPanel from '@/components/BundlesPanel';

export const dynamic = 'force-dynamic';

export default async function WebsiteBundlesPage() {
  const db = getDB();
  const now = Date.now();
  const [bundles, catalog, stats] = await Promise.all([loadBundles(db), loadCatalog(db), bundleStats(db, now)]);
  const shopUrl = emailLinks().shopUrl;
  const newButton = (
    <Link href="/website-bundles/new" className="a-btn a-btn-pri">
      <Icon name="plus" className="size-4" />
      New bundle
    </Link>
  );
  return (
    <div>
      <PageHeader title="Promotions" sub="Discounts, partners and what customers see on the shop." actions={newButton} />
      <Tabs items={PROMO_TABS} active="/website-bundles" />
      <BundlesPanel
        shopUrl={shopUrl}
        now={now}
        bundles={bundles.map((b) => {
          const totals = bundleTotals(b, catalog);
          // Up to 3 photos: per pick a product it allows, a different one each time when possible.
          const used: string[] = [];
          for (const slot of b.slots.slice(0, 3)) {
            const options = catalog.filter((p) => p.visible && slot.includes(p.product) && p.image);
            const pick = options.find((p) => !used.includes(p.image)) ?? options[0];
            if (pick) used.push(pick.image);
          }
          const photos = used;
          return { ...b, normal: totals.normal, compareAt: totals.compareAt, photos, stats: stats[b.id] ?? { sold: 0, thisWeek: 0, sales: 0 } };
        })}
      />
    </div>
  );
}
