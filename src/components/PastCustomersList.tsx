'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PastCustomerEntry } from '@/lib/marketing/pastCustomers';

type Filter = 'all' | 'done' | 'open';
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/**
 * Ads Report → "Past customers list": the 1.507 customers of the retargeting project with a tick for everyone who
 * ordered again. Ticks from orders are automatic; the owner can tick the others by hand (e.g. ordered by WhatsApp).
 */
export default function PastCustomersList({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<PastCustomerEntry[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/marketing/past-customers')
      .then(async (r) => (r.ok ? setRows(await r.json()) : setError((await r.json()).error ?? 'Could not load the list')))
      .catch(() => setError('Could not load the list'));
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const done = rows?.filter((r) => r.done).length ?? 0;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '').replace(/^0/, '');
    return (rows ?? []).filter(
      (r) =>
        (filter === 'all' || (filter === 'done') === Boolean(r.done)) &&
        (!q || r.name.toLowerCase().includes(q) || (r.city ?? '').toLowerCase().includes(q) || (digits.length >= 3 && (r.phone ?? '').includes(digits))),
    );
  }, [rows, query, filter]);

  const tick = async (r: PastCustomerEntry) => {
    if (r.done && !r.manual) return; // ticked by an order
    setSaving(r.id);
    setError('');
    try {
      const res = await fetch('/api/marketing/past-customers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, done: !r.done }) });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to save');
      const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      setRows((all) => all?.map((x) => (x.id === r.id ? { ...x, manual: !r.done, done: r.done ? null : { day: today, orderId: '', channel: 'manual', label: 'Ticked by you' } } : x)) ?? null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const btn = 'px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl h-[92vh] sm:h-[85vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Past customers list</h2>
              <p className="text-sm text-gray-600">
                {rows ? (
                  <>
                    <b className="text-green-700">{done.toLocaleString('id-ID')}</b> of {rows.length.toLocaleString('id-ID')} won back ({rows.length ? ((done / rows.length) * 100).toFixed(1) : '0'}%) · delivery area only
                  </>
                ) : (
                  'Loading…'
                )}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-700 px-2" aria-label="Close">
              ×
            </button>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, city or phone"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
          />
          <div className="flex gap-2">
            {(
              [
                ['all', 'All'],
                ['done', 'Won back'],
                ['open', 'Not yet'],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`${btn} ${filter === f ? 'bg-[#9a3412] border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-[#f6f5f2]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">Ticks come by themselves when someone orders with their number. Tick by hand when they ordered another way (e.g. a different number).</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[#f6f5f2] p-3">
          {shown.map((r) => {
            const auto = Boolean(r.done && !r.manual);
            return (
              <li key={r.id} className={`flex items-center gap-3 rounded-xl border border-[#ebe8e3] bg-white px-3.5 py-2.5 ${r.done ? '!bg-green-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={Boolean(r.done)}
                  disabled={auto || saving === r.id}
                  onChange={() => tick(r)}
                  className="h-5 w-5 shrink-0 accent-green-600"
                  aria-label={`Won back: ${r.name}`}
                  title={auto ? 'Ticked by their order' : 'Tick by hand'}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {r.name}
                    {r.activeBefore && <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">already buying</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {r.city || '–'}
                    {r.done && (
                      <span className="text-green-700">
                        {' · '}
                        {r.done.orderId ? `#${r.done.orderId} · ` : ''}
                        {shortDay(r.done.day)} · {r.done.label}
                      </span>
                    )}
                  </p>
                </div>
                {r.phone && (
                  <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-green-700 hover:underline">
                    WhatsApp
                  </a>
                )}
              </li>
            );
          })}
          {rows && !shown.length && <li className="p-6 text-center text-sm text-gray-500">No customers match.</li>}
        </ul>
      </div>
    </div>
  );
}
