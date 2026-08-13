import { describe, expect, it } from 'vitest';
import {
  assertAllowedImageUrl,
  assertSafeNetworkUrl,
  validateShopeeUrl,
} from './url-policy.js';

describe('Shopee URL policy', () => {
  it.each(['https://id.shp.ee/abc', 'https://shopee.co.id/product/1/2'])('accepts %s', (url) => expect(() => validateShopeeUrl(url)).not.toThrow());
  it.each(['http://shopee.co.id/x', 'https://evilshopee.co.id/x', 'https://shopee.co.id.evil.test/x', 'https://u:p@shopee.co.id/x', 'https://shopee.co.id:444/x'])('rejects %s', (url) => expect(() => validateShopeeUrl(url)).toThrow());
  it('rejects oversized source URLs', () => expect(() => validateShopeeUrl(`https://shopee.co.id/${'x'.repeat(2048)}`)).toThrow());
  it.each(['http://127.0.0.1/x', 'http://100.64.0.1/x', 'http://169.254.169.254/x', 'http://192.168.1.1/x', 'http://[::1]/x', 'http://[fc00::1]/x', 'http://[::ffff:127.0.0.1]/x'])('rejects unsafe network target %s', (url) => expect(() => assertSafeNetworkUrl(url)).toThrow());
  it('allows only known Shopee image hosts', () => {
    expect(() => assertAllowedImageUrl('https://down-id.img.susercontent.com/file/sample')).not.toThrow();
    expect(() => assertAllowedImageUrl('https://images.evil.example/product.jpg')).toThrow();
    expect(() => assertAllowedImageUrl('http://down-id.img.susercontent.com/file/sample')).toThrow();
  });
});
