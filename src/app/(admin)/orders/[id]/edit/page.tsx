import Link from 'next/link';
import { getOrder as readOrder } from '@/lib/core/orders';
import { loadStockProducts, type StockProduct } from '@/lib/core/products';
import { getDB } from '@/lib/server';

export const dynamic = 'force-dynamic';
import EditOrderForm from '@/components/EditOrderForm';
import AdminHeader from '@/components/AdminHeader';

async function getOrder(id: string, products: StockProduct[]) {
  try {
    return await readOrder(getDB(), id, products);
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error; // show the error page rather than a misleading "Order Not Found"
  }
}

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const products = await loadStockProducts(getDB());
  const order = await getOrder(id, products);

  if (!order) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="mb-3 text-xl font-bold">Order Not Found</h1>
          <Link href="/orders" className="a-btn">
            ← Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  if (order.deliveryStatus === 'DELIVERED') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-bold">Order #{order.orderId} is delivered</h1>
          <p className="mb-4 text-[#52525b]">A delivered order is finished and can no longer be edited. Duplicate it instead.</p>
          <Link href="/orders" className="a-btn">
            ← Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="">
      <AdminHeader backHref="/orders" title={`Edit order #${order.orderId}`} />

      {/* Main Content */}
      <div className="">
        <EditOrderForm order={order} products={products} />
      </div>
    </div>
  );
}
