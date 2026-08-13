import { expect, it } from 'vitest';
import { detectShopeeFailure, parseShopeePayload } from './parser.js';

it('normalizes a plausible item response', () => {
  const result = parseShopeePayload({ data: { name: 'Sepatu', images: ['abc'], price: 12500000, shopid: 12, itemid: 34, item_rating: { rating_star: 4.8, rating_count: [20] } } }, 'https://shopee.co.id/product/12/34');
  expect(result).toMatchObject({ title: 'Sepatu', price: 125, shopId: '12', itemId: '34', rating: 4.8, completeness: 'partial' });
  expect(result?.images[0]).toContain('/abc');
});

it('applies Shopee price units consistently for low raw values', () => {
  const result = parseShopeePayload({ data: { name: 'Sample', images: ['abc'], price: 500000 } }, 'https://shopee.co.id/product/1/2');
  expect(result?.price).toBe(5);
});

it('classifies Shopee traffic verification responses', () => {
  expect(detectShopeeFailure({ error: 90309999, action_type: 2, redirect_to_error_page: true })).toBe('VERIFICATION_REQUIRED');
});
