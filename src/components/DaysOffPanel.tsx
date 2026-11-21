'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type DayOff = { id: string; startDate: string; endDate: string; note: string };
type Form = { id: string | null; startDate: string; endDate: string; note: string };
type Booked = { orderId: string; deliveryDay: string };
type Confirm = { kind: 'save'; lines: string[]; booked: Booked[] } | { kind: 'remove'; dayOff: DayOff };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayText = (key: string) => {
  const t = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
};
const dayCount = (d: Pick<DayOff, 'startDate' | 'endDate'>) =>
  Math.round((Date.parse(`${d.endDate}T00:00:00Z`) - Date.parse(`${d.startDate}T00:00:00Z`)) / 86_400_000) + 1;
const periodText = (d: Pick<DayOff, 'startDate' | 'endDate'>) => {
  const n = dayCount(d);
  return d.startDate === d.endDate ? dayText(d.startDate) : `${dayText(d.startDate)} – ${dayText(d.endDate)} (${n} days)`;
};
const nextDay = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** First day customers see the day off: H-2 (same as days-off.ts). Only the days off themselves are "Penuh". */
const noticeDay = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
/** Soonest delivery after a day off: the next day, Monday when that is a Sunday. */
const soonestAfter = (end: string) => {
  const next = nextDay(end);
  return new Date(`${next}T00:00:00Z`).getUTCDay() === 0 ? nextDay(next) : next;
};

/**
 * Schedule → Store Days Off: the owner's days off (no website delivery). Coming and running ones have "Edit" and
 * "Remove"; saving or removing asks for confirmation (old → new) and warns about paid orders already booked on those
 * days. Finished ones are listed read-only under History.
 */
export default function DaysOffPanel({ daysOff, history, today }: { daysOff: DayOff[]; history: DayOff[]; today: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const editingOld = form?.id ? daysOff.find((d) => d.id === form.id) ?? null : null;

  function open(next: Form) {
    setMessage(null);
    setForm(next);
  }

  async function askToSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setMessage(null);
    const endDate = form.endDate || form.startDate;
    if (!form.startDate) return setMessage({ ok: false, text: 'Please choose the first day off.' });
    if (endDate < form.startDate) return setMessage({ ok: false, text: 'The last day off must be on or after the first day off.' });
    if (endDate < today) return setMessage({ ok: false, text: 'These days are already over.' });
    const next = { startDate: form.startDate, endDate };
    const note = form.note.trim();
    const lines: string[] = [];
    if (editingOld) {
      if (editingOld.startDate !== next.startDate || editingOld.endDate !== next.endDate) lines.push(`Days off: ${periodText(editingOld)} → ${periodText(next)}`);
      if (editingOld.note !== note) lines.push(`Note: ${editingOld.note || '(none)'} → ${note || '(none)'}`);
      if (!lines.length) return setMessage({ ok: false, text: 'Nothing changed.' });
    } else {
      lines.push(`New day off: ${periodText(next)}`);
      if (note) lines.push(`Note: ${note}`);
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/website/days-off?start=${next.startDate}&end=${next.endDate}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setConfirm({ kind: 'save', lines, booked: data.orders ?? [] });
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!confirm) return;
    setBusy(true);
    try {
      let res: Response;
      if (confirm.kind === 'remove') {
        res = await fetch(`/api/website/days-off/${confirm.dayOff.id}`, { method: 'DELETE' });
      } else {
        const body = JSON.stringify({ startDate: form!.startDate, endDate: form!.endDate || form!.startDate, note: form!.note });
        res = form!.id
          ? await fetch(`/api/website/days-off/${form!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
          : await fetch('/api/website/days-off', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessage({ ok: true, text: confirm.kind === 'remove' ? 'Removed. Customers can choose these days again.' : 'Saved. The shop calendar uses it right away.' });
      setConfirm(null);
      setForm(null);
      router.refresh();
    } catch (error) {
      setConfirm(null);
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f6dcc4]';
  const editor = form && (
    <form onSubmit={askToSave} className="rounded-xl border border-[#f6dcc4] bg-[#fdf3ea]/50 p-4 space-y-3">
      <p className="font-medium text-gray-900">{form.id ? 'Change day off' : 'New day off'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-[180px_180px_1fr] gap-3">
        <div>
          <label htmlFor="dayoff-start" className="block text-xs font-medium text-gray-600 mb-1">First day off</label>
          <input
            id="dayoff-start"
            type="date"
            min={editingOld && editingOld.startDate < today ? editingOld.startDate : today}
            value={form.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              setForm((f) => f && { ...f, startDate, endDate: !f.endDate || f.endDate < startDate ? startDate : f.endDate });
            }}
            className={input}
            required
          />
        </div>
        <div>
          <label htmlFor="dayoff-end" className="block text-xs font-medium text-gray-600 mb-1">Last day off</label>
          <input
            id="dayoff-end"
            type="date"
            min={form.startDate || today}
            value={form.endDate}
            onChange={(e) => setForm((f) => f && { ...f, endDate: e.target.value })}
            className={input}
            required
          />
        </div>
        <div>
          <label htmlFor="dayoff-note" className="block text-xs font-medium text-gray-600 mb-1">Note (only you see it)</label>
          <input
            id="dayoff-note"
            value={form.note}
            maxLength={100}
            placeholder="e.g. Christmas holiday"
            onChange={(e) => setForm((f) => f && { ...f, note: e.target.value })}
            className={input}
          />
        </div>
      </div>
      {form.startDate && (form.endDate || form.startDate) >= form.startDate && (
        <p className="text-sm text-gray-600">
          From <b>{dayText(noticeDay(form.startDate))}</b> customers see these days as “Penuh” and cannot pick them. First delivery after:{' '}
          <b>{dayText(soonestAfter(form.endDate || form.startDate))}</b>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white font-medium disabled:opacity-50">
          {busy ? 'Checking…' : 'Save'}
        </button>
        <button type="button" disabled={busy} onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium">
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div className="mt-5 a-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Days off</h2>
          <p className="text-sm text-gray-600">Coming and running days off. Finished ones move to History below.</p>
        </div>
        {!form && (
          <button
            type="button"
            onClick={() => open({ id: null, startDate: '', endDate: '', note: '' })}
            className="shrink-0 px-4 py-2 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white font-medium"
          >
            + Add day off
          </button>
        )}
      </div>

      {form && !form.id && editor}

      {daysOff.length === 0 && !form && <p className="text-sm text-gray-500">No days off planned. Delivery runs Monday to Saturday as usual.</p>}

      {daysOff.length > 0 && (
        <ul className="flex flex-col gap-2">
          {daysOff.map((d) => (
            <li key={d.id} className="rounded-xl border border-[#ebe8e3] bg-white p-3 space-y-3">
              {form?.id === d.id ? (
                editor
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      {periodText(d)}
                      {d.startDate <= today && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Running now</span>}
                    </p>
                    <p className="text-sm text-gray-600">
                      {d.note ? `${d.note} · ` : ''}“Penuh” shown from {dayText(noticeDay(d.startDate))} · first delivery after {dayText(soonestAfter(d.endDate))}
                    </p>
                  </div>
                  {!form && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => open({ id: d.id, startDate: d.startDate, endDate: d.endDate, note: d.note })}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMessage(null);
                          setConfirm({ kind: 'remove', dayOff: d });
                        }}
                        className="px-4 py-2 rounded-lg border border-red-200 text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <div className="pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">History</h3>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {history.map((d) => (
              <li key={d.id} className="rounded-xl border border-[#ebe8e3] bg-white px-3 py-2 text-sm text-gray-700">
                {periodText(d)}
                {d.note && <span className="text-gray-500"> · {d.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="dayoff-confirm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            {confirm.kind === 'remove' ? (
              <>
                <h3 id="dayoff-confirm" className="text-lg font-semibold text-gray-900">Remove this day off?</h3>
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">{periodText(confirm.dayOff)}{confirm.dayOff.note ? ` · ${confirm.dayOff.note}` : ''}</p>
                <p className="text-sm text-gray-600">Customers can choose these days for delivery again.</p>
              </>
            ) : (
              <>
                <h3 id="dayoff-confirm" className="text-lg font-semibold text-gray-900">Save this day off?</h3>
                <ul className="space-y-1.5 text-sm text-gray-800">
                  {confirm.lines.map((l) => (
                    <li key={l} className="rounded-lg bg-gray-50 px-3 py-2">{l}</li>
                  ))}
                </ul>
                <p className="text-sm text-gray-600">Customers will see these days as “Penuh” and can’t choose them for delivery.</p>
                {confirm.booked.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-semibold">
                      {confirm.booked.length} paid website {confirm.booked.length === 1 ? 'order is' : 'orders are'} already booked on these days:
                    </p>
                    <p className="mt-1">{confirm.booked.map((o) => `${o.orderId} (${dayText(o.deliveryDay)})`).join(', ')}</p>
                    <p className="mt-1">They are not moved. Please contact these customers to agree on another day.</p>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium">
                Go back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={run}
                className={`px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50 ${confirm.kind === 'remove' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#9a3412] hover:bg-[#7c2d12]'}`}
              >
                {busy ? 'Saving…' : confirm.kind === 'remove' ? 'Yes, remove' : 'Yes, save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
