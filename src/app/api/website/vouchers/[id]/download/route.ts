import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB } from '@/lib/server';
import { campaignCodesCsv, campaignUsageCsv, getCampaign } from '@/lib/shop/campaigns';
import { AppError } from '@/lib/core/d1';
import { jakartaDateKey } from '@/lib/core/time';
import { buildZip } from '@/lib/core/zip';

export const dynamic = 'force-dynamic';

/**
 * ?what=codes (unique codes only) or ?what=usage. Unique-code files come as a ZIP locked with the voucher prefix
 * as password, because they contain codes that work at checkout. The other usage reports are plain CSV.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const db = getDB();
    const campaign = await getCampaign(db, id);
    if (!campaign) throw new AppError(404, 'Voucher not found');
    const what = new URL(request.url).searchParams.get('what') === 'codes' ? 'codes' : 'usage';
    if (what === 'codes' && campaign.type !== 'UNIQUE') throw new AppError(400, 'Only unique-code vouchers have a code list');
    const csv = what === 'codes' ? await campaignCodesCsv(db, campaign) : await campaignUsageCsv(db, campaign);
    const base = `${(campaign.prefix ?? campaign.name).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${what}-${jakartaDateKey(Date.now())}`;
    if (campaign.type === 'UNIQUE') {
      const zip = buildZip([{ name: `${base}.csv`, data: new TextEncoder().encode(csv) }], campaign.prefix, new Date(Date.now() + 7 * 3600_000));
      return new NextResponse(zip as BodyInit, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${base}.zip"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, 'Download failed', { route: 'GET /api/website/vouchers/[id]/download', campaign: id });
  }
}
