import { isIP } from 'node:net';
import { SafeError } from '../domain/errors.js';

const HOSTS = new Set(['id.shp.ee', 'shopee.co.id']);
const IMAGE_HOST_SUFFIX = '.img.susercontent.com';

function isUnsafeIp(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host) === 6) {
    return host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb') || host.startsWith('ff') || host.startsWith('::ffff:');
  }
  if (isIP(host) !== 4) return false;
  const [first = 0, second = 0] = host.split('.').map(Number);
  return first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19));
}

export function validateShopeeUrl(input: string): URL {
  if (input.length > 2048) {
    throw new SafeError('INVALID_URL');
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeError('INVALID_URL');
  }

  const isAllowed =
    url.protocol === 'https:' &&
    HOSTS.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.port;
  if (!isAllowed) {
    throw new SafeError('URL_NOT_ALLOWED');
  }
  return url;
}

export function assertSafeNetworkUrl(input: string): void {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeError('UNSAFE_NETWORK_TARGET');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new SafeError('UNSAFE_NETWORK_TARGET');
  }
  const host = url.hostname.toLowerCase();
  const isUnsafeHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    isUnsafeIp(host);
  if (isUnsafeHost) {
    throw new SafeError('UNSAFE_NETWORK_TARGET');
  }
}

export function assertAllowedImageUrl(input: string): void {
  assertSafeNetworkUrl(input);
  const url = new URL(input);
  const allowedHost =
    url.hostname.endsWith(IMAGE_HOST_SUFFIX) ||
    url.hostname === 'cf.shopee.co.id';
  if (url.protocol !== 'https:' || url.port || !allowedHost) {
    throw new SafeError('IMAGE_URL_NOT_ALLOWED');
  }
}

export const assertAllowedNavigation = (input: string) => {
  assertSafeNetworkUrl(input);
  validateShopeeUrl(input);
};
