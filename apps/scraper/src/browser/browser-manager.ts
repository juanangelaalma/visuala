import { chromium, type Browser, type BrowserContext } from 'playwright';

export class BrowserManager {
  private browser: Browser | undefined;
  private launchPromise: Promise<Browser> | undefined;

  constructor(private readonly headless: boolean, private readonly executablePath?: string) {}

  async context(): Promise<BrowserContext> {
    if (!this.browser?.isConnected()) {
      this.launchPromise ??= chromium.launch({ headless: this.headless, ...(this.executablePath ? { executablePath: this.executablePath } : {}) });
      try {
        this.browser = await this.launchPromise;
      } finally {
        this.launchPromise = undefined;
      }
    }
    return this.browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', locale: 'id-ID' });
  }

  async close() {
    const browser = this.browser ?? await this.launchPromise;
    await browser?.close();
    this.browser = undefined;
    this.launchPromise = undefined;
  }
}
