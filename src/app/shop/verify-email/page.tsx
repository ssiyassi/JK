import { redirect } from 'next/navigation';
import { getDB } from '@/lib/server';
import { formatRupiah } from '@/lib/shop/catalog';
import { secondsUntilResend } from '@/lib/shop/email-verify';
import { currentCustomer, shopBase } from '@/lib/shop/server';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import VerifyEmailForm from '../_components/VerifyEmailForm';

export const dynamic = 'force-dynamic';

/** After sign-up: the customer types the 6-digit code from their email to confirm it and get the welcome voucher. */
export default async function VerifyEmailPage(props: { searchParams: Promise<{ next?: string }> }) {
  const [search, base, customer] = await Promise.all([props.searchParams, shopBase(), currentCustomer()]);
  if (!customer) redirect(`${base}/login?next=${encodeURIComponent(`${base}/verify-email`)}`);
  if (customer.emailVerifiedAt !== null) redirect(`${base}/account`);
  const db = getDB();
  const [rules, resendWait] = await Promise.all([loadVoucherRules(db), secondsUntilResend(db, customer.id, Date.now())]);
  return (
    <VerifyEmailForm
      email={customer.email}
      voucherText={`${rules.WELCOME.percent}% (maks. ${formatRupiah(rules.WELCOME.cap)})`}
      next={search.next ?? null}
      resendWait={resendWait}
    />
  );
}
