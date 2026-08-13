import { afterEach, expect, it } from 'vitest';
import { MemoryJobRepository } from '../infrastructure/memory-job-repository.js';
import { buildServer } from './server.js';

const apiKey = '0123456789abcdef';
const authorization = { authorization: `Bearer ${apiKey}` };
const app = buildServer(
  new MemoryJobRepository(60_000),
  apiKey,
  undefined,
  false,
);

afterEach(async () => app.close());

it('enforces auth, validates body, and returns a safe job DTO', async () => {
  const unauthorized = await app.inject({
    method: 'POST',
    url: '/v1/extractions',
    payload: {},
  });
  expect(unauthorized.statusCode).toBe(401);

  const invalid = await app.inject({
    method: 'POST',
    url: '/v1/extractions',
    headers: authorization,
    payload: {},
  });
  expect(invalid.statusCode).toBe(400);

  const payload = {
    requestRef: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
    marketplace: 'shopee',
    url: 'https://shopee.co.id/product/1/2',
  };
  const created = await app.inject({
    method: 'POST',
    url: '/v1/extractions',
    headers: authorization,
    payload,
  });
  expect(created.statusCode).toBe(202);

  const replayed = await app.inject({
    method: 'POST',
    url: '/v1/extractions',
    headers: authorization,
    payload,
  });
  expect(replayed.statusCode).toBe(202);
  expect(replayed.json().id).toBe(created.json().id);

  const conflictingReplay = await app.inject({
    method: 'POST',
    url: '/v1/extractions',
    headers: authorization,
    payload: { ...payload, url: 'https://shopee.co.id/product/1/3' },
  });
  expect(conflictingReplay.statusCode).toBe(409);
  expect(conflictingReplay.json()).toEqual({
    error: { code: 'IDEMPOTENCY_CONFLICT' },
  });

  const fetched = await app.inject({
    method: 'GET',
    url: `/v1/extractions/${created.json().id}`,
    headers: authorization,
  });
  expect(fetched.json()).toMatchObject({ status: 'queued', stage: 'queued' });
  expect(fetched.json()).not.toHaveProperty('idempotencyKey');
  expect(fetched.json()).not.toHaveProperty('url');
});
