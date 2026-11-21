import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { createProduct } from '@/lib/shop/products';

/** Create a website-only product (not stock-tracked). */
export async function POST(request: NextRequest) {
  try {
    const product = await createProduct(getDB(), await readJson(request), Date.now());
    log('info', 'shop_product_created', { product: product.product, user: actor(request) });
    return NextResponse.json({ success: true, product });
  } catch (error) {
    return errorResponse(error, 'Failed to create product', { route: 'POST /api/website/products', user: actor(request) });
  }
}
