import { expect, it } from 'vitest';
import { MemoryJobRepository } from './memory-job-repository.js';

const request = {
  requestRef: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  marketplace: 'shopee' as const,
  url: 'https://shopee.co.id/product/1/2',
};

it('retains active jobs past the result TTL and expires terminal results', async () => {
  const repository = new MemoryJobRepository(5);
  const { job } = await repository.createOrGet(request);
  await repository.claimNext(1);
  await new Promise((resolve) => setTimeout(resolve, 10));

  await expect(repository.get(job.id)).resolves.toMatchObject({
    status: 'processing',
  });
  await expect(repository.createOrGet(request)).resolves.toMatchObject({
    job: { id: job.id },
    created: false,
  });

  await repository.succeed(job.id, {
    title: 'Sample product',
    images: ['https://down-id.img.susercontent.com/file/sample'],
    canonicalUrl: request.url,
    extractionMethod: 'network',
    completeness: 'partial',
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  await expect(repository.get(job.id)).resolves.toBeUndefined();
});
