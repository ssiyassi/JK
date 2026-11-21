// Couriers the owner picks with "Ship order" (owner, 2026-11-06). Grab, Gojek, Lalamove and Paxel give a tracking link;
// TIKI and JNE give a resi (tracking number): the customer copies it and checks it on the courier's own page, since
// neither page takes the number in its address.
export const COURIERS = [
  { id: 'grab', name: 'Grab', checkUrl: null },
  { id: 'gojek', name: 'Gojek', checkUrl: null },
  { id: 'lalamove', name: 'Lalamove', checkUrl: null },
  { id: 'paxel', name: 'Paxel', checkUrl: null },
  { id: 'tiki', name: 'TIKI', checkUrl: 'https://www.tiki.id/id/track' },
  { id: 'jne', name: 'JNE', checkUrl: 'https://www.jne.co.id/tracking-package' },
] as const;

export type CourierId = (typeof COURIERS)[number]['id'];
export type Courier = (typeof COURIERS)[number];

export const findCourier = (id: unknown): Courier | null => COURIERS.find((c) => c.id === id) ?? null;

/** TIKI and JNE: the owner types the resi instead of pasting a link. */
export const usesResi = (c: Courier | null): boolean => Boolean(c?.checkUrl);
