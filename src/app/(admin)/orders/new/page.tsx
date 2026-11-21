import OrderForm from '@/components/OrderForm';
import AdminHeader from '@/components/AdminHeader';
import { loadStockProducts } from '@/lib/core/products';
import { getDB } from '@/lib/server';

// Reads the product list live (never pre-rendered at build time).
export const dynamic = 'force-dynamic';

interface NewOrderPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewOrderPage(props: NewOrderPageProps) {
  const searchParams = await props.searchParams;
  const products = await loadStockProducts(getDB());
  return (
    <div className="">
      <AdminHeader backHref="/orders" title="New reseller order" />

      <OrderForm key={JSON.stringify(searchParams)} searchParams={searchParams} products={products} />
    </div>
  );
}