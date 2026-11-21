'use client';

import { useState } from 'react';

/** My Resellers: write one message for every reseller; the owner receives it by email as WhatsApp buttons. */
export default function ResellerAnnouncement({ resellerCount }: { resellerCount: number }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!confirm(`Email yourself ${resellerCount} WhatsApp buttons with this message?`)) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/resellers/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || 'Failed to send');
      setResult({ ok: true, text: `Sent to ${r.to}: ${r.sent} email${r.sent > 1 ? 's' : ''} with ${r.resellers} WhatsApp buttons.` });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a-card p-4 lg:p-[18px]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
        <span className="font-bold">📣 Announcement to all resellers</span>
        <span className="a-btn a-btn-sm">{open ? 'Close' : 'Write'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-gray-600">
            You get an email with one WhatsApp button per reseller ({resellerCount}), this message filled in. Long lists come in
            several emails of 40. <code>{'{{reseller name}}'}</code> becomes each reseller&apos;s name. WhatsApp: *bold*, _italic_.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={3000}
            className="a-input h-56"
            placeholder="Halo kak {{reseller name}} …"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={busy || !message.trim()}
              className="a-btn a-btn-pri"
            >
              {busy ? 'Sending…' : 'Email me the WhatsApp buttons'}
            </button>
            <span className="text-xs text-gray-500">{message.length}/3000</span>
          </div>
          {result && (
            <p className={`text-sm rounded-md px-3 py-2 ${result.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {result.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
