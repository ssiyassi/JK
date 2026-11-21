'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { weekdaysLabel, type Bundle } from '@/lib/shop/bundles';
import RupiahInput from '@/components/RupiahInput';
import Modal from '@/components/admin/Modal';
import { Icon, Message, Note, cx } from '@/components/admin/ui';

export interface EditorProduct {
  product: string;
  name: string;
  shortName: string | null;
  price: number;
  compareAtPrice: number | null;
  image: string;
  visible: boolean;
}

const rp = (n: number) => 'Rp' + Math.round(n).toLocaleString('id-ID');
const short = (p: EditorProduct) => p.shortName ?? p.name.replace(/ Marinade/i, '');
const JAKARTA = 7 * 3600 * 1000;
/** yyyy-mm-dd ↔ ms at the start (00:00) or end (23:59:59) of that day in Jakarta. */
const toMs = (day: string, end: boolean) => (day ? Date.parse(`${day}T00:00:00Z`) - JAKARTA + (end ? 24 * 3600 * 1000 - 1 : 0) : null);
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toDay = (ms: number | null) => (ms === null ? '' : new Date(ms + JAKARTA).toISOString().slice(0, 10));

/**
 * Create / edit a bundle (Promotions → Bundles). For every pick ("Product 1, 2, 3…") the owner ticks which products
 * the customer may choose. The price box adds up today's prices and the crossed-out prices; the owner types the final
 * price. Saving opens a pop-up that lists everything first (owner rule for anything customers see).
 */
export default function BundleEditor({ products, bundle }: { products: EditorProduct[]; bundle: Bundle | null }) {
  const router = useRouter();
  const onSale = products.filter((p) => p.visible);
  const allIds = onSale.map((p) => p.product);
  const [name, setName] = useState(bundle?.name ?? 'Paket Hemat 3 Box');
  const [tagline, setTagline] = useState(bundle?.tagline ?? 'Pilih 3 pack bebas, gratis ongkir');
  const [slots, setSlots] = useState<string[][]>(bundle?.slots ?? [allIds, allIds, allIds]);
  const [price, setPrice] = useState(bundle ? String(bundle.price) : '');
  const [freeDelivery, setFreeDelivery] = useState(bundle?.freeDelivery ?? true);
  const [voucherAllowed, setVoucherAllowed] = useState(bundle?.voucherAllowed ?? false);
  const [active, setActive] = useState(bundle?.active ?? true);
  const [start, setStart] = useState(toDay(bundle?.startsAt ?? null));
  const [end, setEnd] = useState(toDay(bundle?.endsAt ?? null));
  const [days, setDays] = useState<number[]>(bundle?.weekdays ?? WEEK);
  const everyDay = days.length === 7;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const slotProducts = (slot: string[]) => products.filter((p) => slot.includes(p.product));
  const dearest = (slot: string[]) => Math.max(0, ...slotProducts(slot).map((p) => p.price));
  const dearestCompare = (slot: string[]) => Math.max(0, ...slotProducts(slot).map((p) => p.compareAtPrice ?? p.price));
  const normal = slots.reduce((s, slot) => s + dearest(slot), 0);
  const compareAt = slots.reduce((s, slot) => s + dearestCompare(slot), 0);
  const final = Number(price) || 0;
  const saves = compareAt - final;
  const n = slots.length;

  function toggle(i: number, id: string) {
    setSlots((all) => all.map((slot, j) => (j !== i ? slot : slot.includes(id) ? slot.filter((x) => x !== id) : products.filter((p) => slot.includes(p.product) || p.product === id).map((p) => p.product))));
  }

  function body() {
    return { name, tagline, slots, price: final, freeDelivery, voucherAllowed, active, startsAt: toMs(start, false), endsAt: toMs(end, true), weekdays: everyDay ? null : days };
  }

  function askToSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!name.trim()) return setMessage({ ok: false, text: 'Fill in the name.' });
    const empty = slots.findIndex((s) => s.length === 0);
    if (empty >= 0) return setMessage({ ok: false, text: `Tick at least one product for Product ${empty + 1}.` });
    if (final < 1000) return setMessage({ ok: false, text: 'Fill in the final price.' });
    if (!days.length) return setMessage({ ok: false, text: 'Tick at least one day.' });
    if (start && end && end < start) return setMessage({ ok: false, text: 'The end date is before the start date.' });
    setConfirming(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(bundle ? `/api/website/bundles/${bundle.id}` : '/api/website/bundles', {
        method: bundle ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      router.push('/website-bundles');
      router.refresh();
    } catch (error) {
      setConfirming(false);
      setMessage({ ok: false, text: (error as Error).message });
      setBusy(false);
    }
  }

  async function remove() {
    if (!bundle) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/website/bundles/${bundle.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      router.push('/website-bundles');
      router.refresh();
    } catch (error) {
      setDeleting(false);
      setMessage({ ok: false, text: (error as Error).message });
      setBusy(false);
    }
  }

  const pickSummary = (slot: string[]) => (slot.length === allIds.length && allIds.every((id) => slot.includes(id)) ? 'any product' : slotProducts(slot).map(short).join(' or '));

  return (
    <form onSubmit={askToSave} className="grid items-start gap-[18px] pb-24 lg:grid-cols-[1.5fr_1fr] lg:pb-0">
      <div className="flex min-w-0 flex-col gap-[18px]">
        <section className="a-card">
          <div className="a-chead">1 · Bundle details</div>
          <div className="flex flex-col gap-4 p-[18px]">
            <div>
              <label htmlFor="b-name" className="a-label">Name (customers see this)</label>
              <input id="b-name" className="a-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="b-tag" className="a-label">Short line under the name</label>
              <input id="b-tag" className="a-input" value={tagline} maxLength={80} onChange={(e) => setTagline(e.target.value)} />
              <p className="a-hint">Shop photos: the products customers can pick.</p>
            </div>
          </div>
        </section>

        <section className="a-card">
          <div className="a-chead">
            <span className="flex-1">2 · What the customer picks</span>
            <span className="text-xs font-normal text-[#52525b]">{n} products</span>
          </div>
          <div className="flex flex-col gap-3 p-[18px]">
            <Note tone="blue">
              Tick which products can be chosen for each pick. Ticking all {onSale.length} everywhere = <b>any {n}, mix freely</b> (the same flavour {n}× is allowed).
            </Note>
            {slots.map((slot, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-[14px] border border-[#ebe8e3] p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[#9a3412] text-[13px] font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Product {i + 1}</p>
                    <p className="text-xs text-[#52525b]">
                      Customer picks 1 of the <b>{slot.length}</b> ticked
                    </p>
                  </div>
                  {i === 0 ? (
                    <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={() => setSlots((all) => all.map((s, j) => (j === 0 ? allIds : s)))}>
                      Tick all
                    </button>
                  ) : (
                    <>
                      <button type="button" className="a-btn a-btn-ghost a-btn-sm" title="Copy from Product 1" onClick={() => setSlots((all) => all.map((s, j) => (j === i ? [...all[0]] : s)))}>
                        <Icon name="copy" className="size-4" />
                        <span className="hidden sm:inline">Copy from Product 1</span>
                      </button>
                      <button type="button" className="a-btn a-btn-ghost a-btn-sm text-[#b91c1c]" aria-label={`Remove product ${i + 1}`} onClick={() => setSlots((all) => all.filter((_, j) => j !== i))}>
                        <Icon name="x" className="size-4" />
                      </button>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
                  {products.filter((p) => p.visible || slot.includes(p.product)).map((p) => {
                    const on = slot.includes(p.product);
                    return (
                      <button
                        key={p.product}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(i, p.product)}
                        className={cx('relative flex flex-col gap-1 rounded-[10px] border-[1.5px] p-1 text-left sm:gap-1.5 sm:rounded-xl sm:p-2', on ? 'border-[#9a3412] bg-[#fdf3ea]' : 'border-[#ebe8e3] bg-white')}
                      >
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className={cx('aspect-square w-full rounded-[7px] object-cover sm:rounded-lg', !on && 'opacity-45')} />
                        ) : (
                          <span className={cx('grid aspect-square w-full place-items-center rounded-[7px] bg-[#e7d9cc] text-xs font-bold text-[#3b1a0c] sm:rounded-lg', !on && 'opacity-45')}>
                            {short(p).slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className={cx('absolute left-2 top-2 grid size-4 place-items-center rounded border-[1.5px] sm:left-3.5 sm:top-3.5', on ? 'border-[#9a3412] bg-[#9a3412] text-white' : 'border-[#d4d4d8] bg-white')}>
                          {on && <Icon name="check" className="size-3" />}
                        </span>
                        <span className="text-center text-[11px] font-semibold leading-tight sm:text-left sm:text-[12.5px]">{short(p)}</span>
                        <span className="hidden text-[11.5px] text-[#52525b] tabular-nums sm:block">{rp(p.price)}</span>
                        {!p.visible && <span className="text-[10.5px] text-[#b45309]">Hidden in shop</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {n < 10 && (
              <button
                type="button"
                onClick={() => setSlots((all) => [...all, [...(all[0] ?? allIds)]])}
                className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#d6cfc6] font-semibold text-[#9a3412]"
              >
                <Icon name="plus" className="size-4" />
                Add product {n + 1}
              </button>
            )}
          </div>
        </section>

        <section className="a-card">
          <div className="a-chead">3 · Rules</div>
          <div className="px-[18px] pb-2">
            <Row title="Free delivery" sub="Delivery fee is Rp0 for an order with this bundle, in every city (courier cities too, normally Rp25.000)." on={freeDelivery} set={setFreeDelivery} />
            <Row
              title="Vouchers can be used"
              sub="Off: no voucher discount on the bundle (35% new customer, 20% friend, monthly, codes…). Other products in the same cart can still use a voucher."
              on={voucherAllowed}
              set={setVoucherAllowed}
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-[#f3f1ed] py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  Dates <span className="font-normal text-[#a1a1aa]">(optional)</span>
                </p>
                <p className="text-xs text-[#52525b]">Empty = runs until you switch it off.</p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <input type="date" aria-label="Start date" className="a-input h-10 sm:w-40" value={start} onChange={(e) => setStart(e.target.value)} />
                <input type="date" aria-label="End date" className="a-input h-10 sm:w-40" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-[#f3f1ed] py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Days of the week</p>
                <p className="text-xs text-[#52525b]">
                  {everyDay ? 'Every day.' : `Only ${weekdaysLabel(days)} (Jakarta time). Other days it is hidden, and its page says when it opens again. Customers see a countdown until it closes.`}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                {WEEK.map((d) => {
                  const on = days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDays((all) => (on ? all.filter((x) => x !== d) : WEEK.filter((x) => all.includes(x) || x === d)))}
                      className={cx('h-9 min-w-11 rounded-lg border px-2 text-[13px] font-semibold', on ? 'border-[#15803d] bg-[#f0fdf4] text-[#15803d]' : 'border-[#e4e4e7] bg-white text-[#a1a1aa]')}
                    >
                      {DAY_SHORT[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-[18px] lg:sticky lg:top-4">
        <section className="a-card">
          <div className="a-chead">4 · Price</div>
          <div className="flex flex-col gap-2 p-[18px]">
            {slots.map((slot, i) => {
              const top = slotProducts(slot).sort((a, b) => b.price - a.price)[0];
              return (
                <div key={i} className="flex text-[13px]">
                  <span className="text-[#52525b]">Product {i + 1}</span>
                  <span className="ml-auto tabular-nums">
                    {top?.compareAtPrice && top.compareAtPrice > top.price && <s className="mr-1.5 text-[#a1a1aa]">{rp(dearestCompare(slot))}</s>}
                    {rp(dearest(slot))}
                  </span>
                </div>
              );
            })}
            <div className="flex border-t border-[#f3f1ed] pt-2 text-[13px]">
              <span className="text-[#52525b]">Today&apos;s total</span>
              <span className="ml-auto tabular-nums">{rp(normal)}</span>
            </div>
            {compareAt > normal && (
              <div className="flex font-semibold">
                <span>Crossed-out price</span>
                <s className="ml-auto text-[#a1a1aa] tabular-nums">{rp(compareAt)}</s>
              </div>
            )}
            <p className="-mt-1 text-xs text-[#a1a1aa]">{compareAt > normal ? `Customers see ${rp(compareAt)} crossed out, like the crossed-out price on each pack.` : 'Shown crossed out to customers.'}</p>
            <div className="mt-1.5">
              <label htmlFor="b-price" className="a-label">Final price the customer pays</label>
              <RupiahInput id="b-price" value={price} onChange={setPrice} required className="h-[52px] border-[#9a3412] text-lg font-bold" />
            </div>
            {final > 0 && (
              <Note tone={saves > 0 ? 'green' : 'amber'}>
                {saves > 0 ? (
                  <>
                    <b>Customer sees: hemat {rp(saves)} ({Math.round((saves / compareAt) * 100)}%)</b>
                    {normal > final && (
                      <>
                        <br />
                        {rp(normal - final)} less than {n} packs today{freeDelivery ? ' + free delivery' : ''}
                      </>
                    )}
                  </>
                ) : (
                  'The final price is not lower than the normal price, so customers save nothing.'
                )}
              </Note>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[#ebe8e3] px-3 py-2">
                <p className="a-k">Bundle per box</p>
                <p className="font-bold tabular-nums">{final > 0 ? rp(final / n) : '–'}</p>
              </div>
              <div className="rounded-xl border border-[#ebe8e3] px-3 py-2">
                <p className="a-k">Normal per box</p>
                <p className="font-bold tabular-nums">{rp(n ? normal / n : 0)}</p>
              </div>
            </div>
          </div>
        </section>
        <section className="a-card">
          <div className="a-chead">5 · Show on the shop</div>
          <div className="px-[18px] pb-2">
            <Row title="Active" sub="On = customers see it on jentiskitchen.id" on={active} set={setActive} first />
          </div>
        </section>
        <Message message={message} />
        <div className="hidden gap-2.5 lg:flex">
          <button type="button" className="a-btn flex-1" onClick={() => router.push('/website-bundles')}>
            Cancel
          </button>
          <button type="submit" className="a-btn a-btn-pri flex-[2]">
            Save bundle
          </button>
        </div>
        {bundle && (
          <button type="button" className="a-btn a-btn-danger" onClick={() => setDeleting(true)}>
            Delete bundle
          </button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#ebe8e3] bg-white px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <button type="submit" className="a-btn a-btn-pri a-btn-lg w-full">
          Save bundle{final > 0 ? ` · ${rp(final)}` : ''}
        </button>
      </div>

      {confirming && (
        <Modal
          title={active ? (bundle ? 'Save and keep it on the shop?' : 'Put this bundle on the shop?') : 'Save this bundle (off)?'}
          sub={active ? 'Customers can buy it as soon as you save.' : 'It stays hidden until you switch it on.'}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className="a-btn a-btn-lg" onClick={() => setConfirming(false)}>
                Go back
              </button>
              <button type="button" className="a-btn a-btn-pri a-btn-lg" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Yes, save'}
              </button>
            </>
          }
        >
          <div className="rounded-xl bg-[#f3f1ed] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#52525b]">
            <b className="text-[#18181b]">{name}</b>
            <br />
            {slots.map((slot, i) => (
              <span key={i}>
                • Product {i + 1}: {pickSummary(slot)}
                <br />
              </span>
            ))}
            • Price <b className="text-[#18181b]">{rp(final)}</b>
            {compareAt > final && (
              <>
                {' '}
                <s>{rp(compareAt)}</s> · hemat {rp(compareAt - final)}
              </>
            )}
            <br />• Delivery: {freeDelivery ? <b className="text-[#15803d]">free</b> : 'normal fee'}
            <br />• Vouchers: {voucherAllowed ? <b className="text-[#15803d]">allowed</b> : <b className="text-[#b91c1c]">not allowed</b>} on this bundle
            <br />• Active: <b className="text-[#18181b]">{active ? 'on' : 'off'}</b>
            {start || end ? ` · ${start || '…'} – ${end || 'no end'}` : ' · no end date'}
            <br />• Days: <b className="text-[#18181b]">{everyDay ? 'every day' : weekdaysLabel(days)}</b>
          </div>
          {bundle && <Note tone="amber">Editing only changes new orders. Orders already placed keep their price.</Note>}
        </Modal>
      )}

      {deleting && bundle && (
        <Modal
          title={`Delete ${bundle.name}?`}
          sub="Only possible when nobody ordered it yet. Otherwise switch it off."
          onClose={() => setDeleting(false)}
          footer={
            <>
              <button type="button" className="a-btn a-btn-lg" onClick={() => setDeleting(false)}>
                Keep it
              </button>
              <button type="button" className="a-btn a-btn-danger-fill a-btn-lg" disabled={busy} onClick={remove}>
                Delete
              </button>
            </>
          }
        >
          <span />
        </Modal>
      )}
    </form>
  );
}

function Row({ title, sub, on, set, first }: { title: string; sub: string; on: boolean; set: (v: boolean) => void; first?: boolean }) {
  return (
    <div className={cx('flex items-center gap-3 py-3', !first && 'border-t border-[#f3f1ed] first:border-t-0')}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-[#52525b]">{sub}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => set(!on)}
        className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', on ? 'bg-[#15803d]' : 'bg-[#d4d4d8]')}
      >
        <span className={cx('absolute top-[3px] size-[18px] rounded-full bg-white shadow transition-all', on ? 'left-[19px]' : 'left-[3px]')} />
      </button>
    </div>
  );
}
