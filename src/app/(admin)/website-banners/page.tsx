import { getDB } from '@/lib/server';
import { listBanners } from '@/lib/shop/banners';
import { BANNER_SIZES } from '@/lib/shop/catalog';
import WebsiteBannersPanel from '@/components/WebsiteBannersPanel';
import { PageHeader, Tabs, PROMO_TABS } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function WebsiteBannersPage() {
  const banners = await listBanners(getDB(), false);
  return (
    <div className="">
      <PageHeader title="Banners" sub={"The sliding pictures at the top of the shop."} />
      <Tabs items={PROMO_TABS} active="/website-banners" />
      <div className="max-w-6xl">
        <p className="text-gray-600 max-w-3xl">
          The carousel at the top of jentiskitchen.id. Active banners rotate in this order.
        </p>
        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm px-4 py-3">
          <p className="font-semibold">Each banner needs two images:</p>
          <ul className="mt-1 list-disc list-inside">
            <li>
              <b>
                Desktop: {BANNER_SIZES.desktop.width} × {BANNER_SIZES.desktop.height} px
              </b>{' '}
              (ratio {BANNER_SIZES.desktop.ratioLabel}), shown on computers
            </li>
            <li>
              <b>
                Mobile: {BANNER_SIZES.mobile.width} × {BANNER_SIZES.mobile.height} px
              </b>{' '}
              (ratio {BANNER_SIZES.mobile.ratioLabel}), shown on phones and tablets
            </li>
          </ul>
          <p className="mt-1">
            Images with a different shape are cropped from the centre; the previews show exactly what customers see. The text
            sits on the bottom-left, so keep that area of both images calm.
          </p>
        </div>
        <WebsiteBannersPanel banners={banners} />
      </div>
    </div>
  );
}
