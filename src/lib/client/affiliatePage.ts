// The affiliate's own page (its link code) once opened in this browser, so the Affiliate tab goes straight back to it.
const KEY = 'jk_affiliate_page';

export function readAffiliatePage(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && /^[A-Za-z0-9_-]{4,64}$/.test(v) ? v : null;
  } catch {
    return null; // private mode or blocked storage
  }
}

export function rememberAffiliatePage(slug: string) {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    /* storage unavailable: the email link still opens the page */
  }
}
