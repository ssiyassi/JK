// Server-rendered part of the Meta Pixel; the client part is src/app/shop/_components/MetaPixel.tsx.

/** The standard Meta Pixel snippet (inline, so `fbq` exists before the page's own scripts run). */
export function metaPixelSnippet(pixelId: string, email: string | null): string | null {
  if (!/^\d{5,20}$/.test(pixelId)) return null; // a Pixel ID is digits only
  const id = JSON.stringify(pixelId);
  // Advanced matching: the Pixel hashes the email in the browser before sending it.
  const matching = email ? `, ${JSON.stringify({ em: email.trim().toLowerCase() })}` : '';
  return (
    "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};" +
    "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;" +
    "s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');" +
    `fbq('init',${id}${matching.replace(/</g, '\\u003c')});fbq('track','PageView');`
  );
}
