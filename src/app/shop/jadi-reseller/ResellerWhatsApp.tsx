'use client';

import { trackStep } from '@/lib/client/metaPixel';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';

const TEXT = 'Halo Jentis Kitchen, saya mau daftar jadi reseller.\nNama: \nKota: ';
const LINK = `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(TEXT)}`;

/** "Daftar lewat WhatsApp" on /jadi-reseller; each tap is counted as a reseller_wa step (where = which button). */
export default function ResellerWhatsApp({ where, className = '' }: { where: string; className?: string }) {
  return (
    <a
      href={LINK}
      target="_blank"
      rel="noreferrer"
      onClick={() => trackStep('reseller_wa', where)}
      className={`flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-base font-bold text-white shadow-md hover:bg-[#1ebe5b] ${className}`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3Z" />
      </svg>
      Daftar lewat WhatsApp
    </a>
  );
}
