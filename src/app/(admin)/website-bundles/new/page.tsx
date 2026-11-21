import { getDB } from '@/lib/server';
import { loadCatalog } from '@/lib/shop/products';
import { PageHeader } from '@/components/admin/ui';
import BundleEditor from '@/components/BundleEditor';

export const dynamic = 'force-dynamic';

export default async function NewBundlePage() {
  const catalog = await loadCatalog(getDB());
  return (
    <div>
      <PageHeader title="New bundle" sub="Same screen is used to edit a bundle." back={{ href: '/website-bundles', label: 'Bundles' }} />
      <BundleEditor products={catalog.map(({ product, name, shortName, price, compareAtPrice, image, visible }) => ({ product, name, shortName, price, compareAtPrice, image, visible }))} bundle={null} />
    </div>
  );
}
