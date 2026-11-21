'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PaymentChoiceDialog, { type PaymentChoice, type WalletChoice } from './PaymentChoiceDialog';
import { postJson, useShop } from './ShopProvider';

/**
 * "Ubah metode pembayaran" on an unpaid order: opens the same payment pop-up as checkout. QRIS or an e-wallet goes straight
 * on to the payment page (the open link also keeps the order from expiring); manual transfer shows the order page again
 * with the bank account.
 */
export default function ChangePaymentMethod({
  orderRowId,
  current,
  total,
  wallets,
  label = 'Ubah metode pembayaran',
  primary = false,
}: {
  orderRowId: string;
  current: PaymentChoice;
  total: number;
  /** The e-wallets that are set up. */
  wallets: readonly WalletChoice[];
  label?: string;
  /** The main button of the section (an order the owner placed: the customer has not picked a method yet). */
  primary?: boolean;
}) {
  const { base } = useShop();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PaymentChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(to: PaymentChoice) {
    setBusy(to);
    setError(null);
    try {
      await postJson(base, `/orders/${orderRowId}/payment-method`, { paymentMethod: to });
      if (to !== 'TRANSFER') {
        const { url } = await postJson<{ url: string }>(base, `/orders/${orderRowId}/pay`, {});
        window.location.href = url;
        return;
      }
      setOpen(false);
      setBusy(null);
      router.refresh();
    } catch (err) {
      setOpen(false);
      setBusy(null);
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          primary
            ? 'w-full py-3.5 rounded-xl bg-[#9a3412] hover:bg-[#7c2d12] text-white font-semibold'
            : 'w-full py-3 rounded-xl border border-[#9a3412] text-[#9a3412] font-semibold hover:bg-[#fff7ed]'
        }
      >
        {label}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
      {open && (
        <PaymentChoiceDialog
          total={total}
          wallets={wallets}
          busy={busy}
          initial={current}
          busyText="Membuka pembayaran…"
          onChoose={(to) => void choose(to)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
