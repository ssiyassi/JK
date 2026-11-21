'use client';

import { useEffect, useState } from 'react';
import { rememberAffiliatePage } from '@/lib/client/affiliatePage';

/** The affiliate's link with Copy and "Bagikan ke WhatsApp" buttons, plus a ready message to copy. */
export default function ShareBox({ link, message, slug }: { link: string; message: string; slug?: string }) {
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);
  // The Affiliate tab of the bottom menu opens this page again in this browser.
  useEffect(() => {
    if (slug) rememberAffiliatePage(slug);
  }, [slug]);

  async function copy(value: string, what: 'link' | 'text') {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const t = document.createElement('textarea');
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-[#9a3412] bg-white p-2 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-[15px] font-bold text-[#7c2d12] sm:text-lg">{link.replace(/^https?:\/\//, '')}</span>
        <button type="button" onClick={() => copy(link, 'link')} className="shrink-0 rounded-xl bg-[#9a3412] px-4 py-2.5 font-bold text-white">
          {copied === 'link' ? 'Tersalin ✓' : 'Salin'}
        </button>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        className="mt-3 flex items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 text-lg font-bold text-white shadow-[0_4px_0_#128C7E]"
      >
        Bagikan ke WhatsApp
      </a>
      {/* Instagram and TikTok have no share link: copy the link first, then open the app. */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <a
          href="https://www.instagram.com/"
          target="_blank"
          rel="noreferrer"
          onClick={() => void copy(link, 'link')}
          className="flex items-center justify-center gap-2 rounded-full bg-white py-3 text-[15px] font-bold text-[#111827] ring-1 ring-[#f1e7dd]"
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <defs>
              <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
                <stop offset="0" stopColor="#fdf497" />
                <stop offset=".05" stopColor="#fdf497" />
                <stop offset=".45" stopColor="#fd5949" />
                <stop offset=".6" stopColor="#d6249f" />
                <stop offset=".9" stopColor="#285AEB" />
              </radialGradient>
            </defs>
            <rect x="1" y="1" width="22" height="22" rx="6.5" fill="url(#ig-grad)" />
            <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.8" />
            <circle cx="16.3" cy="7.7" r="1.05" fill="#fff" />
          </svg>
          Instagram
        </a>
        <a
          href="https://www.tiktok.com/"
          target="_blank"
          rel="noreferrer"
          onClick={() => void copy(link, 'link')}
          className="flex items-center justify-center gap-2 rounded-full bg-[#111] py-3 text-[15px] font-bold text-white"
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <path d="M16.6 3c.4 2.2 1.8 3.6 4 3.8v3.1c-1.5.1-2.8-.3-4-1.1v6.4c0 3.6-2.6 5.8-5.6 5.8A5.5 5.5 0 0 1 5.4 15.5c0-3.4 3-5.9 6.5-5.4v3.2c-1.6-.4-3.4.5-3.4 2.3 0 1.4 1.1 2.4 2.4 2.4 1.5 0 2.5-1 2.5-2.9V3z" fill="#25F4EE" transform="translate(-.7 -.6)" />
            <path d="M16.6 3c.4 2.2 1.8 3.6 4 3.8v3.1c-1.5.1-2.8-.3-4-1.1v6.4c0 3.6-2.6 5.8-5.6 5.8A5.5 5.5 0 0 1 5.4 15.5c0-3.4 3-5.9 6.5-5.4v3.2c-1.6-.4-3.4.5-3.4 2.3 0 1.4 1.1 2.4 2.4 2.4 1.5 0 2.5-1 2.5-2.9V3z" fill="#FE2C55" transform="translate(.7 .6)" />
            <path d="M16.6 3c.4 2.2 1.8 3.6 4 3.8v3.1c-1.5.1-2.8-.3-4-1.1v6.4c0 3.6-2.6 5.8-5.6 5.8A5.5 5.5 0 0 1 5.4 15.5c0-3.4 3-5.9 6.5-5.4v3.2c-1.6-.4-3.4.5-3.4 2.3 0 1.4 1.1 2.4 2.4 2.4 1.5 0 2.5-1 2.5-2.9V3z" fill="#fff" />
          </svg>
          TikTok
        </a>
      </div>
      <p className="mt-1.5 text-center text-xs text-[#8a7a6d]">Instagram & TikTok: link kamu otomatis tersalin, tinggal tempel.</p>
      <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-[#f1e7dd]">
        <p className="text-sm font-semibold text-[#5c4d42]">Contoh pesan (boleh diubah):</p>
        <p className="mt-1 whitespace-pre-line text-[15px] leading-6">{message}</p>
        <button type="button" onClick={() => copy(message, 'text')} className="mt-3 rounded-full border-2 border-[#9a3412] px-4 py-2 text-sm font-bold text-[#9a3412]">
          {copied === 'text' ? 'Tersalin ✓' : 'Salin pesan'}
        </button>
      </div>
    </div>
  );
}
