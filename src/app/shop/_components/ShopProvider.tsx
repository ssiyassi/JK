'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { trackMeta } from '@/lib/client/metaPixel';
import { cartCount as countCart, type Cart, type CatalogItem } from '@/lib/shop/catalog';
import { bundleTotals, slotOptions, type Bundle, type CartBundle } from '@/lib/shop/bundles';

/** A bundle in the cart with its definition (for prices and names). */
export interface CartBundleItem extends CartBundle {
  bundle: Bundle;
}

interface ShopContextValue {
  base: string; // '' on jentiskitchen.id, '/shop' elsewhere
  customer: { name: string; email: string } | null;
  catalog: CatalogItem[]; // products currently shown in the shop, in display order
  welcomeVoucher: { percent: number; cap: number }; // new-account voucher (editable in the admin)
  monthlyVoucher: { percent: number; cap: number }; // monthly voucher for accounts (editable in the admin)
  cart: Cart; // quantities by product id (products bought on their own)
  bundles: Bundle[]; // bundles on sale (Paket Hemat)
  cartBundles: CartBundleItem[]; // bundles in the cart, each with the product picked per slot
  cartCount: number; // packs in the cart, bundles included
  cartSubtotal: number; // what the cart costs before vouchers and delivery
  cartOriginal: number; // the same at crossed-out prices ("harga coret")
  cartFreeDelivery: boolean; // a bundle in the cart ships the order free
  cartReady: boolean; // false until the saved cart has been read from this browser
  setQty: (product: string, qty: number) => void;
  addBundle: (bundleId: string, picks: string[]) => void;
  setBundleAt: (index: number, picks: string[] | null) => void; // null removes it
  clearCart: () => void;
  href: (path: string) => string;
}

const ShopContext = createContext<ShopContextValue | null>(null);
const CART_KEY = 'jk_cart_v1';
const BUNDLES_KEY = 'jk_bundles_v1';

export function ShopProvider({
  base,
  customer,
  catalog,
  welcomeVoucher,
  monthlyVoucher,
  bundles = [],
  children,
}: {
  base: string;
  customer: { name: string; email: string } | null;
  catalog: CatalogItem[];
  welcomeVoucher: { percent: number; cap: number };
  monthlyVoucher: { percent: number; cap: number };
  bundles?: Bundle[];
  children: React.ReactNode;
}) {
  const [cart, setCart] = useState<Cart>({});
  const [savedBundles, setSavedBundles] = useState<CartBundle[]>([]);
  const [cartReady, setCartReady] = useState(false);

  // The cart lives in this browser only; it survives reloads but is never required.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        // Only products still on sale; deleted or hidden products drop out of the cart.
        const q: Cart = {};
        for (const item of catalog) {
          const n = Number(saved[item.product]);
          if (Number.isInteger(n) && n > 0 && n <= 50) q[item.product] = n;
        }
        setCart(q);
      }
      // Bundles still on sale whose picks are still allowed; anything else drops out.
      const sb = JSON.parse(localStorage.getItem(BUNDLES_KEY) || '[]');
      if (Array.isArray(sb)) {
        setSavedBundles(
          sb
            .filter((x): x is CartBundle => Boolean(x) && typeof x.bundleId === 'string' && Array.isArray(x.picks))
            .filter((x) => {
              const b = bundles.find((d) => d.id === x.bundleId);
              return b && x.picks.length === b.slots.length && x.picks.every((p, i) => slotOptions(b.slots[i], catalog).some((o) => o.product === p));
            })
            .slice(0, 10),
        );
      }
    } catch {
      /* storage unavailable: start empty */
    }
    setCartReady(true);
    // Read once on load; products hidden later are dropped at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (q: Cart) => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(q));
    } catch {
      /* ignore */
    }
  };

  // Latest cart outside the state updater, so Meta's AddToCart is sent once per click (updaters may run twice).
  const cartRef = useRef(cart);
  cartRef.current = cart;

  const setQty = useCallback((product: string, qty: number) => {
    const added = Math.max(0, Math.min(50, Math.floor(qty))) - (cartRef.current[product] ?? 0);
    if (added > 0) {
      const item = catalog.find((c) => c.product === product);
      trackMeta('AddToCart', { content_type: 'product', content_ids: [product], contents: [{ id: product, quantity: added }], value: (item?.price ?? 0) * added, currency: 'IDR' });
    }
    setCart((prev) => {
      const next = { ...prev };
      const n = Math.max(0, Math.min(50, Math.floor(qty)));
      if (n) next[product] = n;
      else delete next[product];
      save(next);
      return next;
    });
  }, [catalog]);

  const saveBundles = (list: CartBundle[]) => {
    try {
      localStorage.setItem(BUNDLES_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  };

  const addBundle = useCallback(
    (bundleId: string, picks: string[]) => {
      const b = bundles.find((x) => x.id === bundleId);
      if (b) {
        const counts: Record<string, number> = {};
        for (const p of picks) counts[p] = (counts[p] ?? 0) + 1;
        trackMeta('AddToCart', { content_type: 'product', content_ids: Object.keys(counts), contents: Object.entries(counts).map(([id, quantity]) => ({ id, quantity })), value: b.price, currency: 'IDR' });
      }
      setSavedBundles((prev) => {
        const next = [...prev, { bundleId, picks: [...picks] }].slice(0, 10);
        saveBundles(next);
        return next;
      });
    },
    [bundles],
  );

  const setBundleAt = useCallback((index: number, picks: string[] | null) => {
    setSavedBundles((prev) => {
      const next = picks ? prev.map((x, i) => (i === index ? { ...x, picks: [...picks] } : x)) : prev.filter((_, i) => i !== index);
      saveBundles(next);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    save({});
    saveBundles([]);
    setCart({});
    setSavedBundles([]);
  }, []);

  const cartBundles = useMemo<CartBundleItem[]>(
    () => savedBundles.flatMap((x) => {
      const bundle = bundles.find((b) => b.id === x.bundleId);
      return bundle ? [{ ...x, bundle }] : [];
    }),
    [savedBundles, bundles],
  );
  const loose = catalog.reduce((sum, item) => sum + item.price * (cart[item.product] ?? 0), 0);
  const looseOriginal = catalog.reduce((sum, item) => sum + (item.compareAtPrice ?? item.price) * (cart[item.product] ?? 0), 0);
  const cartSubtotal = loose + cartBundles.reduce((sum, x) => sum + x.bundle.price, 0);
  const cartOriginal = looseOriginal + cartBundles.reduce((sum, x) => sum + Math.max(x.bundle.price, bundleTotals(x.bundle, catalog).compareAt), 0);
  const cartFreeDelivery = cartBundles.some((x) => x.bundle.freeDelivery);
  const packs = countCart(cart) + cartBundles.reduce((sum, x) => sum + x.picks.length, 0);

  const value = useMemo<ShopContextValue>(
    () => ({
      base,
      customer,
      catalog,
      welcomeVoucher,
      monthlyVoucher,
      cart,
      bundles,
      cartBundles,
      cartCount: packs,
      cartSubtotal,
      cartOriginal,
      cartFreeDelivery,
      cartReady,
      setQty,
      addBundle,
      setBundleAt,
      clearCart,
      href: (path: string) => (path === '/' ? base || '/' : `${base}${path}`),
    }),
    [base, customer, catalog, welcomeVoucher, monthlyVoucher, cart, bundles, cartBundles, packs, cartSubtotal, cartOriginal, cartFreeDelivery, cartReady, setQty, addBundle, setBundleAt, clearCart],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside ShopProvider');
  return ctx;
}

/** POST JSON to a shop API route; throws the server's message on failure. */
export async function postJson<T = Record<string, unknown>>(
  base: string,
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {
    /* non-JSON error page */
  }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Terjadi kesalahan. Silakan coba lagi.');
  return data as T;
}
