// Meat types used for the HPP. Kept separate from costs.ts so the browser forms can use it without the server code.
export const MEATS = ['babi', 'sapi'] as const;
export type Meat = (typeof MEATS)[number];
export const MEAT_LABELS: Record<Meat, string> = { babi: 'Babi', sapi: 'Sapi' };

export function isMeat(v: unknown): v is Meat {
  return v === 'babi' || v === 'sapi';
}
