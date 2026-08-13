# Shopee extraction viability service

Standalone Fastify/TypeScript spike. The API/application/domain layers depend on `JobRepository` and `Extractor`; the current adapter is asynchronous **process memory only**, while `ShopeeExtractor` uses one reusable Chromium browser and a fresh isolated context per job. Jobs run with bounded retries/concurrency/timeouts. Extraction tries bounded Shopee JSON responses first, then rendered DOM, and succeeds only with a title and image. `completeness: partial` explicitly means optional fields were unavailable.

## Local use

```sh
pnpm install
pnpm --filter @visuala/scraper exec playwright install chromium
SCRAPER_API_KEY=change-me-at-least-16 pnpm --filter @visuala/scraper dev
pnpm --filter @visuala/scraper test
pnpm --filter @visuala/scraper typecheck
pnpm --filter @visuala/scraper build
pnpm --filter @visuala/scraper smoke -- 'https://shopee.co.id/...'
```

Configuration: `SCRAPER_API_KEY` (required), `HOST=127.0.0.1`, `PORT=3100`, `HEADLESS=true`, optional `PLAYWRIGHT_EXECUTABLE_PATH`, `JOB_TIMEOUT_MS=45000`, `NAVIGATION_TIMEOUT_MS=25000`, `MAX_ATTEMPTS=2`, `CONCURRENCY=1`, and `RESULT_TTL_MS=86400000`. Secrets are not request-logged.

```sh
curl localhost:3100/health/live
curl -X POST localhost:3100/v1/extractions -H 'Authorization: Bearer change-me-at-least-16' -H 'content-type: application/json' -d '{"requestRef":"11111111-1111-4111-8111-111111111111","idempotencyKey":"22222222-2222-4222-8222-222222222222","marketplace":"shopee","url":"https://shopee.co.id/product/1/2"}'
curl localhost:3100/v1/extractions/JOB_UUID -H 'Authorization: Bearer change-me-at-least-16'
```

## Safety and limitations

Only exact HTTPS `id.shp.ee` and `shopee.co.id` source/navigation hosts are accepted; credentials, ports, suffix tricks, local/private literal IP requests, downloads, and service workers are blocked. Images remain validated remote candidate URLs—temporary spike behavior; they are not downloaded or guaranteed stable. Browser-side checks cannot fully prevent DNS rebinding: deployment-level egress firewall/DNS controls are required before production.

Jobs/results/idempotency keys are lost on restart and TTL expiry; memory mode is **not production durable**. Public pages may change, throttle, CAPTCHA, geo-block, or reject automation. There is intentionally no login, CAPTCHA bypass, stealth, proxy, or anti-detection behavior. Review Shopee terms and applicable law before use. No live test runs in default CI.

The current live example reaches Shopee in this environment, but Shopee classifies the request as `VERIFICATION_REQUIRED`; it does not currently demonstrate successful product extraction.

For containers, use Microsoft's version-matched Playwright image (for example `mcr.microsoft.com/playwright:v1.61.1-noble`), copy the workspace, run `pnpm install --frozen-lockfile`, build this package, and start `node apps/scraper/dist/main.js`; apply a read-only filesystem where practical, non-root user, resource limits, and strict egress policy.
