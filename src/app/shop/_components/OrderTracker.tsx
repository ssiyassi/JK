import { formatDeliveryDate, shopAsset } from '@/lib/shop/catalog';

/**
 * Phone order tracker (app layout, owner 2026-11-12, replaces the brown vertical stepper on phones): status pill, the
 * date in big type, a 4-part green progress bar with the four steps, one sentence about now, and the status history.
 * Pattern from delivery apps (Uber Eats, Apple, Just Eat: ETA first, 4 stages, say less).
 */
const STEPS = [
  { short: 'Dibayar', title: 'Menunggu Pembayaran', now: 'Kami menunggu pembayaran Anda.', icon: 'step-pay', history: 'Pesanan dibuat' },
  { short: 'Diproses', title: 'Pesanan Diproses', now: 'Pesanan Anda sedang kami siapkan.', icon: 'step-process-active', history: 'Pembayaran diterima' },
  { short: 'Dalam Perjalanan', title: 'Pesanan Dalam Perjalanan', now: 'Kurir sedang menuju alamat Anda. Simpan di freezer begitu sampai ya!', icon: 'step-ship-active', history: 'Dalam perjalanan' },
  { short: 'Sampai di Tujuan', title: 'Sampai di Tujuan', now: 'Pesanan telah diserahkan kepada Anda. Selamat menikmati!', icon: 'step-home', history: 'Sampai di tujuan' },
];

const when = (ms: number) =>
  new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function OrderTracker({
  orderId,
  current,
  finished,
  times,
  deliveryDate,
  paid,
  trackingUrl,
  photo,
}: {
  orderId: string;
  current: 0 | 1 | 2 | 3;
  finished: boolean;
  times: (number | null)[];
  deliveryDate: number | null;
  paid: boolean;
  trackingUrl: string | null;
  photo: string | null;
}) {
  // "Paid" is step 0 done: the bar counts finished steps (paid, prepared, on the way, delivered).
  const reached = finished ? 4 : current;
  const pill = finished
    ? { text: 'Sampai di Tujuan', cls: 'bg-[#ecfdf3] text-[#15803d]', dot: 'bg-[#22c55e]' }
    : current === 0
      ? { text: 'Menunggu Pembayaran', cls: 'bg-[#fff7ed] text-[#c2410c]', dot: 'bg-[#f97316]' }
      : { text: STEPS[current].title.replace('Pesanan ', ''), cls: 'bg-[#ecfdf3] text-[#15803d]', dot: 'bg-[#22c55e]' };
  const eta = finished
    ? { label: 'Diterima', value: times[3] ? new Date(times[3]).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long' }) : 'Selesai' }
    : deliveryDate !== null
      ? { label: paid ? 'Perkiraan tiba' : 'Dikirim setelah pembayaran, pada', value: formatDeliveryDate(deliveryDate) }
      : null;
  const history = STEPS.map((s, i) => ({ text: i === 0 ? s.history : s.history, at: times[i] })).filter((h, i) => h.at !== null && (i <= current || finished));

  return (
    <div className="sm:hidden flex flex-col gap-3">
      <section className="rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${pill.cls}`}>
            <span className={`size-2 rounded-full ${pill.dot}`} aria-hidden />
            {pill.text}
          </span>
          <span className="text-[11px] text-[#6b7280] tabular-nums">#{orderId}</span>
        </div>
        {eta && (
          <p className="mt-3 text-[13px] text-[#4b5563]">
            {eta.label}
            <b className="mt-0.5 block text-[22px] leading-7 tracking-[-0.3px] text-[#111827]">{eta.value}</b>
          </p>
        )}
        <div className="mt-4 grid grid-cols-4 gap-1.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-1.5 rounded-full"
              style={{ background: i < reached ? '#22a052' : i === reached && !finished ? 'linear-gradient(90deg,#22a052 50%,#efe8e1 50%)' : '#efe8e1' }}
            />
          ))}
        </div>
        <ol className="mt-3 grid grid-cols-4 text-center">
          {STEPS.map((s, i) => {
            const done = i < reached;
            const now = i === reached && !finished;
            return (
              <li key={s.short} className="flex flex-col items-center gap-1.5">
                <span
                  className={`size-[38px] rounded-full grid place-items-center ${
                    done ? 'bg-[#22a052]' : now ? 'bg-[#fdf3ea] shadow-[0_0_0_2px_#9a3412,0_0_0_6px_rgba(154,52,18,0.12)]' : 'bg-[#f3f4f6]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shopAsset(`/icons/${done ? 'step-check' : now ? s.icon : i === 1 ? 'step-process' : i === 2 ? 'step-ship' : i === 3 ? 'step-home' : 'step-pay'}.svg`)}
                    alt=""
                    width={done ? 12 : 18}
                    height={done ? 13 : 18}
                    className={done ? 'h-[13px] w-3' : 'h-[18px] w-[18px] object-contain'}
                  />
                </span>
                <span className={`text-[11px] font-semibold leading-tight ${done ? 'text-[#15803d]' : now ? 'font-extrabold text-[#9a3412]' : 'text-[#9ca3af]'}`}>
                  {i === 0 && now ? 'Bayar' : s.short}
                </span>
                {now && <span className="sr-only">(langkah saat ini)</span>}
              </li>
            );
          })}
        </ol>
        <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-[#faf9f6] px-3 py-2.5 text-[12.5px] text-[#111827]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo} alt="" className="size-10 shrink-0 rounded-[10px] object-cover" />}
          <span>{STEPS[finished ? 3 : current].now}</span>
        </div>
        {trackingUrl && (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex h-[42px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[#9a3412] text-sm font-bold text-[#9a3412]"
          >
            🚚 Lacak kurir
          </a>
        )}
      </section>

      {history.length > 0 && (
        <section className="rounded-[18px] bg-white p-4 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
          <h2 className="text-sm font-bold text-[#111827]">Riwayat status</h2>
          <ol className="mt-3 flex flex-col">
            {[...history].reverse().map((h, i, all) => (
              <li key={h.text} className="relative pb-3.5 pl-6 last:pb-0">
                {i < all.length - 1 && <span className="absolute left-[5px] top-[18px] -bottom-0.5 w-0.5 bg-[#d7efe0]" aria-hidden />}
                <span className={`absolute left-0 top-1 size-3 rounded-full bg-[#22a052] ${i === 0 ? 'shadow-[0_0_0_4px_rgba(34,160,82,0.2)]' : ''}`} aria-hidden />
                <p className="text-[13px] font-semibold text-[#111827]">{h.text}</p>
                <p className="text-[11.5px] text-[#9ca3af]">{when(h.at!)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
