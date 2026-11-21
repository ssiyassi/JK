// Orders placed as a guest in this browser, so the shop can show links back to them (login page). Only the order
// ids are kept here; opening an order still needs its key, which is in an httpOnly cookie.
const KEY = 'jk_guest_orders';
const MAX = 10;

export interface GuestOrderRef {
  id: string; // orderRowId
  orderId: string; // order number shown to customers
  at: number;
}

export function readGuestOrders(): GuestOrderRef[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(list)
      ? list.filter((o): o is GuestOrderRef => typeof o?.id === 'string' && typeof o?.orderId === 'string' && typeof o?.at === 'number')
      : [];
  } catch {
    return []; // private mode or blocked storage
  }
}

export function rememberGuestOrder(id: string, orderId: string) {
  try {
    const rest = readGuestOrders().filter((o) => o.id !== id);
    localStorage.setItem(KEY, JSON.stringify([{ id, orderId, at: Date.now() }, ...rest].slice(0, MAX)));
  } catch {
    /* storage unavailable: the order email (if any) still has the link */
  }
}
