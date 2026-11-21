'use client';

import { useState } from 'react';
import { postJson, useShop } from './ShopProvider';

/** Lets the customer cancel their own unpaid order (asks to confirm first). */
export default function CancelOrderButton({ orderRowId, voucherCode }: { orderRowId: string; voucherCode: string | null }) {
  const { base } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const question = `Batalkan pesanan ini?${voucherCode ? ` Voucher ${voucherCode} akan langsung bisa dipakai lagi.` : ''}`;
          if (!confirm(question)) return;
          setBusy(true);
          setError(null);
          try {
            await postJson<{ result: string }>(base, `/orders/${orderRowId}/cancel`, {});
            window.location.reload();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
        className="w-full py-3 rounded-xl border border-[#e5e7eb] text-[#6b7280] font-semibold hover:bg-[#f9fafb] disabled:opacity-60"
      >
        {busy ? 'Membatalkan pesanan…' : 'Batalkan pesanan'}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
