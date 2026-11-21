import type { Metadata, Viewport } from 'next';
import { Inter, Italianno } from 'next/font/google';
import { getDB } from '@/lib/server';
import { loadCatalog } from '@/lib/shop/products';
import { claritySnippet } from '@/lib/shop/clarity';
import { googleTagSnippet } from '@/lib/shop/googleTag';
import { metaPixelSnippet } from '@/lib/shop/metaSnippet';
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/lib/shop/seo';
import { clarityProjectId, currentCustomer, googleAdsPublic, metaPublic, shopBase } from '@/lib/shop/server';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import { loadShopBundles } from '@/lib/shop/bundles';
import { ShopProvider } from './_components/ShopProvider';
import AdminSessionBar from './_components/AdminSessionBar';
import ShopHeader from './_components/ShopHeader';
import ShopFooter from './_components/ShopFooter';
import AppTabBar from './_components/AppTabBar';
import ClarityMask from './_components/ClarityMask';
import MetaPixel from './_components/MetaPixel';

export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Brand font (the "Jentis Kitchen" wordmark).
const italianno = Italianno({ subsets: ['latin'], weight: '400', variable: '--font-brand' });

export async function generateMetadata(): Promise<Metadata> {
  const { domainVerification } = metaPublic();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: SITE_TITLE, template: `%s — ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    icons: { icon: '/shop/brand/logo.png' },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'id_ID',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Daging BBQ marinasi Jentis Kitchen di atas panggangan' }],
    },
    twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: [OG_IMAGE] },
    // Meta Business domain verification (<meta name="facebook-domain-verification">).
    ...(domainVerification ? { other: { 'facebook-domain-verification': domainVerification } } : {}),
  };
}

export const viewport: Viewport = { themeColor: '#9a3412' };

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const db = getDB();
  const [base, customer, catalog, rules] = await Promise.all([shopBase(), currentCustomer(), loadCatalog(db), loadVoucherRules(db)]);
  // Bundles must never take the shop down (e.g. before migration 0047 is applied).
  const bundles = await loadShopBundles(db, catalog, Date.now()).catch(() => []);
  const { pixelId } = metaPublic();
  // The owner signed in as a customer is not ad traffic: no Pixel and no visit tracking.
  const adminSession = Boolean(customer?.adminSession);
  const pixel = pixelId && !adminSession ? metaPixelSnippet(pixelId, customer?.email ?? null) : null;
  const { tagId } = googleAdsPublic();
  const googleTag = tagId && !adminSession ? googleTagSnippet(tagId) : null;
  const clarityId = clarityProjectId();
  const clarity = clarityId && !adminSession ? claritySnippet(clarityId) : null;
  return (
    <ShopProvider
      base={base}
      customer={customer ? { name: customer.name, email: customer.email } : null}
      catalog={catalog.filter((p) => p.visible)}
      welcomeVoucher={{ percent: rules.WELCOME.percent, cap: rules.WELCOME.cap }}
      monthlyVoucher={{ percent: rules.MONTHLY.percent, cap: rules.MONTHLY.cap }}
      bundles={bundles}
    >
      {pixel && <script id="meta-pixel" dangerouslySetInnerHTML={{ __html: pixel }} />}
      {googleTag && <script id="google-tag" dangerouslySetInnerHTML={{ __html: googleTag }} />}
      {clarity && <script id="clarity" dangerouslySetInnerHTML={{ __html: clarity }} />}
      {clarity && <ClarityMask />}
      {!adminSession && <MetaPixel />}
      <div className={`${inter.variable} ${italianno.variable} font-[family-name:var(--font-inter)] min-h-screen bg-[#faf9f6] text-[#111827] flex flex-col`}>
        {customer && adminSession && <AdminSessionBar name={customer.name} email={customer.email} />}
        <ShopHeader />
        <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 sm:px-8 pt-4 pb-12 sm:pb-16">{children}</main>
        <ShopFooter />
        <AppTabBar />
      </div>
    </ShopProvider>
  );
}
