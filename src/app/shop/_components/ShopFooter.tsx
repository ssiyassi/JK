'use client';

import { usePathname } from 'next/navigation';
import { CONTACT_WHATSAPP, isStandalonePage } from '@/lib/shop/catalog';
import { useShop } from './ShopProvider';
import { TAB_BAR_HIDDEN } from './AppTabBar';

const CONTACT_DISPLAY = '0852-1544-8802';
const HELP_TEXT = 'Halo Customer Care Jentis Kitchen, saya butuh bantuan.';
const SUPPORT_EMAIL = 'help@jentiskitchen.id';
const BUSINESS_ADDRESS = 'Apartemen Taman Anggrek Residence Tower Fragrant Unit STF-27N, Jakarta Barat 11470';

/** Dark brown footer on every shop page: where to get help (WhatsApp customer care, email, business address). */
export default function ShopFooter() {
  const { href, cartCount, cartReady } = useShop();
  // The floating cart bar (homepage, cart not empty) covers the bottom of the page: leave room for it.
  const pathname = usePathname();
  const cartBarShown = pathname === href('/') && cartReady && cartCount > 0;
  if (isStandalonePage(pathname)) return null;

  return (
    <footer
      className={`bg-[#3b1a0c] text-[#f5e6d8] ${
        cartBarShown ? 'pb-[220px] sm:pb-36' : !TAB_BAR_HIDDEN(pathname) ? 'pb-[96px] sm:pb-8' : /\/(produk|orders)\//.test(pathname) ? 'pb-28 sm:pb-8' : 'pb-8'
      }`}
    >
      <div className="max-w-[1920px] mx-auto px-4 sm:px-8 pt-10 sm:pt-12 flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-[family-name:var(--font-brand)] text-[40px] leading-none text-white pl-1">Jentis Kitchen</span>
          <span className="text-sm text-[#d9b99f]">Taste is our utmost priority</span>
          <address className="not-italic mt-3 flex flex-col gap-1 text-sm text-[#f5e6d8] max-w-sm">
            <span>
              <span className="text-[#d9b99f]">Email: </span>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 hover:text-white">{SUPPORT_EMAIL}</a>
            </span>
            <span>
              <span className="text-[#d9b99f]">Alamat: </span>
              {BUSINESS_ADDRESS}
            </span>
          </address>
        </div>

        <div className="flex flex-col gap-3 sm:items-end sm:text-right">
          <div>
            <p className="text-lg font-bold text-white">Butuh bantuan?</p>
            <p className="text-sm text-[#d9b99f]">Hubungi Customer Care kami, kami siap membantu.</p>
          </div>
          <a
            href={`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(HELP_TEXT)}`}
            target="_blank"
            rel="noreferrer"
            className="self-start sm:self-auto inline-flex items-center gap-3 rounded-full bg-[#5a2a14] hover:bg-[#6e3519] border border-[#7a3f22] pl-2 pr-5 py-2 transition-colors"
          >
            <span className="size-9 rounded-full bg-[#25d366] flex items-center justify-center shrink-0" aria-hidden>
              <svg viewBox="0 0 24 24" className="size-5 fill-white">
                <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.43 9.45-9.43a9.4 9.4 0 0 1 9.43 9.44c0 5.2-4.24 9.44-9.44 9.44m8.03-17.47A11.3 11.3 0 0 0 12.05.7C5.79.7.7 5.79.7 12.05c0 2 .52 3.95 1.52 5.67L.6 23.3l5.72-1.5a11.3 11.3 0 0 0 5.42 1.38h.01c6.25 0 11.34-5.09 11.35-11.35 0-3.03-1.18-5.88-3.33-8.03" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[11px] uppercase tracking-wide text-[#d9b99f]">Customer Care (WhatsApp)</span>
              <span className="text-lg font-bold text-white">{CONTACT_DISPLAY}</span>
            </span>
          </a>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-4 sm:px-8 mt-8 pt-5 border-t border-[#5a2a14] text-xs text-[#b08a70] flex flex-wrap gap-x-4 gap-y-1 justify-between">
        <span>© {new Date().getFullYear()} Jentis Kitchen</span>
        <span className="flex gap-4">
          <a href={href('/resep-tips')} className="underline underline-offset-2 hover:text-white">Resep & Tips</a>
          <a href={href('/kebijakan-privasi')} className="underline underline-offset-2 hover:text-white">Kebijakan Privasi</a>
        </span>
      </div>
    </footer>
  );
}
