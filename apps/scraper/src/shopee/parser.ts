import { z } from 'zod';
import type { ExtractionResult } from '../domain/model.js';
import { assertAllowedImageUrl } from './url-policy.js';

const Product = z.object({
  name: z.string().min(1).max(1000).optional(),
  title: z.string().min(1).max(1000).optional(),
  description: z.string().max(100_000).optional(),
  image: z.string().optional(),
  images: z.array(z.string()).max(100).optional(),
  price: z.number().finite().optional(),
  price_min: z.number().finite().optional(),
  price_before_discount: z.number().finite().optional(),
  itemid: z.union([z.string(), z.number()]).optional(),
  shopid: z.union([z.string(), z.number()]).optional(),
  sold: z.number().optional(),
  historical_sold: z.number().optional(),
  item_rating: z
    .object({
      rating_star: z.number().optional(),
      rating_count: z.array(z.number()).optional(),
    })
    .passthrough()
    .optional(),
  shop_name: z.string().optional(),
  category_name: z.string().optional(),
}).passthrough();
const Payload = z
  .object({ data: z.unknown().optional(), item: z.unknown().optional() })
  .passthrough();
const FailurePayload = z
  .object({
    error: z.number().optional(),
    redirect_to_error_page: z.boolean().optional(),
    action_type: z.number().optional(),
  })
  .passthrough();

export function detectShopeeFailure(value: unknown): 'VERIFICATION_REQUIRED' | undefined {
  const parsed = FailurePayload.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  if (
    parsed.data.redirect_to_error_page ||
    parsed.data.error === 90309999 ||
    parsed.data.action_type === 2
  ) {
    return 'VERIFICATION_REQUIRED';
  }
  return undefined;
}

function toImageUrl(value: string) {
  return value.startsWith('http')
    ? value
    : `https://down-id.img.susercontent.com/file/${value}`;
}

function toSafeImage(value: string) {
  try {
    const url = toImageUrl(value);
    assertAllowedImageUrl(url);
    return url;
  } catch {
    return undefined;
  }
}

function fromShopeePriceUnits(value?: number) {
  return value === undefined ? undefined : value / 100_000;
}

export function parseShopeePayload(
  value: unknown,
  canonicalUrl: string,
): ExtractionResult | undefined {
  const parsed = Payload.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }

  const data = parsed.data.data;
  const nested =
    data && typeof data === 'object' && 'item' in data ? data.item : data;
  const productParsed = Product.safeParse(parsed.data.item ?? nested);
  if (!productParsed.success) {
    return undefined;
  }

  const product = productParsed.data;
  const title = product.name ?? product.title;
  const images = [
    ...new Set(
      [...(product.images ?? []), ...(product.image ? [product.image] : [])]
        .map(toSafeImage)
        .filter((image): image is string => Boolean(image)),
    ),
  ];
  if (!title || images.length === 0) {
    return undefined;
  }

  const price = fromShopeePriceUnits(product.price ?? product.price_min);
  const originalPrice = fromShopeePriceUnits(product.price_before_discount);
  const soldCount = product.historical_sold ?? product.sold;

  return {
    title,
    images,
    canonicalUrl,
    extractionMethod: 'network',
    completeness: product.description && product.shopid ? 'complete' : 'partial',
    ...(product.description ? { description: product.description } : {}),
    ...(product.category_name ? { category: product.category_name } : {}),
    ...(product.shop_name ? { shopName: product.shop_name } : {}),
    ...(price !== undefined ? { price, currency: 'IDR' as const } : {}),
    ...(originalPrice !== undefined ? { originalPrice } : {}),
    ...(product.item_rating?.rating_star !== undefined
      ? { rating: product.item_rating.rating_star }
      : {}),
    ...(product.item_rating?.rating_count?.[0] !== undefined
      ? { ratingCount: product.item_rating.rating_count[0] }
      : {}),
    ...(soldCount !== undefined ? { soldCount } : {}),
    ...(product.shopid !== undefined ? { shopId: String(product.shopid) } : {}),
    ...(product.itemid !== undefined ? { itemId: String(product.itemid) } : {}),
  };
}
