// Payday Promo texts, shared by the server and the admin editor (no database code, safe in the browser).
import { MONTHS_ID } from '../core/time.ts';

export interface PaydayPromo {
  /** Poster URL (path on the shop). */
  image: string;
  imageMediaId: string | null;
  startDate: string;
  endDate: string;
  caption: string;
  whatsappTemplate: string;
  updatedAt: number;
}

const parts = (key: string) => key.split('-').map(Number) as [number, number, number];

/** "Oktober" (month of the start date). */
export function paydayMonth(p: Pick<PaydayPromo, 'startDate'>): string {
  return MONTHS_ID[parts(p.startDate)[1] - 1];
}

/** "25 – 31 Oktober 2026", "28 Oktober – 3 November 2026", "29 Desember 2026 – 2 Januari 2027". */
export function paydayPeriod(p: Pick<PaydayPromo, 'startDate' | 'endDate'>): string {
  const [y1, m1, d1] = parts(p.startDate);
  const [y2, m2, d2] = parts(p.endDate);
  if (y1 !== y2) return `${d1} ${MONTHS_ID[m1 - 1]} ${y1} – ${d2} ${MONTHS_ID[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${MONTHS_ID[m1 - 1]} – ${d2} ${MONTHS_ID[m2 - 1]} ${y2}`;
  return d1 === d2 ? `${d1} ${MONTHS_ID[m1 - 1]} ${y1}` : `${d1} – ${d2} ${MONTHS_ID[m1 - 1]} ${y1}`;
}

/** The template with {{reseller name}} / {{nama}}, {{month}} / {{bulan}} and {{link}} filled in (any capitals). */
export function paydayMessage(template: string, resellerName: string, month: string, link: string): string {
  return template
    .replace(/\{\{\s*(reseller name|reseller|nama)\s*\}\}/gi, resellerName)
    .replace(/\{\{\s*(month|bulan)\s*\}\}/gi, month)
    .replace(/\{\{\s*link\s*\}\}/gi, link);
}
