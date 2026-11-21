'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Bundle, BundleStats } from '@/lib/shop/bundles';
import Modal from '@/components/admin/Modal';
import { Icon, Message, Note, Pill, cx } from '@/components/admin/ui';

const rp = (n: number) => 'Rp' + n.toLocaleString('id-ID');

export interface BundleRow extends Bundle {
  normal: number;
  compareAt: number;
  photos: string[];
  stats: BundleStats;
}

/** Promotions → Bundles: one card per bundle with the on/off switch, sales, link and Edit. */
export default function BundlesPanel({ bundles, shopUrl, now }: { bundles: BundleRow[]; shopUrl: string; now: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BundleRow | null>(null);

  async function toggle(b: BundleRow) {
    setBusy(b.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/website/bundles/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !b.active }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessage({ ok: true, text: b.active ? `${b.name} is off: hidden from the shop.` : `${b.name} is on: customers can buy it now.` });
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function copy(b: BundleRow) {
    const link = `${shopUrl}/paket/${b.slug}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this link', link);
    }
    setCopied(b.id);
    setTimeout(() => setCopied(null), 1500);
  }

  if (bundles.length === 0) {
    return (
      <div className="a-card flex flex-col items-center gap-2.5 px-6 py-12 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-[#fdf3ea] text-[#9a3412]">
          <Icon name="gift" />
        </span>
        <p className="font-semibold">No bundles yet</p>
        <p className="max-w-xs text-[13px] text-[#52525b]">Choose which products customers can pick, then set one final price.</p>
        <Link href="/website-bundles/new" className="a-btn a-btn-pri mt-1">
          <Icon name="plus" className="size-4" />
          New bundle
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <Message message={message} />
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {bundles.map((b) => {
          const ended = b.endsAt !== null && now > b.endsAt;
          const waiting = b.startsAt !== null && now < b.startsAt;
          const saves = b.compareAt - b.price;
          return (
            <div key={b.id} className="a-card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{b.name}</p>
                  <p className="truncate text-xs text-[#52525b]">
                    Pick {b.slots.length}
                    {b.tagline ? ` · ${b.tagline}` : ''}
                  </p>
                </div>
                {b.active && !ended && !waiting ? <Pill tone="green">Active</Pill> : <Pill tone="gray">{ended ? 'Ended' : waiting ? 'Not started' : 'Off'}</Pill>}
                <button
                  type="button"
                  role="switch"
                  aria-checked={b.active}
                  aria-label={b.active ? `Switch ${b.name} off` : `Switch ${b.name} on`}
                  disabled={busy === b.id}
                  onClick={() => setConfirm(b)}
                  className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50', b.active ? 'bg-[#15803d]' : 'bg-[#d4d4d8]')}
                >
                  <span className={cx('absolute top-[3px] size-[18px] rounded-full bg-white shadow transition-all', b.active ? 'left-[19px]' : 'left-[3px]')} />
                </button>
              </div>
              {b.photos.length > 0 && (
                <div className={cx('grid gap-[3px] overflow-hidden rounded-xl', b.photos.length === 1 ? 'grid-cols-1' : b.photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3', !b.active && 'opacity-60')}>
                  {b.photos.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" className="aspect-square w-full object-cover" />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={cx('text-2xl font-bold', b.active ? 'text-[#9a3412]' : 'text-[#52525b]')}>{rp(b.price)}</span>
                {b.compareAt > b.price && <span className="text-[13px] text-[#a1a1aa] line-through">{rp(b.compareAt)}</span>}
                {saves > 0 && <span className={cx('a-pill ml-auto', b.active ? 'bg-[#ecfdf3] text-[#15803d]' : 'bg-[#f4f4f5] text-[#52525b]')}>Saves {rp(saves)}</span>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <Check ok={b.freeDelivery} yes="Free delivery" no="Normal delivery fee" />
                <Check ok={b.voucherAllowed} yes="Vouchers allowed" no="No vouchers" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat k="Sold" v={String(b.stats.sold)} />
                <Stat k="Last 7 days" v={String(b.stats.thisWeek)} />
                <Stat k="Sales" v={rp(b.stats.sales)} />
              </div>
              {(b.startsAt || b.endsAt) && (
                <p className="text-xs text-[#52525b]">
                  {b.startsAt ? new Date(b.startsAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta' }) : '…'} –{' '}
                  {b.endsAt ? new Date(b.endsAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta' }) : 'no end'}
                </p>
              )}
              <div className="mt-auto flex gap-2">
                <button type="button" onClick={() => copy(b)} className="a-btn a-btn-sm flex-1">
                  <Icon name={copied === b.id ? 'check' : 'link'} className="size-4" />
                  {copied === b.id ? 'Copied' : 'Copy link'}
                </button>
                <Link href={`/website-bundles/${b.id}`} className="a-btn a-btn-sm flex-1">
                  <Icon name="edit" className="size-4" />
                  Edit
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <Note>Off = hidden from the shop straight away. Orders already placed keep their bundle price.</Note>
      <Link href="/website-bundles/new" className="a-btn a-btn-pri a-btn-lg w-full lg:hidden">
        <Icon name="plus" className="size-4" />
        New bundle
      </Link>

      {confirm && (
        <Modal
          title={confirm.active ? `Switch ${confirm.name} off?` : `Put ${confirm.name} on the shop?`}
          sub={confirm.active ? 'Customers will no longer see or buy it.' : `Customers can buy it for ${rp(confirm.price)} as soon as you confirm.`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button type="button" className="a-btn a-btn-lg" onClick={() => setConfirm(null)}>
                Go back
              </button>
              <button type="button" className={cx('a-btn a-btn-lg', confirm.active ? 'a-btn-danger-fill' : 'a-btn-pri')} disabled={busy !== null} onClick={() => toggle(confirm)}>
                {confirm.active ? 'Switch off' : 'Switch on'}
              </button>
            </>
          }
        >
          <span />
        </Modal>
      )}
    </div>
  );
}

function Check({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('grid size-[18px] place-items-center rounded-full text-[11px] font-extrabold', ok ? 'bg-[#ecfdf3] text-[#15803d]' : 'bg-[#fef2f2] text-[#b91c1c]')}>{ok ? '✓' : '✕'}</span>
      {ok ? yes : no}
    </span>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-[#f3f1ed] px-3 py-2">
      <p className="a-k">{k}</p>
      <p className="truncate text-[15px] font-bold tabular-nums">{v}</p>
    </div>
  );
}
