'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, cx } from './admin/ui';

type Item = { href: string; label: string; icon: string; also?: string[] };

// Main menu (desktop sidebar). Sub-pages keep their parent highlighted through `also`.
const MAIN: Item[] = [
  { href: '/', label: 'Today', icon: 'home' },
  { href: '/orders', label: 'Orders', icon: 'bag', also: ['/website-orders'] },
  { href: '/inventory', label: 'Stock', icon: 'box' },
  { href: '/website-customers', label: 'Customers', icon: 'users' },
  { href: '/website-vouchers', label: 'Promotions', icon: 'tag', also: ['/website-bundles', '/website-affiliates', '/website-collabs', '/website-payday', '/website-banners', '/website-photos'] },
  { href: '/marketing-report', label: 'Reports', icon: 'chart' },
];
const RESELLER: Item[] = [
  { href: '/my-resellers', label: 'My resellers', icon: 'users', also: ['/resellers/new'] },
  { href: '/resellers', label: 'Reseller sales', icon: 'chart' },
];
const SETUP: Item[] = [
  { href: '/website-products', label: 'Products', icon: 'img' },
  { href: '/store-days-off', label: 'Store days off', icon: 'cal' },
];

function isActive(path: string, item: Item): boolean {
  if (item.href === '/') return path === '/';
  if (item.also?.some((a) => path === a || path.startsWith(`${a}/`))) return true;
  if (item.href === '/resellers' && path.startsWith('/resellers/new')) return false;
  return path === item.href || path.startsWith(`${item.href}/`);
}

const SPIN = 'inline-block animate-spin rounded-full border-2 border-[#ebe8e3] border-t-[#9a3412]';

/** Small spinner inside a menu link while its page is loading (so a tap on a slow page like Reports shows it is working). */
function Pending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" aria-label="Loading" className={cx(SPIN, 'size-4 shrink-0', className)} /> : null;
}

/** Tab bar icon that turns into a spinner while that tab's page loads. */
function TabIcon({ icon }: { icon: string }) {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" aria-label="Loading" className={cx(SPIN, 'm-[2px] size-[18px]')} /> : <Icon name={icon} className="size-[22px]" />;
}

function NavLink({ item, path }: { item: Item; path: string }) {
  const on = isActive(path, item);
  return (
    <Link
      href={item.href}
      className={cx(
        'flex items-center gap-[11px] rounded-[9px] px-2.5 py-2 text-[13.5px]',
        on ? 'bg-[#fdf3ea] font-semibold text-[#9a3412]' : 'font-medium text-[#52525b] hover:bg-[#f3f1ed]',
      )}
    >
      <Icon name={item.icon} />
      {item.label}
      <Pending className="ml-auto" />
    </Link>
  );
}

function Head({ children }: { children: string }) {
  return <div className="px-2.5 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-[.06em] text-[#a1a1aa]">{children}</div>;
}

// Phone: bottom tab bar + the "More" sheet with every other page.
const TABS: { href: string; label: string; icon: string; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Today', icon: 'home', match: (p) => p === '/' },
  { href: '/orders', label: 'Orders', icon: 'bag', match: (p) => p.startsWith('/orders') || p.startsWith('/website-orders') },
  { href: '/inventory', label: 'Stock', icon: 'box', match: (p) => p.startsWith('/inventory') },
  { href: '/marketing-report', label: 'Reports', icon: 'chart', match: (p) => p.startsWith('/marketing-report') },
];
const MORE: { title: string; items: Item[] }[] = [
  {
    title: 'Customers & promotions',
    items: [
      { href: '/website-customers', label: 'Customers', icon: 'users' },
      { href: '/website-customers/checkouts', label: 'Unfinished checkouts', icon: 'cart' },
      { href: '/website-vouchers', label: 'Vouchers', icon: 'tag' },
      { href: '/website-bundles', label: 'Bundles', icon: 'gift' },
      { href: '/website-affiliates', label: 'Affiliates', icon: 'link' },
      { href: '/website-collabs', label: 'Collabs', icon: 'star' },
      { href: '/website-payday', label: 'Payday promo', icon: 'gift' },
    ],
  },
  { title: 'Reseller', items: RESELLER },
  {
    title: 'Shop setup',
    items: [
      { href: '/website-products', label: 'Products', icon: 'img' },
      { href: '/website-banners', label: 'Banners', icon: 'img' },
      { href: '/website-photos', label: 'Promo photos', icon: 'img' },
      { href: '/store-days-off', label: 'Store days off', icon: 'cal' },
    ],
  },
];

/** Admin menu: a left sidebar + top bar on desktop, a bottom tab bar + "More" sheet on a phone. */
export default function AdminSidebar() {
  const path = usePathname() || '/';
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  const moreOn = !TABS.some((t) => t.match(path));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-0.5 overflow-y-auto border-r border-[#ebe8e3] bg-white px-3.5 py-[18px] lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-4">
          <span className="grid size-8 place-items-center rounded-[9px] bg-[#9a3412] font-serif text-[15px] font-extrabold text-white">J</span>
          <span>
            <b className="block text-[15px] leading-tight">Jentis Kitchen</b>
            <span className="text-[11.5px] text-[#a1a1aa]">Admin</span>
          </span>
        </Link>
        {MAIN.map((i) => <NavLink key={i.href} item={i} path={path} />)}
        <Head>Reseller</Head>
        {RESELLER.map((i) => <NavLink key={i.href} item={i} path={path} />)}
        <Head>Shop setup</Head>
        {SETUP.map((i) => <NavLink key={i.href} item={i} path={path} />)}
        <a
          href="https://jentiskitchen.id"
          target="_blank"
          rel="noreferrer"
          className="mt-auto flex items-center gap-2 rounded-[9px] border border-[#ebe8e3] px-2.5 py-2 text-[13px] font-medium text-[#52525b] hover:bg-[#f3f1ed]"
        >
          <Icon name="globe" className="size-4" />
          Open jentiskitchen.id
          <Icon name="ext" className="ml-auto size-3.5" />
        </a>
      </aside>

      {/* Desktop top bar */}
      <header className="sticky top-0 z-20 hidden h-[60px] items-center gap-3.5 border-b border-[#ebe8e3] bg-[#f6f5f2]/90 px-7 backdrop-blur lg:ml-[248px] lg:flex">
        <form action="/orders" className="flex h-[38px] w-[420px] items-center gap-2 rounded-[10px] border border-[#ebe8e3] bg-white px-3 text-[#a1a1aa]">
          <Icon name="search" className="size-4" />
          <input name="q" placeholder="Search orders: name, order no., phone, reseller…" className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#18181b] outline-none placeholder:text-[#a1a1aa]" />
        </form>
        <div className="ml-auto flex gap-2.5">
          <Link href="/inventory/production" className="a-btn"><Icon name="plus" className="size-4" />Add production</Link>
          <Link href="/orders/new" className="a-btn a-btn-pri"><Icon name="plus" className="size-4" />New reseller order</Link>
        </div>
      </header>

      {/* Phone bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[#ebe8e3] bg-white px-1 pb-[max(14px,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={cx('flex flex-col items-center gap-[3px] text-[11px] font-semibold', t.match(path) && !more ? 'text-[#9a3412]' : 'text-[#a1a1aa]')}>
            <TabIcon icon={t.icon} />
            {t.label}
          </Link>
        ))}
        <button type="button" onClick={() => setMore((m) => !m)} className={cx('flex flex-col items-center gap-[3px] text-[11px] font-semibold', more || moreOn ? 'text-[#9a3412]' : 'text-[#a1a1aa]')}>
          <Icon name="menu" className="size-[22px]" />
          More
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/45" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[22px] bg-white px-4 pb-28 pt-2.5">
            <div className="mx-auto mb-3.5 h-[5px] w-[38px] rounded-full bg-[#e4e4e7]" />
            <form action="/orders" className="flex h-11 items-center gap-2 rounded-[10px] border border-[#ebe8e3] px-3 text-[#a1a1aa]">
              <Icon name="search" className="size-4" />
              <input name="q" placeholder="Search orders…" className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#18181b] outline-none" />
            </form>
            {MORE.map((g) => (
              <div key={g.title}>
                <div className="mx-0.5 mb-2 mt-4 text-[11.5px] font-bold uppercase tracking-[.05em] text-[#a1a1aa]">{g.title}</div>
                <div className="grid grid-cols-3 gap-2.5">
                  {g.items.map((i) => (
                    <Link key={i.href} href={i.href} className="flex min-h-[78px] flex-col gap-2 rounded-xl border border-[#ebe8e3] px-2.5 py-3 text-[12.5px] font-semibold">
                      <span className="flex items-center justify-between text-[#9a3412]"><Icon name={i.icon} /><Pending /></span>
                      {i.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <a href="https://jentiskitchen.id" target="_blank" rel="noreferrer" className="a-btn mt-4 w-full">
              <Icon name="globe" className="size-4" />Open jentiskitchen.id
            </a>
          </div>
        </div>
      )}
    </>
  );
}
