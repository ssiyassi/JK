'use client';

import { useEffect, useState } from 'react';

// Owner 14 Nov 2026: "block the whole page with a loading state while it's still processing" (Orders page most of all).
// One overlay for every admin page, no per-button work needed:
//  - any change sent to the server (POST/PATCH/PUT/DELETE to /api, or a Next server action) blocks the screen;
//  - the page reload that follows it (router.refresh) and menu/page changes the owner clicked also block it;
//  - background work does not: link prefetches, search-as-you-type GETs, and the Reports 5-minute auto refresh.
// It only appears after 120 ms (no flash on instant actions) and leaves 250 ms after the last request ends,
// so a save followed by the page refresh shows as one loading state instead of flickering.

type Kind = 'save' | 'load';

const SHOW_AFTER = 120;
const HIDE_AFTER = 250;
const USER_WINDOW = 2500; // a page load this soon after a tap/click/Enter/save counts as the owner's own action

function header(init: RequestInit | undefined, input: RequestInfo | URL, name: string): string | null {
  const h = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? (h as Record<string, string>)[key] : null;
}

export default function BusyOverlay() {
  const [kind, setKind] = useState<Kind | null>(null);

  useEffect(() => {
    const original = window.fetch;
    let saves = 0;
    let loads = 0;
    let lastUser = 0;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      if (saves + loads > 0) {
        clearTimeout(hideTimer);
        hideTimer = undefined;
        const next: Kind = saves > 0 ? 'save' : 'load';
        if (!showTimer) showTimer = setTimeout(() => { showTimer = undefined; if (saves + loads > 0) setKind(saves > 0 ? 'save' : 'load'); }, SHOW_AFTER);
        setKind((k) => (k ? next : k));
      } else {
        clearTimeout(showTimer);
        showTimer = undefined;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { if (saves + loads === 0) setKind(null); }, HIDE_AFTER);
      }
    };

    const markUser = () => { lastUser = Date.now(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') markUser(); };

    window.fetch = function patched(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      let path = '';
      let sameSite = false;
      try {
        const u = new URL(url, window.location.href);
        sameSite = u.origin === window.location.origin;
        path = u.pathname + u.search;
      } catch { /* not a URL we track */ }

      let counted: Kind | null = null;
      if (sameSite) {
        const isAction = !!header(init, input, 'Next-Action');
        const isPage = !!header(init, input, 'RSC') || path.includes('_rsc=');
        const isPrefetch = !!header(init, input, 'Next-Router-Prefetch');
        if (isAction || (method !== 'GET' && method !== 'HEAD' && path.startsWith('/api/'))) counted = 'save';
        else if (isPage && !isPrefetch && Date.now() - lastUser < USER_WINDOW) counted = 'load';
      }
      if (!counted) return original.call(window, input, init);

      if (counted === 'save') saves++; else loads++;
      update();
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        if (counted === 'save') { saves--; lastUser = Date.now(); } else loads--; // the refresh right after a save is part of it
        update();
      };
      // A page answer streams: fetch() resolves as soon as the first bytes arrive, while the server keeps sending the
      // page for seconds (owner's screen recording 14 Nov: overlay gone, Orders tab still spinning). So the overlay
      // stays until the whole answer has arrived, read from a copy so the page still gets the original.
      const request = original.call(window, input, init);
      setTimeout(end, 60_000); // never leave the screen blocked if a stream hangs
      request.then(
        (res) => {
          try {
            res.clone().arrayBuffer().then(end, end);
          } catch {
            end();
          }
        },
        end,
      );
      return request;
    } as typeof window.fetch;

    window.addEventListener('pointerdown', markUser, true);
    window.addEventListener('submit', markUser, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('popstate', markUser, true);
    return () => {
      window.fetch = original;
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      window.removeEventListener('pointerdown', markUser, true);
      window.removeEventListener('submit', markUser, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('popstate', markUser, true);
    };
  }, []);

  if (!kind) return null;
  return (
    <div
      role="status"
      aria-live="assertive"
      aria-busy="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(246,245,242,.72)] backdrop-blur-[2px]"
      onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,.14)]">
        <span className="size-6 animate-spin rounded-full border-[3px] border-[#ebe8e3] border-t-[#9a3412]" />
        <div>
          <div className="text-[15px] font-semibold text-[#18181b]">{kind === 'save' ? 'Saving…' : 'Loading…'}</div>
          <div className="text-xs text-[#71717a]">Please wait, don&apos;t close this page.</div>
        </div>
      </div>
    </div>
  );
}
