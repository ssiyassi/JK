import { NextRequest, NextResponse } from 'next/server';
import { addIngredientPurchases, deleteIngredientPurchase } from '@/lib/core/costs';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';

// Shop Ingredients: one shopping trip (date + rows of ingredient, size, price).
export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const saved = await addIngredientPurchases(getDB(), body);
    log('info', 'ingredients_bought', { rows: saved, user: actor(request) });
    return NextResponse.json({ success: true, message: `${saved} ingredient${saved === 1 ? '' : 's'} saved` });
  } catch (error) {
    return errorResponse(error, 'Failed to save ingredients', { route: 'POST /api/ingredients', user: actor(request) });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    await deleteIngredientPurchase(getDB(), id);
    log('info', 'ingredient_purchase_deleted', { id, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete', { route: 'DELETE /api/ingredients', user: actor(request) });
  }
}
