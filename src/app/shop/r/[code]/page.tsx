import { redirect } from 'next/navigation';
import { getDB } from '@/lib/server';
import { activeAffiliateCode, affiliateLandingPath } from '@/lib/shop/affiliates';
import { shopBase } from '@/lib/shop/server';

// Affiliate short link jentiskitchen.id/r/<code>: lands on the shop with the tags that credit the order to them
// (remembered 30 days by MetaPixel.tsx). Unknown or switched-off codes still land on the shop, without tags.
export const dynamic = 'force-dynamic';

export default async function AffiliateShortLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [active, base] = await Promise.all([activeAffiliateCode(getDB(), code), shopBase()]);
  redirect(active ? `${base}${affiliateLandingPath(active)}` : `${base}/`);
}
