'use client';

import { useState } from 'react';
import { postJson, useShop } from './ShopProvider';

/** Opens (or re-opens) the DOKU payment page for an unpaid order. */
export default function PayButton({ orderRowId, label = 'Bayar sekarang' }: { orderRowId: string; label?: string }) {
  const { base } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { url } = await postJson<{ url: string }>(base, `/orders/${orderRowId}/pay`, {});
            window.location.href = url;
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
        className="w-full py-3.5 rounded-xl bg-[#9a3412] text-white font-semibold text-lg hover:bg-[#7c2d12] disabled:opacity-60"
      >
        {busy ? 'Membuka halaman pembayaran…' : label}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
