import { notFound } from 'next/navigation';
import { getDB } from '@/lib/server';
import { getBundle } from '@/lib/shop/bundles';
import { loadCatalog } from '@/lib/shop/products';
import { PageHeader } from '@/components/admin/ui';
import BundleEditor from '@/components/BundleEditor';

export const dynamic = 'force-dynamic';

export default async function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDB();
  const [bundle, catalog] = await Promise.all([getBundle(db, id), loadCatalog(db)]);
  if (!bundle) notFound();
  return (
    <div>
      <PageHeader title={bundle.name} sub="Changes apply to new orders. Orders already placed keep their price." back={{ href: '/website-bundles', label: 'Bundles' }} />
      <BundleEditor products={catalog.map(({ product, name, shortName, price, compareAtPrice, image, visible }) => ({ product, name, shortName, price, compareAtPrice, image, visible }))} bundle={bundle} />
    </div>
  );
}
