import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { deleteProduct, moveProduct, updateProduct } from '@/lib/shop/products';

/** Save a product's details (and optionally a new photo). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ product: string }> }) {
  const { product } = await context.params;
  try {
    const item = await updateProduct(getDB(), product, await readJson(request), Date.now());
    log('info', 'shop_product_updated', { product, price: item.price, visible: item.visible, user: actor(request) });
    return NextResponse.json({ success: true, product: item });
  } catch (error) {
    return errorResponse(error, 'Failed to save product', { route: 'PATCH /api/website/products/[product]', product, user: actor(request) });
  }
}

/** Move a product up or down: { direction: 'up' | 'down' }. */
export async function POST(request: NextRequest, context: { params: Promise<{ product: string }> }) {
  const { product } = await context.params;
  try {
    const body = await readJson(request);
    const products = await moveProduct(getDB(), product, body.direction === 'up' ? 'up' : 'down', Date.now());
    return NextResponse.json({ success: true, products });
  } catch (error) {
    return errorResponse(error, 'Failed to move product', { route: 'POST /api/website/products/[product]', product, user: actor(request) });
  }
}

/** Delete a website-only product (stock products can only be hidden). */
export async function DELETE(request: NextRequest, context: { params: Promise<{ product: string }> }) {
  const { product } = await context.params;
  try {
    await deleteProduct(getDB(), product);
    log('info', 'shop_product_deleted', { product, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete product', { route: 'DELETE /api/website/products/[product]', product, user: actor(request) });
  }
}
