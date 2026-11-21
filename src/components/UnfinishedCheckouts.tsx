'use client';

import { useEffect, useState } from 'react';
import { whatsappLink } from '@/lib/shop/catalog';
import type { CheckoutLead } from '@/lib/shop/checkoutLeads';
import { Icon } from './admin/ui';

const LINK = 'https://jentiskitchen.id/checkout?utm_source=whatsapp&utm_medium=personal&utm_campaign=checkout-reminder';
const message = (name: string) =>
  `Halo${name ? ` Kak ${name}` : ' Kak'}, ini Jentis Kitchen 😊 Tadi Kakak sempat isi pesanan di website tapi belum selesai ya? Kalau ada kendala, balas saja chat ini, nanti kami bantu sampai selesai 🙏\n\nAtau lanjutkan di sini: ${LINK}`;
const when = (at: number) => new Date(at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).replace(',', '');
const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

/** Ads Report → "Unfinished checkouts": guests who typed their number at checkout, then left. One WhatsApp by hand, at most. */
export default function UnfinishedCheckouts({ onClose, inline = false }: { onClose: () => void; inline?: boolean }) {
  const [rows, setRows] = useState<CheckoutLead[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/marketing/checkout-leads')
      .then(async (r) => (r.ok ? setRows(await r.json()) : setError((await r.json()).error ?? 'Could not load the list')))
      .catch(() => setError('Could not load the list'));
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const mark = async (r: CheckoutLead, contacted: boolean) => {
    setError('');
    try {
      const res = await fetch('/api/marketing/checkout-leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: r.phone, contacted }) });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to save');
      setRows((all) => all?.map((x) => (x.phone === r.phone ? { ...x, contactedAt: contacted ? Date.now() : null } : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const items = (
    <>
      {rows?.map((r) => (
        <li key={r.phone} className={`a-card flex items-center gap-3 px-4 py-3 ${r.contactedAt ? '!bg-green-50' : ''}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {r.name || 'No name yet'} <span className="font-normal text-[#a1a1aa]">| {when(r.updatedAt)}</span>
            </p>
            <p className="text-sm text-[#52525b]">{r.items}</p>
            <p className="text-xs text-[#a1a1aa]">
              <b className="text-[#18181b]">{rupiah(r.subtotal)}</b> before discount · {r.source}
            </p>
          </div>
          {r.contactedAt ? (
            <button type="button" onClick={() => mark(r, false)} className="shrink-0 text-sm font-semibold text-green-700 hover:underline">
              ✓ Messaged
            </button>
          ) : (
            <a
              href={whatsappLink(r.phone, message(r.name))}
              target="_blank"
              rel="noreferrer"
              onClick={() => mark(r, true)}
              aria-label={`WhatsApp ${r.name || r.phone}`}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[#16a34a] text-white"
            >
              <Icon name="wa" className="size-5" />
            </a>
          )}
        </li>
      ))}
      {rows && !rows.length && <li className="a-card p-6 text-center text-sm text-[#a1a1aa]">Nobody at the moment.</li>}
      {!rows && !error && <li className="a-card p-6 text-center text-sm text-[#a1a1aa]">Loading…</li>}
    </>
  );
  const note = 'Guests who typed their number at checkout and have not ordered for 30 minutes. Message each person once at most, and stop if they ask. Removed when they order, or after 14 days.';

  if (inline) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-xl bg-[#eff6ff] px-3.5 py-2.5 text-[13px] text-[#1e3a8a]">{note}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="flex flex-col gap-2.5">{items}</ul>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl h-[92vh] sm:h-[85vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Unfinished checkouts</h2>
            <button type="button" onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-700 px-2" aria-label="Close">
              ×
            </button>
          </div>
          <p className="text-xs text-gray-500">{note}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[#f6f5f2] p-3">{items}</ul>
      </div>
    </div>
  );
}
