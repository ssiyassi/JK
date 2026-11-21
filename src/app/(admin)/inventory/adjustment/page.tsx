import StockAdjustmentForm from '@/components/StockAdjustmentForm';
import { getInventory as readInventory } from '@/lib/core/inventory';
import { loadStockProducts } from '@/lib/core/products';
import { getDB } from '@/lib/server';
import { PageHeader, STOCK_TABS, Tabs } from '@/components/admin/ui';

// Always read live data (never pre-rendered at build time).
export const dynamic = 'force-dynamic';

// Live inventory; on failure the error page is shown instead of pre-filling zeros
// (pre-filled zeros on the adjustment form could have wiped the real stock on submit).
async function getCurrentInventory() {
  const db = getDB();
  const products = await loadStockProducts(db);
  const { quantities } = await readInventory(db, products);
  return { products, quantities };
}

export default async function StockAdjustmentPage() {
  const { products, quantities } = await getCurrentInventory();
  return (
    <>
      <PageHeader title="Fix a count" sub="Count the freezer and fix every product in one go." back={{ href: '/inventory', label: 'Stock' }} />
      <Tabs items={STOCK_TABS} active="/inventory/adjustment" />
      <StockAdjustmentForm products={products} currentInventory={quantities} />
    </>
  );
}
