import { getDB } from '@/lib/server';
import { getPaydayPromo, paydayMonth } from '@/lib/shop/payday';
import { listPromoPhotos } from '@/lib/shop/promo-photos';
import PromoPhotosPanel from '@/components/PromoPhotosPanel';
import { PageHeader, Tabs, PROMO_TABS } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function WebsitePhotosPage() {
  const db = getDB();
  const [photos, promo] = await Promise.all([listPromoPhotos(db), getPaydayPromo(db)]);
  return (
    <div className="">
      <PageHeader title="Promo photos" sub={"Photos resellers download to post on their own."} />
      <Tabs items={PROMO_TABS} active="/website-photos" />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          The photos resellers can save on{' '}
          <a href="https://jentiskitchen.id/hadiah-reseller/foto" target="_blank" rel="noreferrer" className="text-blue-600">
            jentiskitchen.id/hadiah-reseller/foto ↗
          </a>
          , in this order. New photos are added at the end.
        </p>
        <PromoPhotosPanel photos={photos} payday={{ image: promo.image, label: `Payday Promo ${paydayMonth(promo)}` }} />
      </div>
    </div>
  );
}
