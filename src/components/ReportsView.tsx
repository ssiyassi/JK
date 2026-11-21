'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { addDaysToKey } from '@/lib/core/time';
import type { ReportView } from '@/lib/marketing/reportView';
import type { LinkLog } from '@/lib/marketing/linkLog';
import PastCustomersList from './PastCustomersList';
import UnfinishedCheckouts from './UnfinishedCheckouts';
import { Card, Icon, Kpi, Note, PageHeader, Pill, cx } from './admin/ui';

const ADS_START = '2026-10-20'; // first day of the Meta campaign
const SPEND = '#c9874f'; // chart: ad spend (bars)
const SALES = '#9a3412'; // chart: sales (line)
type Tab = 'sales' | 'ads' | 'profit' | 'partners' | 'customers' | 'links';
const TABS: [Tab, string][] = [
  ['sales', 'Sales'],
  ['ads', 'Ads'],
  ['profit', 'Profit'],
  ['partners', 'Affiliates & collabs'],
  ['customers', 'Customers'],
  ['links', 'Links & WhatsApp'],
];

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
const num = (n: number) => Math.round(n).toLocaleString('id-ID');
const dmy = (key: string) => key.split('-').reverse().join('/');
const signed = (n: number) => `${n < 0 ? '−' : '+'}${rp(Math.abs(n))}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const range = (v: ReportView) => (v.from === v.to ? dmy(v.to) : `${dmy(v.from)} – ${dmy(v.to)}`);
const money = (n: number | null) => (n === null ? '—' : rp(n));

/** Reports: date choice, five tabs, and the PDF (the morning report's own design) for printing. */
export default function ReportsView({ view: v, links, today, pdfHtml }: { view: ReportView; links: LinkLog; today: string; pdfHtml: string }) {
  const router = useRouter();
  const pdf = useRef<HTMLIFrameElement>(null);
  const [tab, setTab] = useState<Tab>('ads');
  const [start, setStart] = useState(v.from);
  const [end, setEnd] = useState(v.to);
  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState(false);
  const [list, setList] = useState(false);
  const [leads, setLeads] = useState(false);
  const [ticked, setTicked] = useState(false);

  useEffect(() => {
    setStart(v.from);
    setEnd(v.to);
    setLoading(false);
  }, [v.from, v.to, v]);

  // Today is live: fresh numbers every 5 minutes while the page is open.
  useEffect(() => {
    if (!v.live) return;
    const id = setInterval(() => router.refresh(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [v.live, router]);

  const go = (f: string, t: string) => {
    setLoading(true);
    router.push(`/marketing-report?from=${f}&to=${t}`);
  };
  const quick: [string, string, string][] = [
    [dmy(today), today, today],
    [dmy(addDaysToKey(today, -1)), addDaysToKey(today, -1), addDaysToKey(today, -1)],
    ['Last 7 days', addDaysToKey(today, -6), today],
    ['This month', `${today.slice(0, 8)}01`, today],
    ['Since ads started', ADS_START, today],
  ];
  const onQuick = quick.some(([, f, t]) => f === v.from && t === v.to);

  return (
    <div aria-busy={loading}>
      <PageHeader
        title="Reports"
        sub={<>How the ads and the website turned into money · <b className="text-[#18181b]">{v.from === v.to ? dmy(v.to) : `${dmy(v.from)} – ${dmy(v.to)}`}</b>{v.live && <span className="ml-1.5 text-[#15803d]">● live</span>}</>}
        actions={
          <button type="button" onClick={() => pdf.current?.contentWindow?.print()} className="a-btn">
            <Icon name="doc" className="size-4" />
            PDF
          </button>
        }
        phoneAction={
          <button type="button" onClick={() => pdf.current?.contentWindow?.print()} aria-label="Save as PDF" className="grid size-10 place-items-center rounded-[10px] border border-[#ebe8e3] bg-white">
            <Icon name="doc" />
          </button>
        }
      />

      {/* Dates */}
      <div className="mb-3 flex flex-col gap-2">
        <div className="a-scrollx -mx-4 px-4 lg:mx-0 lg:px-0">
          {quick.map(([label, f, t]) => (
            <button key={label} type="button" onClick={() => { setCustom(false); go(f, t); }} className={cx('a-chip', !custom && v.from === f && v.to === t && 'a-chip-on')}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setCustom(!custom)} className={cx('a-chip', (custom || !onQuick) && 'a-chip-on')}>
            <Icon name="cal" className="size-4" />
            Other dates
          </button>
          <button type="button" disabled={loading} onClick={() => { setLoading(true); router.refresh(); }} className="a-chip">
            {loading ? <span className="inline-block size-4 animate-spin rounded-full border-2 border-[#ebe8e3] border-t-[#9a3412]" /> : '↻'} Refresh
          </button>
        </div>
        {(custom || !onQuick) && (
          <form
            className="a-card flex flex-wrap items-end gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (start && end) go(start <= end ? start : end, start <= end ? end : start);
            }}
          >
            <label className="min-w-[140px] flex-1">
              <span className="a-label">From</span>
              <input type="date" value={start} max={today} onChange={(e) => setStart(e.target.value)} className="a-input" />
            </label>
            <label className="min-w-[140px] flex-1">
              <span className="a-label">To</span>
              <input type="date" value={end} max={today} onChange={(e) => setEnd(e.target.value)} className="a-input" />
            </label>
            <button type="submit" className="a-btn a-btn-pri h-11">Show</button>
          </form>
        )}
      </div>

      <nav className="a-tabs -mx-4 px-4 lg:mx-0 lg:px-0">
        {TABS.map(([k, label]) => (
          <a key={k} href={`#${k}`} onClick={(e) => { e.preventDefault(); setTab(k); }} className={tab === k ? 'a-on' : ''}>
            {label}
          </a>
        ))}
      </nav>

      <div className={cx('flex flex-col gap-3 transition-opacity lg:gap-[18px]', loading && 'opacity-50')}>
        {tab === 'ads' && <AdsTab v={v} />}
        {tab === 'sales' && <SalesTab v={v} />}
        {tab === 'profit' && <ProfitTab v={v} />}
        {tab === 'partners' && <PartnersTab v={v} />}
        {tab === 'links' && <LinksTab l={links} />}
        {tab === 'customers' && <CustomersTab v={v} onList={() => setList(true)} onLeads={() => setLeads(true)} />}
        {v.notes.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-[#a1a1aa]">
            {v.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
      </div>

      {/* The PDF in its own design, only for printing */}
      <iframe ref={pdf} title="PDF report" srcDoc={pdfHtml} aria-hidden tabIndex={-1} className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0" />
      {leads && <UnfinishedCheckouts onClose={() => setLeads(false)} />}
      {list && (
        <PastCustomersList
          onChanged={() => setTicked(true)}
          onClose={() => {
            setList(false);
            // a tick by hand changes the project numbers in the report
            if (ticked) (setTicked(false), setLoading(true), router.refresh());
          }}
        />
      )}
    </div>
  );
}

function Questions({ v }: { v: ReportView }) {
  if (!v.questions.length) return null;
  return (
    <Note tone="amber">
      <b>Questions for you</b>
      <ul className="mt-1 list-disc pl-5">
        {v.questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </Note>
  );
}

function AdsTab({ v }: { v: ReportView }) {
  const a = v.ads;
  const cpo = a.orders ? a.spend / a.orders : null;
  const after = a.profit === null ? null : a.profit - a.spend;
  return (
    <>
      <Questions v={v} />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6 lg:gap-3">
        <Kpi label="Ad spend" value={rp(a.spend)} note={`Meta ${rp(a.metaSpend)} · Google ${rp(a.googleSpend)}`} />
        {/* Owner 14 Nov: the Ads tab must show what the ads brought in (website orders from ads only, no resellers). */}
        <Kpi label="Sales from ads" value={rp(a.revenue)} note="paid website orders from ads" />
        <Kpi label="Orders from ads" value={num(a.orders)} note="paid" />
        <Kpi label="Cost per order" value={cpo === null ? '—' : rp(cpo)} note="ad spend ÷ orders from ads" />
        <Kpi label="Ad visitors" value={num(a.visitors)} note="people who opened the shop from an ad" />
        <div className="col-span-2 lg:col-span-1">
          {/* Owner 14 Nov: profit after ads instead of "sales per Rp1 of ads". */}
          <Kpi
            tone="brand"
            label="Profit after ads"
            value={after === null ? '—' : <span className={after >= 0 ? 'text-[#15803d]' : 'text-[#b91c1c]'}>{signed(after)}</span>}
            note={after === null ? 'HPP missing for a product' : 'ad orders: sales − product cost − ad spend'}
          />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr] lg:gap-[18px]">
        <SpendChart days={v.days} />
        <Funnel steps={v.funnel} />
      </div>
      <Card title={<>Campaigns <span className="ml-1 text-xs font-normal text-[#a1a1aa]">{range(v)}</span></>}>
        <div className="hidden lg:block">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Campaign', 'Status', 'Budget / day', 'Spend', 'Ad clicks', 'Orders', 'Cost / order', 'Sales', 'Profit after ads'].map((h, i) => (
                  <th key={h} className={cx('a-th', i >= 2 && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.campaigns.map((c) => {
                const after = c.profit === null ? null : c.profit - c.spend;
                return (
                  <tr key={c.id}>
                    <td className="a-td">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[#f3f1ed] px-1.5 py-0.5 text-[11.5px] font-semibold text-[#52525b]">{c.platform}</span>
                        <span className="font-semibold">{c.name}</span>
                      </div>
                      <div className="text-xs text-[#a1a1aa]">{c.what}</div>
                    </td>
                    <td className="a-td">{c.running ? <Pill tone="green">Running</Pill> : <Pill tone="gray">Off</Pill>}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{c.budget ? rp(c.budget) : '—'}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{rp(c.spend)}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{num(c.visits)}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{c.orders}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{c.orders ? rp(c.spend / c.orders) : '—'}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{rp(c.revenue)}</td>
                    <td className={cx('a-td whitespace-nowrap text-right font-semibold tabular-nums', after !== null && (after >= 0 ? 'text-[#15803d]' : 'text-[#b91c1c]'))}>{after === null ? '—' : signed(after)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 p-3 lg:hidden">
          {v.campaigns.map((c) => {
            const after = c.profit === null ? null : c.profit - c.spend;
            return (
              <div key={c.id} className="rounded-xl border border-[#ebe8e3] bg-white px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-[#f3f1ed] px-1.5 py-0.5 text-[11.5px] font-semibold text-[#52525b]">{c.platform}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                  {c.running ? <Pill tone="green">Running</Pill> : <Pill tone="gray">Off</Pill>}
                </div>
                {/* Phone: budget per day was only in the desktop table (owner 14 Nov). */}
                <div className="mt-1 text-xs text-[#71717a]">
                  Budget <b className="font-semibold text-[#15181b]">{c.budget ? `${rp(c.budget)}/day` : '—'}</b> · {c.what}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <Stat k="Spend" v={rp(c.spend)} />
                  <Stat k="Orders" v={String(c.orders)} />
                  <Stat k="Cost / order" v={c.orders ? rp(c.spend / c.orders) : '—'} />
                  <Stat k="Ad clicks" v={num(c.visits)} />
                  <Stat k="Sales" v={rp(c.revenue)} />
                  <Stat k="After ads" v={after === null ? '—' : signed(after)} tone={after === null ? undefined : after >= 0 ? 'good' : 'bad'} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <div className="a-k">{k}</div>
      <div className={cx('font-bold tabular-nums', tone === 'good' && 'text-[#15803d]', tone === 'bad' && 'text-[#b91c1c]')}>{v}</div>
    </div>
  );
}

/** Ad spend (bars) and sales from ads (line, website orders from ads only — owner 14 Nov) per day on one Rupiah scale, with a hover tooltip and a table. */
function SpendChart({ days }: { days: ReportView['days'] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the real width of its box, so the labels keep their size on a phone.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 500 ? 200 : 240;
  const L = 44;
  const B = 28;
  const T = 12;
  const max = Math.max(1, ...days.map((d) => Math.max(d.spend, d.adRevenue)));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => L + ((W - L - 12) / days.length) * (i + 0.5);
  const y = (n: number) => T + (H - T - B) * (1 - n / top);
  const bw = Math.min(28, ((W - L - 12) / days.length) * 0.45);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}jt` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const h = hover === null ? null : days[hover];
  return (
    <Card
      title="Ad spend vs sales from ads"
      right={
        <span className="flex items-center gap-3 text-xs font-normal text-[#52525b]">
          <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: SPEND }} />Ad spend</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-3.5 rounded" style={{ background: SALES }} />Sales from ads</span>
        </span>
      }
    >
      <div className="relative px-2 pb-2 pt-1 lg:px-4">
        <div ref={box} className="w-full" />
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto max-w-full" role="img" aria-label="Ad spend and sales from ads per day" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#f0ede8" strokeWidth={1} />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#a1a1aa">{short(t)}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const bh = Math.max(d.spend ? 2 : 0, y(0) - y(d.spend));
            return <rect key={d.date} x={x(i) - bw / 2} y={y(0) - bh} width={bw} height={bh} rx={4} fill={SPEND} opacity={hover === null || hover === i ? 1 : 0.55} />;
          })}
          <polyline points={days.map((d, i) => `${x(i)},${y(d.adRevenue)}`).join(' ')} fill="none" stroke={SALES} strokeWidth={2} strokeLinejoin="round" />
          {days.map((d, i) => (
            <circle key={d.date} cx={x(i)} cy={y(d.adRevenue)} r={hover === i ? 5.5 : 4} fill={hover === i ? SALES : '#fff'} stroke={SALES} strokeWidth={2} />
          ))}
          {days.map((d, i) => (
            <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill={i === days.length - 1 ? '#18181b' : '#a1a1aa'} fontWeight={i === days.length - 1 ? 700 : 400}>
              {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} stroke="#d4d4d8" strokeDasharray="3 3" />}
          {days.map((d, i) => (
            <rect key={d.date} x={x(i) - (W - L) / days.length / 2} y={0} width={(W - L) / days.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-2 rounded-lg border border-[#ebe8e3] bg-white px-3 py-2 text-xs shadow-md" style={{ left: `clamp(8px, calc(${(x(hover!) / W) * 100}% - 70px), calc(100% - 160px))` }}>
            <div className="mb-1 font-semibold">{dmy(h.date)}</div>
            <div className="flex justify-between gap-4"><span className="text-[#52525b]">Ad spend</span><b className="tabular-nums">{rp(h.spend)}</b></div>
            <div className="flex justify-between gap-4"><span className="text-[#52525b]">Sales from ads</span><b className="tabular-nums">{rp(h.adRevenue)}</b></div>
            <div className="flex justify-between gap-4"><span className="text-[#52525b]">Profit</span><b className={cx('tabular-nums', h.adProfit !== null && (h.adProfit >= 0 ? 'text-[#15803d]' : 'text-[#b91c1c]'))}>{h.adProfit === null ? '—' : signed(h.adProfit)}</b></div>
          </div>
        )}
        <details className="px-2 text-xs text-[#52525b]">
          <summary className="cursor-pointer py-1 font-semibold">Numbers per day</summary>
          <table className="mb-1 w-full">
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-[#f3f1ed]">
                  <td className="py-1">{dmy(d.date)}</td>
                  <td className="py-1 text-right tabular-nums">spend {rp(d.spend)}</td>
                  <td className="py-1 text-right tabular-nums">from ads {rp(d.adRevenue)}</td>
                  <td className={cx('py-1 text-right tabular-nums', d.adProfit !== null && (d.adProfit >= 0 ? 'text-[#15803d]' : 'text-[#b91c1c]'))}>{d.adProfit === null ? '—' : signed(d.adProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </Card>
  );
}

function niceStep(max: number): number {
  const raw = max / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? p * 10;
}

function Funnel({ steps }: { steps: ReportView['funnel'] }) {
  const first = steps[0]?.n ?? 0;
  let worst: { i: number; lost: number } | null = null;
  steps.forEach((s, i) => {
    if (i === 0 || !steps[i - 1].n) return;
    const lost = 1 - s.n / steps[i - 1].n;
    if (!worst || lost > worst.lost) worst = { i, lost };
  });
  const w = worst as { i: number; lost: number } | null;
  return (
    <Card title="Where ad visitors drop off">
      <div className="flex flex-col gap-3 p-4 lg:p-[18px]">
        {steps.map((s, i) => (
          <div key={s.label}>
            <div className="mb-1 flex text-[13px]">
              <span className="font-semibold">{s.label}</span>
              <span className="ml-auto tabular-nums">
                <b>{num(s.n)}</b>
                {i > 0 && <span className="ml-1.5 text-[#a1a1aa]">{pct(s.n, steps[i - 1].n)}</span>}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-md bg-[#f3f1ed]">
              <div className="h-full rounded-md" style={{ width: `${first ? Math.max(s.n ? 2 : 0, (s.n / first) * 100) : 0}%`, background: '#e6cdb8' }} />
            </div>
          </div>
        ))}
        {w && first > 0 && (
          <Note tone="amber">
            Biggest drop: {steps[w.i - 1].label.toLowerCase()} → {steps[w.i].label.toLowerCase()}. {Math.round(w.lost * 100)}% stop here.
          </Note>
        )}
        {!first && <p className="text-sm text-[#a1a1aa]">No ad visitors in these days.</p>}
      </div>
    </Card>
  );
}

function SalesTab({ v }: { v: ReportView }) {
  const s = v.sales;
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5 lg:gap-3">
        <Kpi label="Paid website orders" value={num(s.orders)} note={`${num(s.boxes)} boxes`} />
        <Kpi tone="brand" label="Sales" value={rp(s.revenue)} note="paid by customers" />
        <Kpi label="Average order" value={s.orders ? rp(s.revenue / s.orders) : '—'} />
        <Kpi label="Discounts given" value={rp(s.discount)} note="vouchers + first-order" />
        <div className="col-span-2 lg:col-span-1">
          <Kpi label="New accounts" value={num(s.newAccounts)} note={`${s.unpaid} placed, not paid yet`} />
        </div>
      </div>
      <Card title={<>Paid orders <span className="ml-1 text-xs font-normal text-[#a1a1aa]">{range(v)}</span></>} right={<Link href="/orders" className="text-[13px] font-semibold text-[#9a3412]">All orders</Link>}>
        {v.orders.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#a1a1aa]">No paid website orders in these days.</p>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {v.orders.map((o) => (
              <div key={o.orderId} className="flex items-start gap-3 rounded-xl border border-[#ebe8e3] bg-white px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-semibold tabular-nums">#{o.orderId}</span>
                    <span className="flex items-center gap-1 text-xs text-[#52525b]"><i className="inline-block size-2 rounded-full" style={{ background: o.color }} />{o.source}</span>
                  </div>
                  <div className="text-[13px] text-[#52525b]">{o.items}</div>
                  <div className="text-xs text-[#a1a1aa]">{o.city}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold tabular-nums">{rp(o.paid)}</div>
                  {o.discount > 0 && <div className="text-xs text-[#15803d]">−{rp(o.discount)} off</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-[18px]">
        <Card title="Where visitors came from">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Source', 'Visits', 'Cart', 'Checkout', 'Paid'].map((h, i) => (
                    <th key={h} className={cx('a-th', i > 0 && 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.sources.map((r) => (
                  <tr key={r.label}>
                    <td className="a-td">{r.label}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{num(r.visits)}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{num(r.addToCart)}</td>
                    <td className="a-td whitespace-nowrap text-right tabular-nums">{num(r.checkout)}</td>
                    <td className="a-td whitespace-nowrap text-right font-semibold tabular-nums">{r.paid}</td>
                  </tr>
                ))}
                {v.sources.length === 0 && (
                  <tr><td colSpan={5} className="a-td text-center text-[#a1a1aa]">No visits yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Where all visitors stopped">
          <div className="flex flex-col gap-1.5 p-4 lg:p-[18px]">
            {v.journey.map((s) => (
              <div key={s.label} className="flex items-baseline gap-2 text-[13px]">
                <span className="min-w-0 flex-1">{s.label}</span>
                <b className="tabular-nums">{num(s.sessions)}</b>
                <span className="w-16 text-right text-xs text-[#a1a1aa]">{s.lostPct === null ? '' : `−${Math.round(s.lostPct)}%`}</span>
              </div>
            ))}
            {v.journeyRead && <Note className="mt-2">{v.journeyRead}</Note>}
            {v.exits.length > 0 && (
              <div className="mt-2">
                <div className="a-label">Page they left on</div>
                {v.exits.map((e) => (
                  <div key={e.page} className="flex text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{e.page}</span>
                    <span className="tabular-nums text-[#52525b]">{num(e.sessions)} · {Math.round(e.pct)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function ProfitTab({ v }: { v: ReportView }) {
  const before = v.orders.some((o) => o.profit === null) ? null : v.orders.reduce((s, o) => s + (o.profit ?? 0), 0);
  const after = before === null ? null : before - v.ads.spend;
  const wAfter = v.week.profit === null ? null : v.week.profit - v.week.spend;
  const tAfter = v.total.profit === null ? null : v.total.profit - v.total.spend;
  const tone = (n: number | null) => (n === null ? '' : n >= 0 ? 'text-[#15803d]' : 'text-[#b91c1c]');
  return (
    <>
      <Questions v={v} />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        <Kpi label="Sales" value={rp(v.sales.revenue)} note={`${v.sales.orders} paid orders`} />
        <Kpi label="Profit before ads" value={money(before)} note="after HPP, courier and payment fee" />
        <Kpi label="Ad spend" value={rp(v.ads.spend)} note="Meta + Google" />
        <Kpi tone="brand" label="Profit after ads" value={<span className={tone(after)}>{after === null ? '—' : signed(after)}</span>} note={after === null ? 'HPP missing for a product' : 'what is left'} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-[18px]">
        <Card title={<>Meta budget week <span className="ml-1 text-xs font-normal text-[#a1a1aa]">{dmy(v.week.from)} – {dmy(v.week.to)}</span></>}>
          <div className="grid grid-cols-2 gap-3 p-4 text-sm lg:p-[18px]">
            <Stat k="Ad spend" v={rp(v.week.spend)} />
            <Stat k="Paid orders" v={String(v.week.orders)} />
            <Stat k="Sales" v={rp(v.week.revenue)} />
            <Stat k="Profit after ads" v={wAfter === null ? '—' : signed(wAfter)} tone={wAfter === null ? undefined : wAfter >= 0 ? 'good' : 'bad'} />
            {v.week.budget !== null && <p className="col-span-2 text-xs text-[#a1a1aa]">Meta budget now {rp(v.week.budget)}/day = up to {rp(v.week.budget * 7)} this week.</p>}
          </div>
        </Card>
        <Card title={<>Since the ads started <span className="ml-1 text-xs font-normal text-[#a1a1aa]">{v.total.since ? dmy(v.total.since) : '—'}</span></>}>
          <div className="grid grid-cols-2 gap-3 p-4 text-sm lg:p-[18px]">
            <Stat k="Ad spend" v={rp(v.total.spend)} />
            <Stat k="Paid orders" v={String(v.total.orders)} />
            <Stat k="Sales" v={rp(v.total.revenue)} />
            <Stat k="Profit after ads" v={tAfter === null ? '—' : signed(tAfter)} tone={tAfter === null ? undefined : tAfter >= 0 ? 'good' : 'bad'} />
          </div>
        </Card>
      </div>
      <Card title={<>Profit per order <span className="ml-1 text-xs font-normal text-[#a1a1aa]">{range(v)}</span></>}>
        {v.orders.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#a1a1aa]">No paid website orders in these days.</p>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {['Order', 'Paid', 'HPP', 'Courier', 'Payment fee', 'Profit before ads'].map((h, i) => (
                      <th key={h} className={cx('a-th', i > 0 && 'text-right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.orders.map((o) => (
                    <tr key={o.orderId}>
                      <td className="a-td">
                        <div className="font-semibold tabular-nums">#{o.orderId}</div>
                        <div className="text-xs text-[#a1a1aa]">{o.items}</div>
                      </td>
                      <td className="a-td whitespace-nowrap text-right tabular-nums">{rp(o.paid)}</td>
                      <td className="a-td whitespace-nowrap text-right tabular-nums">{money(o.hpp)}</td>
                      <td className="a-td whitespace-nowrap text-right tabular-nums">{o.courierMissing ? <span className="font-semibold text-[#b91c1c]">not entered</span> : money(o.courierFee)}</td>
                      <td className="a-td whitespace-nowrap text-right tabular-nums">{rp(o.paymentFee)}</td>
                      <td className={cx('a-td whitespace-nowrap text-right font-bold tabular-nums', tone(o.profit))}>{money(o.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 p-3 lg:hidden">
              {v.orders.map((o) => (
                <div key={o.orderId} className="rounded-xl border border-[#ebe8e3] bg-white px-3.5 py-3">
                  <div className="flex">
                    <span className="font-semibold tabular-nums">#{o.orderId}</span>
                    <b className={cx('ml-auto tabular-nums', tone(o.profit))}>{money(o.profit)}</b>
                  </div>
                  <div className="text-xs text-[#a1a1aa]">
                    paid {rp(o.paid)} · HPP {money(o.hpp)} · courier {o.courierMissing ? 'not entered' : money(o.courierFee)} · fee {rp(o.paymentFee)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function PartnersTab({ v }: { v: ReportView }) {
  const t = v.partners.reduce((s, p) => ({ orders: s.orders + p.orders, sales: s.sales + p.sales, commission: s.commission + p.commission }), { orders: 0, sales: 0, commission: 0 });
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3">
        <Kpi label="Orders through partners" value={num(t.orders)} note="affiliates + collabs" />
        <Kpi label="Their sales" value={rp(t.sales)} />
        <div className="col-span-2 lg:col-span-1">
          <Kpi tone="brand" label="Commission earned" value={rp(t.commission)} note="paid every Sunday" />
        </div>
      </div>
      <Card title={<>Partners <span className="ml-1 text-xs font-normal text-[#a1a1aa]">{range(v)}</span></>} right={<span className="flex gap-3 text-[13px] font-semibold"><Link href="/website-affiliates" className="text-[#9a3412]">Affiliates</Link><Link href="/website-collabs" className="text-[#9a3412]">Collabs</Link></span>}>
        {v.partners.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#a1a1aa]">No orders through affiliates or collabs in these days.</p>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {v.partners.map((p) => (
              <div key={`${p.kind}-${p.name}`} className="flex items-center gap-3 rounded-xl border border-[#ebe8e3] bg-white px-3.5 py-3">
                <span className="rounded-md bg-[#f3f1ed] px-1.5 py-0.5 text-[11.5px] font-semibold text-[#52525b]">{p.kind}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-xs text-[#a1a1aa]">{p.orders} order{p.orders === 1 ? '' : 's'} · {p.boxes} box{p.boxes === 1 ? '' : 'es'} · {rp(p.sales)}</div>
                </div>
                <div className="text-right">
                  <div className="a-k">Commission</div>
                  <b className="tabular-nums">{rp(p.commission)}</b>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function CustomersTab({ v, onList, onLeads }: { v: ReportView; onList: () => void; onLeads: () => void }) {
  const p = v.past;
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        <Kpi label="New accounts" value={num(v.sales.newAccounts)} note="signed up in these days" />
        <Kpi label="Placed, not paid" value={num(v.sales.unpaid)} note="orders waiting for payment" />
        {p && <Kpi tone="brand" label="Past customers back" value={`${num(p.completed)} / ${num(p.inArea)}`} note={`${p.pct.toFixed(1)}% · goal ${p.goalPct}% by ${dmy(p.goalDay)}`} />}
        {p && <Kpi label="Win-back ad spend" value={rp(p.spend)} note="since the project started" />}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onList} className="a-btn a-btn-lg w-full sm:h-10 sm:flex-1"><Icon name="users" className="size-4" />Past customers list</button>
        <button type="button" onClick={onLeads} className="a-btn a-btn-lg w-full sm:h-10 sm:flex-1"><Icon name="cart" className="size-4" />Unfinished checkouts</button>
        <Link href="/website-customers" className="a-btn a-btn-lg w-full sm:h-10 sm:flex-1"><Icon name="users" className="size-4" />All customers</Link>
      </div>
      {p && (
        <Card title={<>Past customers who came back <span className="ml-1 text-xs font-normal text-[#a1a1aa]">{range(v)}</span></>}>
          <div className="px-4 py-3 lg:px-[18px]">
            <div className="mb-3 h-3 overflow-hidden rounded-md bg-[#f3f1ed]">
              <div className="h-full rounded-md bg-[#9a3412]" style={{ width: `${Math.min(100, (p.pct / p.goalPct) * 100)}%` }} />
            </div>
            <p className="mb-2 text-xs text-[#a1a1aa]">{p.pct.toFixed(1)}% of the {p.goalPct}% goal</p>
            {p.period.length === 0 ? (
              <p className="text-sm text-[#a1a1aa]">Nobody from the list ordered in these days.</p>
            ) : (
              p.period.map((c) => (
                <div key={c.orderId} className="mt-2 flex rounded-xl border border-[#ebe8e3] bg-white px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <b>{c.name}</b> · #{c.orderId} · {dmy(c.day)}
                  </span>
                  <span className="tabular-nums text-[#52525b]">{c.packs} pack{c.packs === 1 ? '' : 's'}{c.paid !== null ? ` · ${rp(c.paid)}` : ''}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      )}
    </>
  );
}

const wibTime = (ms: number) => {
  const d = new Date(ms + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/**
 * Opens the ad link on the website (owner: a button instead of the long link). jk_preview=1: the shop does not count
 * it as an ad visit nor tie a later order to that ad (MetaPixel.tsx).
 */
function OpenLink({ href }: { href: string }) {
  return (
    <a href={`${href}&jk_preview=1`} target="_blank" rel="noreferrer" className="a-btn a-btn-sm shrink-0">
      Open
    </a>
  );
}

/** Links & WhatsApp (owner 15 Nov): where each WhatsApp chat from the website came from, and every ad link in use. */
function LinksTab({ l }: { l: LinkLog }) {
  return (
    <>
      <Card title="WhatsApp chats from the website" right={<span className="text-xs font-normal text-[#a1a1aa]">last 14 days · newest first</span>}>
        <div className="px-4 pb-3 pt-1 text-xs text-[#71717a] lg:px-[18px]">
          Find a chat by the time it reached you (a few seconds after the tap). Messages sent from the website also end with the code letter.
        </div>
        {l.taps.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-[#a1a1aa] lg:px-[18px]">No WhatsApp taps yet.</p>
        ) : (
          <div className="flex flex-col">
            {l.taps.map((t) => (
              <div key={`${t.at}-${t.page}`} className="flex items-start gap-3 border-t border-[#f3f1ed] px-4 py-2.5 lg:px-[18px]">
                <span className="w-[86px] shrink-0 text-sm font-semibold tabular-nums">{wibTime(t.at)}</span>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#fdf3ea] text-sm font-bold text-[#9a3412]">#{t.code}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">{t.where}</div>
                  <div className="text-xs text-[#a1a1aa]">on {t.page ?? '/'}{t.button ? ` · ${t.button}` : ''}</div>
                </div>
                {t.link && <OpenLink href={t.link} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Ad & link tags people used" right={<span className="text-xs font-normal text-[#a1a1aa]">last 30 days</span>}>
        <div className="flex flex-col">
          {l.links.map((k) => (
            <div key={k.link} className="flex items-start gap-3 border-t border-[#f3f1ed] px-4 py-2.5 lg:px-[18px]">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#fdf3ea] text-sm font-bold text-[#9a3412]">#{k.code}</span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">{k.where}</div>
                <div className="text-xs text-[#a1a1aa]">{num(k.people)} visitors · last {wibTime(k.lastAt)}</div>
              </div>
              <OpenLink href={k.link} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="WhatsApp code letters">
        <div className="grid gap-1.5 px-4 pb-4 pt-1 text-sm sm:grid-cols-2 lg:px-[18px]">
          {l.legend.map(([c, d]) => (
            <div key={c} className="flex items-center gap-2">
              <b className="w-7 text-[#9a3412]">#{c}</b>
              <span className="text-[#52525b]">{d}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
