'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { deliveryDateFromKey, deliveryDayWarnings, jakartaDateKey } from '@/lib/core/time';
import { formatDeliveryDate, formatRupiah, orderConfirmationMessage, orderFollowUpMessage, whatsappLink } from '@/lib/shop/catalog';
import { COURIERS, findCourier, usesResi } from '@/lib/shop/couriers';
import { resellerOrderCharge } from '@/lib/core/resellerPrice';
import BulkPrintLabels from './BulkPrintLabels';
import CopyValueButton from './CopyValueButton';
import PrintLabelButton from './PrintLabelButton';
import Modal from './admin/Modal';
import type { OrderProfitInfo } from '@/lib/core/orderProfit';
import OwnerOrderButton from './admin/OwnerOrderButton';
import { Icon, Message, Note, PRODUCT_COLORS, PageHeader, Pill, WaIcon, cx, fmtDateTime, fmtDay, type Tone } from './admin/ui';

interface WebsiteOrder {
  id: string;
  orderId: string;
  createdAt: number;
  customerEmail: string;
  customerName: string; // account holder who placed the order
  deliveryDate: number | null;
  recipientName: string;
  recipientPhone: string;
  address: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  lines: { name: string; qty: number; websiteOnly: boolean; key: string | null }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  voucherCode: string | null;
  proofUploadedAt: number | null;
  paymentMethod: 'QRIS' | 'OVO' | 'SHOPEEPAY' | 'DANA' | 'TRANSFER' | null; // what the customer picked after "Bayar"
  placedByOwner: string | null; // placed by the owner for the customer ("Website order for a customer")
  paidInvoice: string | null;
  paidVia: string | null; // payment gateway: doku | duitku | duitku-sandbox
  shippedAt: number | null;
  deliveredAt: number | null;
  trackingUrl: string | null;
  courier: string | null; // couriers.ts id, null = shipped before it was asked
  trackingNumber: string | null; // resi (TIKI, JNE)
  courierFee: number | null; // what the owner paid the courier
  profit: OrderProfitInfo;
  cancelReason: 'EXPIRED' | 'ADMIN' | 'CUSTOMER' | null;
  orderStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
}

const GATEWAY_LABELS: Record<string, string> = {
  doku: 'DOKU',
  duitku: 'Duitku',
  'duitku-sandbox': 'Duitku SANDBOX (test account, no real money — do not ship)',
};

/** Where the order is: the owner's five statuses. */
type Status = 'pay' | 'deliver' | 'way' | 'done' | 'cancel';
function statusOf(o: WebsiteOrder): Status {
  if (o.orderStatus === 'CANCELLED') return 'cancel';
  if (o.paymentStatus === 'PENDING') return 'pay';
  if (o.deliveryStatus === 'DELIVERED') return 'done';
  if (o.shippedAt) return 'way';
  return 'deliver';
}
const STATUS: Record<Status, { tone: Tone; label: string }> = {
  pay: { tone: 'amber', label: 'Needs payment' },
  deliver: { tone: 'blue', label: 'To deliver' },
  way: { tone: 'violet', label: 'On the way' },
  done: { tone: 'green', label: 'Delivered' },
  cancel: { tone: 'gray', label: 'Cancelled' },
};
function StatusPill({ o }: { o: WebsiteOrder }) {
  const s = STATUS[statusOf(o)];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const phone0 = (p: string) => `0${p.slice(2)}`;
const courierName = (o: WebsiteOrder) => (o.courier ? (findCourier(o.courier)?.name ?? 'Courier') : 'Courier');

function labelOf(o: WebsiteOrder) {
  return {
    kind: 'customer' as const,
    orderId: o.orderId,
    recipientName: o.recipientName,
    recipientPhone: o.recipientPhone,
    address: o.address,
    notes: o.notes,
    lines: o.lines,
    deliveryDate: o.deliveryDate,
  };
}

/** WhatsApp template for this order: "confirm order" before delivering, "follow up" once the tracking link is saved. */
function whatsappFor(o: WebsiteOrder): { href: string; title: string; label: string } {
  if (o.shippedAt || o.deliveryStatus === 'DELIVERED') {
    return { href: whatsappLink(o.recipientPhone, orderFollowUpMessage(o.recipientName)), title: `WhatsApp ${o.recipientName}: follow up`, label: 'WhatsApp: follow up' };
  }
  return {
    href: whatsappLink(o.recipientPhone, orderConfirmationMessage({ customerName: o.recipientName, lines: o.lines, address: o.address, deliveryDate: o.deliveryDate })),
    title: `WhatsApp ${o.recipientName}: confirm order`,
    label: 'WhatsApp: confirm order',
  };
}

type Popup =
  | { kind: 'deliver'; id: string; courier: string; url: string; resi: string; fee: string }
  | { kind: 'delivered'; id: string; url: string; fee: string }
  | { kind: 'cancel'; id: string }
  | { kind: 'date'; id: string; date: string; now: number }
  | { kind: 'qris'; id: string; url: string }
  | { kind: 'email'; id: string; email: string; sendNow: boolean };

/** A reseller order (entered by the owner), with the reseller's label name + phone for the shipping label. */
export interface ResellerOrder {
  id: string;
  orderId: string;
  createdAt: number;
  customerName: string;
  reseller: string;
  parentReseller: string | null;
  address: string;
  phoneNumber: string;
  quantities: Record<string, number>;
  isPaydayPromo: boolean;
  orderStatus: string;
  paymentStatus: string; // PENDING | PAID | FREE
  deliveryStatus: string; // PENDING | DELIVERED
  deliveryDate: number | null;
  courierFee: number | null;
  profit: OrderProfitInfo;
  resellerPhone: string | null;
  resellerLabelName: string | null;
}
export interface ProductInfo {
  key: string;
  label: string;
  boxValue: number;
}

type Row = { kind: 'web'; o: WebsiteOrder } | { kind: 'res'; o: ResellerOrder };
type ResPopup = { kind: 'resfee'; id: string; deliver: boolean; fee: string } | { kind: 'rescancel'; id: string } | { kind: 'ressheet'; id: string };
type Box = 'today' | 'tomorrow' | 'delivery' | 'payment';
type Source = 'all' | 'web' | 'res' | 'cancel';

const PAGE = 60;
const dayKey = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));
const dmy = (key: string) => key.split('-').reverse().join('/');
const shortName = (label: string) => label.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 3);

function resStatus(o: ResellerOrder): Status {
  if (o.orderStatus === 'CANCELLED') return 'cancel';
  return o.deliveryStatus === 'DELIVERED' ? 'done' : 'deliver';
}
const rowStatus = (r: Row): Status => (r.kind === 'web' ? statusOf(r.o) : resStatus(r.o));
const resUnpaid = (o: ResellerOrder) => o.paymentStatus === 'PENDING' && o.orderStatus !== 'CANCELLED';

function resLabel(o: ResellerOrder, products: ProductInfo[]) {
  return {
    kind: 'reseller' as const,
    recipientName: o.customerName,
    recipientPhone: o.phoneNumber,
    address: o.address,
    lines: products.map((p) => ({ name: p.label, qty: o.quantities[p.key] ?? 0 })),
    deliveryDate: o.deliveryDate,
    resellerName: o.resellerLabelName || o.reseller,
    resellerPhone: o.resellerPhone,
  };
}

/** Website and reseller orders in one list, newest first. */
export default function OrdersPanel({
  orders,
  resellerOrders,
  products,
  gatewayLabel,
  qris = false,
  daysOff = [],
  initialQuery = '',
  today,
  tomorrow,
}: {
  orders: WebsiteOrder[];
  resellerOrders: ResellerOrder[];
  /** Stock products, in the label order (BM, BA, SM, SA). */
  products: ProductInfo[];
  /** Store days off not over yet: a warning when the owner moves an order onto one. */
  daysOff?: { startDate: string; endDate: string }[];
  /** DOKU is set up: unpaid website orders get a "QRIS" button. */
  qris?: boolean;
  /** Online payment gateway for new payments (e.g. "Duitku"), or null for manual bank transfer. */
  gatewayLabel: string | null;
  /** Search from the top bar (?q=). */
  initialQuery?: string;
  /** Jakarta date keys (YYYY-MM-DD). */
  today: string;
  tomorrow: string;
}) {
  const router = useRouter();
  const [box, setBox] = useState<Box | null>(null);
  const [source, setSource] = useState<Source>('all');
  const [query, setQuery] = useState(initialQuery);
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [resPopup, setResPopup] = useState<ResPopup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(key: string, url: string, method: 'PATCH' | 'POST', success: (data: Record<string, unknown>) => string, body?: unknown, refresh = true): Promise<boolean> {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessage({ ok: true, text: success(data) });
      if (refresh) router.refresh();
      return true;
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function getQris(o: WebsiteOrder) {
    setBusy(`qris-${o.id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/website/orders/${o.id}/qris`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setPopup({ kind: 'qris', id: o.id, url: String(data.url) });
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function markPaid(o: WebsiteOrder) {
    const question =
      gatewayLabel && o.paymentMethod !== 'TRANSFER' && !o.proofUploadedAt
        ? `${gatewayLabel} marks orders paid automatically. Only continue if you received ${formatRupiah(o.total)} for order #${o.orderId} another way. Mark as paid and email the customer?`
        : `Confirm you received ${formatRupiah(o.total)} for order #${o.orderId}? The customer will be emailed.`;
    if (confirm(question)) call(`paid-${o.id}`, `/api/orders/${o.id}/paid`, 'PATCH', () => `Order #${o.orderId} marked as paid. Emails sent.`);
  }

  function markResPaid(o: ResellerOrder) {
    const c = charge(o);
    if (confirm(`Mark reseller order #${o.orderId} (${o.reseller}) as paid${c.total ? ` · ${formatRupiah(c.total)}` : ''}?`)) {
      call(`paid-${o.id}`, `/api/orders/${o.id}/paid`, 'PATCH', () => `Order #${o.orderId} marked as paid.`);
    }
  }

  function duplicate(o: ResellerOrder) {
    const params = new URLSearchParams({
      reseller: o.reseller,
      parentReseller: o.parentReseller || '',
      recipientName: o.customerName,
      phone: o.phoneNumber,
      address: o.address,
      deliveryDate: dayKey(o.deliveryDate) ?? '',
      promo: o.isPaydayPromo ? 'Payday Promo' : 'None',
    });
    if (o.paymentStatus === 'FREE') params.set('free', '1');
    for (const p of products) params.set(`q_${p.key}`, String(o.quantities[p.key] ?? 0));
    router.push(`/orders/new?${params.toString()}`);
  }

  const boxesOf = (o: ResellerOrder) => products.reduce((n, p) => n + (o.quantities[p.key] ?? 0) * p.boxValue, 0);
  const charge = (o: ResellerOrder) => resellerOrderCharge({ boxes: boxesOf(o), payday: o.isPaydayPromo, free: o.paymentStatus === 'FREE' });
  const qtyOf = (r: Row): Record<string, number> => {
    if (r.kind === 'res') return r.o.quantities;
    const q: Record<string, number> = {};
    for (const l of r.o.lines) if (l.key) q[l.key] = (q[l.key] ?? 0) + l.qty;
    return q;
  };

  const openDeliver = (o: WebsiteOrder) =>
    setPopup({ kind: 'deliver', id: o.id, courier: o.courier ?? '', url: o.trackingNumber ? '' : (o.trackingUrl ?? ''), resi: o.trackingNumber ?? '', fee: o.courierFee === null ? '' : String(o.courierFee) });
  const openDelivered = (o: WebsiteOrder) => setPopup({ kind: 'delivered', id: o.id, url: o.trackingNumber ? '' : (o.trackingUrl ?? ''), fee: o.courierFee === null ? '' : String(o.courierFee) });

  /** The one main button of a website order, by status. */
  function mainAction(o: WebsiteOrder, size: 'sm' | 'lg' | 'md' = 'sm', grow = false, tight = false) {
    const st = statusOf(o);
    const c = cx('a-btn', size === 'sm' && 'a-btn-sm', size === 'lg' && 'a-btn-lg', grow && 'flex-1', tight && 'gap-1.5 px-2.5');
    if (st === 'pay') {
      if (qris) {
        return (
          <button type="button" disabled={busy !== null} onClick={() => getQris(o)} className={cx(c, 'a-btn-wa')}>
            <Icon name="wa" className="size-4" />
            {busy === `qris-${o.id}` ? 'Getting QRIS…' : size === 'sm' ? 'QRIS' : 'Send QRIS'}
          </button>
        );
      }
      const wa = whatsappFor(o);
      return (
        <a href={wa.href} target="_blank" rel="noreferrer" className={cx(c, 'a-btn-wa')}>
          <Icon name="wa" className="size-4" />
          WhatsApp
        </a>
      );
    }
    if (st === 'deliver') {
      return (
        <button type="button" disabled={busy !== null} onClick={() => openDeliver(o)} className={cx(c, 'a-btn-blue')}>
          <Icon name="truck" className="size-4" />
          {size === 'sm' ? 'Deliver' : 'Deliver order'}
        </button>
      );
    }
    if (st === 'way') {
      return (
        <button type="button" disabled={busy !== null} onClick={() => openDelivered(o)} className={cx(c, 'a-btn-green')}>
          <Icon name="checkc" className="size-4" />
          {size === 'sm' ? 'Delivered' : 'Mark as delivered'}
        </button>
      );
    }
    return null;
  }

  /** The main button of a row (website or reseller). */
  function rowAction(r: Row, grow = false, tight = false) {
    if (r.kind === 'web') return mainAction(r.o, 'sm', grow, tight);
    if (resStatus(r.o) !== 'deliver') return null;
    const o = r.o;
    return (
      <button type="button" disabled={busy !== null} onClick={() => setResPopup({ kind: 'resfee', id: o.id, deliver: true, fee: o.courierFee === null ? '' : String(o.courierFee) })} className={cx('a-btn a-btn-sm a-btn-green', grow && 'flex-1', tight && 'gap-1.5 px-2.5')}>
        <Icon name="checkc" className="size-4" />
        Delivered
      </button>
    );
  }
  function rowLabel(r: Row, text: string, className: string) {
    if (r.kind === 'web') return statusOf(r.o) === 'cancel' ? null : <PrintLabelButton label={labelOf(r.o)} fileName={`label-${r.o.orderId}`} text={text} className={className} />;
    return resStatus(r.o) === 'deliver' ? <PrintLabelButton label={resLabel(r.o, products)} fileName={`label-${r.o.orderId}`} text={text} className={className} /> : null;
  }

  const rows = useMemo<Row[]>(
    () => [...orders.map((o) => ({ kind: 'web' as const, o })), ...resellerOrders.map((o) => ({ kind: 'res' as const, o }))].sort((a, b) => b.o.createdAt - a.o.createdAt),
    [orders, resellerOrders],
  );

  const inBox = (r: Row, b: Box) => {
    const st = rowStatus(r);
    const toDeliver = r.kind === 'web' ? st === 'deliver' || st === 'way' : st === 'deliver';
    if (b === 'payment') return r.kind === 'web' ? st === 'pay' : resUnpaid(r.o);
    if (!toDeliver) return false;
    if (b === 'delivery') return true;
    return dayKey(r.o.deliveryDate) === (b === 'today' ? today : tomorrow);
  };
  const counts = useMemo(() => {
    const c = { today: 0, tomorrow: 0, delivery: 0, payment: 0 };
    for (const r of rows) for (const b of ['today', 'tomorrow', 'delivery', 'payment'] as const) if (inBox(r, b)) c[b]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, today, tomorrow]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return rows.filter((r) => {
      const st = rowStatus(r);
      // Cancelled orders stay out of the normal list, but a search finds them too (owner 15 Nov), shown greyed out;
      // the "Cancelled" chip lists only them.
      if (source === 'cancel' ? st !== 'cancel' : st === 'cancel' && !q) return false;
      if (source === 'web' && r.kind !== 'web') return false;
      if (source === 'res' && r.kind !== 'res') return false;
      if (box && !inBox(r, box)) return false;
      if (!q) return true;
      if (r.kind === 'web') {
        const o = r.o;
        return (
          o.orderId.toLowerCase().includes(q) ||
          o.recipientName.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerEmail.toLowerCase().includes(q) ||
          'website'.includes(q) ||
          (digits.length >= 4 && phone0(o.recipientPhone).includes(digits))
        );
      }
      const o = r.o;
      return (
        o.orderId.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.reseller.toLowerCase().includes(q) ||
        (o.parentReseller ?? '').toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        (digits.length >= 4 && o.phoneNumber.replace(/\D/g, '').includes(digits))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, source, box, query, today, tomorrow]);

  const tomorrowLabels = rows
    .filter((r) => inBox(r, 'tomorrow') && !(r.kind === 'web' && r.o.shippedAt))
    .map((r) => (r.kind === 'web' ? labelOf(r.o) : resLabel(r.o, products)));

  const open = openId ? orders.find((o) => o.id === openId) ?? null : null;
  const popOrder = popup ? orders.find((o) => o.id === popup.id) ?? null : null;
  const resOrder = resPopup ? resellerOrders.find((o) => o.id === resPopup.id) ?? null : null;
  const openRow = (r: Row) => (r.kind === 'web' ? setOpenId(r.o.id) : setResPopup({ kind: 'ressheet', id: r.o.id }));

  const chips = (r: Row, compact: boolean) => {
    const q = qtyOf(r);
    return (
      <div className={cx('flex', compact ? 'flex-nowrap gap-[2px]' : 'flex-wrap gap-1.5')}>
        {products.map((p, i) => {
          const n = q[p.key] ?? 0;
          return (
            <span key={p.key} title={p.label} className={cx('a-plab', n === 0 && 'a-plab-zero', compact ? 'min-w-[36px] gap-[3px] px-[5px] py-[3px] text-[10.5px]' : 'min-w-[54px] px-2 py-1 text-xs')} style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}>
              {shortName(p.label)} <b>{n}</b>
            </span>
          );
        })}
      </div>
    );
  };
  const promo = (r: Row) => {
    if (r.kind === 'web') return <span className="text-[#a1a1aa]">—</span>;
    if (r.o.paymentStatus === 'FREE') return <span className="inline-block rounded-lg bg-[#f5f3ff] px-2 py-0.5 text-[11.5px] font-semibold leading-tight text-[#6d28d9]">Free product</span>;
    if (r.o.isPaydayPromo) return <span className="inline-block rounded-lg bg-[#eff6ff] px-2 py-0.5 text-[11.5px] font-semibold leading-tight text-[#1d4ed8]">Payday promo</span>;
    return <span className="text-[#a1a1aa]">—</span>;
  };
  const fee = (r: Row) => {
    if (r.kind === 'web') return r.o.deliveryFee ? formatRupiah(r.o.deliveryFee) : 'Free';
    if (r.o.paymentStatus === 'FREE') return '—';
    const d = charge(r.o).deliveryFee;
    return d ? formatRupiah(d) : 'Free';
  };
  const total = (r: Row) => formatRupiah(r.kind === 'web' ? r.o.total : charge(r.o).total);
  const paidLabel = (r: Row) => (r.kind === 'web' ? `${courierName(r.o)} paid` : 'Courier paid');
  const pill = (r: Row) => {
    const s = STATUS[rowStatus(r)];
    return <Pill tone={s.tone}>{s.label}</Pill>;
  };
  const unpaidTag = (r: Row) =>
    r.kind === 'res' && resUnpaid(r.o) ? (
      <button type="button" disabled={busy !== null} onClick={(e) => { e.stopPropagation(); markResPaid(r.o); }} className="rounded-lg bg-[#fff7e6] px-2 py-0.5 text-left text-[11.5px] font-semibold leading-tight text-[#b45309]">
        Unpaid
        <br />
        <u>Mark paid</u>
      </button>
    ) : null;
  const resellerCell = (r: Row) =>
    r.kind === 'web' ? (
      <span className="font-semibold text-[#52525b]">Website</span>
    ) : (
      <>
        <div className="font-semibold">{r.o.reseller}</div>
        <div className="text-xs text-[#a1a1aa]">{r.o.parentReseller ? `under ${r.o.parentReseller}` : 'independent'}</div>
      </>
    );
  const name = (r: Row) => (r.kind === 'web' ? r.o.recipientName : r.o.customerName);
  const phone = (r: Row) => (r.kind === 'web' ? phone0(r.o.recipientPhone) : r.o.phoneNumber);

  const BOXES: [Box, string, string][] = [
    ['today', 'Deliver today', 'text-[#52525b]'],
    ['tomorrow', 'Deliver tomorrow', 'text-[#52525b]'],
    ['delivery', 'Pending delivery', 'text-[#1d4ed8]'],
    ['payment', 'Pending payment', 'text-[#b45309]'],
  ];
  const list = shown.slice(0, limit);

  return (
    <>
      {message && <div className="mb-3 mt-2 lg:mt-0"><Message message={message} /></div>}
      {open ? (
        <OrderDetail
          o={open}
          busy={busy}
          qris={qris}
          gatewayLabel={gatewayLabel}
          onBack={() => setOpenId(null)}
          mainAction={mainAction}
          onDeliver={() => openDeliver(open)}
          onChangeLink={() => openDeliver(open)}
          onMarkPaid={() => markPaid(open)}
          onQris={() => getQris(open)}
          onDate={() => setPopup({ kind: 'date', id: open.id, date: open.deliveryDate !== null ? new Date(open.deliveryDate).toISOString().slice(0, 10) : '', now: Date.now() })}
          onCancel={() => setPopup({ kind: 'cancel', id: open.id })}
          onAddEmail={() => setPopup({ kind: 'email', id: open.id, email: '', sendNow: true })}
        />
      ) : (
        <div>
          <PageHeader
            title="Orders"
            sub="Website and reseller orders in one list, newest first."
            actions={
              <>
                <BulkPrintLabels labels={tomorrowLabels} text={`Print labels for ${dmy(tomorrow)} (${tomorrowLabels.length})`} />
                <OwnerOrderButton />
                <Link href="/orders/new" className="a-btn a-btn-pri"><Icon name="plus" className="size-4" />New reseller order</Link>
              </>
            }
            phoneAction={<Link href="/orders/new" aria-label="New reseller order" className="grid size-10 place-items-center rounded-[10px] bg-[#9a3412] text-white"><Icon name="plus" /></Link>}
          />
          <OwnerOrderButton className="mb-3 lg:hidden" />
          <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
            {BOXES.map(([k, label, color]) => (
              <button
                key={k}
                type="button"
                onClick={() => { setBox(box === k ? null : k); if (source === 'cancel') setSource('all'); setLimit(PAGE); }}
                className={cx('a-card px-3.5 py-3 text-left', box === k && 'border-[#18181b] shadow-[0_0_0_1px_#18181b]')}
              >
                <div className={cx('text-[12.5px] font-semibold', color)}>{label}</div>
                <div className="text-xl font-bold tabular-nums">{counts[k]}</div>
              </button>
            ))}
          </div>
          <div className="mb-3 lg:hidden">
            <BulkPrintLabels labels={tomorrowLabels} text={`Labels for ${dmy(tomorrow)} (${tomorrowLabels.length})`} className="a-btn w-full" />
          </div>

          <div className="mb-3 flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="a-scrollx -mx-4 px-4 lg:mx-0 lg:px-0">
              {(
                [
                  ['all', 'All'],
                  ['web', 'Website'],
                  ['res', 'Resellers'],
                  ['cancel', 'Cancelled'],
                ] as const
              ).map(([f, label]) => (
                <button key={f} type="button" onClick={() => { setSource(f); if (f === 'cancel') setBox(null); setLimit(PAGE); }} className={cx('a-chip', source === f && 'a-chip-on')}>
                  {label}
                </button>
              ))}
            </div>
            <label className="flex h-10 items-center gap-2 rounded-[10px] border border-[#ebe8e3] bg-white px-3 text-[#a1a1aa] lg:ml-auto lg:w-[320px]">
              <Icon name="search" className="size-4" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
                placeholder="Search name, order, phone, reseller…"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#18181b] outline-none"
              />
            </label>
          </div>

          {list.length === 0 ? (
            <div className="a-card px-5 py-10 text-center text-[#a1a1aa]">No orders here.</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="a-card hidden overflow-x-auto lg:block">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Order', 'Customer', 'Reseller', 'Items', 'Delivery', 'Fee', 'Promo', 'Total', 'Status', ''].map((h) => (
                        <th key={h || 'actions'} className={cx('a-th !px-1.5 first:!pl-3 last:!pr-3', ['Fee', 'Total'].includes(h) && 'text-right')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={`${r.kind}-${r.o.id}`} className={cx('a-row-link', rowStatus(r) === 'cancel' && 'opacity-60')} onClick={() => openRow(r)}>
                        <td className="a-td !px-1.5 !pl-3">
                          <div className="whitespace-nowrap text-[13px] font-semibold tabular-nums">#{r.o.orderId}</div>
                          <div className="whitespace-nowrap text-xs text-[#a1a1aa]">{fmtDateTime(r.o.createdAt)}</div>
                        </td>
                        <td className="a-td !px-1.5">
                          <div className="font-semibold">{name(r)}</div>
                          <div className="text-xs tabular-nums text-[#a1a1aa]">{phone(r)}</div>
                        </td>
                        <td className="a-td !px-1.5">{resellerCell(r)}</td>
                        <td className="a-td !px-1.5">{chips(r, true)}</td>
                        <td className="a-td !px-1.5 whitespace-nowrap text-[13px] tabular-nums">{fmtDay(r.o.deliveryDate)}</td>
                        <td className="a-td !px-1.5 whitespace-nowrap text-right tabular-nums">
                          <div>{fee(r)}</div>
                          {r.o.courierFee !== null && (
                            <div className="text-xs leading-tight text-[#a1a1aa]">
                              {paidLabel(r)}
                              <br />
                              <b className="text-[#52525b]">{formatRupiah(r.o.courierFee)}</b>
                            </div>
                          )}
                        </td>
                        <td className="a-td !px-1.5 max-w-[76px]">{promo(r)}</td>
                        <td className="a-td !px-1.5 whitespace-nowrap text-right font-bold tabular-nums">{total(r)}</td>
                        <td className="a-td !px-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-start gap-1">
                            {pill(r)}
                            {unpaidTag(r)}
                          </div>
                        </td>
                        <td className="a-td !px-1.5 !pr-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {rowLabel(r, '', 'a-btn a-btn-sm w-8 px-0')}
                            {rowAction(r, false, true)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <div className="flex flex-col gap-3 lg:hidden">
                {list.map((r) => (
                  <div key={`${r.kind}-${r.o.id}`} className={cx('a-card px-3.5 py-3', rowStatus(r) === 'cancel' && 'opacity-60')}>
                    <div role="button" tabIndex={0} onClick={() => openRow(r)} onKeyDown={(e) => { if (e.key === 'Enter') openRow(r); }} className="block w-full cursor-pointer text-left">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{name(r)}</div>
                          <div className="text-xs tabular-nums text-[#a1a1aa]">#{r.o.orderId} · {phone(r)}</div>
                          <div className="text-[13px]">
                            <span className="text-[#a1a1aa]">Reseller </span>
                            <b>{r.kind === 'web' ? 'Website' : `${r.o.reseller}${r.o.parentReseller ? ` · under ${r.o.parentReseller}` : ''}`}</b>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {pill(r)}
                          {unpaidTag(r)}
                        </div>
                      </div>
                      <div className="mt-2">{chips(r, false)}</div>
                      <div className="mt-2 flex items-center gap-2 text-[13px]">
                        <span className="text-[#a1a1aa]">Deliver</span>
                        <b className="tabular-nums">{fmtDay(r.o.deliveryDate)}</b>
                        {r.kind === 'res' && (r.o.isPaydayPromo || r.o.paymentStatus === 'FREE') && <span className="ml-auto">{promo(r)}</span>}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div>
                          <div className="a-k">Delivery fee</div>
                          <div className="text-sm font-bold tabular-nums">{fee(r)}</div>
                        </div>
                        <div>
                          <div className="a-k">Total</div>
                          <div className="text-sm font-bold tabular-nums">{total(r)}</div>
                        </div>
                        <div>
                          <div className="a-k">{paidLabel(r)}</div>
                          <div className="text-sm font-bold tabular-nums">{r.o.courierFee === null ? '—' : formatRupiah(r.o.courierFee)}</div>
                        </div>
                      </div>
                    </div>
                    {(rowLabel(r, '', '') || rowAction(r)) && (
                      <div className="mt-2.5 flex gap-2">
                        {rowLabel(r, 'Print label', 'a-btn a-btn-sm flex-1')}
                        {rowAction(r, true)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {shown.length > limit && (
                <button type="button" onClick={() => setLimit(limit + PAGE)} className="a-btn mt-3 w-full">
                  Show more ({shown.length - limit} older)
                </button>
              )}
            </>
          )}
          <Note className="mt-3">
            Tap an order to open it. <b>Deliver</b> = you hand a website order to the courier (it becomes <b>On the way</b>). <b>Delivered</b> = the customer has it. Reseller total: Payday promo = every 3 boxes Rp350.000 + each extra box Rp140.000, otherwise Rp140.000 a box; Rp15.000 delivery for 1 box.
          </Note>
        </div>
      )}

      {popup && popOrder && <Popups popup={popup} setPopup={setPopup} o={popOrder} busy={busy} daysOff={daysOff} call={call} setMessage={setMessage} />}

      {resPopup && resOrder && (
        <ResellerPopups
          popup={resPopup}
          setPopup={setResPopup}
          o={resOrder}
          busy={busy}
          products={products}
          charge={charge(resOrder)}
          call={call}
          onMarkPaid={() => markResPaid(resOrder)}
          onDuplicate={() => duplicate(resOrder)}
          chips={chips({ kind: 'res', o: resOrder }, false)}
          label={resStatus(resOrder) === 'deliver' ? <PrintLabelButton label={resLabel(resOrder, products)} fileName={`label-${resOrder.orderId}`} text="Print label" className="a-btn" /> : null}
        />
      )}
    </>
  );
}

/** Reseller order: the order sheet (details + every action), the delivery fee / delivered pop-up and the cancel pop-up. */
function ResellerPopups({
  popup,
  setPopup,
  o,
  busy,
  charge,
  call,
  onMarkPaid,
  onDuplicate,
  chips,
  label,
}: {
  popup: ResPopup;
  setPopup: (p: ResPopup | null) => void;
  o: ResellerOrder;
  busy: string | null;
  products: ProductInfo[];
  charge: { price: number; deliveryFee: number; total: number };
  call: (key: string, url: string, method: 'PATCH' | 'POST', success: (data: Record<string, unknown>) => string, body?: unknown, refresh?: boolean) => Promise<boolean>;
  onMarkPaid: () => void;
  onDuplicate: () => void;
  chips: React.ReactNode;
  label: React.ReactNode;
}) {
  const close = () => setPopup(null);
  const st = resStatus(o);
  const free = o.paymentStatus === 'FREE';

  if (popup.kind === 'resfee') {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (popup.fee.trim() === '') return;
          const ok = await call(
            `resfee-${o.id}`,
            `/api/orders/${o.id}/${popup.deliver ? 'delivered' : 'courier-fee'}`,
            'PATCH',
            () => (popup.deliver ? `Order #${o.orderId} marked as delivered.` : `Delivery fee saved for #${o.orderId}.`),
            { courierFee: popup.fee },
          );
          if (ok) close();
        }}
      >
        <Modal
          onClose={close}
          title={`${popup.deliver ? 'Mark as delivered' : 'Delivery fee'} · #${o.orderId}`}
          sub="What you paid the courier. Counted as a cost in the profit on the HPP page."
          footer={
            <>
              <button type="button" onClick={close} className="a-btn a-btn-lg">Cancel</button>
              <button type="submit" disabled={busy !== null || popup.fee.trim() === ''} className={cx('a-btn a-btn-lg', popup.deliver ? 'a-btn-green' : 'a-btn-pri')}>
                {busy === `resfee-${o.id}` ? 'Saving…' : popup.deliver ? 'Mark as delivered' : 'Save'}
              </button>
            </>
          }
        >
          <label>
            <span className="a-label">How much did you pay for the delivery? (Rp, 0 if nothing)</span>
            <input autoFocus inputMode="numeric" required value={popup.fee} onChange={(e) => setPopup({ ...popup, fee: e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 25000" className="a-input" />
          </label>
        </Modal>
      </form>
    );
  }

  if (popup.kind === 'rescancel') {
    return (
      <Modal
        onClose={close}
        title={`Cancel order #${o.orderId}?`}
        sub="This cannot be undone. The boxes go back into stock."
        footer={
          <>
            <button type="button" onClick={close} className="a-btn a-btn-lg">Keep order</button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                const ok = await call(`cancel-${o.id}`, `/api/orders/${o.id}/cancel`, 'PATCH', () => `Order #${o.orderId} cancelled.`);
                if (ok) close();
              }}
              className="a-btn a-btn-lg a-btn-danger-fill"
            >
              <Icon name="x" className="size-4" />
              {busy === `cancel-${o.id}` ? 'Cancelling…' : 'Cancel order'}
            </button>
          </>
        }
      >
        <span />
      </Modal>
    );
  }

  // Order sheet
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex py-[3px] text-sm">
      <span className="text-[#52525b]">{k}</span>
      <span className="ml-auto text-right tabular-nums">{v}</span>
    </div>
  );
  return (
    <Modal
      onClose={close}
      title={`#${o.orderId} · ${o.customerName}`}
      sub={`Reseller ${o.reseller}${o.parentReseller ? ` · under ${o.parentReseller}` : ''} · made ${fmtDateTime(o.createdAt)}`}
      footer={
        <button type="button" onClick={close} className="a-btn a-btn-lg">Close</button>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
        {o.paymentStatus === 'PAID' ? <Pill tone="green" dot={false}>Paid</Pill> : free ? <Pill tone="violet" dot={false}>Free product</Pill> : <Pill tone="amber" dot={false}>Unpaid</Pill>}
        {o.isPaydayPromo && <Pill tone="blue" dot={false}>Payday promo</Pill>}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        {o.phoneNumber && (
          <div className="flex items-center gap-1 tabular-nums">
            <Icon name="phone" className="size-4 text-[#a1a1aa]" />
            <a href={`tel:${o.phoneNumber}`}>{o.phoneNumber}</a>
            <CopyValueButton value={o.phoneNumber} label="phone number" />
          </div>
        )}
        {o.address && (
          <div className="flex items-start gap-1 text-[#52525b]">
            <Icon name="pin" className="mt-0.5 size-4 shrink-0 text-[#a1a1aa]" />
            <span className="min-w-0 flex-1">{o.address}</span>
            <CopyValueButton value={o.address} label="address" />
          </div>
        )}
      </div>
      {chips}
      <div>
        {row('Deliver', <b>{fmtDay(o.deliveryDate)}</b>)}
        {row('Boxes', free ? 'free product' : formatRupiah(charge.price))}
        {row('Delivery fee', free ? '—' : charge.deliveryFee ? formatRupiah(charge.deliveryFee) : 'Free')}
        <div className="mt-1 flex border-t border-[#f3f1ed] pt-2 font-bold">
          <span>Total</span>
          <span className="ml-auto tabular-nums">{formatRupiah(charge.total)}</span>
        </div>
        <button type="button" onClick={() => setPopup({ kind: 'resfee', id: o.id, deliver: false, fee: o.courierFee === null ? '' : String(o.courierFee) })} className="mt-1 text-xs text-[#52525b] underline">
          Courier paid: {o.courierFee === null ? <b className="text-red-600">not entered</b> : <b>{formatRupiah(o.courierFee)}</b>} · change
        </button>
      </div>
      {st !== 'cancel' && <ProfitCard p={o.profit} paid={o.paymentStatus !== 'PENDING'} />}
      <div className="flex flex-col gap-2">
        {st === 'deliver' && (
          <button type="button" disabled={busy !== null} onClick={() => setPopup({ kind: 'resfee', id: o.id, deliver: true, fee: o.courierFee === null ? '' : String(o.courierFee) })} className="a-btn a-btn-green">
            <Icon name="checkc" className="size-4" />
            Mark as delivered
          </button>
        )}
        {o.paymentStatus === 'PENDING' && st !== 'cancel' && (
          <button type="button" disabled={busy !== null} onClick={onMarkPaid} className="a-btn">
            {busy === `paid-${o.id}` ? 'Saving…' : 'Mark as paid'}
          </button>
        )}
        {label}
        <div className="grid grid-cols-2 gap-2">
          {st === 'deliver' && (
            <Link href={`/orders/${o.id}/edit`} className="a-btn">
              <Icon name="edit" className="size-4" />
              Edit order
            </Link>
          )}
          <button type="button" onClick={onDuplicate} className={cx('a-btn', st !== 'deliver' && 'col-span-2')}>
            <Icon name="copy" className="size-4" />
            Duplicate
          </button>
        </div>
        {st === 'deliver' && (
          <button type="button" disabled={busy !== null} onClick={() => setPopup({ kind: 'rescancel', id: o.id })} className="a-btn a-btn-danger">
            <Icon name="x" className="size-4" />
            Cancel order
          </button>
        )}
      </div>
    </Modal>
  );
}

function OrderDetail({
  o,
  busy,
  qris,
  gatewayLabel,
  onBack,
  mainAction,
  onChangeLink,
  onMarkPaid,
  onQris,
  onDate,
  onCancel,
  onAddEmail,
}: {
  o: WebsiteOrder;
  busy: string | null;
  qris: boolean;
  gatewayLabel: string | null;
  onBack: () => void;
  mainAction: (o: WebsiteOrder, size?: 'sm' | 'lg' | 'md', grow?: boolean) => React.ReactNode;
  onDeliver: () => void;
  onChangeLink: () => void;
  onMarkPaid: () => void;
  onQris: () => void;
  onDate: () => void;
  onCancel: () => void;
  onAddEmail: () => void;
}) {
  const st = statusOf(o);
  const wa = whatsappFor(o);
  const cancellable = o.orderStatus === 'ACTIVE' && o.deliveryStatus === 'PENDING' && !o.shippedAt;
  const dateEditable = o.orderStatus === 'ACTIVE' && o.deliveryStatus !== 'DELIVERED';
  const banner = {
    pay: { cls: 'border-[#fde7b0] bg-[#fff7e6] text-[#7c4a03]', icon: 'clock', title: 'Waiting for payment', sub: paymentWaiting(o, gatewayLabel) },
    deliver: { cls: 'border-[#dbe6fe] bg-[#eff6ff] text-[#1e3a8a]', icon: 'truck', title: `Paid · deliver on ${fmtDay(o.deliveryDate)}`, sub: o.paidInvoice ? `Paid via ${GATEWAY_LABELS[o.paidVia ?? ''] ?? 'online payment'} · invoice ${o.paidInvoice}` : 'Paid' },
    way: { cls: 'border-[#e4dcfd] bg-[#f5f3ff] text-[#4c1d95]', icon: 'truck', title: `On the way with ${courierName(o)}`, sub: `Sent out ${fmtDateTime(o.shippedAt)} · customer emailed the ${o.trackingNumber ? 'resi' : 'link'}` },
    done: { cls: 'border-[#bbf7d0] bg-[#ecfdf3] text-[#14532d]', icon: 'checkc', title: 'Delivered', sub: o.deliveredAt ? `Marked delivered ${fmtDateTime(o.deliveredAt)}` : 'Delivered' },
    cancel: { cls: 'border-[#e4e4e7] bg-[#f4f4f5] text-[#3f3f46]', icon: 'x', title: o.cancelReason === 'EXPIRED' ? 'Cancelled: payment expired' : o.cancelReason === 'CUSTOMER' ? 'Cancelled by customer' : 'Cancelled', sub: `Ordered ${fmtDateTime(o.createdAt)}` },
  }[st];
  const steps = [
    { label: 'Paid', done: o.paymentStatus === 'PAID' },
    { label: o.shippedAt ? `On the way ${fmtDateTime(o.shippedAt).slice(11)}` : 'On the way', done: !!o.shippedAt },
    { label: 'Delivered', done: o.deliveryStatus === 'DELIVERED' },
  ];
  const nowStep = steps.findIndex((s) => !s.done);

  const nextStep = (
    <div className="flex flex-col gap-2.5">
      {st !== 'cancel' && (
        <a href={wa.href} target="_blank" rel="noreferrer" className="a-btn a-btn-lg a-btn-wa">
          <Icon name="wa" className="size-5" />
          {wa.label}
        </a>
      )}
      {st === 'pay' && (
        <>
          {o.proofUploadedAt && (
            <a href={`/api/website/proof/${o.id}`} target="_blank" rel="noreferrer" className="a-btn">
              View transfer proof
            </a>
          )}
          {qris && (
            <button type="button" disabled={busy !== null} onClick={onQris} className="a-btn">
              {busy === `qris-${o.id}` ? 'Getting QRIS…' : 'QRIS: show, copy or send'}
            </button>
          )}
          <button type="button" disabled={busy !== null} onClick={onMarkPaid} className="a-btn">
            {busy === `paid-${o.id}` ? 'Saving…' : 'Mark as paid (got the money another way)'}
          </button>
        </>
      )}
      {(st === 'way' || st === 'done') && o.trackingUrl && (
        <div>
          <div className="a-label">{o.trackingNumber ? `Resi (${courierName(o)})` : 'Tracking link'}</div>
          <div className="flex items-center gap-2 rounded-[10px] border border-[#ebe8e3] bg-[#fcfbf9] px-3 py-2.5 text-[13px]">
            <Icon name="link" className="size-4 text-[#a1a1aa]" />
            {o.trackingNumber ? (
              <span className="min-w-0 flex-1 font-mono font-semibold">{o.trackingNumber}</span>
            ) : (
              <a href={o.trackingUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[#1d4ed8] underline">
                {o.trackingUrl}
              </a>
            )}
            <button type="button" onClick={onChangeLink} className="shrink-0 font-semibold text-[#9a3412]">
              Change
            </button>
          </div>
          <div className="a-hint">
            Courier: {courierName(o)} · fee you paid {o.courierFee === null ? <b className="text-red-600">not entered</b> : formatRupiah(o.courierFee)}. The customer can open this link until 48 hours after delivery.
          </div>
        </div>
      )}
      {st !== 'cancel' && st !== 'done' && <PrintLabelButton label={labelOf(o)} fileName={`label-${o.orderId}`} text="Print label" className="a-btn" />}
      {(st === 'deliver' || st === 'way') && <div className="hidden lg:contents">{mainAction(o, 'lg')}</div>}
    </div>
  );

  return (
    <div className="pb-24 lg:pb-0">
      <div className="lg:hidden sticky top-0 z-20 -mx-4 -mt-1 mb-2 flex items-center gap-2.5 bg-[#f6f5f2]/95 px-4 py-3 backdrop-blur">
        <button type="button" onClick={onBack} aria-label="Back to orders" className="grid size-10 place-items-center rounded-[10px] border border-[#ebe8e3] bg-white">
          <Icon name="left" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-bold tabular-nums">#{o.orderId}</div>
          <div className="text-xs text-[#a1a1aa]">Ordered {fmtDateTime(o.createdAt)}</div>
        </div>
        <span className="size-10" />
      </div>
      <div className="mb-4 hidden lg:block">
        <button type="button" onClick={onBack} className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#a1a1aa] hover:text-[#52525b]">
          <Icon name="left" className="size-3.5" />
          Orders
        </button>
        <div className="flex items-center gap-2.5">
          <h2 className="text-2xl font-bold tabular-nums">#{o.orderId}</h2>
          <StatusPill o={o} />
        </div>
        <p className="text-[#52525b]">Ordered {fmtDateTime(o.createdAt)} · {o.customerName} · {o.customerEmail}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr] lg:items-start lg:gap-[18px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className={cx('flex items-center gap-2.5 rounded-[14px] border px-4 py-3.5', banner.cls)}>
            <Icon name={banner.icon} className="size-[22px]" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{banner.title}</div>
              <div className="text-xs opacity-80">{banner.sub}</div>
            </div>
            {dateEditable && (
              <button type="button" onClick={onDate} className="a-btn a-btn-sm shrink-0">
                Change date
              </button>
            )}
          </div>

          {st !== 'cancel' && (
            <div className="a-card px-4 py-3.5">
              <div className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[.04em] text-[#a1a1aa]">Progress</div>
              <div className="grid grid-cols-3 gap-1.5">
                {steps.map((s, i) => (
                  <div key={s.label} className={cx('text-[11.5px] font-semibold', s.done ? 'text-[#15803d]' : i === nowStep ? 'text-[#18181b]' : 'text-[#a1a1aa]')}>
                    <i className={cx('mb-1.5 block h-[5px] rounded-full', s.done ? 'bg-[#15803d]' : i === nowStep ? 'bg-[#9a3412]' : 'bg-[#ebe8e3]')} />
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="a-card flex flex-col gap-2.5 px-4 py-3.5">
            <div className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-[#a1a1aa]">Customer</div>
            <div className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{o.recipientName}</div>
                <div className="flex items-center gap-1 text-sm text-[#52525b]">
                  {phone0(o.recipientPhone)}
                  <CopyValueButton value={phone0(o.recipientPhone)} label="phone number" />
                </div>
              </div>
              {st !== 'cancel' && <WaIcon href={wa.href} title={wa.title} round size="lg" />}
            </div>
            {/* Owner 15 Nov: a guest who ordered without an email (e.g. helped on WhatsApp) can get one added later. */}
            {o.customerEmail === 'no email' && o.orderStatus === 'ACTIVE' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 text-[#a1a1aa]">No email: the customer gets no order emails</span>
                <button type="button" onClick={onAddEmail} className="a-btn a-btn-sm">Add email</button>
              </div>
            )}
            <div className="flex items-start gap-2 text-sm">
              <Icon name="pin" className="mt-0.5 size-4 text-[#a1a1aa]" />
              <span className="min-w-0 flex-1">{o.address}</span>
              <CopyValueButton value={o.address} label="address" />
            </div>
            <div className="flex flex-wrap gap-2">
              {o.latitude !== null && o.longitude !== null && (
                <a className="a-btn a-btn-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${o.latitude},${o.longitude}`}>
                  <Icon name="pin" className="size-4" />
                  Open pin in Maps
                </a>
              )}
              <a className="a-btn a-btn-sm" href={`tel:${phone0(o.recipientPhone)}`}>
                <Icon name="phone" className="size-4" />
                Call
              </a>
            </div>
            {o.notes && <Note tone="amber">Note: &quot;{o.notes}&quot;</Note>}
            {o.customerName !== o.recipientName && <div className="text-xs text-[#a1a1aa]">Ordered by {o.customerName} · {o.customerEmail}</div>}
          </div>

          <div className="a-card px-4 py-3.5">
            <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-[#a1a1aa]">Items</div>
            {o.lines.map((l, i) => (
              <div key={i} className="flex py-[3px] text-sm">
                <span className="text-[#52525b]">
                  {l.name} × {l.qty}
                  {l.websiteOnly && <span className="ml-1.5 text-xs text-[#a1a1aa]">(website-only, not in stock)</span>}
                </span>
              </div>
            ))}
            <div className="flex py-[3px] text-sm">
              <span className="text-[#52525b]">Subtotal</span>
              <span className="ml-auto tabular-nums">{formatRupiah(o.subtotal)}</span>
            </div>
            {o.discount > 0 && (
              <div className="flex py-[3px] text-sm">
                <span className="text-[#52525b]">Voucher {o.voucherCode}</span>
                <span className="ml-auto tabular-nums text-[#15803d]">−{formatRupiah(o.discount)}</span>
              </div>
            )}
            <div className="flex py-[3px] text-sm">
              <span className="text-[#52525b]">Delivery fee (charged)</span>
              <span className="ml-auto tabular-nums">{o.deliveryFee ? formatRupiah(o.deliveryFee) : 'Free'}</span>
            </div>
            <div className="mt-2 flex border-t border-[#f3f1ed] pt-2.5 font-bold">
              <span>{o.paymentStatus === 'PAID' ? 'Total paid' : 'To receive'}</span>
              <span className="ml-auto tabular-nums">{formatRupiah(o.total)}</span>
            </div>
          </div>
          {st !== 'cancel' && <ProfitCard p={o.profit} website paid={o.paymentStatus === 'PAID'} />}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="a-card hidden flex-col gap-2.5 px-4 py-4 lg:flex">
            <div className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-[#a1a1aa]">Next step</div>
            {nextStep}
          </div>
          <div className="lg:hidden">{nextStep}</div>
          {cancellable && (
            <button type="button" disabled={busy !== null} onClick={onCancel} className="a-btn a-btn-danger">
              <Icon name="x" className="size-4" />
              Cancel order
            </button>
          )}
        </div>
      </div>

      {(st === 'deliver' || st === 'way' || st === 'pay') && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-[#ebe8e3] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
          {st === 'pay' ? (
            <>
              {mainAction(o, 'lg', true)}
              <button type="button" disabled={busy !== null} onClick={onMarkPaid} className="a-btn a-btn-lg flex-1">
                Mark as paid
              </button>
            </>
          ) : (
            <>
              <PrintLabelButton label={labelOf(o)} fileName={`label-${o.orderId}`} text="Label" className="a-btn a-btn-lg flex-1" />
              <div className="flex flex-[2]">{mainAction(o, 'lg', true)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function paymentWaiting(o: WebsiteOrder, gatewayLabel: string | null): string {
  const since = `ordered ${fmtDateTime(o.createdAt)}`;
  if (o.proofUploadedAt) return `Transfer proof uploaded · ${since}`;
  if (o.placedByOwner && o.paymentMethod === null) return `Placed by you · waiting for the customer to pay (24 hours) · ${since}`;
  if (o.paymentMethod === 'TRANSFER' || !gatewayLabel) return `Manual BCA transfer · no transfer proof yet · ${since}`;
  if (o.paymentMethod === 'OVO') return `Waiting for OVO payment (Duitku) · ${since}`;
  if (o.paymentMethod === 'SHOPEEPAY') return `Waiting for ShopeePay payment (Duitku) · ${since}`;
  if (o.paymentMethod === 'DANA') return `Waiting for DANA payment (${gatewayLabel}) · ${since}`;
  return `Waiting for ${gatewayLabel} QRIS payment · ${since}`;
}

function Popups({
  popup,
  setPopup,
  o,
  busy,
  daysOff,
  call,
  setMessage,
}: {
  popup: Popup;
  setPopup: (p: Popup | null) => void;
  o: WebsiteOrder;
  busy: string | null;
  daysOff: { startDate: string; endDate: string }[];
  call: (key: string, url: string, method: 'PATCH' | 'POST', success: (data: Record<string, unknown>) => string, body?: unknown, refresh?: boolean) => Promise<boolean>;
  setMessage: (m: { ok: boolean; text: string } | null) => void;
}) {
  const close = () => setPopup(null);

  if (popup.kind === 'deliver') {
    const resi = usesResi(findCourier(popup.courier));
    const again = !!o.shippedAt;
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call(
            `ship-${o.id}`,
            `/api/website/orders/${o.id}/ship`,
            'POST',
            (d) => (d.firstTime ? `Order #${o.orderId} is on the way. The customer was emailed the tracking ${resi ? 'number' : 'link'}.` : `Tracking and delivery fee saved for #${o.orderId}.`),
            { courier: popup.courier, trackingUrl: resi ? '' : popup.url, trackingNumber: resi ? popup.resi : '', courierFee: popup.fee },
          );
          if (ok) close();
        }}
      >
        <Modal
          onClose={close}
          title={again ? `Change tracking for #${o.orderId}` : `Deliver order #${o.orderId}`}
          sub={again ? 'Fix the courier, link or fee. The customer is not emailed again.' : 'Hand the order to the courier. The customer is emailed the tracking link. After this the order can no longer be cancelled.'}
          footer={
            <>
              <button type="button" onClick={close} className="a-btn a-btn-lg">
                Cancel
              </button>
              <button type="submit" disabled={busy !== null || !popup.courier} className="a-btn a-btn-lg a-btn-blue">
                <Icon name="truck" className="size-4" />
                {busy === `ship-${o.id}` ? 'Saving…' : again ? 'Save' : 'Deliver · email customer'}
              </button>
            </>
          }
        >
          <div>
            <div className="a-label">Courier</div>
            <div className="flex flex-wrap gap-2">
              {COURIERS.map((c) => (
                <button key={c.id} type="button" onClick={() => setPopup({ ...popup, courier: c.id })} className={cx('a-chip', popup.courier === c.id && 'a-chip-on')}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          {resi ? (
            <label>
              <span className="a-label">Resi number (letters and numbers)</span>
              <input
                required
                autoCapitalize="characters"
                autoComplete="off"
                value={popup.resi}
                onChange={(e) => setPopup({ ...popup, resi: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                placeholder="e.g. 030123456789"
                className="a-input font-mono"
              />
            </label>
          ) : (
            <label>
              <span className="a-label">Tracking link</span>
              <input type="url" required value={popup.url} onChange={(e) => setPopup({ ...popup, url: e.target.value })} placeholder="https://…" className="a-input" />
              <span className="a-hint block">Any https link works (Grab, Gojek, Lalamove, Paxel). TIKI / JNE ask for the resi number instead.</span>
            </label>
          )}
          <label>
            <span className="a-label">Delivery fee you paid the courier (Rp)</span>
            <input
              inputMode="numeric"
              required
              value={popup.fee}
              onChange={(e) => setPopup({ ...popup, fee: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="e.g. 25000"
              className="a-input"
            />
            <span className="a-hint block">Customer paid {o.deliveryFee ? formatRupiah(o.deliveryFee) : 'no'} delivery. Used for profit.</span>
          </label>
        </Modal>
      </form>
    );
  }

  if (popup.kind === 'delivered') {
    const hasLink = !!o.trackingUrl && !o.trackingNumber;
    const needFee = o.courierFee === null;
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const linkChanged = hasLink && popup.url.trim() !== (o.trackingUrl ?? '');
          if (linkChanged || needFee) {
            const saved = await call(
              `del-${o.id}`,
              `/api/website/orders/${o.id}/ship`,
              'POST',
              () => 'Saved.',
              { courier: o.courier ?? '', trackingUrl: hasLink ? popup.url.trim() : (o.trackingUrl ?? ''), trackingNumber: o.trackingNumber ?? '', courierFee: popup.fee },
              false,
            );
            if (!saved) return;
          }
          const ok = await call(`del-${o.id}`, `/api/orders/${o.id}/delivered`, 'PATCH', () => `Order #${o.orderId} marked as delivered. Customer emailed.`);
          if (ok) close();
          else setMessage({ ok: false, text: `Could not mark #${o.orderId} as delivered. Try again.` });
        }}
      >
        <Modal
          onClose={close}
          title={`Mark #${o.orderId} as delivered?`}
          sub='The customer gets a "delivered" email.'
          footer={
            <>
              <button type="button" onClick={close} className="a-btn a-btn-lg">
                Not yet
              </button>
              <button type="submit" disabled={busy !== null} className="a-btn a-btn-lg a-btn-green">
                <Icon name="checkc" className="size-4" />
                {busy === `del-${o.id}` ? 'Saving…' : 'Delivered · email customer'}
              </button>
            </>
          }
        >
          {hasLink && (
            <>
              <Note tone="blue">
                Couriers like Grab often give a <b>new link for the proof of delivery</b>. Paste it here if it changed, otherwise keep the same link.
              </Note>
              <label>
                <span className="a-label">Link the customer will see</span>
                <input type="url" required value={popup.url} onChange={(e) => setPopup({ ...popup, url: e.target.value })} className="a-input" />
                <span className="a-hint block">The customer can open it for 48 hours after delivery.</span>
              </label>
            </>
          )}
          {needFee ? (
            <label>
              <span className="a-label">Delivery fee you paid the courier (Rp)</span>
              <input inputMode="numeric" required value={popup.fee} onChange={(e) => setPopup({ ...popup, fee: e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 25000" className="a-input" />
            </label>
          ) : (
            <div className="flex text-sm">
              <span className="text-[#52525b]">Delivery fee you paid</span>
              <b className="ml-auto tabular-nums">{formatRupiah(o.courierFee ?? 0)}</b>
            </div>
          )}
        </Modal>
      </form>
    );
  }

  if (popup.kind === 'cancel') {
    const paid = o.paymentStatus === 'PAID';
    const boxes = o.lines.filter((l) => !l.websiteOnly).reduce((n, l) => n + l.qty, 0);
    return (
      <Modal
        onClose={close}
        title={`Cancel order #${o.orderId}?`}
        sub="This cannot be undone."
        footer={
          <>
            <button type="button" onClick={close} className="a-btn a-btn-lg">
              Keep order
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                const ok = await call(`cancel-${o.id}`, `/api/orders/${o.id}/cancel`, 'PATCH', () => `Order #${o.orderId} cancelled. Customer emailed.`);
                if (ok) close();
              }}
              className="a-btn a-btn-lg a-btn-danger-fill"
            >
              <Icon name="x" className="size-4" />
              {busy === `cancel-${o.id}` ? 'Cancelling…' : 'Cancel order'}
            </button>
          </>
        }
      >
        <Note className="leading-relaxed">
          <b>What happens</b>
          <br />
          {paid && boxes > 0 && (
            <>
              ✓ {boxes} box{boxes === 1 ? '' : 'es'} go back into stock
              <br />
            </>
          )}
          {o.voucherCode && (
            <>
              ✓ Voucher {o.voucherCode} can be used again
              <br />
            </>
          )}
          ✓ The customer is emailed that the order is cancelled
        </Note>
        {paid && (
          <Note tone="amber">
            The customer already paid <b>{formatRupiah(o.total)}</b>. Refund them yourself (bank / e-wallet).
          </Note>
        )}
      </Modal>
    );
  }

  if (popup.kind === 'email') {
    const paid = o.paymentStatus === 'PAID';
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call(
            `email-${o.id}`,
            `/api/website/orders/${o.id}/email`,
            'PATCH',
            (d) =>
              `Email added to #${o.orderId}. ${d.account === 'existing' ? 'Order moved to their account.' : d.account === 'new' ? 'New account made for them.' : 'Phone belongs to another account: order kept as guest with this email.'}${d.firstPurchaseMarked ? ' First-purchase discount marked as used for this email + phone.' : ''}${d.sent ? ' Payment email sent.' : paid ? '' : ' They get the payment email when you mark it paid.'}`,
            { email: popup.email, sendPaidEmail: paid && popup.sendNow },
          );
          if (ok) close();
        }}
      >
        <Modal
          onClose={close}
          title={`Add email to #${o.orderId}`}
          sub="The order moves to the customer's account (made for them if they have none)."
          footer={
            <>
              <button type="button" onClick={close} className="a-btn a-btn-lg">
                Cancel
              </button>
              <button type="submit" disabled={busy !== null || !popup.email.includes('@')} className="a-btn a-btn-lg a-btn-pri">
                {busy === `email-${o.id}` ? 'Saving…' : 'Save email'}
              </button>
            </>
          }
        >
          <label>
            <span className="a-label">Customer email</span>
            <input type="email" required autoFocus value={popup.email} onChange={(e) => setPopup({ ...popup, email: e.target.value })} className="a-input" placeholder="nama@gmail.com" />
          </label>
          {paid ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={popup.sendNow} onChange={(e) => setPopup({ ...popup, sendNow: e.target.checked })} />
              Also send the &quot;Pembayaran diterima&quot; email now
            </label>
          ) : (
            <Note>When you mark this order as paid, the customer gets the &quot;Pembayaran diterima&quot; email.</Note>
          )}
          {o.voucherCode !== null || o.discount > 0 ? (
            <Note tone="amber">If this order used the first-purchase discount, this email + phone count as having used it.</Note>
          ) : null}
        </Modal>
      </form>
    );
  }

  if (popup.kind === 'date') {
    const hasEmail = o.customerEmail.includes('@');
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const to = formatDeliveryDate(deliveryDateFromKey(popup.date));
          const ok = await call(
            `date-${o.id}`,
            `/api/website/orders/${o.id}/delivery-date`,
            'PATCH',
            (d) =>
              !d.changed
                ? `Order #${o.orderId} already had this delivery date. Nothing changed.`
                : `Delivery of #${o.orderId} moved to ${to}. ${d.customerHasEmail ? 'Customer emailed.' : 'This order has no email: tell the customer on WhatsApp.'}`,
            { date: popup.date },
          );
          if (ok) close();
        }}
      >
        <Modal
          onClose={close}
          title={`Change delivery date of #${o.orderId}`}
          sub={`Now: ${fmtDay(o.deliveryDate)}. ${hasEmail ? 'The customer will be emailed.' : 'This order has no email: tell the customer on WhatsApp.'}`}
          footer={
            <>
              <button type="button" onClick={close} className="a-btn a-btn-lg">
                Cancel
              </button>
              <button type="submit" disabled={busy !== null || !popup.date} className="a-btn a-btn-lg a-btn-pri">
                {busy === `date-${o.id}` ? 'Saving…' : hasEmail ? 'Save & email customer' : 'Save'}
              </button>
            </>
          }
        >
          <label>
            <span className="a-label">New delivery date</span>
            <input type="date" required min={jakartaDateKey(popup.now)} value={popup.date} onChange={(e) => setPopup({ ...popup, date: e.target.value })} className="a-input" />
          </label>
          {popup.date &&
            deliveryDayWarnings(popup.date, daysOff, popup.now).map((w) => (
              <Note key={w} tone="red">
                {w}
              </Note>
            ))}
        </Modal>
      </form>
    );
  }

  // QRIS link
  const waText = `Halo Kak ${o.recipientName}, berikut link pembayaran QRIS untuk pesanan Jentis Kitchen #${o.orderId} sebesar ${formatRupiah(o.total)}:\n${popup.url}\n\nBisa dibayar dengan semua e-wallet dan m-banking. Terima kasih!`;
  return (
    <Modal
      onClose={close}
      title={`QRIS for #${o.orderId}`}
      sub={`QRIS for ${formatRupiah(o.total)} is ready (valid about 2 hours). Paid orders are marked paid automatically.`}
      footer={
        <button type="button" onClick={close} className="a-btn a-btn-lg">
          Close
        </button>
      }
    >
      <a href={whatsappLink(o.recipientPhone, waText)} target="_blank" rel="noreferrer" className="a-btn a-btn-lg a-btn-wa">
        <Icon name="wa" className="size-5" />
        Send QRIS link on WhatsApp
      </a>
      <div className="flex gap-2">
        <a href={popup.url} target="_blank" rel="noreferrer" className="a-btn flex-1">
          Show QRIS ↗
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(popup.url).catch(() => {});
            setMessage({ ok: true, text: `QRIS link for #${o.orderId} copied.` });
          }}
          className="a-btn flex-1"
        >
          <Icon name="copy" className="size-4" />
          Copy QRIS link
        </button>
      </div>
    </Modal>
  );
}

/** Net profit of one order (owner 14 Nov 2026): income − product cost (HPP) − payment fee − courier fee. No ads. Value only. */
function ProfitCard({ p, paid }: { p: OrderProfitInfo; website?: boolean; paid: boolean }) {
  return (
    <div className="a-card flex items-center px-4 py-3.5 font-bold">
      <span>Net profit{paid ? '' : ' (once paid)'}</span>
      <span className={cx('ml-auto tabular-nums', p.net === null ? '' : p.net >= 0 ? 'text-[#15803d]' : 'text-[#b91c1c]')}>
        {p.net === null ? '—' : `${p.net < 0 ? '−' : ''}${formatRupiah(Math.abs(p.net))}`}
      </span>
    </div>
  );
}
