'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import RupiahInput from '@/components/RupiahInput';

type Kind = 'WELCOME' | 'REFERRAL' | 'MONTHLY';
type Rules = Record<Kind, { percent: number; cap: number }>;
type FormRules = Record<Kind, { percent: string; cap: string }>;

const ROWS: { kind: Kind; name: string; when: string }[] = [
  { kind: 'WELCOME', name: 'New registration', when: 'Given when someone creates an account.' },
  { kind: 'REFERRAL', name: 'Referral', when: 'Given to the referrer after their friend’s first order is delivered.' },
  { kind: 'MONTHLY', name: 'Monthly', when: 'Sent with the monthly button below; expires at the end of the month.' },
];

const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
const toForm = (rules: Rules) =>
  Object.fromEntries(ROWS.map((r) => [r.kind, { percent: String(rules[r.kind].percent), cap: String(rules[r.kind].cap) }])) as FormRules;

/**
 * Percent and max discount of the automatic vouchers (Website → Vouchers). Read-only until "Edit" is clicked;
 * saving asks for confirmation in a pop-up that lists what changes.
 */
export default function AutoVoucherSettings({ rules }: { rules: Rules }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState<FormRules>(() => toForm(rules));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (kind: Kind, field: 'percent' | 'cap', value: string) => setForm((f) => ({ ...f, [kind]: { ...f[kind], [field]: value } }));

  const changes = ROWS.flatMap((r) => {
    const out: string[] = [];
    const p = Number(form[r.kind].percent);
    const c = Number(form[r.kind].cap);
    if (p !== rules[r.kind].percent) out.push(`${r.name}: discount ${rules[r.kind].percent}% → ${p}%`);
    if (c !== rules[r.kind].cap) out.push(`${r.name}: max discount ${rupiah(rules[r.kind].cap)} → ${rupiah(c)}`);
    return out;
  });

  function startEdit() {
    setForm(toForm(rules));
    setMessage(null);
    setEditing(true);
  }

  function cancelEdit() {
    setForm(toForm(rules));
    setEditing(false);
    setConfirming(false);
  }

  function askToSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    for (const r of ROWS) {
      const p = Number(form[r.kind].percent);
      if (!Number.isInteger(p) || p < 1 || p > 100) return setMessage({ ok: false, text: `${r.name}: discount must be 1–100%.` });
      if (!(Number(form[r.kind].cap) >= 1)) return setMessage({ ok: false, text: `${r.name}: fill in the max discount.` });
    }
    if (!changes.length) return setMessage({ ok: false, text: 'Nothing changed.' });
    setConfirming(true);
  }

  async function save() {
    setBusy(true);
    try {
      const body = Object.fromEntries(ROWS.map((r) => [r.kind, { percent: Number(form[r.kind].percent), cap: Number(form[r.kind].cap) }]));
      const res = await fetch('/api/website/voucher-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setConfirming(false);
      setEditing(false);
      setMessage({ ok: true, text: 'Saved. New vouchers use these terms; vouchers already given keep theirs.' });
      router.refresh();
    } catch (error) {
      setConfirming(false);
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={askToSave} className="a-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Automatic vouchers</h2>
          <p className="text-sm text-gray-600">Discount and max discount of the vouchers the shop gives by itself. Changes apply to vouchers given from now on.</p>
        </div>
        {!editing && (
          <button type="button" onClick={startEdit} className="shrink-0 px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium">
            Edit
          </button>
        )}
      </div>

      <div className="divide-y">
        {ROWS.map((r) => (
          <div key={r.kind} className="py-3 grid grid-cols-2 sm:grid-cols-[1fr_120px_200px] gap-3 sm:items-end">
            <div className="col-span-2 sm:col-span-1">
              <p className="font-medium text-gray-900">{r.name}</p>
              <p className="text-xs text-gray-500">{r.when}</p>
            </div>
            {editing ? (
              <>
                <div>
                  <label htmlFor={`${r.kind}-p`} className="block text-xs font-medium text-gray-600 mb-1">Discount</label>
                  <div className="flex items-center">
                    <input
                      id={`${r.kind}-p`}
                      inputMode="numeric"
                      value={form[r.kind].percent}
                      onChange={(e) => set(r.kind, 'percent', e.target.value.replace(/\D/g, '').slice(0, 3))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f6dcc4]"
                      required
                    />
                    <span className="ml-2 text-gray-600">%</span>
                  </div>
                </div>
                <div>
                  <label htmlFor={`${r.kind}-c`} className="block text-xs font-medium text-gray-600 mb-1">Max discount</label>
                  <RupiahInput id={`${r.kind}-c`} value={form[r.kind].cap} onChange={(d) => set(r.kind, 'cap', d)} required />
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-medium text-gray-600">Discount</p>
                  <p className="text-lg font-semibold text-gray-900">{rules[r.kind].percent}%</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Max discount</p>
                  <p className="text-lg font-semibold text-gray-900">{rupiah(rules[r.kind].cap)}</p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {(editing || message) && (
        <div className="flex flex-wrap items-center gap-3">
          {editing && (
            <>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white font-medium disabled:opacity-50">
                Save
              </button>
              <button type="button" disabled={busy} onClick={cancelEdit} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium">
                Cancel
              </button>
            </>
          )}
          {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="auto-voucher-confirm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <h3 id="auto-voucher-confirm" className="text-lg font-semibold text-gray-900">Save these changes?</h3>
            <ul className="space-y-1.5 text-sm text-gray-800">
              {changes.map((c) => (
                <li key={c} className="rounded-lg bg-gray-50 px-3 py-2">{c}</li>
              ))}
            </ul>
            <p className="text-sm text-gray-600">New vouchers will use these terms, and the shop will show them. Vouchers customers already have keep their current terms.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium">
                Go back
              </button>
              <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white font-medium disabled:opacity-50">
                {busy ? 'Saving…' : 'Yes, save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
