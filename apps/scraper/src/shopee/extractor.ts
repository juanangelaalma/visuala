import type { BrowserManager } from '../browser/browser-manager.js';
import type { Extractor } from '../domain/contracts.js';
import type { ExtractionResult } from '../domain/model.js';
import { SafeError } from '../domain/errors.js';
import { detectShopeeFailure, parseShopeePayload } from './parser.js';
import {
  assertAllowedImageUrl,
  assertAllowedNavigation,
  assertSafeNetworkUrl,
  validateShopeeUrl,
} from './url-policy.js';

function isProductResponse(input: string) {
  try {
    const url = new URL(input);
    return url.hostname === 'shopee.co.id' && /^\/api\/v4\/(?:pdp|item)\//.test(url.pathname);
  } catch {
    return false;
  }
}

export class ShopeeExtractor implements Extractor {
  constructor(
    private readonly browsers: BrowserManager,
    private readonly navigationTimeout: number,
  ) {}

  async extract(
    url: string,
    signal: AbortSignal,
    onStage: (stage: 'navigating' | 'extracting') => Promise<void>,
  ): Promise<ExtractionResult> {
    signal.throwIfAborted();
    console.log("URL:", url)
    validateShopeeUrl(url);
    const context = await this.browsers.context();

    try {
      signal.throwIfAborted();
      await context.route('**/*', async (route) => {
        const request = route.request();
        try {
          assertSafeNetworkUrl(request.url());
          if (request.isNavigationRequest()) {
            assertAllowedNavigation(request.url());
          }
          await route.continue();
        } catch {
          await route.abort('blockedbyclient');
        }
      });

      const page = await context.newPage();
      page.setDefaultNavigationTimeout(this.navigationTimeout);
      signal.throwIfAborted();

      const candidates: unknown[] = [];
      const responseTasks = new Set<Promise<void>>();
      let signalProductResponse: () => void = () => {};
      const productResponseReceived = new Promise<void>((resolve) => {
        signalProductResponse = resolve;
      });

      page.on('response', (response) => {
        const contentType = response.headers()['content-type'];
        if (!isProductResponse(response.url()) || !contentType?.includes('json')) {
          return;
        }

        console.log("Hello")

        const task = response
          .json()
          .then((payload) => {
            console.log(response.url(), payload)
            candidates.push(payload);
            signalProductResponse();
          })
          .catch(() => {})
          .finally(() => responseTasks.delete(task));
        responseTasks.add(task);
      });

      signal.addEventListener('abort', () => void page.close(), { once: true });
      console.log('navigating')
      await onStage('navigating');
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      signal.throwIfAborted();
      assertAllowedNavigation(page.url());
      console.log('extracting')
      await onStage('extracting');

      await Promise.race([productResponseReceived, page.waitForTimeout(8_000)]);
      console.log("sini")
      signal.throwIfAborted();
      await Promise.allSettled(responseTasks);
      console.log("sini 2")

      // console.log("candidates", candidates)
      // for (const candidate of candidates) {
      //   const failure = detectShopeeFailure(candidate);
      //   if (failure) {
      //     throw new SafeError(failure);
      //   }
      //   const result = parseShopeePayload(candidate, page.url());
      //     console.log("result ini", result)
      //   if (result) {
      //     return result;
      //   }
      // }

      // if (new URL(page.url()).pathname.startsWith('/verify/')) {
      //   console.log("start with verify")
      //   throw new SafeError('VERIFICATION_REQUIRED');
      // }
      console.log("doesn't start with verify")
      console.log(page.url())

      const dom = await page.evaluate(() => ({
        title:
          document.querySelector('h1')?.textContent?.trim() ||
          document
            .querySelector('meta[property="og:title"]')
            ?.getAttribute('content'),
        description:
          document
            .querySelector('meta[property="og:description"]')
            ?.getAttribute('content') || undefined,
        images: [...document.querySelectorAll<HTMLImageElement>('img')]
          .map((image) => image.currentSrc || image.src)
          .filter((source) => source.startsWith('http'))
          .slice(0, 40),
        canonicalUrl:
          document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
            ?.href || location.href,
      }));

      console.log(dom)

      assertAllowedNavigation(dom.canonicalUrl);
      const images = [...new Set(dom.images)].filter((image) => {
        try {
          assertAllowedImageUrl(image);
          return true;
        } catch {
          return false;
        }
      });
      if (!dom.title || images.length === 0) {
        throw new SafeError('INSUFFICIENT_PRODUCT_DATA');
      }

      return {
        title: dom.title,
        images,
        canonicalUrl: dom.canonicalUrl,
        extractionMethod: 'dom',
        completeness: 'partial',
        ...(dom.description ? { description: dom.description } : {}),
      };
    } finally {
      await context.close();
    }
  }
}
