import Link from 'next/link';
import { Icon, PageHeader } from '@/components/admin/ui';
import { listResellersAlphabetical } from '@/lib/core/resellers';
import { getDB } from '@/lib/server';
import ResellerList from '@/components/ResellerList';
import ResellerAnnouncement from '@/components/ResellerAnnouncement';
import { getPaydayPromo, paydayLink, paydayMonth } from '@/lib/shop/payday';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

async function getResellers() {
  try {
    return await listResellersAlphabetical(getDB());
  } catch (error) {
    console.error('Error fetching resellers:', error);
    throw error;
  }
}

export default async function MyResellersPage() {
  const [resellers, promo] = await Promise.all([getResellers(), getPaydayPromo(getDB())]);
  const payday = { template: promo.whatsappTemplate, month: paydayMonth(promo), link: paydayLink(promo) };
  
  return (
    <>
      <PageHeader
        title="My resellers"
        sub={`${resellers.length} resellers. The WhatsApp icon sends this month's Payday message.`}
        actions={<Link href="/resellers/new" className="a-btn a-btn-pri"><Icon name="plus" className="size-4" />Add reseller</Link>}
        phoneAction={<Link href="/resellers/new" aria-label="Add reseller" className="grid size-10 place-items-center rounded-[10px] bg-[#9a3412] text-white"><Icon name="plus" /></Link>}
      />
      <div className="grid gap-[18px] lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <ResellerList resellers={resellers} payday={payday} />
        <ResellerAnnouncement resellerCount={resellers.length} />
      </div>
    </>
  );
}
