'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Affiliate, AffiliateReport } from '@/lib/shop/affiliates';
import type { CommissionSum } from '@/lib/shop/collab-report';
import { CHANNEL_LABELS_EN } from '@/lib/shop/affiliate-text';
import CopyValueButton from './CopyValueButton';

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
const DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' });
const DAY = (key: string) => DATE.format(new Date(`${key}T00:00:00+07:00`));
const sumText = (s: CommissionSum) => `${s.boxes.toLocaleString('id-ID')} box${s.boxes === 1 ? '' : 'es'} · ${rupiah(s.commission)}`;

/** Website → Affiliates: everyone who signed up, what to transfer this Sunday, their orders, switch off / on. */
export default function AffiliatesPanel({ affiliates, report, shopUrl }: { affiliates: Affiliate[]; report: AffiliateReport; shopUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const byId = new Map(report.affiliates.map((r) => [r.affiliateId, r]));
  const totalThis = report.affiliates.reduce((s, r) => s + r.thisWeek.commission, 0);
  const totalLast = report.affiliates.reduce((s, r) => s + r.lastWeek.commission, 0);

  async function switchOff(a: Affiliate) {
    const off = a.disabledAt === null;
    if (
      !window.confirm(
        off
          ? `Switch off ${a.name}? Their link will land on the shop without crediting them, and they earn no more commission from now on.`
          : `Switch ${a.name} back on? Their link and commission work again.`,
      )
    )
      return;
    setBusy(a.id);
    setError(null);
    try {
      const res = await fetch(`/api/website/affiliates/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: off }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Commission (paid every Sunday)</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-gray-500">
              This week {DAY(report.thisWeek.startKey)} – {DAY(report.thisWeek.endKey)}
            </p>
            <p className="text-2xl font-bold">{rupiah(totalThis)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last week</p>
            <p className="text-2xl font-bold">{rupiah(totalLast)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Affiliates</p>
            <p className="text-2xl font-bold">
              {affiliates.filter((a) => a.disabledAt === null).length}
              <span className="text-base font-normal text-gray-500"> active</span>
            </p>
          </div>
        </div>
      </section>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {!affiliates.length && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-gray-500">
          No affiliates yet. Share {shopUrl.replace(/^https?:\/\//, '')}/affiliate to get sign-ups.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {affiliates.map((a) => {
          const r = byId.get(a.id)!;
          const link = `${shopUrl}/r/${a.code}`;
          const page = `${shopUrl}/affiliate/${a.slug}`;
          const off = a.disabledAt !== null;
          return (
            <article key={a.id} className={`a-card p-4 ${off ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">
                    {a.name} <span className="text-sm font-normal text-gray-500">· {a.city}</span>
                    {off && <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">Switched off</span>}
                  </p>
                  <p className="text-sm text-gray-600">
                    <a className="text-green-700 underline" href={`https://wa.me/${a.whatsapp}`}>
                      {a.whatsapp.replace(/^62/, '0')}
                    </a>{' '}
                    · {a.email} · {a.channels.map((c) => CHANNEL_LABELS_EN[c]).join(', ')} · joined {DATE.format(a.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Bank: <b>{a.bank}</b> {a.accountNumber} a/n {a.accountName} <CopyValueButton value={a.accountNumber} label="Copy account number" />
                  </p>
                  <p className="mt-1 text-sm">
                    Link: <span className="font-mono">{link.replace(/^https?:\/\//, '')}</span> <CopyValueButton value={link} label="Copy link" />
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => switchOff(a)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {off ? 'Switch on' : 'Switch off'}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <p className="rounded-lg bg-[#f6f5f2] p-2">
                  <span className="block text-gray-500">Customers</span>
                  <b>{r.customers}</b>
                </p>
                <p className="rounded-lg bg-[#f6f5f2] p-2">
                  <span className="block text-gray-500">This week</span>
                  <b>{sumText(r.thisWeek)}</b>
                </p>
                <p className="rounded-lg bg-[#f6f5f2] p-2">
                  <span className="block text-gray-500">Last week</span>
                  <b>{sumText(r.lastWeek)}</b>
                </p>
                <p className="rounded-lg bg-[#f6f5f2] p-2">
                  <span className="block text-gray-500">Total</span>
                  <b>{sumText(r.total)}</b>
                </p>
              </div>
              {r.orders.length > 0 && (
                <div className="mt-2">
                  <button type="button" className="text-sm text-[#7c2d12] underline" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    {open === a.id ? 'Hide orders' : `Show ${r.orders.length} order${r.orders.length === 1 ? '' : 's'}`}
                  </button>
                  {open === a.id && (
                    <table className="mt-2 w-full text-sm">
                      <thead className="text-left text-gray-500">
                        <tr>
                          <th className="py-1">Paid</th>
                          <th>Order</th>
                          <th>Customer</th>
                          <th className="text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.orders.map((o) => (
                          <tr key={o.orderRowId} className="border-t border-gray-100">
                            <td className="py-1.5 align-top">{DATE.format(o.paidAt)}</td>
                            <td className="align-top">#{o.orderId}</td>
                            <td className="align-top">{o.recipientName}</td>
                            <td className="text-right align-top">
                              <b>{rupiah(o.commission)}</b>
                              <div className="text-xs text-gray-500">{o.kind === 'FIRST' ? 'first order' : 'repeat'} · {o.boxes} box{o.boxes === 1 ? '' : 'es'}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              <a href={page} target="_blank" rel="noreferrer" className="a-btn a-btn-pri mt-3 w-full">
                Their page ↗
              </a>
            </article>
          );
        })}
      </div>
    </div>
  );
}
