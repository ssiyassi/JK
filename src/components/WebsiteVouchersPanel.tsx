'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import RupiahInput from '@/components/RupiahInput';
import { jakartaDateKey } from '@/lib/core/time';
import type { CampaignSummary, CampaignType, CodeRow } from '@/lib/shop/campaigns';

export interface PickCustomer {
  id: string;
  name: string;
  email: string;
  /** Email confirmed with the sign-up code; "All" only sends to these. */
  confirmed: boolean;
}

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

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#9a3412] focus:outline-none';
const label = 'block text-sm font-medium text-gray-700 mb-1';
const hint = 'text-xs text-gray-500 mt-1';
const btn = 'rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50';
const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta' });

const TYPE_INFO: Record<CampaignType, { name: string; text: string }> = {
  GENERAL: { name: 'General code', text: 'One code for everyone, e.g. JENTIS10.' },
  UNIQUE: { name: 'Unique codes', text: 'A batch of single-use codes (e.g. for a company collab). Download them as a locked ZIP.' },
  BLAST: { name: 'Email blast', text: 'Every recipient gets their own single-use code by email.' },
};

const STATUS_STYLE: Record<CampaignSummary['status'], string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  ENDED: 'bg-gray-200 text-gray-700',
  DEACTIVATED: 'bg-red-100 text-red-800',
};

function discountText(c: Pick<CampaignSummary, 'discountType' | 'discountValue' | 'capAmount'>) {
  if (c.discountType === 'FIXED') return rupiah(c.discountValue);
  return c.capAmount ? `${c.discountValue}% (max ${rupiah(c.capAmount)})` : `${c.discountValue}%`;
}

// ---------------------------------------------------------------------------
// Recipients (email blast)
// ---------------------------------------------------------------------------

type RecipientMode = 'ALL' | 'SELECTED' | 'EMAILS';
interface RecipientState {
  mode: RecipientMode;
  customerIds: string[];
  emails: string;
}

function RecipientPicker({ value, onChange, customers }: { value: RecipientState; onChange: (v: RecipientState) => void; customers: PickCustomer[] }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.includes(q)) : customers;
  }, [customers, query]);
  const selected = new Set(value.customerIds);
  const toggle = (id: string) =>
    onChange({ ...value, customerIds: selected.has(id) ? value.customerIds.filter((x) => x !== id) : [...value.customerIds, id] });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['ALL', `All confirmed customers (${customers.filter((c) => c.confirmed).length})`],
            ['SELECTED', 'Choose customers'],
            ['EMAILS', 'Paste email addresses'],
          ] as const
        ).map(([mode, text]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ ...value, mode })}
            className={`${btn} border ${value.mode === mode ? 'bg-[#9a3412] text-white border-orange-500' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            {text}
          </button>
        ))}
      </div>
      {value.mode === 'SELECTED' && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center gap-2 p-2 border-b">
            <input className={input} placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button
              type="button"
              className={`${btn} border border-gray-300 whitespace-nowrap`}
              onClick={() => onChange({ ...value, customerIds: [...new Set([...value.customerIds, ...shown.map((c) => c.id)])] })}
            >
              Tick all
            </button>
            <button type="button" className={`${btn} border border-gray-300`} onClick={() => onChange({ ...value, customerIds: [] })}>
              Clear
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y">
            {shown.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" className="size-4" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-900 truncate">{c.name}</span>
                    <span className="block text-gray-500 truncate">{c.email}</span>
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-4 text-sm text-gray-500">No customers found.</li>}
          </ul>
          <p className="px-3 py-2 text-xs text-gray-600 border-t">{value.customerIds.length} ticked</p>
        </div>
      )}
      {value.mode === 'EMAILS' && (
        <div>
          <textarea
            className={`${input} min-h-28 font-mono`}
            placeholder={'rini@example.com\nbudi@example.com'}
            value={value.emails}
            onChange={(e) => onChange({ ...value, emails: e.target.value })}
          />
          <p className={hint}>One per line, or separated by commas. Only a shop account with that email can use the code (they can register with it).</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------

interface FormState {
  type: CampaignType;
  name: string;
  code: string;
  prefix: string;
  count: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: string;
  capAmount: string;
  minOrder: string;
  startDate: string;
  endDate: string;
  quota: string;
  perCustomerLimit: string;
  perCustomerDailyLimit: string;
}

const str = (n: number | null) => (n === null ? '' : String(n));

function VoucherForm({
  existing,
  customers,
  onDone,
}: {
  existing?: CampaignSummary;
  customers: PickCustomer[];
  onDone: (message: string) => void;
}) {
  const today = jakartaDateKey(Date.now());
  const [f, setF] = useState<FormState>(() =>
    existing
      ? {
          type: existing.type,
          name: existing.name,
          code: existing.generalCode ?? '',
          prefix: existing.prefix ?? '',
          count: '',
          discountType: existing.discountType,
          discountValue: String(existing.discountValue),
          capAmount: str(existing.capAmount),
          minOrder: existing.minOrder ? String(existing.minOrder) : '',
          startDate: jakartaDateKey(existing.startsAt),
          endDate: jakartaDateKey(existing.endsAt),
          quota: str(existing.quota),
          perCustomerLimit: str(existing.perCustomerLimit),
          perCustomerDailyLimit: str(existing.perCustomerDailyLimit),
        }
      : {
          type: 'GENERAL',
          name: '',
          code: '',
          prefix: '',
          count: '50',
          discountType: 'PERCENT',
          discountValue: '',
          capAmount: '',
          minOrder: '',
          startDate: today,
          endDate: '',
          quota: '',
          perCustomerLimit: '1',
          perCustomerDailyLimit: '',
        },
  );
  const [recipients, setRecipients] = useState<RecipientState>({ mode: 'ALL', customerIds: [], emails: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const setUpper = (k: 'code' | 'prefix') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value.toUpperCase().replace(/\s+/g, '') }));
  const discountLocked = Boolean(existing && existing.uses > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!existing && f.type === 'BLAST') {
      const who =
        recipients.mode === 'ALL'
          ? `all ${customers.length} active customers`
          : recipients.mode === 'SELECTED'
            ? `${recipients.customerIds.length} customers`
            : 'the pasted email addresses';
      if (!window.confirm(`Create the voucher and email a personal code to ${who} now?`)) return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, minOrder: f.minOrder || '0', recipients: f.type === 'BLAST' ? recipients : undefined };
      if (existing) {
        await send(`/api/website/vouchers/${existing.id}`, 'PATCH', body);
        onDone('Saved.');
      } else {
        const res = await send('/api/website/vouchers', 'POST', body);
        const em = res.emails as { attempted: number; sent: number } | null;
        onDone(
          em
            ? em.sent === em.attempted
              ? `Voucher created and ${em.sent} emails sent.`
              : `Voucher created. Sent ${em.sent} of ${em.attempted} emails; use "Send unsent emails" to retry the rest.`
            : 'Voucher created.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!existing && (
        <div>
          <span className={label}>Type</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {(Object.keys(TYPE_INFO) as CampaignType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setF((s) => ({ ...s, type: t, perCustomerLimit: t === 'GENERAL' ? s.perCustomerLimit || '1' : s.perCustomerLimit }))}
                className={`text-left rounded-lg border p-3 ${f.type === t ? 'border-gray-900 ring-2 ring-gray-900 bg-white' : 'border-gray-300 bg-white'}`}
              >
                <span className="block font-semibold text-gray-900 text-sm">{TYPE_INFO[t].name}</span>
                <span className="block text-xs text-gray-600 mt-0.5">{TYPE_INFO[t].text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={label} htmlFor="v-name">Name (customers see this)</label>
        <input id="v-name" className={input} value={f.name} onChange={set('name')} placeholder="e.g. Promo OCBC" maxLength={80} required />
      </div>

      {!existing && f.type === 'GENERAL' && (
        <div>
          <label className={label} htmlFor="v-code">Code</label>
          <input id="v-code" className={`${input} font-mono uppercase`} value={f.code} onChange={setUpper('code')} placeholder="JENTIS10" required />
          <p className={hint}>Letters, numbers and dashes. Customers can type it in small or capital letters.</p>
        </div>
      )}
      {!existing && f.type !== 'GENERAL' && (
        <div className="grid grid-cols-2 gap-3">
          <div className={f.type === 'UNIQUE' ? '' : 'col-span-2'}>
            <label className={label} htmlFor="v-prefix">Prefix</label>
            <input id="v-prefix" className={`${input} font-mono uppercase`} value={f.prefix} onChange={setUpper('prefix')} placeholder="JENTISXOCBC" required />
          </div>
          {f.type === 'UNIQUE' && (
            <div>
              <label className={label} htmlFor="v-count">How many codes</label>
              <input id="v-count" className={input} inputMode="numeric" value={f.count} onChange={set('count')} placeholder="50" required />
            </div>
          )}
          <p className={`${hint} col-span-2`}>
            Codes look like <span className="font-mono">{(f.prefix || 'PREFIX') + 'A7K2QX'}</span> (prefix + 6 random characters), each usable once.
            {f.type === 'UNIQUE' && ' The download is a ZIP locked with the prefix as password.'}
          </p>
        </div>
      )}
      {existing && (
        <p className="text-sm text-gray-600">
          {TYPE_INFO[existing.type].name} · <span className="font-mono">{existing.generalCode ?? existing.prefix}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="v-dtype">Discount</label>
          <select id="v-dtype" className={input} value={f.discountType} onChange={set('discountType')} disabled={discountLocked}>
            <option value="PERCENT">Percent (%)</option>
            <option value="FIXED">Fixed Rupiah</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="v-value">{f.discountType === 'PERCENT' ? 'Percent' : 'Amount'}</label>
          {f.discountType === 'PERCENT' ? (
            <div className="flex items-center">
              <input id="v-value" className={input} inputMode="numeric" value={f.discountValue} onChange={set('discountValue')} placeholder="10" required disabled={discountLocked} />
              <span className="ml-2 text-gray-600">%</span>
            </div>
          ) : (
            <RupiahInput id="v-value" value={f.discountValue} onChange={(d) => setF((s) => ({ ...s, discountValue: d }))} placeholder="20.000" required />
          )}
        </div>
        {discountLocked && <p className={`${hint} col-span-2`}>The discount can&apos;t change because customers have already used this voucher.</p>}
        {f.discountType === 'PERCENT' && (
          <div>
            <label className={label} htmlFor="v-cap">Max discount (optional)</label>
            <RupiahInput id="v-cap" value={f.capAmount} onChange={(d) => setF((s) => ({ ...s, capAmount: d }))} placeholder="No limit" />
          </div>
        )}
        <div className={f.discountType === 'PERCENT' ? '' : 'col-span-2'}>
          <label className={label} htmlFor="v-min">Minimum order</label>
          <RupiahInput id="v-min" value={f.minOrder} onChange={(d) => setF((s) => ({ ...s, minOrder: d }))} placeholder="0 = no minimum" />
        </div>
        <p className={`${hint} col-span-2`}>Products only — the delivery fee is never discounted. Minimum order counts product prices.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="v-start">Start date</label>
          <input id="v-start" type="date" className={input} value={f.startDate} onChange={set('startDate')} required />
        </div>
        <div>
          <label className={label} htmlFor="v-end">End date</label>
          <input id="v-end" type="date" className={input} value={f.endDate} min={f.startDate} onChange={set('endDate')} required />
        </div>
        <p className={`${hint} col-span-2`}>From 00:00 on the start date until 23:59 on the end date (WIB).</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={label} htmlFor="v-quota">Total quota (optional)</label>
          <input id="v-quota" className={input} inputMode="numeric" value={f.quota} onChange={set('quota')} placeholder="Unlimited" />
          <p className={hint}>e.g. 50 = only the first 50 orders.</p>
        </div>
        <div>
          <label className={label} htmlFor="v-per">Per customer (optional)</label>
          <input id="v-per" className={input} inputMode="numeric" value={f.perCustomerLimit} onChange={set('perCustomerLimit')} placeholder="Unlimited" />
          <p className={hint}>Times one customer can use it between the dates.</p>
        </div>
        <div>
          <label className={label} htmlFor="v-daily">Per customer per day (optional)</label>
          <input id="v-daily" className={input} inputMode="numeric" value={f.perCustomerDailyLimit} onChange={set('perCustomerDailyLimit')} placeholder="Unlimited" />
        </div>
      </div>

      {!existing && f.type === 'BLAST' && (
        <div>
          <span className={label}>Send to</span>
          <RecipientPicker value={recipients} onChange={setRecipients} customers={customers} />
        </div>
      )}

      <p className="text-xs text-gray-500">One voucher per order: a customer can&apos;t combine this with another voucher. A cancelled order gives the use back.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${btn} bg-[#9a3412] hover:bg-[#7c2d12] text-white px-4 py-2.5`}>
          {busy ? 'Saving…' : existing ? 'Save changes' : f.type === 'BLAST' ? 'Create and send emails' : 'Create voucher'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Codes list (unique / blast)
// ---------------------------------------------------------------------------

function CodesList({ campaign }: { campaign: CampaignSummary }) {
  const [codes, setCodes] = useState<CodeRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCodes((await send(`/api/website/vouchers/${campaign.id}`, 'GET')).codes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }, [campaign.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(k: CodeRow) {
    setBusyId(k.id);
    try {
      await send(`/api/website/vouchers/${campaign.id}`, 'PATCH', { codeId: k.id, disabled: k.disabledAt === null });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!codes) return <p className="text-sm text-gray-500">Loading codes…</p>;
  const q = query.trim().toUpperCase();
  const shown = q ? codes.filter((k) => k.code.includes(q) || (k.email ?? '').toUpperCase().includes(q)) : codes;
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="p-2 border-b">
        <input className={input} placeholder={campaign.type === 'BLAST' ? 'Search code or email' : 'Search code'} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="max-h-80 overflow-y-auto divide-y">
        {shown.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-mono font-medium text-gray-900">{k.code}</p>
              {k.email && <p className="text-xs text-gray-500 truncate">{k.email}{k.emailedAt ? '' : ' · email not sent'}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${k.used ? 'bg-green-100 text-green-800' : k.disabledAt ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}
              >
                {k.used ? 'Used' : k.disabledAt ? 'Deactivated' : 'Not used'}
              </span>
              {!k.used && (
                <button type="button" disabled={busyId === k.id} onClick={() => toggle(k)} className="text-xs text-blue-700 disabled:opacity-50">
                  {k.disabledAt ? 'Reactivate' : 'Deactivate'}
                </button>
              )}
            </div>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-4 text-sm text-gray-500">No codes found.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One voucher
// ---------------------------------------------------------------------------

function CampaignCard({ c, customers }: { c: CampaignSummary; customers: PickCustomer[] }) {
  const router = useRouter();
  const [panel, setPanel] = useState<'none' | 'edit' | 'codes' | 'add'>('none');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [recipients, setRecipients] = useState<RecipientState>({ mode: 'EMAILS', customerIds: [], emails: '' });
  const unsent = c.type === 'BLAST' ? c.codes - c.emailed - c.codesDisabled : 0;

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await work() });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  const toggle = () => {
    const off = c.disabledAt === null;
    if (!window.confirm(off ? `Deactivate "${c.name}"? Nobody can use it until you reactivate it. Orders that already used it are not changed.` : `Reactivate "${c.name}"?`)) return;
    void run(async () => {
      await send(`/api/website/vouchers/${c.id}`, 'PATCH', { disabled: off });
      return off ? 'Deactivated.' : 'Reactivated.';
    });
  };

  const sendEmails = (withRecipients: boolean) =>
    run(async () => {
      const res = await send(`/api/website/vouchers/${c.id}/send`, 'POST', withRecipients ? { recipients } : {});
      setPanel('none');
      const em = res.emails as { attempted: number; sent: number };
      const added = withRecipients ? `Added ${res.added} new recipient${res.added === 1 ? '' : 's'}. ` : '';
      return em.attempted === 0 ? `${added}No emails left to send.` : `${added}Sent ${em.sent} of ${em.attempted} emails.`;
    });

  const usedText =
    c.type === 'GENERAL'
      ? `${c.uses}${c.quota !== null ? ` / ${c.quota}` : ''} used`
      : `${c.codesUsed} / ${c.codes} codes used${c.quota !== null ? ` · quota ${c.quota}` : ''}`;

  return (
    <li className="rounded-2xl bg-white shadow-lg p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{c.name}</p>
          <p className="text-sm text-gray-600">
            {TYPE_INFO[c.type].name} · <span className="font-mono">{c.generalCode ?? `${c.prefix}…`}</span>
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>
          {c.status === 'ACTIVE' ? 'Active' : c.status === 'SCHEDULED' ? 'Not started' : c.status === 'ENDED' ? 'Ended' : 'Deactivated'}
        </span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-gray-500 text-xs">Discount</dt>
          <dd className="font-medium">{discountText(c)}</dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Min. order</dt>
          <dd className="font-medium">{c.minOrder ? rupiah(c.minOrder) : 'None'}</dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Valid</dt>
          <dd className="font-medium">{day(c.startsAt)} – {day(c.endsAt)}</dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Limits</dt>
          <dd className="font-medium">
            {[c.perCustomerLimit !== null && `${c.perCustomerLimit}× per customer`, c.perCustomerDailyLimit !== null && `${c.perCustomerDailyLimit}× per day`]
              .filter(Boolean)
              .join(', ') || 'None'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Used</dt>
          <dd className="font-medium">{usedText}</dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Paid orders</dt>
          <dd className="font-medium">{c.paidUses}</dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Discount given</dt>
          <dd className="font-medium">{rupiah(c.discountGiven)}</dd>
        </div>
        {c.type === 'BLAST' && (
          <div>
            <dt className="text-gray-500 text-xs">Emails sent</dt>
            <dd className="font-medium">{c.emailed} / {c.codes}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        {c.type === 'UNIQUE' && (
          <a href={`/api/website/vouchers/${c.id}/download?what=codes`} className={`${btn} bg-[#9a3412] hover:bg-[#7c2d12] text-white`}>
            Download codes (ZIP)
          </a>
        )}
        <a href={`/api/website/vouchers/${c.id}/download?what=usage`} className={`${btn} border border-gray-300 text-gray-800`}>
          Download usage{c.type === 'UNIQUE' ? ' (ZIP)' : ' (CSV)'}
        </a>
        {c.type !== 'GENERAL' && (
          <button type="button" className={`${btn} border border-gray-300 text-gray-800`} onClick={() => setPanel(panel === 'codes' ? 'none' : 'codes')}>
            {panel === 'codes' ? 'Hide codes' : 'Codes'}
          </button>
        )}
        {c.type === 'BLAST' && (
          <button type="button" className={`${btn} border border-gray-300 text-gray-800`} onClick={() => setPanel(panel === 'add' ? 'none' : 'add')}>
            Add recipients
          </button>
        )}
        {unsent > 0 && (
          <button type="button" disabled={busy} className={`${btn} bg-[#7c2d12] text-white`} onClick={() => sendEmails(false)}>
            Send unsent emails ({unsent})
          </button>
        )}
        <button type="button" className={`${btn} border border-gray-300 text-gray-800`} onClick={() => setPanel(panel === 'edit' ? 'none' : 'edit')}>
          {panel === 'edit' ? 'Close edit' : 'Edit'}
        </button>
        <button type="button" disabled={busy} onClick={toggle} className={`${btn} border ${c.disabledAt === null ? 'border-red-300 text-red-700' : 'border-green-300 text-green-700'}`}>
          {c.disabledAt === null ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
      {c.type === 'UNIQUE' && (
        <p className="text-xs text-gray-500">
          ZIP password: <span className="font-mono font-semibold">{c.prefix}</span>
        </p>
      )}
      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}

      {panel === 'codes' && <CodesList campaign={c} />}
      {panel === 'add' && (
        <div className="space-y-3 rounded-lg bg-gray-50 p-3">
          <p className="text-sm text-gray-700">People who already have a code from this voucher are skipped.</p>
          <RecipientPicker value={recipients} onChange={setRecipients} customers={customers} />
          <button type="button" disabled={busy} className={`${btn} bg-[#9a3412] hover:bg-[#7c2d12] text-white`} onClick={() => sendEmails(true)}>
            {busy ? 'Sending…' : 'Add and send emails'}
          </button>
        </div>
      )}
      {panel === 'edit' && (
        <div className="rounded-lg bg-gray-50 p-3">
          <VoucherForm
            existing={c}
            customers={customers}
            onDone={(text) => {
              setPanel('none');
              setMessage({ ok: true, text });
              router.refresh();
            }}
          />
        </div>
      )}
    </li>
  );
}

export default function WebsiteVouchersPanel({ campaigns, customers }: { campaigns: CampaignSummary[]; customers: PickCustomer[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl bg-white shadow-lg p-4">
        {creating ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">New voucher</h2>
              <button type="button" className="text-sm text-gray-600" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
            <VoucherForm
              key={formKey}
              customers={customers}
              onDone={(text) => {
                setCreating(false);
                setFormKey((k) => k + 1);
                setMessage(text);
                router.refresh();
              }}
            />
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">Create a discount code, a batch of unique codes, or email a personal code to customers.</p>
            <button type="button" className={`${btn} bg-[#9a3412] hover:bg-[#7c2d12] text-white px-4 py-2.5`} onClick={() => { setCreating(true); setMessage(null); }}>
              + New voucher
            </button>
          </div>
        )}
        {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      </section>

      {campaigns.length === 0 ? (
        <p className="text-sm text-gray-500">No vouchers yet.</p>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <CampaignCard key={`${c.id}-${c.updatedAt}`} c={c} customers={customers} />
          ))}
        </ul>
      )}
    </div>
  );
}
