import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { JobRepository } from '../domain/contracts.js';
import { SafeError } from '../domain/errors.js';
import { createExtraction, getExtraction, toJobDto } from '../application/use-cases.js';
import { validateShopeeUrl } from '../shopee/url-policy.js';

const Body = z
  .object({
    requestRef: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    marketplace: z.literal('shopee'),
    url: z.string().max(2048),
  })
  .strict();
const Id = z.object({ id: z.string().uuid() });

export function buildServer(
  repository: JobRepository,
  apiKey: string,
  ready: () => boolean = () => true,
  logger = true,
) {
  const app = Fastify({ logger });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_, reply) =>
    ready()
      ? { status: 'ready' }
      : reply.code(503).send({ status: 'not_ready' }),
  );

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/v1/')) {
      return;
    }

    const suppliedKey = request.headers.authorization?.replace(/^Bearer /, '');
    const keyIsValid =
      suppliedKey &&
      Buffer.byteLength(suppliedKey) === Buffer.byteLength(apiKey) &&
      timingSafeEqual(Buffer.from(suppliedKey), Buffer.from(apiKey));
    console.log("valid key", keyIsValid)
    if (!keyIsValid) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
  });

  app.post('/v1/extractions', async (request, reply) => {
    const parsedBody = Body.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST' } });
    }

    try {
      validateShopeeUrl(parsedBody.data.url);
    } catch {
      return reply.code(400).send({ error: { code: 'URL_NOT_ALLOWED' } });
    }

    try {
      const { job } = await createExtraction(repository, parsedBody.data);
      return reply.code(202).send({ id: job.id, status: job.status });
    } catch (error) {
      if (
        error instanceof SafeError &&
        error.code === 'IDEMPOTENCY_CONFLICT'
      ) {
        return reply.code(409).send({ error: { code: error.code } });
      }
      throw error;
    }
  });

  app.get('/v1/extractions/:id', async (request, reply) => {
    const parsedParameters = Id.safeParse(request.params);
    if (!parsedParameters.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST' } });
    }

    const job = await getExtraction(repository, parsedParameters.data.id);
    return job
      ? toJobDto(job)
      : reply.code(404).send({ error: { code: 'NOT_FOUND' } });
  });

  return app;
}
