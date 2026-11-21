import type { D1Database } from '../core/d1';
import { customerDiscountText, unsentBlastJobs, type Campaign } from './campaigns';
import { campaignVoucherEmail } from './email';
import { emailLinks, sendEmails } from './server';

/** Sends every email-blast code of the voucher whose email has not gone out yet. */
export async function sendBlastEmails(db: D1Database, c: Campaign): Promise<{ attempted: number; sent: number }> {
  const jobs = await unsentBlastJobs(db, c.id);
  const links = emailLinks();
  const text = customerDiscountText(c);
  const sent = await sendEmails(
    jobs.map((j) =>
      campaignVoucherEmail(j.email, j.name, {
        codeId: j.codeId,
        code: j.code,
        title: c.name,
        discountText: text,
        minOrder: c.minOrder,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
      }, links),
    ),
  );
  return { attempted: jobs.length, sent };
}
