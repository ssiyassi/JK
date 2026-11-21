// Microsoft Clarity (owner, 2026-11-13): free anonymous screen recordings and tap maps, to see where ad visitors who
// add to cart get stuck. Typed fields are masked by Clarity; pages with personal details are masked as a whole
// (src/app/shop/_components/ClarityMask.tsx). Not loaded for the owner's admin session.

/** The standard Clarity snippet, or null when the project ID is missing or malformed (letters and digits only). */
export function claritySnippet(projectId: string): string | null {
  if (!/^[a-z0-9]{6,16}$/.test(projectId)) return null;
  const id = JSON.stringify(projectId);
  return (
    '(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};' +
    't=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;' +
    'y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);' +
    `})(window,document,"clarity","script",${id});`
  );
}

/** Shop pages that show names, phone numbers, addresses or account details: recorded fully masked. */
export function isPrivatePage(pathname: string): boolean {
  return /\/(checkout|pesanan|orders|account|voucher|affiliate|r)(\/|$)/.test(pathname);
}
