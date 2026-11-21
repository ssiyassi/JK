'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** The monthly voucher send button (Website → Vouchers). */
export default function MonthlyVoucherBox({ stats, percent }: { stats: { period: string; customers: number; sent: number }; percent: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const unsent = Math.max(0, stats.customers - stats.sent);

  async function sendMonthly() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/website/monthly-vouchers', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Request failed');
      setMessage({
        ok: true,
        text:
          Number(d.attempted) === 0
            ? 'Nothing to send.'
            : Number(d.sent) === Number(d.attempted)
              ? `Sent ${d.sent} voucher emails.`
              : `Sent ${d.sent} of ${d.attempted}. The rest could not be emailed (is the email service set up?). Their vouchers are saved and visible in their account; click again later to retry.`,
      });
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="a-card p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">Monthly {percent}% vouchers · {stats.period}</h2>
          <p className="text-sm text-gray-600">
            Sent to {stats.sent} of {stats.customers} customers this month.
            {unsent > 0 ? ' Clicking sends to everyone who has not received one yet.' : ' Everyone has received this month’s voucher.'}
          </p>
        </div>
        <button
          disabled={busy || unsent === 0}
          onClick={sendMonthly}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 whitespace-nowrap"
        >
          {busy ? 'Sending…' : `Send to ${unsent} customer${unsent === 1 ? '' : 's'}`}
        </button>
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
    </section>
  );
}
