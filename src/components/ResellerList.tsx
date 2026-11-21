'use client';

import { useState } from 'react';
import { Icon, Message, WaIcon } from './admin/ui';
import { paydayMessage } from '@/lib/shop/payday-text';

interface Reseller {
  id: string;
  reseller: string;
  parentReseller: string | null;
  phone: string | null;
  labelName: string; // printed as "DARI" on the shipping label
  createdAt: string;
  updatedAt: string;
}

type Field = 'phone' | 'labelName';

interface ResellerListProps {
  resellers: Reseller[];
  /** This month's Payday Promo message (edited in Website → Payday). */
  payday: { template: string; month: string; link: string };
}

export default function ResellerList({ resellers: initialResellers, payday }: ResellerListProps) {
  const [resellers, setResellers] = useState(initialResellers);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  // Values being typed, by "<field>:<reseller id>" (only rows that differ from the saved value).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const saved = (r: Reseller, field: Field) => (field === 'phone' ? (r.phone ? '0' + r.phone.slice(2) : '') : r.labelName);

  const handleSave = async (r: Reseller, field: Field) => {
    const key = `${field}:${r.id}`;
    const value = drafts[key] ?? saved(r, field);
    const what = field === 'phone' ? 'WhatsApp number' : 'Label name';
    setSavingKey(key);
    setMessage(null);
    try {
      const response = await fetch('/api/resellers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, [field]: value }),
      });
      const result = await response.json();
      if (response.ok) {
        setResellers(prev => prev.map(x => (x.id === r.id ? { ...x, [field]: result[field] } : x)));
        setDrafts(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setMessage({ type: 'success', text: `${what} of "${r.reseller}" saved.` });
      } else {
        setMessage({ type: 'error', text: result.error || `Failed to save ${what.toLowerCase()}.` });
      }
    } catch (error) {
      console.error('Save reseller error:', error);
      setMessage({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleDelete = async (id: string, resellerName: string) => {
    if (!confirm(`Are you sure you want to delete "${resellerName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    setMessage(null);

    try {
      const response = await fetch(`/api/resellers?id=${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: `Reseller "${resellerName}" deleted successfully!` });
        // Remove the deleted reseller from the list
        setResellers(prev => prev.filter(r => r.id !== id));
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to delete reseller. Please try again.' });
      }
    } catch (error) {
      console.error('Delete error:', error);
      setMessage({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setDeletingId(null);
    }
  };

  // Text box with a Save button that appears once the value is changed.
  const editForm = (reseller: Reseller, field: Field, inputClass: string) => {
    const key = `${field}:${reseller.id}`;
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); handleSave(reseller, field); }}
      >
        <input
          type={field === 'phone' ? 'tel' : 'text'}
          aria-label={`${field === 'phone' ? 'WhatsApp number' : 'Label name'} of ${reseller.reseller}`}
          value={drafts[key] ?? saved(reseller, field)}
          onChange={(e) => setDrafts(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder={field === 'phone' ? '08xx' : reseller.reseller}
          maxLength={field === 'labelName' ? 60 : undefined}
          className={inputClass}
        />
        {drafts[key] !== undefined && drafts[key] !== saved(reseller, field) && (
          <button
            type="submit"
            disabled={savingKey === key}
            className="a-btn a-btn-sm a-btn-green shrink-0"
          >
            {savingKey === key ? 'Saving...' : 'Save'}
          </button>
        )}
      </form>
    );
  };

  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const shown = resellers.filter((r) => {
    const q = query.trim().toLowerCase();
    return !q || r.reseller.toLowerCase().includes(q) || r.labelName.toLowerCase().includes(q) || (r.parentReseller ?? '').toLowerCase().includes(q);
  });

  // WhatsApp icon: opens WhatsApp with this month's Payday message filled in; without a saved number WhatsApp asks which chat.
  const paydayHref = (reseller: Reseller) =>
    `https://wa.me/${reseller.phone ?? ''}?text=${encodeURIComponent(paydayMessage(payday.template, reseller.reseller, payday.month, payday.link))}`;

  return (
    <div className="flex flex-col gap-3">
      <Message message={message ? { ok: message.type === 'success', text: message.text } : null} />
      <label className="flex h-11 items-center gap-2 rounded-[10px] border border-[#ebe8e3] bg-white px-3 text-[#a1a1aa]">
        <Icon name="search" className="size-4" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, label or parent…" className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#18181b] outline-none" />
      </label>
      <div className="flex flex-col gap-2.5">
        {shown.map((reseller) => (
          <div key={reseller.id} className="a-card px-3.5 py-3 lg:px-[18px]">
            <div className="flex items-center gap-3">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[#f3f1ed] text-xs font-bold text-[#52525b]">{reseller.reseller.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <b>{reseller.reseller}</b>
                  {reseller.labelName && reseller.labelName !== reseller.reseller && <span className="text-[#52525b]"> - {reseller.labelName}</span>}
                </div>
                <div className="text-[13px] tabular-nums text-[#52525b]">{reseller.phone ? `0${reseller.phone.slice(2)}` : 'No WhatsApp number'}</div>
                <div className="text-xs text-[#a1a1aa]">Parent: {reseller.parentReseller || 'none'}</div>
              </div>
              <WaIcon href={paydayHref(reseller)} title={reseller.phone ? `Send the Payday ${payday.month} message to ${reseller.reseller}` : 'No number saved: WhatsApp will ask which chat'} />
              <button type="button" onClick={() => setEditing(editing === reseller.id ? null : reseller.id)} className="a-btn a-btn-sm w-9 px-0" aria-label={`Edit ${reseller.reseller}`}>
                <Icon name="edit" className="size-4" />
              </button>
            </div>
            {editing === reseller.id && (
              <div className="mt-3 grid gap-2.5 rounded-xl bg-[#fcfbf9] p-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <div>
                  <div className="a-label">WhatsApp number</div>
                  {editForm(reseller, 'phone', 'a-input h-10 min-w-0 flex-1')}
                </div>
                <div>
                  <div className="a-label">Label name (printed on labels)</div>
                  {editForm(reseller, 'labelName', 'a-input h-10 min-w-0 flex-1')}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(reseller.id, reseller.reseller)}
                  disabled={deletingId === reseller.id}
                  className="a-btn a-btn-sm a-btn-danger"
                >
                  {deletingId === reseller.id ? 'Deleting…' : 'Delete reseller'}
                </button>
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="p-6 text-center text-[#a1a1aa]">No resellers found.</p>}
      </div>
    </div>
  );
}
