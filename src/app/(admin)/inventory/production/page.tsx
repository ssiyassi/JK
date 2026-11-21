import ProductionForm from '@/components/ProductionForm';
import { getInventory as readInventory } from '@/lib/core/inventory';
import { loadStockProducts } from '@/lib/core/products';
import { loadProductCosting, type Meat } from '@/lib/core/costs';
import { getDB } from '@/lib/server';
import { PageHeader, STOCK_TABS, Tabs } from '@/components/admin/ui';

// Always read live data (never pre-rendered at build time).
export const dynamic = 'force-dynamic';

async function getProducts() {
  const db = getDB();
  const products = await loadStockProducts(db);
  const { quantities } = await readInventory(db, products); // fail clearly if the inventory cannot be read
  const costing = await loadProductCosting(db);
  const productMeat: Record<string, Meat> = Object.fromEntries(Object.values(costing).map((c) => [c.product, c.meat]));
  return { products, productMeat, quantities };
}

export default async function AddProductionPage() {
  const { products, productMeat, quantities } = await getProducts();
  return (
    <>
      <PageHeader title="Add production" sub="Boxes you just made go into the freezer stock." back={{ href: '/inventory', label: 'Stock' }} />
      <Tabs items={STOCK_TABS} active="/inventory/production" />
      <ProductionForm products={products} productMeat={productMeat} stock={quantities} />
    </>
  );
}
