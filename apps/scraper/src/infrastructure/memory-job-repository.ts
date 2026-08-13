import { randomUUID } from 'node:crypto';
import type { JobRepository } from '../domain/contracts.js';
import { SafeError } from '../domain/errors.js';
import type { ExtractionJob, ExtractionRequest, ExtractionResult, JobStage } from '../domain/model.js';

export class MemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, ExtractionJob>();
  private readonly keys = new Map<string, string>();

  constructor(private readonly ttlMs: number) {}

  async createOrGet(request: ExtractionRequest) {
    this.prune();
    const existingId = this.keys.get(request.idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId)!;
      const inputMatches =
        existing.requestRef === request.requestRef &&
        existing.marketplace === request.marketplace &&
        existing.url === request.url;

      if (!inputMatches) {
        throw new SafeError('IDEMPOTENCY_CONFLICT');
      }

      return { job: structuredClone(existing), created: false };
    }

    const now = new Date().toISOString();
    const job: ExtractionJob = {
      ...request,
      id: randomUUID(),
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    this.keys.set(request.idempotencyKey, job.id);
    return { job: structuredClone(job), created: true };
  }

  async get(id: string) {
    this.prune();
    const job = this.jobs.get(id);
    return job && structuredClone(job);
  }

  async claimNext(maxAttempts: number) {
    const job = [...this.jobs.values()].find(
      (candidate) =>
        candidate.status === 'queued' && candidate.attempts < maxAttempts,
    );
    if (!job) {
      return undefined;
    }

    Object.assign(job, {
      status: 'processing',
      attempts: job.attempts + 1,
      updatedAt: new Date().toISOString(),
    });
    return structuredClone(job);
  }

  async setStage(id: string, stage: JobStage) {
    this.mutate(id, { stage });
  }

  async succeed(id: string, result: ExtractionResult) {
    this.mutate(id, { status: 'succeeded', stage: 'complete', result });
    const job = this.jobs.get(id);
    if (job) {
      delete job.errorCode;
    }
  }

  async fail(id: string, code: string, retry: boolean) {
    const nextState: Partial<ExtractionJob> = retry
      ? { status: 'queued', stage: 'queued' }
      : { status: 'failed', stage: 'complete', errorCode: code };
    this.mutate(id, nextState);

    const job = this.jobs.get(id);
    if (retry && job) {
      delete job.errorCode;
    }
  }

  private mutate(id: string, patch: Partial<ExtractionJob>) {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    }
  }

  private prune() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      const terminal = job.status === 'succeeded' || job.status === 'failed';
      if (terminal && Date.parse(job.updatedAt) < cutoff) {
        this.jobs.delete(id);
        this.keys.delete(job.idempotencyKey);
      }
    }
  }
}
