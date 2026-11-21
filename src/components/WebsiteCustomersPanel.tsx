'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { monthlyVoucherReminderMessage, whatsappLink } from '@/lib/shop/catalog';
import { WaIcon } from './admin/ui';
import type { AdminCustomer } from '@/lib/shop/customers';
import type { MonthlyReminder } from '@/lib/shop/vouchers';

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#9a3412] focus:outline-none';

/** 6281234567890 -> 081234567890, the way customers write it. */
const displayPhone = (phone: string) => (phone.startsWith('62') ? '0' + phone.slice(2) : phone);

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta' });

type Field = 'all' | 'name' | 'email' | 'phone';
type Status = 'all' | 'active' | 'disabled';

function matches(c: AdminCustomer, query: string, field: Field): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/[^\d]/g, '');
  const byName = () => c.name.toLowerCase().includes(q);
  const byEmail = () => c.email.includes(q);
  // Typed as 0812…, +62812… or 62812…: compare against both the stored (62…) and the written (08…) form.
  const byPhone = () => digits.length > 0 && (c.phone.includes(digits) || displayPhone(c.phone).includes(digits));
  if (field === 'name') return byName();
  if (field === 'email') return byEmail();
  if (field === 'phone') return byPhone();
  return byName() || byEmail() || byPhone();
}

function CustomerRow({ customer, monthly }: { customer: AdminCustomer; monthly: MonthlyReminder | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: customer.name, email: customer.email, phone: displayPhone(customer.phone) });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const disabled = customer.disabledAt !== null;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await send(`/api/website/customers/${customer.id}`, 'PATCH', form);
      setEditing(false);
      setMessage({ ok: true, text: 'Saved' });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    const question = disabled
      ? `Reactivate ${customer.name}? They can sign in again.`
      : `Deactivate ${customer.name}? They will be signed out and cannot sign in, reset the password or receive monthly vouchers. You can reactivate them later.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setMessage(null);
    try {
      await send(`/api/website/customers/${customer.id}`, 'PATCH', { disabled: !disabled });
      setMessage({ ok: true, text: disabled ? 'Reactivated' : 'Deactivated' });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  /** Opens the shop in a new tab, signed in as this customer (one-time link, see shop/masuk-admin). */
  async function loginAs() {
    // Opened right away: phones block new tabs opened after waiting for the server.
    const tab = window.open('', '_blank');
    setMessage(null);
    try {
      const { url } = await send(`/api/website/customers/${customer.id}/login`, 'POST');
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      tab?.close();
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    }
  }

  return (
    <li className={`a-card p-4 ${disabled ? '!bg-gray-50' : ''}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${disabled ? 'text-gray-500' : 'text-gray-900'}`}>{customer.name}</span>
            {disabled ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Deactivated {formatDate(customer.disabledAt!)}
              </span>
            ) : (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
            )}
            {!customer.hasPassword ? (
              // Made at a guest checkout: signs in after setting a password from the emailed "Buat password" link.
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">No password yet (from checkout)</span>
            ) : (
              customer.emailVerifiedAt === null && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Email not confirmed</span>
              )
            )}
          </div>
          <div className="mt-1 text-sm text-gray-700 break-all">{customer.email}</div>
          <div className="text-sm text-gray-700">{displayPhone(customer.phone)}</div>
          <div className="mt-1 text-xs text-gray-500">
            Joined {formatDate(customer.createdAt)} · {customer.orders} paid order{customer.orders === 1 ? '' : 's'}
            {customer.lastOrderAt ? ` · last order ${formatDate(customer.lastOrderAt)}` : ''}
            {customer.referredByName ? ` · referred by ${customer.referredByName}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:justify-end sm:gap-2">
          {!disabled && (
            <>
              {/* WhatsApp reminder about this month's voucher (opens WhatsApp with the message filled in; nothing is sent automatically). */}
              {monthly && !monthly.used ? (
                <WaIcon href={whatsappLink(customer.phone, monthlyVoucherReminderMessage(customer.name, monthly))} title={`WhatsApp ${customer.name}: ${monthly.percent}% voucher reminder`} />
              ) : (
                <WaIcon href={whatsappLink(customer.phone, `Halo Kak ${customer.name}, ini Jentis Kitchen 😊`)} title={`WhatsApp ${customer.name}`} />
              )}
              <button onClick={loginAs} disabled={busy} title="Login as customer" className="a-btn flex-1 border-blue-300 px-2 text-blue-700 hover:bg-blue-50 disabled:opacity-50 sm:flex-none sm:px-3.5">
                <span className="sm:hidden">Login</span>
                <span className="hidden sm:inline">Login as customer</span>
              </button>
            </>
          )}
            {!editing && (
              <button
                onClick={() => {
                  setForm({ name: customer.name, email: customer.email, phone: displayPhone(customer.phone) });
                  setMessage(null);
                  setEditing(true);
                }}
                disabled={busy}
                className="a-btn flex-1 px-2 disabled:opacity-50 sm:flex-none sm:px-3.5"
              >
                Edit
              </button>
            )}
            <button onClick={toggle} disabled={busy} className={`a-btn flex-1 px-2 disabled:opacity-50 sm:flex-none sm:px-3.5 ${disabled ? 'a-btn-green' : 'a-btn-danger'}`}>
              {disabled ? 'Reactivate' : 'Deactivate'}
            </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-3">
          <label className="text-sm text-gray-700">
            Name
            <input className={`${input} mt-1`} value={form.name} onChange={set('name')} />
          </label>
          <label className="text-sm text-gray-700">
            Email
            <input className={`${input} mt-1`} type="email" value={form.email} onChange={set('email')} />
          </label>
          <label className="text-sm text-gray-700">
            Phone
            <input className={`${input} mt-1`} type="tel" value={form.phone} onChange={set('phone')} placeholder="081234567890" />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-[#9a3412] px-4 py-2 text-sm font-medium text-white hover:bg-[#7c2d12] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setMessage(null);
              }}
              disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-500 sm:col-span-3">
            The customer signs in with the new email from now on. Past orders keep the recipient details they were placed with.
          </p>
        </div>
      )}

      {message && <p className={`mt-2 text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
    </li>
  );
}

export default function WebsiteCustomersPanel({
  customers,
  monthly,
}: {
  customers: AdminCustomer[];
  /** This month's voucher by customer id (for the WhatsApp reminder). */
  monthly: Record<string, MonthlyReminder>;
}) {
  const [query, setQuery] = useState('');
  const [field, setField] = useState<Field>('all');
  const [status, setStatus] = useState<Status>('all');

  const shown = useMemo(
    () =>
      customers.filter(
        (c) =>
          matches(c, query, field) &&
          (status === 'all' || (status === 'active' ? c.disabledAt === null : c.disabledAt !== null)),
      ),
    [customers, query, field, status],
  );
  const activeCount = customers.filter((c) => c.disabledAt === null).length;

  return (
    <div className="mt-6">
      <div className="grid gap-3 rounded-2xl bg-white shadow-lg p-4 sm:grid-cols-[1fr_auto_auto]">
        <input
          className={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            field === 'name' ? 'Search by name' : field === 'email' ? 'Search by email' : field === 'phone' ? 'Search by phone, e.g. 0812…' : 'Search name, email or phone'
          }
        />
        <select className={input} value={field} onChange={(e) => setField(e.target.value as Field)} aria-label="Search in">
          <option value="all">All fields</option>
          <option value="name">Name</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
        </select>
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Deactivated</option>
        </select>
      </div>

      <p className="mt-3 text-sm text-gray-600">
        Showing {shown.length} of {customers.length} customer{customers.length === 1 ? '' : 's'} ({activeCount} active,{' '}
        {customers.length - activeCount} deactivated)
      </p>

      {shown.length ? (
        <ul className="mt-3 flex flex-col gap-3">
          {shown.map((c) => (
            <CustomerRow key={c.id} customer={c} monthly={monthly[c.id] ?? null} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl bg-white shadow-lg p-6 text-center text-sm text-gray-500">
          {customers.length ? 'No customers match this filter.' : 'No customers have registered yet.'}
        </p>
      )}
    </div>
  );
}
