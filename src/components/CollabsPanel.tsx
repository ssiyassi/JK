'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Collab, CollabApplication, CollabPlatform } from '@/lib/shop/collabs';
import type { CommissionReport, CommissionSum } from '@/lib/shop/collab-report';
import CopyValueButton from './CopyValueButton';

type Defaults = {
  platform: CollabPlatform;
  freeProducts: string;
  commissionPerBox: number;
  codePercent: number;
  codeCap: number;
  contentDays: number;
  minReels: number;
  minStories: number;
  contractMonths: number;
};

type Form = {
  id: string | null;
  applicationId: string | null;
  name: string;
  platform: CollabPlatform;
  handle: string;
  campaign: string;
  voucherCode: string;
  freeProducts: string;
  commissionPerBox: string;
  codePercent: string;
  codeCap: string;
  contentDays: string;
  minReels: string;
  minStories: string;
  startDate: string;
  endDate: string;
  note: string;
  /** Link name / code typed by hand: stop filling them from the name. */
  campaignTouched: boolean;
  codeTouched: boolean;
};

type Confirm =
  | { kind: 'save'; lines: string[] }
  | { kind: 'switch'; collab: Collab; disabled: boolean }
  | { kind: 'delete'; collab: Collab }
  | { kind: 'hide'; application: CollabApplication };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = (key: string) => {
  const t = new Date(`${key}T00:00:00Z`);
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
};
const when = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
const digits = (s: string) => s.replace(/[^\d]/g, '');
const addMonths = (key: string, months: number) => {
  const t = new Date(`${key}T00:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() + months);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};
const slugify = (text: string, max = 40) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
/** Voucher code suggestion from the first name: "Sarah Wijaya" → SARAH. */
const codeFrom = (name: string) => (name.trim().split(/\s+/)[0] ?? '').normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
const shopLink = (shopUrl: string, platform: string, campaign: string) =>
  `${shopUrl}/?utm_source=${platform}&utm_medium=influencer&utm_campaign=${encodeURIComponent(campaign)}`;
const pageLink = (shopUrl: string, slug: string) => `${shopUrl}/collab/${slug}`;
const waPhone = (p: string) => p.replace(/^0/, '62');

function inviteText(c: Collab, shopUrl: string): string {
  return `Halo ${c.name}! 👋 Kami dari Jentis Kitchen ingin mengajak kamu collab. Detail penawarannya ada di sini ya:\n${pageLink(shopUrl, c.slug)}`;
}

const STATUS = {
  accepted: 'bg-green-100 text-green-800',
  waiting: 'bg-amber-100 text-amber-800',
  off: 'bg-gray-200 text-gray-700',
};

/**
 * Website → Collabs: create influencer offer pages, see who accepted (with their shipping and bank details), switch
 * pages off, and turn sign-ups from jentiskitchen.id/collab into pages. Editing a page asks for confirmation (old → new).
 */
export default function CollabsPanel({
  collabs,
  applications,
  defaults,
  shopUrl,
  today,
  commission,
}: {
  collabs: Collab[];
  applications: CollabApplication[];
  defaults: Defaults;
  shopUrl: string;
  today: string;
  commission: CommissionReport;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<Collab | null>(null);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [openOrders, setOpenOrders] = useState<Record<string, boolean>>({});
  const editingOld = form?.id ? collabs.find((c) => c.id === form.id) ?? null : null;

  function blankForm(prefill: Partial<Form> = {}): Form {
    return {
      id: null,
      applicationId: null,
      name: '',
      platform: defaults.platform,
      handle: '',
      campaign: '',
      voucherCode: '',
      freeProducts: defaults.freeProducts,
      commissionPerBox: String(defaults.commissionPerBox),
      codePercent: String(defaults.codePercent),
      codeCap: String(defaults.codeCap),
      contentDays: String(defaults.contentDays),
      minReels: String(defaults.minReels),
      minStories: String(defaults.minStories),
      startDate: today,
      endDate: addMonths(today, defaults.contractMonths),
      note: '',
      campaignTouched: false,
      codeTouched: false,
      ...prefill,
    };
  }

  function editForm(c: Collab): Form {
    return {
      id: c.id,
      applicationId: null,
      name: c.name,
      platform: c.platform,
      handle: c.handle,
      campaign: c.campaign,
      voucherCode: c.voucherCode,
      freeProducts: c.freeProducts,
      commissionPerBox: String(c.commissionPerBox),
      codePercent: String(c.codePercent),
      codeCap: String(c.codeCap),
      contentDays: String(c.contentDays),
      minReels: String(c.minReels),
      minStories: String(c.minStories),
      startDate: c.startDate,
      endDate: c.endDate,
      note: c.note,
      campaignTouched: true,
      codeTouched: true,
    };
  }

  function open(next: Form) {
    setMessage(null);
    setCreated(null);
    setForm(next);
  }

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  function onName(name: string) {
    setForm((f) => {
      if (!f) return f;
      return {
        ...f,
        name,
        campaign: f.campaignTouched ? f.campaign : slugify(name),
        voucherCode: f.codeTouched ? f.voucherCode : codeFrom(name),
      };
    });
  }

  function payload(f: Form) {
    return {
      name: f.name,
      platform: f.platform,
      handle: f.handle,
      campaign: f.campaign,
      voucherCode: f.voucherCode,
      freeProducts: f.freeProducts,
      commissionPerBox: Number(digits(f.commissionPerBox) || 'NaN'),
      codePercent: Number(digits(f.codePercent) || 'NaN'),
      codeCap: Number(digits(f.codeCap) || 'NaN'),
      contentDays: Number(digits(f.contentDays) || 'NaN'),
      minReels: Number(digits(f.minReels) || 'NaN'),
      minStories: Number(digits(f.minStories) || 'NaN'),
      startDate: f.startDate,
      endDate: f.endDate,
      note: f.note,
      applicationId: f.applicationId,
    };
  }

  function changeLines(old: Collab, f: Form): string[] {
    const p = payload(f);
    const lines: string[] = [];
    const cmp = (label: string, a: string, b: string) => {
      if (a !== b) lines.push(`${label}: ${a || '(none)'} → ${b || '(none)'}`);
    };
    cmp('Name', old.name, p.name.trim());
    cmp('Platform', old.platform, p.platform);
    cmp('Handle', old.handle, p.handle.trim().replace(/^@+/, ''));
    cmp('Link name', old.campaign, slugify(p.campaign));
    cmp('Voucher code', old.voucherCode, p.voucherCode.trim().toUpperCase());
    cmp('Free products', old.freeProducts, p.freeProducts.trim());
    cmp('Commission per box', rupiah(old.commissionPerBox), Number.isFinite(p.commissionPerBox) ? rupiah(p.commissionPerBox) : '?');
    cmp('Code discount', `${old.codePercent}%`, `${p.codePercent}%`);
    cmp('Max discount', rupiah(old.codeCap), Number.isFinite(p.codeCap) ? rupiah(p.codeCap) : '?');
    cmp('Content within', `${old.contentDays} days`, `${p.contentDays} days`);
    cmp('Reels', String(old.minReels), String(p.minReels));
    cmp('Stories', String(old.minStories), String(p.minStories));
    cmp('Contract', `${dayText(old.startDate)} – ${dayText(old.endDate)}`, p.startDate && p.endDate ? `${dayText(p.startDate)} – ${dayText(p.endDate)}` : '?');
    cmp('Note', old.note, p.note.trim());
    return lines;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setMessage(null);
    if (editingOld) {
      const lines = changeLines(editingOld, form);
      if (!lines.length) return setMessage({ ok: false, text: 'Nothing changed.' });
      if (editingOld.acceptedAt) lines.push('⚠️ They already accepted: tell them about the change.');
      return setConfirm({ kind: 'save', lines });
    }
    setBusy(true);
    try {
      const res = await fetch('/api/website/collabs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(form)) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setForm(null);
      setCreated(data.collab);
      router.refresh();
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
      let done = '';
      if (confirm.kind === 'save') {
        res = await fetch(`/api/website/collabs/${form!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(form!)) });
        done = 'Saved. The page shows the new terms right away (same link).';
      } else if (confirm.kind === 'switch') {
        res = await fetch(`/api/website/collabs/${confirm.collab.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled: confirm.disabled }),
        });
        done = confirm.disabled ? 'Switched off. The page now says the offer is no longer available.' : 'Switched on again.';
      } else if (confirm.kind === 'delete') {
        res = await fetch(`/api/website/collabs/${confirm.collab.id}`, { method: 'DELETE' });
        done = 'Deleted.';
      } else {
        res = await fetch(`/api/website/collabs/applications/${confirm.application.id}`, { method: 'DELETE' });
        done = 'Hidden.';
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessage({ ok: true, text: done });
      if (confirm.kind === 'save') setForm(null);
      setConfirm(null);
      router.refresh();
    } catch (error) {
      setConfirm(null);
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f6dcc4]';
  const label = 'block text-xs font-medium text-gray-600 mb-1';

  const editor = form && (
    <form onSubmit={submit} className="rounded-xl border border-[#f6dcc4] bg-[#fdf3ea]/50 p-4 space-y-4">
      <p className="font-medium text-gray-900">{form.id ? `Change ${editingOld?.name ?? ''}’s page` : 'New collab page'}</p>

      <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="c-name" className={label}>Influencer name (greeting on the page)</label>
          <input id="c-name" value={form.name} maxLength={60} placeholder="e.g. Sarah" onChange={(e) => onName(e.target.value)} className={input} required />
        </div>
        <div>
          <label htmlFor="c-platform" className={label}>Platform</label>
          <select id="c-platform" value={form.platform} onChange={(e) => set({ platform: e.target.value as CollabPlatform })} className={input}>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>
        <div>
          <label htmlFor="c-handle" className={label}>Handle (optional)</label>
          <input id="c-handle" value={form.handle} maxLength={41} placeholder="@sarahmasak" onChange={(e) => set({ handle: e.target.value })} className={input} />
        </div>
        <div>
          <label htmlFor="c-campaign" className={label}>Link name (in their tracking link)</label>
          <input
            id="c-campaign"
            value={form.campaign}
            maxLength={40}
            placeholder="sarah"
            onChange={(e) => set({ campaign: slugify(e.target.value.replace(/\s/g, '-')), campaignTouched: true })}
            className={input}
            required
          />
        </div>
        <div>
          <label htmlFor="c-code" className={label}>Voucher code (shown, not created)</label>
          <input
            id="c-code"
            value={form.voucherCode}
            maxLength={20}
            placeholder="SARAH"
            onChange={(e) => set({ voucherCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), codeTouched: true })}
            className={`${input} font-mono`}
            required
          />
        </div>
        <div className="sm:col-span-3">
          <p className="text-xs text-gray-500 break-all">
            Their shop link: <span className="font-mono text-gray-800">{shopLink(shopUrl, form.platform, form.campaign || '…')}</span>
          </p>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-3">
          <label htmlFor="c-free" className={label}>Free products you send them</label>
          <input id="c-free" value={form.freeProducts} maxLength={200} onChange={(e) => set({ freeProducts: e.target.value })} className={input} required />
        </div>
        <div>
          <label htmlFor="c-commission" className={label}>Commission per box (Rp)</label>
          <input id="c-commission" inputMode="numeric" value={form.commissionPerBox} onChange={(e) => set({ commissionPerBox: digits(e.target.value) })} className={input} required />
        </div>
        <div>
          <label htmlFor="c-percent" className={label}>Code discount for followers (%)</label>
          <input id="c-percent" inputMode="numeric" value={form.codePercent} onChange={(e) => set({ codePercent: digits(e.target.value) })} className={input} required />
        </div>
        <div>
          <label htmlFor="c-cap" className={label}>Max discount with the code (Rp)</label>
          <input id="c-cap" inputMode="numeric" value={form.codeCap} onChange={(e) => set({ codeCap: digits(e.target.value) })} className={input} required />
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label htmlFor="c-days" className={label}>Content within (days)</label>
          <input id="c-days" inputMode="numeric" value={form.contentDays} onChange={(e) => set({ contentDays: digits(e.target.value) })} className={input} required />
        </div>
        <div>
          <label htmlFor="c-reels" className={label}>Min. Reels</label>
          <input id="c-reels" inputMode="numeric" value={form.minReels} onChange={(e) => set({ minReels: digits(e.target.value) })} className={input} required />
        </div>
        <div>
          <label htmlFor="c-stories" className={label}>Min. Stories</label>
          <input id="c-stories" inputMode="numeric" value={form.minStories} onChange={(e) => set({ minStories: digits(e.target.value) })} className={input} required />
        </div>
        <div>
          <label htmlFor="c-start" className={label}>Contract start</label>
          <input
            id="c-start"
            type="date"
            value={form.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              set({ startDate, endDate: !form.endDate || form.endDate < startDate ? addMonths(startDate, defaults.contractMonths) : form.endDate });
            }}
            className={input}
            required
          />
        </div>
        <div>
          <label htmlFor="c-end" className={label}>Contract end</label>
          <input id="c-end" type="date" min={form.startDate} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} className={input} required />
        </div>
      </fieldset>

      <div>
        <label htmlFor="c-note" className={label}>Note (only you see it)</label>
        <input id="c-note" value={form.note} maxLength={300} placeholder="e.g. 25k followers, food content" onChange={(e) => set({ note: e.target.value })} className={input} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white font-medium disabled:opacity-50">
          {busy ? 'Saving…' : form.id ? 'Save' : 'Create page'}
        </button>
        <button type="button" disabled={busy} onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium">
          Cancel
        </button>
      </div>
    </form>
  );

  const linkRow = (title: string, value: string, openable = false) => (
    <div className="min-w-0">
      <p className="text-xs text-gray-500">{title}</p>
      <div className="flex items-center gap-1 min-w-0">
        {openable ? (
          <a href={value} target="_blank" rel="noreferrer" className="truncate font-mono text-sm text-[#9a3412] underline">
            {value.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="truncate font-mono text-sm text-gray-800">{value.replace(/^https?:\/\//, '')}</span>
        )}
        <CopyValueButton value={value} label={title} />
      </div>
    </div>
  );

  /** "19–25 Oct", or "28 Sep – 4 Oct" across two months. */
  const weekText = (w: { startKey: string; endKey: string }) => {
    const [a, b] = [dayText(w.startKey).split(' '), dayText(w.endKey).split(' ')];
    return a[1] === b[1] ? `${a[0]}–${b[0]} ${b[1]}` : `${a[0]} ${a[1]} – ${b[0]} ${b[1]}`;
  };
  const boxText = (n: number) => `${n.toLocaleString('en-US')} box${n === 1 ? '' : 'es'}`;
  const stat = (title: string, sub: string, v: CommissionSum, strong = false) => (
    <div className={`rounded-lg border p-2 ${strong ? 'border-[#f6dcc4] bg-[#fdf3ea]' : 'border-gray-200'}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-[11px] text-gray-400">{sub}</p>
      <p className={`font-semibold ${strong ? 'text-[#7c2d12]' : 'text-gray-900'}`}>{rupiah(v.commission)}</p>
      <p className="text-xs text-gray-600">{boxText(v.boxes)} · {v.orders} order{v.orders === 1 ? '' : 's'}</p>
    </div>
  );
  // Influencers who accepted or already brought orders.
  const commissionRows = commission.collabs
    .map((r) => ({ r, c: collabs.find((c) => c.id === r.collabId)! }))
    .filter(({ r, c }) => c && (c.acceptedAt !== null || r.total.orders > 0));
  const commissionCard = (
    <div className="a-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Commission (paid every Sunday)</h2>
        <p className="text-sm text-gray-600">
          Boxes from paid orders: the customer&apos;s <b>first order</b> through the influencer&apos;s link, plus <b>every order</b> with their voucher code.
          Weeks run Monday–Sunday (WIB), by the time the order was paid. The Telegram CMO bot sends this every Sunday at 12:00.
        </p>
      </div>
      {commissionRows.length === 0 && <p className="text-sm text-gray-500">Nobody has accepted a collab yet.</p>}
      <ul className="flex flex-col gap-2">
        {commissionRows.map(({ r, c }) => (
          <li key={c.id} className="rounded-xl border border-[#ebe8e3] bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-semibold text-gray-900">{c.name}</p>
              {c.handle && <span className="text-sm text-gray-500">@{c.handle}</span>}
              <span className="text-xs text-gray-500">{rupiah(c.commissionPerBox)}/box</span>
            </div>
            {c.acceptedAt !== null && !r.voucherCreated && (
              <p className="text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
                Voucher <b className="font-mono">{c.voucherCode}</b> is not created yet, so repeat orders cannot count. Create it in{' '}
                <a href="/website-vouchers" className="underline">Website → Vouchers</a>.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {stat('This week', weekText(commission.thisWeek), r.thisWeek, true)}
              {stat('Last week', weekText(commission.lastWeek), r.lastWeek)}
              {stat('Total', 'since the start', r.total)}
            </div>
            {c.accepted && r.thisWeek.commission > 0 && (
              <p className="text-xs text-gray-600 flex items-center gap-1">
                Transfer to {c.accepted.bank} <span className="font-mono">{c.accepted.accountNumber}</span>
                <CopyValueButton value={c.accepted.accountNumber} label="account number" /> a/n {c.accepted.accountName}
              </p>
            )}
            {r.orders.length > 0 && (
              <div className="text-sm">
                <button type="button" onClick={() => setOpenOrders((o) => ({ ...o, [c.id]: !o[c.id] }))} className="font-medium text-[#9a3412]">
                  {openOrders[c.id] ? '▾' : '▸'} {r.orders.length} order{r.orders.length === 1 ? '' : 's'}
                </button>
                {openOrders[c.id] && (
                  <ul className="mt-2 space-y-1">
                    {r.orders.map((o) => (
                      <li key={o.orderRowId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-gray-50 px-3 py-2">
                        <span className="text-gray-500 w-28 shrink-0">{when(o.paidAt)}</span>
                        <span className="font-mono text-gray-900">#{o.orderId}</span>
                        <span className="text-gray-700">{o.recipientName}</span>
                        <span className={`text-xs rounded-full px-2 py-0.5 ${o.via === 'CODE' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                          {o.via === 'CODE' ? `Code ${c.voucherCode}` : 'Link (first order)'}
                        </span>
                        <span className="ml-auto text-gray-900">
                          {boxText(o.boxes)} = <b>{rupiah(o.commission)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="mt-5 space-y-5">
      {message && <p className={`rounded-lg px-4 py-3 text-sm ${message.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      {commissionCard}

      <div className="a-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Collab pages</h2>
            <p className="text-sm text-gray-600">One private page per influencer. Google never shows these pages.</p>
          </div>
          {!form && (
            <button type="button" onClick={() => open(blankForm())} className="shrink-0 px-4 py-2 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white font-medium">
              + Create page
            </button>
          )}
        </div>

        {created && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
            <p className="font-medium text-green-900">✓ Page for {created.name} is ready. Send them the page link:</p>
            {linkRow('Page link (send this)', pageLink(shopUrl, created.slug), true)}
            {linkRow('Their shop link (shown on the page)', shopLink(shopUrl, created.platform, created.campaign))}
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(inviteText(created, shopUrl))}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-lg bg-[#25D366] text-white font-medium"
              >
                Send via WhatsApp
              </a>
              <button type="button" onClick={() => setCreated(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium">
                Close
              </button>
            </div>
          </div>
        )}

        {form && !form.id && editor}

        {collabs.length === 0 && !form && <p className="text-sm text-gray-500">No collab pages yet.</p>}

        {collabs.length > 0 && (
          <ul className="flex flex-col gap-2">
            {collabs.map((c) => {
              const ended = c.endDate < today;
              const status = c.disabledAt
                ? { text: 'Switched off', cls: STATUS.off }
                : c.acceptedAt
                  ? { text: `Accepted ${when(c.acceptedAt)}`, cls: STATUS.accepted }
                  : ended
                    ? { text: 'Contract ended', cls: STATUS.off }
                    : { text: 'Waiting for answer', cls: STATUS.waiting };
              return (
                <li key={c.id} className="rounded-xl border border-[#ebe8e3] bg-white p-3.5 space-y-3">
                  {form?.id === c.id ? (
                    editor
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{c.name}</p>
                        {c.handle && (
                          <a
                            href={c.platform === 'tiktok' ? `https://www.tiktok.com/@${c.handle}` : `https://www.instagram.com/${c.handle}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[#9a3412] underline"
                          >
                            @{c.handle}
                          </a>
                        )}
                        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${status.cls}`}>{status.text}</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Code <b className="font-mono text-gray-900">{c.voucherCode}</b> ({c.codePercent}%, max {rupiah(c.codeCap)}) · {rupiah(c.commissionPerBox)}/box ·{' '}
                        {c.minReels} Reels + {c.minStories} Stories within {c.contentDays} days · {dayText(c.startDate)} – {dayText(c.endDate)}
                      </p>
                      {c.note && <p className="text-sm text-gray-500 italic">{c.note}</p>}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {linkRow('Page link', pageLink(shopUrl, c.slug), true)}
                        {linkRow('Their shop link', shopLink(shopUrl, c.platform, c.campaign))}
                      </div>
                      {c.accepted && (
                        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm space-y-1">
                          <button
                            type="button"
                            onClick={() => setOpenDetails((o) => ({ ...o, [c.id]: !o[c.id] }))}
                            className="font-medium text-green-900"
                          >
                            {openDetails[c.id] ? '▾' : '▸'} Shipping & bank details
                          </button>
                          {openDetails[c.id] && (
                            <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-gray-800">
                              <dt className="text-gray-500">Full name</dt>
                              <dd>{c.accepted.name}</dd>
                              <dt className="text-gray-500">WhatsApp</dt>
                              <dd>
                                <a href={`https://wa.me/${waPhone(c.accepted.whatsapp)}`} target="_blank" rel="noreferrer" className="text-[#9a3412] underline">
                                  {c.accepted.whatsapp.replace(/^62/, '0')}
                                </a>
                              </dd>
                              <dt className="text-gray-500">Address</dt>
                              <dd className="flex items-start gap-1">
                                <span className="whitespace-pre-line">{c.accepted.address}</span>
                                <CopyValueButton value={c.accepted.address} label="address" />
                              </dd>
                              <dt className="text-gray-500">Send</dt>
                              <dd>{c.freeProducts}</dd>
                              <dt className="text-gray-500">Bank / e-wallet</dt>
                              <dd>{c.accepted.bank}</dd>
                              <dt className="text-gray-500">Account no.</dt>
                              <dd className="flex items-center gap-1">
                                <span className="font-mono">{c.accepted.accountNumber}</span>
                                <CopyValueButton value={c.accepted.accountNumber} label="account number" />
                              </dd>
                              <dt className="text-gray-500">Account name</dt>
                              <dd>{c.accepted.accountName}</dd>
                              {c.accepted.message && (
                                <>
                                  <dt className="text-gray-500">Message</dt>
                                  <dd className="whitespace-pre-line">{c.accepted.message}</dd>
                                </>
                              )}
                            </dl>
                          )}
                          <p className="text-green-900">
                            Next: create voucher <b className="font-mono">{c.voucherCode}</b> in{' '}
                            <a href="/website-vouchers" className="underline">Website → Vouchers</a> (General, {c.codePercent}%, max {rupiah(c.codeCap)}).
                          </p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 text-sm">
                        {!c.acceptedAt && !c.disabledAt && (
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(inviteText(c, shopUrl))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-[#25D366] text-white font-medium"
                          >
                            Send via WhatsApp
                          </a>
                        )}
                        <button type="button" onClick={() => open(editForm(c))} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-800 font-medium">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm({ kind: 'switch', collab: c, disabled: !c.disabledAt })}
                          className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-800 font-medium"
                        >
                          {c.disabledAt ? 'Switch on' : 'Switch off'}
                        </button>
                        {!c.acceptedAt && (
                          <button type="button" onClick={() => setConfirm({ kind: 'delete', collab: c })} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 font-medium">
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="a-card p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">Sign-ups from the website</h2>
          <p className="text-sm text-gray-600">
            Influencers who applied on{' '}
            <a href={`${shopUrl}/collab`} target="_blank" rel="noreferrer" className="text-[#9a3412] underline">
              {shopUrl.replace(/^https?:\/\//, '')}/collab
            </a>
            . Check their profile, then make a page for the ones you like.
          </p>
        </div>
        {applications.length === 0 && <p className="text-sm text-gray-500">No sign-ups yet.</p>}
        {applications.length > 0 && (
          <ul className="flex flex-col gap-2">
            {applications.map((a) => (
              <li key={a.id} className="rounded-xl border border-[#ebe8e3] bg-white p-3 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0 text-sm space-y-0.5">
                  <p>
                    <b className="text-gray-900">{a.name}</b>{' '}
                    <a
                      href={a.platform === 'tiktok' ? `https://www.tiktok.com/@${a.handle}` : `https://www.instagram.com/${a.handle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#9a3412] underline"
                    >
                      @{a.handle}
                    </a>{' '}
                    <span className="text-gray-500">({a.platform === 'tiktok' ? 'TikTok' : 'Instagram'}, {a.followers} followers)</span>
                  </p>
                  <p className="text-gray-600">
                    <a href={`https://wa.me/${a.whatsapp}`} target="_blank" rel="noreferrer" className="underline">
                      {a.whatsapp.replace(/^62/, '0')}
                    </a>
                    {a.city ? ` · ${a.city}` : ''} · {when(a.createdAt)}
                  </p>
                  {a.message && <p className="text-gray-700 whitespace-pre-line">“{a.message}”</p>}
                </div>
                <div className="flex gap-2 text-sm shrink-0">
                  {a.collabId ? (
                    <span className="px-3 py-1.5 rounded-lg bg-green-100 text-green-800 font-medium">Page made</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        open(
                          blankForm({
                            applicationId: a.id,
                            name: a.name.split(/\s+/)[0],
                            platform: a.platform,
                            handle: a.handle,
                            campaign: slugify(a.handle.replace(/[._]/g, '-')),
                            voucherCode: codeFrom(a.name.split(/\s+/)[0]),
                            note: `${a.followers} followers${a.city ? `, ${a.city}` : ''}`,
                            campaignTouched: true,
                          }),
                        );
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white font-medium"
                    >
                      Make page
                    </button>
                  )}
                  <button type="button" onClick={() => setConfirm({ kind: 'hide', application: a })} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-800 font-medium">
                    Hide
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            {confirm.kind === 'save' && (
              <>
                <p className="font-semibold text-gray-900">Save these changes?</p>
                <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
                  {confirm.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            )}
            {confirm.kind === 'switch' && (
              <p className="text-gray-900">
                {confirm.disabled
                  ? `Switch off ${confirm.collab.name}’s page? It will say the offer is no longer available. Their shop link keeps working.`
                  : `Switch ${confirm.collab.name}’s page on again?`}
              </p>
            )}
            {confirm.kind === 'delete' && <p className="text-gray-900">Delete {confirm.collab.name}’s page? The link stops working.</p>}
            {confirm.kind === 'hide' && <p className="text-gray-900">Hide {confirm.application.name}’s sign-up from this list?</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-medium">
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={run}
                className={`px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50 ${confirm.kind === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#9a3412] hover:bg-[#7c2d12]'}`}
              >
                {busy ? 'Working…' : confirm.kind === 'save' ? 'Yes, save' : confirm.kind === 'delete' ? 'Yes, delete' : confirm.kind === 'hide' ? 'Yes, hide' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
