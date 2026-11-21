'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { rememberGuestOrder } from '@/lib/client/guestOrders';
import { trackMeta, trackStep } from '@/lib/client/metaPixel';
import { useIdempotencyKey } from '@/lib/client/useIdempotencyKey';
import { addDaysToKey, deliveryDateFromKey, jakartaDateKey, WEBSITE_DELIVERY_CHOICES, websiteDeliveryDateKey, websiteDeliveryOptions } from '@/lib/core/time';
import { cityLeadDays, courierService, DELIVERY_CITIES, SAME_DAY_CITIES } from '@/lib/shop/delivery-cities';
import { cartWhatsAppText, CONTACT_WHATSAPP, formatDeliveryDate, formatRupiah, freeDeliveryFrom, PAYMENT_INSTRUCTIONS, shopAsset, whatsappLink } from '@/lib/shop/catalog';
import { discountLabel, NEW_CUSTOMER_CODE, priceCart } from '@/lib/shop/pricing';
import { bundlePicksText, bundleTotals } from '@/lib/shop/bundles';
import CheckoutTotalBar from './CheckoutTotalBar';
import DeliveryDatePicker from './DeliveryDatePicker';
import { ErrorBox } from './Form';
import PaymentChoiceDialog, { type PaymentChoice, type WalletChoice } from './PaymentChoiceDialog';

const WALLET_TITLE: Record<WalletChoice, string> = { OVO: 'OVO', SHOPEEPAY: 'ShopeePay', DANA: 'DANA' };
import ProductArt from './ProductArt';
import { MonthlyVoucherBanner } from './PromoBanners';
import QtyStepper from './QtyStepper';
import { postJson, useShop } from './ShopProvider';
import VoucherTicket, { ticketButton } from './VoucherTicket';
import { playfair } from '../fonts';
import { OWNER_SOURCES } from '@/lib/shop/ownerSources';

const PinPicker = dynamic(() => import('./PinPicker'), {
  ssr: false,
  loading: () => <div className="h-64 rounded-2xl bg-[#f3f4f6] animate-pulse" />,
});

export interface AddressDefaults {
  recipientName: string;
  recipientPhone: string;
  street: string; // full address: street, number, RT/RW, kelurahan, kecamatan, kota
  city?: string; // the "Kota" dropdown, when it is on
  notes: string;
  latitude: number | null;
  longitude: number | null;
}

interface AppliedVoucher {
  code: string;
  percent: number;
  fixedAmount: number | null;
  capAmount: number | null;
  minOrder: number;
}

interface VoucherOption extends AppliedVoucher {
  label: string;
  expiresAt: number | null;
}

function Section({
  step,
  title,
  phoneTitle,
  aside,
  children,
  gap = 'gap-4 sm:gap-8',
  bare = false,
}: {
  step: number;
  title: string;
  /** Phones: the title shown above the card (app layout, 2026-11-12). */
  phoneTitle?: string;
  /** Phones: small text at the right of the title. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  gap?: string;
  /** Phones: no white card around the content (e.g. a voucher ticket on its own). */
  bare?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2.5 sm:gap-0">
      <div className="sm:hidden flex items-end justify-between gap-3 px-0.5">
        <h2 className={phoneHeading}>{phoneTitle ?? title}</h2>
        {aside && <span className="pb-0.5 text-[12.5px] text-[#4b5563]">{aside}</span>}
      </div>
      <div
        className={`${
          bare ? 'max-sm:bg-transparent max-sm:border-0 max-sm:shadow-none max-sm:p-0' : 'shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)] p-4'
        } bg-white border border-[#f9fafb] rounded-[18px] sm:rounded-[32px] sm:shadow-none sm:drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] sm:p-[41px] flex flex-col ${gap}`}
      >
        <h2 className="hidden sm:flex items-center gap-4 text-xl sm:text-2xl leading-8 font-bold text-[#111827]">
          <span className="size-8 shrink-0 rounded-full bg-[#9a3412] text-white text-base font-bold flex items-center justify-center">{step}</span>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

const phoneHeading = 'font-[family-name:var(--font-heading)] text-[19px] font-extrabold leading-7 text-[#3b1a0c]';

const fieldClass =
  'w-full rounded-[14px] sm:rounded-2xl border-[1.5px] sm:border border-[#eee7df] sm:border-[#e5e7eb] bg-[#faf9f6] sm:bg-[rgba(249,250,251,0.3)] px-4 py-3 sm:px-[25px] sm:py-[17px] text-[15px] sm:text-lg leading-6 sm:leading-7 text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#9a3412] focus:ring-2 focus:ring-[#9a3412]/15';

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="block text-[13px] sm:text-lg leading-5 sm:leading-7 font-bold text-[#111827] mb-1.5 sm:mb-3">
      {label}
      {!required && <span className="font-normal text-[#9ca3af]"> (opsional)</span>}
    </span>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: string }) {
  const { label, icon, ...rest } = props;
  return (
    <label className="block">
      <FieldLabel label={label} required={rest.required} />
      <span className="relative block">
        {icon && <FieldIcon name={icon} />}
        <input {...rest} className={`${fieldClass} ${icon ? 'max-sm:pl-10' : ''}`} />
      </span>
    </label>
  );
}

const FIELD_ICONS: Record<string, React.ReactNode> = {
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  home: <path d="M3 10.5 12 3l9 7.5V21H3z" />,
  note: (
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
};

/** Phones: small brand-coloured icon at the left inside a field. */
function FieldIcon({ name, top = false }: { name: string; top?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`sm:hidden pointer-events-none absolute left-3 size-[18px] text-[#9a3412] ${top ? 'top-3.5' : 'top-1/2 -translate-y-1/2'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {FIELD_ICONS[name]}
    </svg>
  );
}

function Icon({ name, w, h }: { name: string; w: number; h: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={shopAsset(`/icons/${name}.svg`)} alt="" width={w} height={h} className="shrink-0" />;
}

const EMPTY_ADDRESS: AddressDefaults = {
  recipientName: '',
  recipientPhone: '',
  street: '',
  notes: '',
  latitude: null,
  longitude: null,
};

const HELP_TEXT = 'Halo Jentis Kitchen, saya butuh bantuan untuk pesan di website.';

const LAST_ORDER_KEY = 'jk_last_order';
const LAST_ORDER_MINUTES = 30;

/** Remembers (for this tab) the order the customer just left for the payment page. */
function rememberLastOrder(url: string) {
  try {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ url, at: Date.now() }));
  } catch {
    /* private mode: Back then just shows the empty cart */
  }
}

/** The order the customer just left for the payment page, once, if it was in the last 30 minutes. */
function readLastOrder(): string | null {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    sessionStorage.removeItem(LAST_ORDER_KEY);
    const v = raw ? (JSON.parse(raw) as { url?: unknown; at?: unknown }) : null;
    if (v && typeof v.url === 'string' && typeof v.at === 'number' && Date.now() - v.at < LAST_ORDER_MINUTES * 60000) return v.url;
  } catch {
    /* ignore */
  }
  return null;
}

export default function CheckoutForm({
  signedIn,
  defaults,
  vouchers,
  onlineMethods,
  wallets,
  addressSearch = false,
  closedDays = [],
  deliveryFull = false,
  cityChoice = false,
  ownerMode = false,
}: {
  /** Admin mode ("Buat pesanan untuk pelanggan"): the owner orders for a customer; no payment pop-up, a source to pick. */
  ownerMode?: boolean;
  /** The "Kota" dropdown: delivery only to DELIVERY_CITIES, courier cities sent the day after the order at the soonest. */
  cityChoice?: boolean;
  /** The owner's days off (YYYY-MM-DD): no delivery, shown as "Penuh" in the calendar. */
  closedDays?: string[];
  /** From the day before a day off until its end: blue "full" notice with the soonest delivery day. */
  deliveryFull?: boolean;
  /** What customers can pay with on the payment page; null = manual bank transfer. */
  onlineMethods: string | null;
  /** The e-wallets that are set up (OVO, ShopeePay, DANA): extra choices in the payment pop-up. */
  wallets: readonly WalletChoice[];
  /** Google address search above the pin map (needs GOOGLE_PLACES_API_KEY). */
  addressSearch?: boolean;
  /** False = guest checkout: same form plus an optional email field. */
  signedIn: boolean;
  defaults: AddressDefaults | null;
  vouchers: VoucherOption[];
}) {
  const { base, href, catalog, welcomeVoucher, cart, cartBundles, cartCount, cartReady, setQty, setBundleAt, clearCart } = useShop();
  // Bundles (Paket Hemat) as the price rules and the server want them.
  const bundleInputs = cartBundles.map((x) => ({ bundle: x.bundle, picks: x.picks }));
  const bundleBody = cartBundles.map((x) => ({ bundleId: x.bundleId, picks: x.picks }));
  const submissionKey = useIdempotencyKey();
  const [address, setAddress] = useState<AddressDefaults>(defaults ?? EMPTY_ADDRESS);
  // Guests only, optional: order emails, and a new account with the welcome voucher.
  const [email, setEmail] = useState('');
  const [showMap, setShowMap] = useState(defaults?.latitude != null);
  const [voucherInput, setVoucherInput] = useState('');
  // Phones: the code field opens from "Punya kode?" next to the Voucher title.
  const [showCode, setShowCode] = useState(false);
  // Guests: the new-customer discount (the ads' first-purchase promise) is on from the start; checked when they pay.
  const newCustomerOffer: AppliedVoucher = { code: NEW_CUSTOMER_CODE, percent: welcomeVoucher.percent, fixedAmount: null, capAmount: welcomeVoucher.cap, minOrder: 0 };
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(signedIn ? null : newCustomerOffer);
  const isNewCustomer = voucher?.code === NEW_CUSTOMER_CODE;
  // Every voucher's "Lepas" first asks for confirmation (2026-10-25: a guest lost the 35% by tapping it by accident).
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [checkingVoucher, setCheckingVoucher] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The floating "Bayar" can be tapped far above the error box: bring a refused order's message into view.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);
  const breakdownRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  // Admin mode: the WhatsApp code the customer came with (#L, #K…), so the order counts for that ad in the reports.
  const [ownerSource, setOwnerSource] = useState('');
  // "Bayar" opens the QRIS / manual transfer pop-up first (only when online payment is set up); the order is placed
  // with the method picked there.
  const [choosingPayment, setChoosingPayment] = useState(false);
  const [placingWith, setPlacingWith] = useState<PaymentChoice | null>(null);
  // Set once the order exists and the browser is leaving for the payment page (or the order page).
  const [redirecting, setRedirecting] = useState<'payment' | 'order' | null>(null);
  // Back button from the payment page lands here again, with the cart already emptied (or with the waiting screen
  // restored from the browser cache). Send the customer to the order they just placed instead: it has "Bayar" to
  // continue paying and "Batalkan pesanan".
  useEffect(() => {
    const toLastOrder = () => {
      const last = readLastOrder();
      if (last) window.location.replace(last);
    };
    // Not while this page is itself leaving for the payment page (the cart was just emptied on purpose).
    if (cartReady && cartCount === 0 && !redirecting) toLastOrder();
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) toLastOrder();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [cartReady, cartCount, redirecting]);
  const [deliveryChoice, setDeliveryChoice] = useState<string | null>(null);

  const items = catalog.filter((i) => (cart[i.product] ?? 0) > 0);
  const price = cartCount > 0 ? priceCart(cart, voucher, catalog, cityChoice ? address.city : undefined, bundleInputs) : null;
  // Only bundles that take no voucher: the voucher box says so, and no voucher (or new-customer discount) is sent.
  const voucherUsable = !price || price.voucherBase > 0;
  const bundleFree = cartBundles.some((x) => x.bundle.freeDelivery);

  // Meta: checkout started (once per visit of this page, when the cart has something in it).
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (!cartReady || cartCount === 0 || checkoutTracked.current) return;
    checkoutTracked.current = true;
    const all = priceCart(cart, null, catalog, undefined, bundleInputs);
    trackMeta('InitiateCheckout', {
      content_type: 'product',
      content_ids: all.lines.map((l) => l.product),
      num_items: all.totalPacks,
      value: all.subtotal,
      currency: 'IDR',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartReady, cartCount]);
  // Visitor journeys: the address is filled in (once per page visit; pre-filled for returning customers counts too).
  const addressTracked = useRef(false);
  const addressFilled = Boolean(address.recipientName.trim() && address.recipientPhone.trim() && address.street.trim());
  useEffect(() => {
    if (!addressFilled || addressTracked.current || cartCount === 0) return;
    addressTracked.current = true;
    trackStep('address');
  }, [addressFilled, cartCount]);
  // Guests: what they typed so far, for one WhatsApp from the owner if they leave (the form says so; checkoutLeads.ts).
  const leadId = useRef('');
  useEffect(() => {
    if (signedIn || cartCount === 0 || address.recipientPhone.replace(/\D/g, '').length < 10) return;
    const timer = setTimeout(() => {
      leadId.current ||= `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      // Bundle packs count as products here (only names and amounts are kept).
      const items: Record<string, number> = { ...cart };
      for (const x of cartBundles) for (const p of x.picks) items[p] = (items[p] ?? 0) + 1;
      void postJson(base, '/checkout-lead', { id: leadId.current, name: address.recipientName, phone: address.recipientPhone, items }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [signedIn, cartCount, cart, cartBundles, base, address.recipientName, address.recipientPhone]);
  // Delivery day: pre-filled with the earliest day (our rule), the customer may pick a later one.
  // Recomputed on every render, so a page left open past midnight never offers a day that is no longer allowed.
  const city = address.city ?? '';
  const leadDays = cityChoice ? cityLeadDays(city) : 0;
  const deliveryOptions = websiteDeliveryOptions(Date.now(), closedDays, WEBSITE_DELIVERY_CHOICES, leadDays);
  // The usual earliest day is a day off: don't promise "dikirim hari ini".
  const earliestFull = leadDays
    ? closedDays.includes(addDaysToKey(jakartaDateKey(Date.now()), leadDays))
    : deliveryFull || closedDays.includes(websiteDeliveryDateKey(Date.now()));
  const deliveryKey = deliveryChoice && deliveryOptions.includes(deliveryChoice) ? deliveryChoice : deliveryOptions[0];
  // "Harga coret": the subtotal is shown at the original prices, with the difference as "Diskon produk" (same as the homepage).
  // Bundles: the difference to their crossed-out total ("Hemat paket").
  const bundleSaving = cartBundles.reduce((sum, x) => sum + Math.max(0, bundleTotals(x.bundle, catalog).compareAt - x.bundle.price), 0);
  const productDiscount = items.reduce((sum, i) => sum + (i.compareAtPrice ? (i.compareAtPrice - i.price) * (cart[i.product] ?? 0) : 0), 0) + bundleSaving;

  if (!cartReady) return <div className="h-64 rounded-[32px] bg-[#f3f4f6] animate-pulse" />;

  // Shown instead of the (now empty) cart while the next page loads, so the customer never sees "Keranjang masih kosong".
  if (redirecting) {
    return (
      <div className="max-w-md mx-auto text-center py-16" role="status" aria-live="polite">
        <div className="mx-auto size-12 rounded-full border-4 border-[#f1e7dd] border-t-[#9a3412] animate-spin" aria-hidden />
        <h1 className="text-2xl font-bold mt-6">Pesanan berhasil dibuat</h1>
        <p className="text-[#6b7280] mt-2">
          {redirecting === 'payment'
            ? 'Membuka halaman pembayaran… Mohon tunggu dan jangan tutup halaman ini.'
            : 'Membuka detail pesanan Anda…'}
        </p>
      </div>
    );
  }

  if (cartCount === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-2xl font-bold">Keranjang masih kosong</h1>
        <p className="text-[#6b7280] mt-2">Pilih produk dulu, lalu kembali ke sini.</p>
        <Link href={href('/')} className="inline-block mt-6 px-6 py-4 rounded-2xl bg-[#9a3412] text-white text-lg font-bold">
          Lihat produk
        </Link>
      </div>
    );
  }

  async function applyVoucher(code: string) {
    setCheckingVoucher(true);
    setVoucherError(null);
    try {
      const res = await postJson<{ voucher: AppliedVoucher }>(base, '/quote', {
        items: cart,
        bundles: bundleBody,
        voucherCode: code,
        // Guests: per-customer voucher limits are counted by the delivery phone number.
        ...(signedIn ? {} : { guestPhone: address.recipientPhone }),
      });
      setVoucher(res.voucher);
      setVoucherInput('');
    } catch (err) {
      setVoucherError((err as Error).message);
    } finally {
      setCheckingVoucher(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cityChoice && !city) {
      setError('Silakan pilih kota pengiriman.');
      return;
    }
    if (ownerMode) {
      if (!ownerSource) {
        setError('Pilih dari mana pelanggan datang.');
        return;
      }
      void placeOrder('QRIS');
      return;
    }
    trackStep('pay_click');
    if (onlineMethods) setChoosingPayment(true);
    else void placeOrder('TRANSFER');
  }

  async function placeOrder(paymentMethod: PaymentChoice) {
    setBusy(true);
    setPlacingWith(paymentMethod);
    setError(null);
    try {
      const res = await postJson<{ id: string; orderId: string; guest: boolean; paymentUrl: string | null }>(
        base,
        '/orders',
        {
          items: cart,
          bundles: bundleBody,
          voucherCode: isNewCustomer || !voucherUsable ? null : (voucher?.code ?? null),
          newCustomerDiscount: isNewCustomer && voucherUsable,
          deliveryDate: deliveryKey,
          address: showMap ? address : { ...address, latitude: null, longitude: null },
          ...(signedIn ? {} : { email: email.trim() }),
          // Admin mode: no payment method yet (the customer picks it from the order link).
          ...(ownerMode ? { ownerSource } : { paymentMethod }),
        },
        { 'Idempotency-Key': submissionKey.current() },
      );
      // Guests: listed on the login page of this browser, in case they leave the payment page without coming back.
      if (res.guest) rememberGuestOrder(res.id, res.orderId);
      if (!ownerMode) trackStep('order_placed', paymentMethod);
      // Online payment: straight to the payment page. Otherwise (or if the gateway was unreachable) to the order page.
      // The waiting screen goes up before the cart is emptied, so the empty-cart page never flashes in between.
      setRedirecting(res.paymentUrl ? 'payment' : 'order');
      if (res.paymentUrl) rememberLastOrder(href(`/orders/${res.id}`));
      clearCart();
      window.location.href = res.paymentUrl ?? href(`/orders/${res.id}?new=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setPlacingWith(null);
      setChoosingPayment(false);
    }
  }

  const set = (field: keyof AddressDefaults) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setAddress((a) => ({ ...a, [field]: e.target.value }));

  const cartSection = (
    <Section step={1} title="Pesanan" phoneTitle="Pesanan kamu">
      <ul className="flex flex-col gap-3 sm:gap-6 divide-y divide-[#f3eee8] sm:divide-y-0 [&>li+li]:pt-3 sm:[&>li+li]:pt-0">
        {cartBundles.map((x, i) => {
          const compareAt = bundleTotals(x.bundle, catalog).compareAt;
          const photos = x.picks.slice(0, 3).map((p) => catalog.find((c) => c.product === p)).filter((c): c is NonNullable<typeof c> => Boolean(c));
          return (
            <li key={`bundle-${i}`} className="flex items-start gap-3 sm:gap-6">
              <div className="relative size-16 shrink-0 sm:size-24">
                {photos.map((p, k) => (
                  <ProductArt
                    key={k}
                    item={p}
                    className={`absolute size-[42px] rounded-[10px] border-2 border-white sm:size-[62px] ${['left-0 top-0', 'left-[22px] top-1 sm:left-[34px]', 'left-[10px] top-[22px] sm:left-[16px] sm:top-[34px]'][k]}`}
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-bold leading-5 text-[#111827] sm:text-xl sm:leading-7">{x.bundle.name}</p>
                  <Link href={href(`/paket/${x.bundle.slug}?ubah=${i}`)} className="shrink-0 text-[11px] font-bold text-[#9a3412] sm:text-base">
                    Ubah isi
                  </Link>
                </div>
                <p className="mt-0.5 text-[11px] leading-4 text-[#4b5563] sm:text-base sm:leading-6">{bundlePicksText(x.picks, catalog)}</p>
                <p className="mt-0.5 flex items-baseline gap-1.5 text-sm sm:text-lg">
                  <b className="text-[#9a3412]">{formatRupiah(x.bundle.price)}</b>
                  {compareAt > x.bundle.price && <s className="text-[11px] text-[#9ca3af] sm:text-sm">{formatRupiah(compareAt)}</s>}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {x.bundle.freeDelivery && <span className="rounded-full bg-[#ecfdf3] px-2 py-1 text-[11px] font-bold text-[#15803d]">🚚 Gratis ongkir</span>}
                  {!x.bundle.voucherAllowed && <span className="rounded-full bg-[#f3f4f6] px-2 py-1 text-[11px] font-bold text-[#4b5563]">Tanpa voucher</span>}
                  <button type="button" onClick={() => setBundleAt(i, null)} className="ml-auto text-[11px] font-bold text-[#6b7280] sm:text-sm" aria-label={`Hapus ${x.bundle.name}`}>
                    Hapus
                  </button>
                </div>
              </div>
            </li>
          );
        })}
        {items.map((item) => (
          <li key={item.product} className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-3 sm:gap-6 flex-1 min-w-0">
              <ProductArt item={item} className="size-16 sm:size-24 rounded-xl sm:rounded-2xl shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5 sm:gap-1">
                <p className="text-[14px] sm:text-xl leading-5 sm:leading-7 font-bold text-[#111827]">{item.name}</p>
                <p className="flex flex-wrap items-baseline gap-x-1.5 sm:gap-x-2 text-sm sm:text-lg leading-5 sm:leading-7 text-[#6b7280]">
                  <span className="font-bold sm:font-semibold text-[#9a3412] sm:text-[#111827]">{formatRupiah(item.price)}</span>
                  {item.compareAtPrice && <span className="text-[11px] sm:text-sm text-[#9ca3af] line-through">{formatRupiah(item.compareAtPrice)}</span>}
                </p>
                <p className="text-xs sm:text-base leading-4 sm:leading-5 text-[#6b7280]">{item.size}</p>
              </div>
            </div>
            {/* Phones: small stepper at the right, like the cart sheet (minus to 0 removes the product). */}
            <div className="sm:hidden shrink-0">
              <QtyStepper variant="mini" value={cart[item.product] ?? 0} max={50} onChange={(n) => setQty(item.product, n)} label={item.name} />
            </div>
            <div className="hidden sm:flex items-center justify-end gap-4">
              <QtyStepper
                variant="compact"
                value={cart[item.product] ?? 0}
                max={50}
                onChange={(n) => setQty(item.product, n)}
                label={item.name}
              />
              <button
                type="button"
                onClick={() => setQty(item.product, 0)}
                className="px-2 py-[3px] rounded-lg hover:bg-[#f3f4f6]"
                aria-label={`Hapus ${item.name}`}
              >
                <Icon name="trash" w={17.5} h={20} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Link href={href('/')} className="self-start hidden sm:flex items-center gap-2 text-base sm:text-lg leading-7 font-bold text-[#9a3412]">
        <Icon name="plus-brand" w={12.25} h={14} />
        Tambah produk lain
      </Link>
    </Section>
  );

  // Phones: one-tap extras (products not in the cart yet), like the cart sheet in the app design.
  const extras = catalog.filter((i) => !(cart[i.product] ?? 0));
  const upsell = (
    <div className="sm:hidden -mt-1 flex flex-col gap-2">
      {extras.length > 0 ? (
        <>
          <p className="px-0.5 text-[13px] font-bold text-[#111827]">
            Sekalian tambah? <span className="font-normal text-[#4b5563]">· sekali tap</span>
          </p>
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {extras.map((i) => (
              <div key={i.product} className="flex w-[250px] shrink-0 items-center gap-3 rounded-[18px] bg-white p-2 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
                <ProductArt item={i} className="size-[60px] shrink-0 rounded-[10px]" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="truncate text-[13px] font-bold text-[#111827]">{i.name}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-[#9a3412]">{formatRupiah(i.price)}</span>
                    <button type="button" onClick={() => setQty(i.product, 1)} className="h-[30px] rounded-[10px] bg-[#9a3412] px-2.5 text-[12.5px] font-bold text-white">
                      + Tambah
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );

  // Delivery day, in its own box under the price summary (not part of the price). The customer can change it.
  const deliveryLabel = (key: string) => formatDeliveryDate(deliveryDateFromKey(key));
  const deliveryInfo = (
    // A div, not a label: a label would re-open the calendar when a day inside it is tapped.
    <div className="rounded-[20px] bg-[#fdf3ea] border border-[#f3d9c4] px-4 sm:px-5 py-4">
      <p className="text-sm text-[#5c4d42] mb-2">
        <span aria-hidden>🚚</span> Jadwal kirim (bisa diubah)
      </p>
      {cityChoice && !city ? (
        <p className="text-sm font-semibold text-[#9a3412]">Pilih kota pengiriman dulu untuk melihat jadwal kirim.</p>
      ) : (
      <>
      <DeliveryDatePicker value={deliveryKey} options={deliveryOptions} fullDays={closedDays} onChange={setDeliveryChoice} formatLabel={deliveryLabel} />
      {earliestFull && (
        <p className="mt-2 flex gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5 text-sm text-[#1e3a8a]" role="status">
          <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-[#2563eb]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
          </svg>
          <span>
            Mohon maaf, pesanan kami sedang penuh. Pengiriman tercepat: <b>{deliveryLabel(deliveryOptions[0])}</b>.
          </span>
        </p>
      )}
      {leadDays > 0 && (
        <p className="mt-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5 text-sm text-[#1e3a8a]" role="status">
          {courierService(city) && (
            <>
              Dikirim menggunakan <b>{courierService(city)}</b>.{' '}
            </>
          )}
          Pengiriman ke {city} memakan waktu 1 hari kerja setelah tanggal kirim, tidak termasuk hari Sabtu dan Minggu.
        </p>
      )}
      <p className="text-xs text-[#8a7a6d] mt-1.5">
        {earliestFull
          ? 'Sudah diisi tanggal tercepat.'
          : leadDays
            ? 'Sudah diisi tanggal tercepat.'
            : 'Sudah diisi tanggal tercepat. Pesan sebelum jam 14.00 WIB bisa dikirim hari ini.'}{' '}
        Ketuk untuk memilih tanggal lain jika ingin dikirim lebih lambat. Tidak ada pengiriman di hari Minggu.
      </p>
      </>
      )}
    </div>
  );

  const chipDays = deliveryOptions.slice(0, 4);
  const shortDay = (key: string) => {
    const d = new Date(deliveryDateFromKey(key));
    return {
      week: d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' }),
      day: d.getUTCDate(),
      month: d.toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' }),
    };
  };
  const phoneDelivery = (
    <section className="sm:hidden flex flex-col gap-2.5">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <h2 className={phoneHeading}>Dikirim kapan?</h2>
        <span className="pb-0.5 text-[12.5px] text-[#4b5563]">bisa diubah</span>
      </div>
      {cityChoice && !city ? (
        <p className="rounded-[14px] bg-[#fdf3ea] border border-[#f3d9c4] px-3 py-2.5 text-sm font-semibold text-[#9a3412]">Pilih kota pengiriman dulu untuk melihat jadwal kirim.</p>
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Tanggal pengiriman">
            {chipDays.map((k) => {
              const d = shortDay(k);
              const on = k === deliveryKey;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDeliveryChoice(k)}
                  className={`w-[62px] shrink-0 rounded-2xl border-[1.5px] py-2 text-center text-[11px] shadow-[0_1px_2px_rgba(59,26,12,0.06)] ${
                    on ? 'border-[#9a3412] bg-[#fdf3ea] text-[#9a3412]' : 'border-[#eee7df] bg-white text-[#4b5563]'
                  }`}
                >
                  {d.week}
                  <b className={`block text-xl leading-6 ${on ? 'text-[#9a3412]' : 'text-[#111827]'}`}>{d.day}</b>
                  {d.month}
                </button>
              );
            })}
            {deliveryOptions.length > chipDays.length && (
              <DeliveryDatePicker
                value={deliveryKey}
                options={deliveryOptions}
                fullDays={closedDays}
                onChange={setDeliveryChoice}
                formatLabel={deliveryLabel}
                chip={{ active: !chipDays.includes(deliveryKey) }}
              />
            )}
          </div>
          {earliestFull && (
            <p className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5 text-sm text-[#1e3a8a]" role="status">
              Mohon maaf, pesanan kami sedang penuh. Pengiriman tercepat: <b>{deliveryLabel(deliveryOptions[0])}</b>.
            </p>
          )}
          {leadDays > 0 && (
            <p className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5 text-sm text-[#1e3a8a]" role="status">
              {courierService(city) && (
                <>
                  Dikirim menggunakan <b>{courierService(city)}</b>.{' '}
                </>
              )}
              Pengiriman ke {city} memakan waktu 1 hari kerja setelah tanggal kirim, tidak termasuk hari Sabtu dan Minggu.
            </p>
          )}
          <p className="px-0.5 text-xs text-[#8a7a6d]">
            {earliestFull || leadDays ? 'Sudah diisi tanggal tercepat.' : 'Sudah diisi tanggal tercepat. Pesan sebelum jam 14.00 WIB bisa dikirim hari ini.'} Tidak ada
            pengiriman di hari Minggu.
          </p>
        </>
      )}
    </section>
  );

  // After signing up from this banner the customer comes back to this checkout.
  const monthlyBanner = <MonthlyVoucherBanner href={href(`/register?next=${encodeURIComponent(href('/checkout'))}`)} />;

  const summary = price && (
    <div ref={breakdownRef} className="flex flex-col">
      <div className="flex flex-col gap-2 sm:gap-4 text-[14px] sm:text-lg leading-6 sm:leading-7 text-[#111827] pb-3 sm:pb-6">
        <div className="flex justify-between">
          <span>Subtotal ({price.totalPacks} pack)</span>
          <span className="font-bold">{formatRupiah(price.subtotal + productDiscount)}</span>
        </div>
        {productDiscount > 0 && (
          <div className="flex justify-between text-[#16a34a]">
            <span>{bundleSaving === 0 ? 'Diskon produk' : bundleSaving === productDiscount ? 'Hemat paket' : 'Diskon produk & paket'}</span>
            <span className="font-bold">−{formatRupiah(productDiscount)}</span>
          </div>
        )}
        {price.discount > 0 && (
          <div className="flex justify-between text-[#16a34a]">
            <span>Diskon voucher{voucher && !voucher.fixedAmount ? ` ${voucher.percent}%` : ''}</span>
            <span className="font-bold">−{formatRupiah(price.discount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Ongkos kirim</span>
          {price.deliveryFee ? <span className="font-bold">{formatRupiah(price.deliveryFee)}</span> : <span className="font-bold text-[#16a34a]">Gratis</span>}
        </div>
        {price.deliveryFee > 0 && (
          <p className="text-sm text-[#6b7280] -mt-2">
            Tambah {freeDeliveryFrom(cityChoice ? address.city : undefined) - price.totalPacks} pack lagi untuk gratis ongkir.
          </p>
        )}
      </div>
      <div className="flex justify-between border-t border-dashed sm:border-solid border-[#e8ddd2] sm:border-[#f3f4f6] pt-3 sm:pt-[25px] text-[17px] sm:text-2xl leading-8 font-bold text-[#111827]">
        <span>Total</span>
        <span className="max-sm:text-[#9a3412]">{formatRupiah(price.total)}</span>
      </div>
    </div>
  );

  const helpLink = (
    <a
      href={whatsappLink(
        CONTACT_WHATSAPP,
        items.length || cartBundles.length
          ? cartWhatsAppText([
              ...cartBundles.map((x) => ({ name: `${x.bundle.name} (${bundlePicksText(x.picks, catalog)})`, qty: 1 })),
              ...items.map((i) => ({ name: i.name, qty: cart[i.product] ?? 0 })),
            ])
          : HELP_TEXT,
      )}
      target="_blank"
      rel="noreferrer"
      onClick={() => trackStep('wa_help')}
      className="font-bold text-[#15803d]"
    >
      Chat kami di WhatsApp
    </a>
  );

  return (
    <form onSubmit={onSubmit} className={`${playfair.variable} flex flex-col gap-5 sm:gap-10`}>
      {ownerMode && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#ea580c] bg-[#fff7ed] px-4 py-3 text-sm text-[#7c2d12]">
          <span>
            <b>Mode admin</b> · pesanan untuk pelanggan. Pelanggan memilih cara bayar dari link yang Anda kirim (24 jam).
          </span>
          <a href={href('/pesan-admin/keluar')} className="shrink-0 font-bold underline">
            Keluar
          </a>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h1 className="font-[family-name:var(--font-heading)] sm:font-[family-name:var(--font-inter)] text-[26px] sm:text-4xl leading-9 sm:leading-10 font-extrabold sm:font-bold text-[#3b1a0c] sm:text-[#111827]">Checkout</h1>
          <span className="sm:hidden pb-1 text-[13px] text-[#4b5563]">{cartCount} barang</span>
        </div>
        {!signedIn && (
          <p className="hidden sm:block text-[13px] sm:text-base text-[#6b7280]">
            Sudah punya akun?{' '}
            <Link href={href(`/login?next=${encodeURIComponent(href('/checkout'))}`)} className="font-bold text-[#9a3412]">
              Masuk
            </Link>{' '}
            untuk memakai voucher Anda. Atau lanjutkan tanpa akun.
          </p>
        )}
        {/* The whole deal before the form (owner, 2026-11-07: 21 of 47 visitors left checkout right after opening it):
            the total with the savings, and WhatsApp help (owner kept only these two). */}
        {price && (
          <div className="sm:hidden rounded-2xl border border-[#bbf7d0] bg-white p-3">
            <p className="flex items-start gap-2 text-[13px] leading-5 text-[#111827]">
              <span aria-hidden>🚚</span>
              {price.deliveryFee > 0 ? (
                <span>
                  <b>Tambah {freeDeliveryFrom(cityChoice ? address.city : undefined) - price.totalPacks} box lagi</b> untuk{' '}
                  <b className="text-[#15803d]">gratis ongkir</b> (hemat {formatRupiah(price.deliveryFee)})
                </span>
              ) : bundleFree ? (
                <span>
                  <b className="text-[#15803d]">Gratis ongkir!</b> Sudah termasuk di paket
                </span>
              ) : (
                <span>
                  <b className="text-[#15803d]">Gratis ongkir</b> untuk pesanan ini 🎉
                </span>
              )}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e7f5ec]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#15803d]"
                style={{ width: `${price.deliveryFee === 0 ? 100 : Math.min(100, Math.round((price.totalPacks / freeDeliveryFrom(cityChoice ? address.city : undefined)) * 100))}%` }}
              />
            </div>
          </div>
        )}
        <div className="hidden sm:flex rounded-2xl bg-[#fdf3ea] border border-[#f3d9c4] px-4 py-3 text-base text-[#5c4d42] flex-col gap-1.5">
          {price && (
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                Total <b className="text-lg text-[#111827]">{formatRupiah(price.total)}</b>
              </span>
              {productDiscount + price.discount > 0 && (
                <span className="text-sm font-bold text-[#15803d]">
                  Hemat {formatRupiah(productDiscount + price.discount)}
                </span>
              )}
            </p>
          )}
          <p>Ada kendala? {helpLink}</p>
        </div>
        {/* Guests: accounts get a monthly voucher (top on wide screens; just above the Bayar button on phones). */}
        {!signedIn && !ownerMode && <div className="hidden lg:block max-w-xl">{monthlyBanner}</div>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-8 flex flex-col gap-6 lg:gap-8">
          {cartSection}
          {upsell}

          <Section
            step={2}
            title="Alamat pengiriman"
            phoneTitle="Kirim ke mana?"
            aside={
              !signedIn && (
                <>
                  Sudah punya akun?{' '}
                  <Link href={href(`/login?next=${encodeURIComponent(href('/checkout'))}`)} className="font-bold text-[#9a3412]">
                    Masuk
                  </Link>
                </>
              )
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
              <Input label="Nama penerima" icon="user" value={address.recipientName} onChange={set('recipientName')} autoComplete="name" required />
              <div>
                <Input label="No. HP penerima" icon="phone" value={address.recipientPhone} onChange={set('recipientPhone')} type="tel" inputMode="tel" autoComplete="tel" required />
                {!signedIn && <span className="block text-sm text-[#6b7280] mt-2">Untuk info pengiriman. Jika pesanan belum selesai, kami bisa bantu lewat WhatsApp.</span>}
              </div>
              {cityChoice && (
                <div className="sm:hidden">
                  <FieldLabel label="Kota" required />
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kota pengiriman">
                    {SAME_DAY_CITIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={city === c}
                        onClick={() => setAddress((a) => ({ ...a, city: c }))}
                        className={`rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold ${
                          city === c ? 'border-[#3b1a0c] bg-[#3b1a0c] text-white' : 'border-[#eee7df] bg-white text-[#4b5563]'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                    <select
                      value={(SAME_DAY_CITIES as readonly string[]).includes(city) ? '' : city}
                      onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                      aria-label="Kota lain"
                      className={`rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold outline-none ${
                        city && !(SAME_DAY_CITIES as readonly string[]).includes(city) ? 'border-[#3b1a0c] bg-[#3b1a0c] text-white' : 'border-[#eee7df] bg-white text-[#4b5563]'
                      }`}
                    >
                      <option value="">Kota lain ▾</option>
                      {DELIVERY_CITIES.filter((c) => !(SAME_DAY_CITIES as readonly string[]).includes(c)).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {cityChoice && (
                <label className="hidden sm:block sm:col-span-2">
                  <FieldLabel label="Kota" required />
                  <select value={city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} className={fieldClass}>
                    <option value="" disabled>
                      Pilih kota pengiriman
                    </option>
                    {DELIVERY_CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block sm:col-span-2">
                <FieldLabel label="Alamat lengkap" required />
                <span className="relative block">
                <FieldIcon name="home" top />
                <textarea
                  value={address.street}
                  onChange={set('street')}
                  autoComplete="street-address"
                  required
                  rows={3}
                  placeholder={cityChoice ? 'Nama jalan, nomor rumah, RT/RW, kelurahan, kecamatan' : 'Nama jalan, nomor rumah, RT/RW, kelurahan, kecamatan, kota'}
                  className={`${fieldClass} h-[92px] sm:h-[118px] resize-none max-sm:pl-10`}
                />
                </span>
              </label>
              <div className="sm:col-span-2">
                <Input label="Catatan untuk kurir" icon="note" value={address.notes} onChange={set('notes')} placeholder="Patokan, warna pagar, dll." />
              </div>
              {!signedIn && (
                <label className="block sm:col-span-2">
                  <FieldLabel label="Email" />
                  <span className="relative block">
                  <FieldIcon name="mail" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="nama@email.com"
                    className={`${fieldClass} max-sm:pl-10`}
                  />
                  </span>
                  <span className="block text-sm text-[#6b7280] mt-2">
                    Isi untuk menerima detail pesanan lewat email. Kami juga buatkan akun supaya Anda bisa melihat pesanan dan voucher Anda.
                  </span>
                </label>
              )}
            </div>

            {showMap ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <FieldLabel label="Titik lokasi" />
                  <button
                    type="button"
                    className="text-base text-[#6b7280] hover:text-red-700 mb-3"
                    onClick={() => {
                      setShowMap(false);
                      setAddress((a) => ({ ...a, latitude: null, longitude: null }));
                    }}
                  >
                    Hapus titik
                  </button>
                </div>
                <PinPicker
                  search={addressSearch}
                  // A picked search result fills the address box only while it is still empty.
                  onAddress={(text) => setAddress((a) => (a.street.trim() ? a : { ...a, street: text }))}
                  latitude={address.latitude}
                  longitude={address.longitude}
                  onChange={(lat, lng) => setAddress((a) => ({ ...a, latitude: lat, longitude: lng }))}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className="w-full flex items-center justify-center gap-2 py-3 sm:py-[21px] px-3 rounded-[14px] sm:rounded-2xl border-[1.5px] sm:border border-dashed sm:border-solid border-[#e3cdb8] sm:border-[#e5e7eb] bg-[#fdf3ea] sm:bg-transparent text-[14px] sm:text-lg leading-6 sm:leading-7 font-bold text-[#9a3412] sm:text-[#374151] hover:bg-[#f9fafb]"
              >
                <Icon name="pin" w={13.5} h={18} />
                Tambahkan titik lokasi di peta (opsional)
              </button>
            )}
          </Section>
          {phoneDelivery}
        </div>

        <div className="lg:col-span-4 flex flex-col gap-5 sm:gap-6 lg:gap-8">
          <Section
            step={3}
            title="Voucher"
            gap="gap-4"
            bare={voucherUsable && isNewCustomer && vouchers.length === 0 && !voucherError && !showCode}
            aside={
              voucherUsable && (!voucher || isNewCustomer) && (
                <button type="button" onClick={() => setShowCode((v) => !v)} className="font-bold text-[#9a3412]">
                  {showCode ? 'Tutup' : 'Punya kode?'}
                </button>
              )
            }
          >
            {!voucherUsable ? (
              <div className="flex items-start gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-[#e5e7eb] bg-[#f9fafb] p-3.5 text-[13px] leading-5 sm:text-base">
                <span className="text-xl" aria-hidden>
                  🏷️
                </span>
                <div>
                  <b className="text-[#111827]">Voucher tidak bisa dipakai untuk {cartBundles.length === 1 ? cartBundles[0].bundle.name : 'paket ini'}</b>
                  <p className="mt-1 text-[#4b5563]">
                    Harga paket sudah lebih murah dari diskon voucher.{' '}
                    {isNewCustomer ? `Diskon pelanggan baru ${welcomeVoucher.percent}% kamu tetap aman, bisa dipakai di pesanan berikutnya.` : 'Voucher kamu tetap aman untuk pesanan berikutnya.'}
                  </p>
                </div>
              </div>
            ) : (
            <>
            {isNewCustomer && (
              <div className="sm:hidden relative flex overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
                <div className="relative w-[92px] shrink-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#22a052] to-[#166534] px-1.5 py-3 text-white">
                  <b className="text-[26px] font-extrabold leading-none tracking-[-1px]">{welcomeVoucher.percent}%</b>
                  <span className="mt-0.5 text-[10px] font-bold tracking-[0.5px]">BARU</span>
                  <span className="absolute right-0 top-2 bottom-2 border-r-2 border-dashed border-white/55" aria-hidden />
                </div>
                <div className="flex-1 min-w-0 py-3 pl-3.5 pr-3">
                  <b className="block text-sm text-[#111827]">Diskon pelanggan baru {welcomeVoucher.percent}%</b>
                  <p className="mt-0.5 text-[11.5px] leading-4 text-[#4b5563]">
                    Maks. {formatRupiah(welcomeVoucher.cap)}, khusus harga produk. Dicek saat bayar dengan nomor HP{email.trim() ? ' dan email' : ''} Anda.
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#15803d]">✓ Terpasang{price && price.discount > 0 ? ` · hemat ${formatRupiah(price.discount)}` : ''}</span>
                    <button type="button" onClick={() => setConfirmRemove(true)} className="text-[11px] font-bold text-[#4b5563]">
                      Lepas
                    </button>
                  </div>
                </div>
                <span className="absolute left-[83px] -top-[9px] size-[18px] rounded-full bg-[#faf9f6]" aria-hidden />
                <span className="absolute left-[83px] -bottom-[9px] size-[18px] rounded-full bg-[#faf9f6]" aria-hidden />
              </div>
            )}
            {isNewCustomer && (
              <div className="max-sm:hidden flex items-center justify-between gap-3 rounded-2xl bg-[#f0fdf4] border border-[#bbf7d0] p-[21px]">
                <div>
                  <p className="text-xl leading-7 font-bold text-[#111827]">Diskon pelanggan baru {welcomeVoucher.percent}%</p>
                  <p className="text-sm text-[#16a34a]">Maks. {formatRupiah(welcomeVoucher.cap)}, khusus harga produk</p>
                  <p className="text-sm text-[#6b7280] mt-1">Untuk pembelian pertama. Dicek saat bayar dengan nomor HP{email.trim() ? ' dan email' : ''} Anda.</p>
                </div>
                <button type="button" onClick={() => setConfirmRemove(true)} className="text-base text-[#6b7280] hover:text-red-700">
                  Lepas
                </button>
              </div>
            )}
            {!signedIn && !voucher && (
              <button
                type="button"
                onClick={() => {
                  setVoucher(newCustomerOffer);
                  setError(null);
                }}
                className="self-start text-base font-bold text-[#9a3412]"
              >
                Pakai diskon pelanggan baru {welcomeVoucher.percent}%
              </button>
            )}
            {voucher && !isNewCustomer && !vouchers.some((v) => v.code === voucher.code) ? (
              // A code typed by hand (not in the customer's list).
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f0fdf4] border border-[#bbf7d0] p-[21px]">
                <div>
                  <p className="text-xl leading-7 font-bold text-[#111827]">{discountLabel(voucher)} dipakai</p>
                  <p className="font-mono text-sm tracking-[0.7px] uppercase text-[#6b7280]">{voucher.code}</p>
                  {voucher.capAmount !== null && <p className="text-sm text-[#16a34a]">Maks. {formatRupiah(voucher.capAmount)}</p>}
                </div>
                <button type="button" onClick={() => setConfirmRemove(true)} className="text-base text-[#6b7280] hover:text-red-700">
                  Lepas
                </button>
              </div>
            ) : (
              (!voucher || isNewCustomer) && (
                <div className={`relative ${showCode || !isNewCustomer ? '' : 'max-sm:hidden'}`}>
                  <input
                    value={voucherInput}
                    onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                    placeholder="KODE VOUCHER"
                    aria-label="Kode voucher"
                    className="w-full rounded-2xl border border-[#e5e7eb] bg-white pl-[25px] pr-[120px] py-5 text-base sm:text-lg uppercase text-[#111827] placeholder:text-[#d1d5db] outline-none focus:border-[#9a3412]"
                  />
                  <button
                    type="button"
                    disabled={!voucherInput.trim() || checkingVoucher}
                    onClick={() => applyVoucher(voucherInput)}
                    className="absolute right-0 top-0 h-full px-8 rounded-2xl bg-[#9a3412] disabled:bg-[#a3a3a3] text-white text-base sm:text-lg font-bold"
                  >
                    Pakai
                  </button>
                </div>
              )
            )}
            {voucherError && <p className="text-sm text-red-700">{voucherError}</p>}
            {voucher && price && voucherUsable && voucher.minOrder > price.voucherBase && (
              <p className="text-sm text-red-700">Minimal belanja produk {formatRupiah(voucher.minOrder)} untuk voucher ini.</p>
            )}
            {vouchers.length > 0 && (
              <div className={`${playfair.variable} flex flex-col gap-2.5`}>
                <p className="text-base text-[#6b7280] pt-2">Voucher Anda:</p>
                {vouchers.map((v) => {
                  const inUse = voucher?.code === v.code;
                  return (
                    <VoucherTicket
                      key={v.code}
                      voucher={v}
                      codeLabel={inUse ? 'Dipakai ✓' : 'Kode voucher'}
                      codeLabelClass={inUse ? 'text-[#16a34a]' : 'text-[#6b7280]'}
                      action={
                        inUse ? (
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(true)}
                            className={`${ticketButton} border border-[#9a3412] bg-white text-[#9a3412] hover:bg-[#fdf3ea]`}
                          >
                            Lepas
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={checkingVoucher}
                            onClick={() => applyVoucher(v.code)}
                            className={`${ticketButton} bg-[#9a3412] hover:bg-[#7c2d12] text-white`}
                          >
                            Pakai
                          </button>
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
            </>
            )}
          </Section>

          <Section step={4} title="Pembayaran" phoneTitle="Ringkasan">
            {ownerMode && (
              <label className="flex flex-col gap-1.5 rounded-2xl border-2 border-[#ea580c] bg-[#fff7ed] p-3">
                <span className="text-sm font-bold text-[#7c2d12]">Pelanggan datang dari</span>
                <select
                  value={ownerSource}
                  onChange={(e) => setOwnerSource(e.target.value)}
                  className="h-12 rounded-xl border border-[#e8ddd2] bg-white px-3 text-base text-[#111827]"
                >
                  <option value="">Pilih kode WhatsApp…</option>
                  {OWNER_SOURCES.map((o) => (
                    <option key={o.code} value={o.code}>
                      #{o.code} · {o.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#7c2d12]">Lihat kode di akhir pesan pertama pelanggan, mis. &quot;#L&quot;.</span>
              </label>
            )}
            <p className="hidden sm:block text-base sm:text-lg leading-[29.25px] text-[#6b7280]">
              {onlineMethods
                ? `Bayar dengan QRIS (semua e-wallet dan m-banking)${wallets.map((w) => `, ${WALLET_TITLE[w]}`).join('')}${wallets.length ? ',' : ''} atau transfer manual ke ${PAYMENT_INSTRUCTIONS.bank}. Pilih caranya setelah menekan Bayar.`
                : `Transfer bank ke ${PAYMENT_INSTRUCTIONS.bank}. Nomor rekening ditampilkan setelah pesanan dibuat, lalu unggah bukti transfer.`}
            </p>
            {summary}
            <div className="hidden sm:block">{deliveryInfo}</div>
            {!signedIn && !ownerMode && <div className="lg:hidden">{monthlyBanner}</div>}
            <p className="hidden sm:block text-base text-center text-[#6b7280]">Ada kendala? {helpLink}</p>
            <p className="sm:hidden flex items-center gap-2.5 rounded-[14px] border border-[#f3d9c4] bg-[#fdf3ea] px-3 py-2.5 text-[13px] text-[#111827]">
              <span className="size-8 shrink-0 rounded-[10px] bg-white grid place-items-center" aria-hidden>
                💬
              </span>
              <span>Ada kendala? {helpLink}</span>
            </p>
            <div ref={errorRef} className="empty:hidden">
              <ErrorBox message={error} />
            </div>
            {error && isNewCustomer && /pembelian pertama/.test(error) && (
              <button
                type="button"
                onClick={() => {
                  setVoucher(null);
                  setError(null);
                }}
                className="w-full py-3.5 rounded-2xl border-2 border-[#9a3412] text-[#9a3412] text-lg font-bold bg-white"
              >
                Lepas diskon, lanjut harga normal
              </button>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-5 sm:py-6 rounded-[24px] bg-[#9a3412] hover:bg-[#7c2d12] text-white text-xl sm:text-2xl leading-8 font-bold shadow-[0px_10px_15px_-3px_rgba(154,52,18,0.2),0px_4px_6px_-4px_rgba(154,52,18,0.2)] disabled:opacity-60"
            >
              {busy
                ? 'Membuat pesanan…'
                : `${onlineMethods && !ownerMode ? 'Bayar' : 'Buat pesanan'} · ${price ? formatRupiah(price.total) : ''}`}
            </button>
          </Section>
        </div>
      </div>
      {price && (
        <CheckoutTotalBar total={price.total} saving={productDiscount + price.discount} label={onlineMethods && !ownerMode ? 'Bayar' : 'Buat pesanan'} busy={busy} breakdownRef={breakdownRef} note={ownerMode ? 'Pelanggan memilih cara bayar dari link' : undefined} />
      )}
      {choosingPayment && (
        <PaymentChoiceDialog
          total={price ? price.total : null}
          wallets={wallets}
          busy={placingWith}
          onChoose={(choice) => void placeOrder(choice)}
          onClose={() => setChoosingPayment(false)}
        />
      )}
      {confirmRemove && voucher && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="remove-voucher-title">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h2 id="remove-voucher-title" className="text-xl font-bold text-[#111827]">
              Lepas penggunaan voucher?
            </h2>
            <p className="mt-2 text-base text-[#4b5563]">
              Dengan anda melepas penggunaan voucher ini, anda akan membayar dengan harga tanpa diskon. Anda dapat kembali menggunakan voucher setelah melepaskannya.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmRemove(false)}
                className="w-full py-3.5 rounded-2xl bg-[#9a3412] hover:bg-[#7c2d12] text-white text-lg font-bold"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoucher(null);
                  setConfirmRemove(false);
                }}
                className="w-full py-3 rounded-2xl border border-[#e5e7eb] text-base font-semibold text-[#6b7280] hover:text-red-700"
              >
                Ya, Lepas
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
