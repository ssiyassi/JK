import { NextRequest, NextResponse } from 'next/server';
import { addMeatPurchase, deleteMeatPurchase, saveCostSettings, saveProductCosting, saveRecipe } from '@/lib/core/costs';
import { AppError } from '@/lib/core/d1';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { requireHppUnlocked } from '@/lib/hpp-lock-server';

// HPP page actions. Body: { action: 'meat' | 'settings' | 'product' | 'recipe', ... }
export async function POST(request: NextRequest) {
  try {
    await requireHppUnlocked(request);
    const body = await readJson(request);
    const db = getDB();
    switch (body.action) {
      case 'meat':
        await addMeatPurchase(db, body);
        break;
      case 'settings':
        await saveCostSettings(db, body);
        break;
      case 'product':
        await saveProductCosting(db, body);
        break;
      case 'recipe':
        await saveRecipe(db, body);
        break;
      default:
        throw new AppError(400, 'Unknown action');
    }
    // Recipe amounts are never written to the logs.
    log('info', 'hpp_changed', { action: body.action, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to save', { route: 'POST /api/hpp', user: actor(request) });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireHppUnlocked(request);
    const id = new URL(request.url).searchParams.get('meat') ?? '';
    await deleteMeatPurchase(getDB(), id);
    log('info', 'meat_price_deleted', { id, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete', { route: 'DELETE /api/hpp', user: actor(request) });
  }
}
