'use client';

import { useState } from 'react';
import { Icon, cx } from '@/components/admin/ui';

/** "Website order for a customer": opens the shop checkout in admin mode (one-time link) in a new tab. */
export default function OwnerOrderButton({ className, label = 'Website order for a customer' }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    // Opened inside the tap so the browser does not block it; pointed at the shop once the link is ready.
    const tab = window.open('', '_blank');
    try {
      const res = await fetch('/api/website/orders/owner-link', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (tab) tab.location.href = String(data.url);
      else window.location.href = String(data.url);
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button type="button" onClick={() => void open()} disabled={busy} className={cx('a-btn w-full justify-center')}>
        <Icon name="plus" className="size-4" />
        {busy ? 'Opening…' : label}
      </button>
      {error && <p className="mt-1.5 text-sm text-[#b91c1c]">{error}</p>}
    </div>
  );
}
