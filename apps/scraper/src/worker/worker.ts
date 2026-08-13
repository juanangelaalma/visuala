import type { Extractor, JobRepository } from '../domain/contracts.js';
import { SafeError, safeCode } from '../domain/errors.js';

export class Worker {
  private stopped = false;
  private readonly running = new Set<Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private scheduler: Promise<void> | undefined;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repository: JobRepository,
    private readonly extractor: Extractor,
    private readonly options: {
      concurrency: number;
      maxAttempts: number;
      timeoutMs: number;
    },
  ) {}

  start() {
    this.stopped = false;
    this.scheduleNow();
  }

  private scheduleNow() {
    if (this.stopped || this.scheduler) {
      return;
    }
    this.scheduler = this.tick().finally(() => {
      this.scheduler = undefined;
    });
  }

  private async tick() {
    while (!this.stopped && this.running.size < this.options.concurrency) {
      const job = await this.repository.claimNext(this.options.maxAttempts);
      if (!job) {
        break;
      }
      if (this.stopped) {
        await this.repository.fail(job.id, 'WORKER_STOPPED', true);
        break;
      }

      const task = this.process(job.id, job.url, job.attempts).finally(() =>
        this.running.delete(task),
      );
      this.running.add(task);
    }

    if (!this.stopped) {
      this.timer = setTimeout(() => this.scheduleNow(), 1000);
    }
  }

  private async process(id: string, url: string, attempt: number) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const result = await this.extractor.extract(
        url,
        controller.signal,
        (stage) => {
          controller.signal.throwIfAborted();
          return this.repository.setStage(id, stage);
        },
      );
      console.log(result)
      controller.signal.throwIfAborted();
      await this.repository.succeed(id, result);
    } catch (error) {
      const retryable =
        controller.signal.aborted ||
        !(error instanceof SafeError) ||
        error.retryable;
      const errorCode = controller.signal.aborted
        ? 'JOB_TIMEOUT'
        : safeCode(error);
      await this.repository.fail(
        id,
        errorCode,
        retryable && attempt < this.options.maxAttempts,
      );
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  async stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    await this.scheduler;
    for (const controller of this.controllers) {
      controller.abort();
    }
    await Promise.allSettled(this.running);
  }
}
