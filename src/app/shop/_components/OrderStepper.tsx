import { shopAsset } from '@/lib/shop/catalog';

/**
 * Vertical order timeline (Figma "Order Stepper Component"): completed steps are filled with a check, the current step
 * is outlined with its own icon, later steps are grey. Every step reached shows the time the order ENTERED it.
 * `current` is the step the order is in (0–3); `finished` means it reached the last step.
 */
interface Step {
  title: string;
  text: string;
  icon: string; // grey (pending) icon
  activeIcon: string; // brand-coloured icon for the current step
  iconSize: [number, number];
}

const STEPS: Step[] = [
  { title: 'Menunggu Pembayaran', text: 'Kami menunggu pembayaran anda', icon: 'step-pay', activeIcon: 'step-pay', iconSize: [20, 20] },
  { title: 'Pesanan Diproses', text: 'Kami sedang menyiapkan pesanan anda', icon: 'step-process', activeIcon: 'step-process-active', iconSize: [18, 18] },
  { title: 'Pesanan Dalam Perjalanan', text: 'Kurir sedang menuju ke lokasi Anda.', icon: 'step-ship', activeIcon: 'step-ship-active', iconSize: [15, 12] },
  { title: 'Sampai di Tujuan', text: 'Pesanan telah diserahkan kepada Anda.', icon: 'step-home', activeIcon: 'step-home', iconSize: [13.5, 12] },
];

const RING = 'shadow-[0px_10px_15px_-3px_#ebd6d0,0px_4px_6px_-4px_#ebd6d0]';

/** 26/09/2026  08:15 WIB */
function formatWib(ms: number): string {
  const d = new Date(ms + 7 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} WIB`;
}

function Icon({ name, size }: { name: string; size: [number, number] }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={shopAsset(`/icons/${name}.svg`)} alt="" width={size[0]} height={size[1]} className="shrink-0" />;
}

export default function OrderStepper({
  current,
  finished,
  times,
}: {
  current: 0 | 1 | 2 | 3;
  finished: boolean;
  times: (number | null)[]; // when the order entered each step
}) {
  return (
    <ol className="bg-white border border-[#f3f4f6] rounded-2xl p-[25px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]">
      {STEPS.map((step, i) => {
        const done = i < current || finished;
        const active = i === current && !finished;
        const last = i === STEPS.length - 1;
        const finalStep = last && finished; // delivered: filled circle with the home icon instead of a check
        const time = done || active ? times[i] : null;
        return (
          <li key={step.title} className={`relative flex gap-4 items-start ${last ? '' : 'pb-6'}`}>
            <span
              className={`relative size-8 shrink-0 rounded-2xl border-2 flex items-center justify-center ${
                done ? 'bg-[#9a3412] border-[#9a3412]' : active ? 'bg-white border-[#9a3412]' : 'bg-white border-[#e5e7eb]'
              } ${active || finalStep ? RING : ''}`}
            >
              {finalStep ? (
                <Icon name="step-home-done" size={[13.5, 12]} />
              ) : done ? (
                <Icon name="step-check" size={[10.5, 12]} />
              ) : (
                <Icon name={active ? step.activeIcon : step.icon} size={step.iconSize} />
              )}
            </span>
            {!last && (
              // Line to the next step: brand colour once the next step has been reached.
              <span className={`absolute left-[15px] top-8 -bottom-0 w-0.5 ${i < current || finished ? 'bg-[#9a3412]' : 'bg-[#e5e7eb]'}`} aria-hidden />
            )}
            <div className="flex flex-col gap-1 min-w-0">
              <p className={`text-sm leading-5 font-bold ${done || active ? 'text-[#111827]' : 'text-[#9ca3af]'}`}>{step.title}</p>
              <p className={`text-xs leading-4 ${done ? 'text-[#6b7280]' : active ? 'font-medium text-[#4b5563]' : 'text-[#d1d5db]'}`}>{step.text}</p>
              {time && <p className="pt-1 text-[10px] leading-[15px] text-[#9ca3af] whitespace-pre">{formatWib(time)}</p>}
              {active && <span className="sr-only">(langkah saat ini)</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
