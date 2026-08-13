import { BrowserManager } from './browser/browser-manager.js';
import { safeCode } from './domain/errors.js';
import { ShopeeExtractor } from './shopee/extractor.js';
import { validateShopeeUrl } from './shopee/url-policy.js';

const url = process.argv.slice(2).find((argument) => argument !== '--');
if (!url) {
  console.error(
    'Usage: pnpm --filter @visuala/scraper smoke -- https://shopee.co.id/...',
  );
  process.exit(2);
}

const browsers = new BrowserManager(
  process.env.HEADLESS !== 'false',
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
);

try {
  validateShopeeUrl(url);
  const extractor = new ShopeeExtractor(browsers, 25_000);
  const result = await extractor.extract(
    url,
    AbortSignal.timeout(45_000),
    async () => {},
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: { code: safeCode(error) } }, null, 2));
  process.exitCode = 1;
} finally {
  await browsers.close();
}
