import { NextResponse } from 'next/server';
import { getDB } from '@/lib/server';
import { syncMetaIfStale } from '@/lib/marketing/liveSync';

// Called by the HPP lock screen while the owner waits for the emailed code (owner 14 Nov 2026: "start calculating
// while I wait for the OTP"): reads the latest Meta ad spend now, so the unlocked page opens without waiting for Meta.
// Only ad spend totals are touched, nothing secret, so it does not need the HPP lock (the admin host is behind Access).
export async function GET() {
  await syncMetaIfStale(getDB());
  return new NextResponse(null, { status: 204 });
}
