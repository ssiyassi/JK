import Link from 'next/link';
import type { ReactNode } from 'react';

/* Shared building blocks of the admin look (see design/admin-redesign). Server-safe: no hooks here. */

/** DD/MM/YYYY for a moment in time, Jakarta time. */
export function fmtDate(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' });
}
/** DD/MM/YYYY HH:MM, Jakarta time. */
export function fmtDateTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  const d = new Date(ms);
  const date = fmtDate(ms);
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time}`;
}
/** Delivery days are stored as midnight UTC: DD/MM/YYYY without moving the day. */
export function fmtDay(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'no date yet';
  return new Date(ms).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/** Page title block. On a phone it becomes the sticky top bar (title + optional back link + one action). */
export function PageHeader({
  title,
  sub,
  actions,
  back,
  crumb,
  phoneAction,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  crumb?: ReactNode;
  phoneAction?: ReactNode;
}) {
  return (
    <>
      <div className="lg:hidden sticky top-0 z-20 -mx-4 mb-2 flex items-center gap-2.5 bg-[#f6f5f2]/95 px-4 py-3 backdrop-blur">
        {back && (
          <Link href={back.href} aria-label={`Back to ${back.label}`} className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-[#ebe8e3] bg-white">
            <Icon name="left" />
          </Link>
        )}
        <h1 className={cx('min-w-0 flex-1 truncate font-bold tracking-tight', back ? 'text-center text-base' : 'text-xl')}>{title}</h1>
        {phoneAction ?? (back ? <span className="size-10 shrink-0" /> : null)}
      </div>
      <div className="mb-4 hidden items-end gap-3 lg:flex">
        <div className="min-w-0">
          {(crumb || back) && (
            <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#a1a1aa]">
              {crumb ?? (
                <>
                  <Link href={back!.href} className="hover:text-[#52525b]">{back!.label}</Link>
                  <Icon name="right" className="size-3.5" />
                  <span>{title}</span>
                </>
              )}
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {sub && <p className="mt-0.5 text-[#52525b]">{sub}</p>}
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
    </>
  );
}

/** Page tabs (links). */
export function Tabs({ items, active }: { items: { href: string; label: string }[]; active: string }) {
  return (
    <nav className="a-tabs -mx-4 px-4 lg:mx-0 lg:px-0">
      {items.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? 'a-on' : ''}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export const STOCK_TABS = [
  { href: '/inventory', label: 'Overview' },
  { href: '/inventory/production', label: 'Add production' },
  { href: '/inventory/movement', label: 'Stock changes' },
  { href: '/inventory/adjustment', label: 'Fix a count' },
  { href: '/inventory/ingredients', label: 'Ingredients' },
  { href: '/inventory/hpp', label: 'Cost & recipes 🔒' },
];
export const PROMO_TABS = [
  { href: '/website-vouchers', label: 'Vouchers' },
  { href: '/website-bundles', label: 'Bundles' },
  { href: '/website-affiliates', label: 'Affiliates' },
  { href: '/website-collabs', label: 'Collabs' },
  { href: '/website-payday', label: 'Payday' },
  { href: '/website-banners', label: 'Banners' },
  { href: '/website-photos', label: 'Promo photos' },
];
export const CUSTOMER_TABS = [
  { href: '/website-customers', label: 'Customers' },
  { href: '/website-customers/checkouts', label: 'Unfinished checkouts' },
];

export function Card({ children, className, title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <section className={cx('a-card', className)}>
      {title && (
        <div className="a-chead">
          <span className="min-w-0 flex-1">{title}</span>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, note, tone }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: 'brand' }) {
  return (
    <div className={cx('a-card px-4 py-3.5', tone === 'brand' && 'border-[#f6dcc4] bg-[#fdf3ea]')}>
      <div className="text-[12.5px] font-medium text-[#52525b]">{label}</div>
      <div className={cx('my-1 text-[18px] font-bold tracking-tight tabular-nums lg:text-[21px]', tone === 'brand' && 'text-[#9a3412]')}>{value}</div>
      {note && <div className="text-xs text-[#a1a1aa]">{note}</div>}
    </div>
  );
}

const TONES = {
  amber: 'bg-[#fff7e6] text-[#b45309]',
  blue: 'bg-[#eff6ff] text-[#1d4ed8]',
  violet: 'bg-[#f5f3ff] text-[#6d28d9]',
  green: 'bg-[#ecfdf3] text-[#15803d]',
  gray: 'bg-[#f4f4f5] text-[#71717a]',
  red: 'bg-[#fef2f2] text-[#b91c1c]',
} as const;
export type Tone = keyof typeof TONES;
export function Pill({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('a-pill', TONES[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Note({ tone = 'gray', children, className }: { tone?: 'amber' | 'blue' | 'green' | 'gray' | 'red'; children: ReactNode; className?: string }) {
  const t = { amber: 'bg-[#fff7e6] text-[#7c4a03]', blue: 'bg-[#eff6ff] text-[#1e3a8a]', green: 'bg-[#ecfdf3] text-[#14532d]', gray: 'bg-[#f3f1ed] text-[#52525b]', red: 'bg-[#fef2f2] text-[#991b1b]' }[tone];
  return <div className={cx('rounded-xl px-3.5 py-2.5 text-[13px]', t, className)}>{children}</div>;
}

/** Product label colours, always in the order Babi Manis, Babi Asin, Sapi Manis, Sapi Asin. */
export const PRODUCT_COLORS = ['#c2410c', '#9a3412', '#b45309', '#78350f', '#57534e', '#44403c'];

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bag: 'M6 7h12l1 13H5zM9 7V6a3 3 0 0 1 6 0v1',
  box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  printer: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
  truck: 'M1 4h14v12H1zM15 9h4l3 3v4h-7M5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h.01',
  cart: 'M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L21.5 7H6M9 21h.01M18 21h.01',
  right: 'M9 18l6-6-6-6',
  left: 'M15 18l-6-6 6-6',
  down: 'M6 9l6 6 6-6',
  check: 'M20 6 9 17l-5-5',
  checkc: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  x: 'M18 6 6 18M6 6l12 12',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2',
  pin: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  cal: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  filter: 'M3 5h18M6 12h12M10 19h4',
  dots: 'M12 6h.01M12 12h.01M12 18h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  money: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 12h.01M18 12h.01',
  img: 'M3 4h18v16H3zM3 16l5-5 5 5M14 14l2-2 5 5M15.5 8.5h.01',
  gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
};
const WA_PATH =
  'M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43zm8.03-17.46A11.28 11.28 0 0 0 12.05.72C5.79.72.7 5.8.7 12.06c0 2 .52 3.95 1.52 5.67L.6 23.28l5.68-1.49a11.3 11.3 0 0 0 5.43 1.38h.01c6.26 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.02z';

export function Icon({ name, className }: { name: string; className?: string }) {
  if (name === 'wa') {
    return (
      <svg viewBox="0 0 24 24" className={cx('size-[18px] shrink-0 fill-current', className)} aria-hidden="true">
        <path d={WA_PATH} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cx('size-[18px] shrink-0 fill-none stroke-current', className)} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.dots} />
    </svg>
  );
}

/** Green square WhatsApp icon link (the owner's choice for every WhatsApp action). */
export function WaIcon({ href, title, round, size = 'md' }: { href: string; title: string; round?: boolean; size?: 'md' | 'lg' }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      aria-label={title}
      className={cx('grid shrink-0 place-items-center bg-[#16a34a] text-white hover:bg-[#15803d]', size === 'lg' ? 'size-11' : 'size-10', round ? 'rounded-full' : 'rounded-[10px]')}
    >
      <Icon name="wa" className="size-5" />
    </a>
  );
}

/** Feedback line under an action. */
export function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <div role="status" className={cx('rounded-xl border px-4 py-3 text-sm', message.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800')}>
      {message.text}
    </div>
  );
}
