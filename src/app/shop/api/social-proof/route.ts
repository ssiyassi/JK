import { NextResponse } from 'next/server';
import { errorResponse, getDB } from '@/lib/server';
import { loadSocialProof } from '@/lib/shop/socialProof';

/** Real recent orders (city + boxes only) for the shop's snack bar, box count and delivery countdown. Cached 5 minutes. */
export async function GET() {
  try {
    const data = await loadSocialProof(getDB(), Date.now());
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } });
  } catch (error) {
    return errorResponse(error, 'Gagal memuat data.', { route: 'GET shop/api/social-proof' });
  }
}
