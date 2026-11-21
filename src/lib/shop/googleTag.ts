// Server-rendered part of the Google tag (Google Ads sales tracking); the Purchase is sent by
// src/app/shop/_components/GooglePurchase.tsx.

/** The standard Google tag snippet (inline, so `gtag` exists before the page's own scripts run). */
export function googleTagSnippet(tagId: string): string | null {
  if (!/^AW-\d{5,20}$/.test(tagId)) return null; // a Google Ads tag ID is "AW-" plus digits
  const id = JSON.stringify(tagId);
  return (
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}" +
    "(function(d,s){s=d.createElement('script');s.async=!0;" +
    `s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(${id});d.head.appendChild(s)})(document);` +
    `gtag('js',new Date());gtag('config',${id});`
  );
}

/** Where a Google Ads conversion is sent ("AW-123/label"), or null when either part is missing or malformed. */
export function googleSendTo(tagId: string, label: string): string | null {
  return /^AW-\d{5,20}$/.test(tagId) && /^[\w-]{5,60}$/.test(label) ? `${tagId}/${label}` : null;
}
