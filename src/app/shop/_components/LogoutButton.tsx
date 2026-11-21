'use client';

import { shopAsset } from '@/lib/shop/catalog';
import { postJson, useShop } from './ShopProvider';

export default function LogoutButton() {
  const { base, href } = useShop();
  return (
    <button
      onClick={async () => {
        try {
          await postJson(base, '/logout', {});
        } finally {
          window.location.href = href('/');
        }
      }}
      className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[#9a3412]/10 bg-white/80 px-4 py-2 text-sm font-bold text-[#9a3412] hover:bg-white"
    >
      <img src={shopAsset('/icons/logout.svg')} alt="" width={14} height={14} />
      Keluar
    </button>
  );
}
