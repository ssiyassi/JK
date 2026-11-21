import { getInventory } from '@/lib/core/inventory';
import { getDB } from '@/lib/server';
import { loadCatalog, stockProductUsed } from '@/lib/shop/products';
import { PageHeader } from '@/components/admin/ui';
import WebsiteProductsPanel from '@/components/WebsiteProductsPanel';

export const dynamic = 'force-dynamic';

export default async function WebsiteProductsPage() {
  const db = getDB();
  const [catalog, inventory] = await Promise.all([loadCatalog(db), getInventory(db)]);
  // Only products that were never stocked or ordered can be deleted (the rest can be hidden).
  const deletable: string[] = [];
  for (const p of catalog) {
    if (!p.stockColumn || !(await stockProductUsed(db, p.stockColumn))) deletable.push(p.product);
  }
  return (
    <div className="">
      <PageHeader title="Products" sub={"What the shop sells, prices and labels."} />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          What customers see and pay on jentiskitchen.id. Changes are live as soon as you save. Every product you add also
          appears in your Inventory, Orders, Stock Movement and Telegram stock alerts. A product that already has stock,
          orders or stock history can be hidden but not deleted.
        </p>
        <WebsiteProductsPanel
          products={catalog}
          stock={inventory.quantities}
          deletable={deletable}
        />
      </div>
    </div>
  );
}
