import { expect, it } from 'vitest';
import type { Extractor, JobRepository } from '../domain/contracts.js';
import { MemoryJobRepository } from '../infrastructure/memory-job-repository.js';
import { Worker } from './worker.js';

const request = {
  requestRef: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  marketplace: 'shopee' as const,
  url: 'https://shopee.co.id/x',
};
it('is idempotent and retries a fake extractor', async () => {
  const repo = new MemoryJobRepository(60_000);
  const first = await repo.createOrGet(request);
  const replay = await repo.createOrGet(request);
  expect(replay.job.id).toBe(first.job.id);

  let calls = 0;
  const fake: Extractor = {
    extract: async (_url, _signal, stage) => {
      await stage('extracting');
      if (++calls === 1) {
        throw new Error('temporary');
      }
      return {
        title: 'ok',
        images: ['https://img.test/x'],
        canonicalUrl: request.url,
        extractionMethod: 'dom',
        completeness: 'partial',
      };
    },
  };
  const worker = new Worker(repo, fake, {
    concurrency: 1,
    maxAttempts: 2,
    timeoutMs: 1000,
  });
  worker.start();
  await new Promise((resolve) => setTimeout(resolve, 350));
  await worker.stop();
  const job = await repo.get(first.job.id);
  expect(job).toMatchObject({ status: 'succeeded', stage: 'complete', attempts: 2 });
});

it('enforces the timeout and waits for abort-aware extraction cleanup', async () => {
  const repo = new MemoryJobRepository(60_000);
  const { job } = await repo.createOrGet(request);
  let cleanedUp = false;
  const abortAware: Extractor = {
    extract: (_url, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        cleanedUp = true;
        reject(signal.reason);
      }, { once: true });
    }),
  };
  const worker = new Worker(repo, abortAware, { concurrency: 1, maxAttempts: 1, timeoutMs: 20 });
  worker.start();
  await new Promise((resolve) => setTimeout(resolve, 80));
  await worker.stop();
  expect(cleanedUp).toBe(true);
  await expect(repo.get(job.id)).resolves.toMatchObject({ status: 'failed', errorCode: 'JOB_TIMEOUT' });
});

it('does not start extraction after stop resolves during a delayed claim', async () => {
  let releaseClaim: () => void = () => {};
  const claimGate = new Promise<void>((resolve) => { releaseClaim = resolve; });
  const repo = new MemoryJobRepository(60_000);
  const { job } = await repo.createOrGet(request);
  const delayedRepository: JobRepository = {
    createOrGet: (input) => repo.createOrGet(input),
    get: (id) => repo.get(id),
    claimNext: async (maxAttempts: number) => {
      await claimGate;
      return repo.claimNext(maxAttempts);
    },
    setStage: (id, stage) => repo.setStage(id, stage),
    succeed: (id, result) => repo.succeed(id, result),
    fail: (id, code, retry) => repo.fail(id, code, retry),
  };
  const extractor: Extractor = { extract: async () => { throw new Error('must not run'); } };
  const worker = new Worker(delayedRepository, extractor, { concurrency: 1, maxAttempts: 1, timeoutMs: 100 });
  worker.start();
  const stopping = worker.stop();
  releaseClaim();
  await stopping;
  await expect(repo.get(job.id)).resolves.toMatchObject({ status: 'queued', attempts: 1 });
});

it('rejects idempotency key reuse with different input', async () => {
  const repo = new MemoryJobRepository(60_000);
  await repo.createOrGet(request);
  await expect(repo.createOrGet({ ...request, url: 'https://shopee.co.id/different' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
