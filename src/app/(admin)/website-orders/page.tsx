import { redirect } from 'next/navigation';

// Website orders now live on the Orders page together with reseller orders (old links and bookmarks keep working).
export default async function WebsiteOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(typeof q === 'string' && q ? `/orders?q=${encodeURIComponent(q.slice(0, 80))}` : '/orders');
}
