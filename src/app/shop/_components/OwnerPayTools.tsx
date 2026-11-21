'use client';

import { useState } from 'react';
import { postJson, useShop } from './ShopProvider';

/**
 * Admin mode, unpaid order: send the customer the order link on WhatsApp (they pick how to pay there), or open the QRIS
 * to screenshot for them. Only rendered for the owner.
 */
export default function OwnerPayTools({ orderRowId, whatsappHref, qris }: { orderRowId: string; whatsappHref: string; qris: boolean }) {
  const { base } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="rounded-2xl border-2 border-[#ea580c] bg-[#fff7ed] p-4 sm:p-5">
      <h2 className="font-semibold text-[#7c2d12]">Untuk admin</h2>
      <p className="mt-1 mb-3 text-sm text-[#7c2d12]">Kirim link ini ke pelanggan. Mereka memilih cara bayar sendiri dan membayar total yang sama persis.</p>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25d366] py-3.5 font-semibold text-white hover:bg-[#1ebe5a]"
      >
        Kirim link bayar ke WhatsApp
      </a>
      {qris && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            // Opened right away (inside the tap) so the browser does not block it; filled once the link is ready.
            const tab = window.open('', '_blank');
            try {
              const { url } = await postJson<{ url: string }>(base, `/orders/${orderRowId}/owner-qris`, {});
              if (tab) tab.location.href = url;
              else window.location.href = url;
            } catch (err) {
              tab?.close();
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 w-full rounded-xl border border-[#9a3412] bg-white py-3 font-semibold text-[#9a3412] disabled:opacity-60"
        >
          {busy ? 'Membuka QRIS…' : 'Buka QRIS (untuk screenshot)'}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
