import { loadConfig } from './api/config.js';
import { buildServer } from './api/server.js';
import { BrowserManager } from './browser/browser-manager.js';
import { MemoryJobRepository } from './infrastructure/memory-job-repository.js';
import { ShopeeExtractor } from './shopee/extractor.js';
import { Worker } from './worker/worker.js';

const config = loadConfig();
const repository = new MemoryJobRepository(config.RESULT_TTL_MS);
const browsers = new BrowserManager(config.HEADLESS, config.PLAYWRIGHT_EXECUTABLE_PATH);
const extractor = new ShopeeExtractor(
  browsers,
  config.NAVIGATION_TIMEOUT_MS,
);
const worker = new Worker(repository, extractor, {
  concurrency: config.CONCURRENCY,
  maxAttempts: config.MAX_ATTEMPTS,
  timeoutMs: config.JOB_TIMEOUT_MS,
});
const server = buildServer(repository, config.SCRAPER_API_KEY);
worker.start();
await server.listen({ host: config.HOST, port: config.PORT });

let closing = false;
const shutdown = async () => {
  if (closing) {
    return;
  }

  closing = true;
  await server.close();
  await worker.stop();
  await browsers.close();
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
