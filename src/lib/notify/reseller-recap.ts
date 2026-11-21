// Sunday 12:00 WIB email to the owner: every reseller with boxes in the current two-month reward period, with
// the ready-made WhatsApp message and a one-tap button that opens WhatsApp with it.
// Framework-free (runs from the Worker's Cron Trigger, see custom-worker.ts).
//
// Numbers come from the admin Reseller Sales page (resellerSalesReport), delivered orders only, by when they were marked
// delivered: this week = Sunday 12:00 to Sunday 12:00 WIB, period = the reward period of the delivery day (owner,
// 2026-11-01; same numbers as the stamp card). The period count starts again from 0 at every 100 boxes.
import type { D1Database } from '../core/d1.ts';
import { roundBoxes } from '../core/products.ts';
import { resellerSalesReport } from '../core/resellers.ts';
import { jakartaDateKey, jakartaParts, MONTHS_ID } from '../core/time.ts';

export interface RewardTier {
  boxes: number;
  /** What the reseller is told they are working towards. */
  goal: string;
  freeBoxes: number;
  cash: number;
}

/** Reward tiers within one 0–100 cycle up to the September–October 2026 period: cash only. */
export const CASH_TIERS: readonly RewardTier[] = [
  { boxes: 65, goal: 'Cash {period} Rp650.000,-', freeBoxes: 0, cash: 650_000 },
  { boxes: 100, goal: 'Cash {period} Rp3.000.000,-', freeBoxes: 0, cash: 3_000_000 },
];

/**
 * From November–December 2026 (owner, 2026-10-16): 15 boxes = 1 free box, 25 = 2 more (3 in total),
 * 65 = Rp650.000, 100 = Rp2.350.000 more (Rp3.000.000 in total). Free boxes are earned again after each reset at 100.
 * Wording changed 2026-10-24 to "GRATIS 2 Box LAGI" / "CASH Rp2.350.000 LAGI" (owner: simpler for resellers).
 */
export const FREE_BOX_TIERS: readonly RewardTier[] = [
  { boxes: 15, goal: '{period}: GRATIS 1 Box', freeBoxes: 1, cash: 0 },
  { boxes: 25, goal: '{period}: GRATIS 2 Box LAGI', freeBoxes: 3, cash: 0 },
  { boxes: 65, goal: 'CASH {period} Rp650.000,-', freeBoxes: 3, cash: 650_000 },
  { boxes: 100, goal: 'CASH {period} Rp2.350.000,- LAGI', freeBoxes: 3, cash: 3_000_000 }, // cash = total incl. the 650k
];

export interface RecapPeriod {
  /** "November dan Desember 2026" */
  label: string;
  /** "November-Desember" */
  short: string;
  tiers: readonly RewardTier[];
  /** Public poster page for this period; WhatsApp shows its preview image under the message. */
  posterUrl: string | null;
}

/** Poster pages per period start ("2026-10" = November–December 2026, months counted from 0). */
/** The reseller stamp card (src/app/shop/stamp), linked in the message from November 2026. */
export const STAMP_URL = 'https://jentiskitchen.id/stamp';

const POSTERS: Record<string, string> = { '2026-10': 'https://jentiskitchen.id/hadiah-reseller' };

export function recapPeriod(now: Date | number): RecapPeriod {
  const p = jakartaParts(now);
  const first = Math.floor(p.month / 2) * 2;
  const [a, b] = [MONTHS_ID[first], MONTHS_ID[first + 1]];
  const tiers = p.year * 12 + first >= 2026 * 12 + 10 ? FREE_BOX_TIERS : CASH_TIERS;
  return { label: `${a} dan ${b} ${p.year}`, short: `${a}-${b}`, tiers, posterUrl: POSTERS[`${p.year}-${first}`] ?? null };
}

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')},-`;

/** Rewards earned so far in the period: every full 100 gives the top tier, plus what the current cycle reached. */
export function earnedRewards(periodBoxes: number, tiers: readonly RewardTier[]): { freeBoxes: number; cash: number; text: string | null } {
  const top = tiers[tiers.length - 1];
  const fullCycles = Math.floor(roundBoxes(periodBoxes) / 100);
  const reached = [...tiers].reverse().find((t) => t.boxes < 100 && roundBoxes(periodBoxes % 100) >= t.boxes);
  const freeBoxes = fullCycles * top.freeBoxes + (reached?.freeBoxes ?? 0);
  const cash = fullCycles * top.cash + (reached?.cash ?? 0);
  const parts = [freeBoxes ? `${freeBoxes} Box gratis` : '', cash ? `Cash ${rupiah(cash)}` : ''].filter(Boolean);
  return { freeBoxes, cash, text: parts.length ? parts.join(' + ') : null };
}

/** "2026-10-12" -> "12/10/2026" (day without leading zero, month with). */
export function shortDate(key: string): string {
  const [y, m, d] = key.split('-');
  return `${Number(d)}/${m}/${y}`;
}

export interface ResellerRecap {
  reseller: string;
  parentReseller: string | null;
  phone: string | null;
  weekBoxes: number;
  /** Real total in the period. */
  periodBoxes: number;
  /** Total within the current 0–100 cycle (what the reseller is told). */
  cycleBoxes: number;
  /** Rewards earned so far in the period ("3 Box gratis + Cash Rp650.000,-"), null when none yet. Owner email only. */
  earned: string | null;
  message: string;
  whatsappUrl: string;
}

export function rewardMessage(
  name: string,
  weekBoxes: number,
  periodBoxes: number,
  week: { start: string; end: string },
  period: RecapPeriod,
): { cycleBoxes: number; earned: string | null; text: string } {
  const cycleBoxes = roundBoxes(periodBoxes % 100);
  const tiers = period.tiers;
  const tier = tiers.find((t) => cycleBoxes < t.boxes) ?? tiers[tiers.length - 1];
  const toGo = roundBoxes(tier.boxes - cycleBoxes);
  const earned = tiers === CASH_TIERS ? null : earnedRewards(periodBoxes, tiers).text;
  const text = [
    `Hi ${name}, Penjualan kamu di minggu ini (${shortDate(week.start)} - ${shortDate(week.end)}) adalah ${weekBoxes} Box, dan total penjualan kamu di periode bulan ${period.label} adalah ${cycleBoxes} Box.`,
    '',
    `${toGo} Box lagi menuju reward ${tier.goal.replace('{period}', period.short)}`,
    'Terima kasih sudah menjadi reseller Jentis Kitchen.',
    'Semangat !',
    'Have a nice week !',
    '-Jentis Kitchen-',
    '',
    'Apakah mau mencoba untuk open PO Daging di minggu ini atau butuh foto untuk promosi?',
    ...(period.posterUrl ? ['', `Info hadiah reseller: ${period.posterUrl}`] : []),
    ...(tiers === CASH_TIERS ? [] : [`${period.posterUrl ? '' : '\n'}Cek kartu stamp kamu: ${STAMP_URL}`]),
  ].join('\n');
  return { cycleBoxes, earned, text };
}

/** wa.me link with the message filled in; without a number WhatsApp asks which chat to send it to. */
export function whatsappUrl(phone: string | null, text: string): string {
  return `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`;
}

export async function resellerRewardRecap(db: D1Database, now: Date | number = Date.now()) {
  const report = await resellerSalesReport(db, jakartaDateKey(now));
  const period = recapPeriod(now);

  // Resellers are keyed by name in the report; take the first number saved under that name. Names that are
  // only on old orders (reseller deleted from My Resellers) are left out.
  const { results } = await db
    .prepare('SELECT reseller, phone FROM resellers ORDER BY rowid')
    .all<{ reseller: string; phone: string | null }>();
  const phones = new Map<string, string | null>();
  for (const r of results) if (!phones.get(r.reseller)) phones.set(r.reseller, r.phone);

  const rows = [...report.independentResellers, ...report.parentResellers.flatMap((p) => p.children)]
    .filter((r) => r.rewardSales > 0 && phones.has(r.reseller))
    .sort((a, b) => a.reseller.localeCompare(b.reseller));

  const resellers: ResellerRecap[] = rows.map((r) => {
    const phone = phones.get(r.reseller) ?? null;
    const { cycleBoxes, earned, text } = rewardMessage(r.reseller, r.weeklySales, r.rewardSales, report.weekRange, period);
    return {
      reseller: r.reseller,
      parentReseller: r.parentReseller,
      phone,
      weekBoxes: r.weeklySales,
      periodBoxes: r.rewardSales,
      cycleBoxes,
      earned,
      message: text,
      whatsappUrl: whatsappUrl(phone, text),
    };
  });
  return { week: report.weekRange, period, resellers };
}

export type RewardRecap = Awaited<ReturnType<typeof resellerRewardRecap>>;
