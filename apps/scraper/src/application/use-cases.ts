import type { JobRepository } from '../domain/contracts.js';
import type { ExtractionJob, ExtractionRequest } from '../domain/model.js';

export const createExtraction = (
  repository: JobRepository,
  request: ExtractionRequest,
) => repository.createOrGet(request);

export const getExtraction = (repository: JobRepository, id: string) =>
  repository.get(id);

export const toJobDto = (job: ExtractionJob) => ({
  id: job.id,
  requestRef: job.requestRef,
  marketplace: job.marketplace,
  status: job.status,
  stage: job.stage,
  attempts: job.attempts,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  ...(job.result ? { result: job.result } : {}),
  ...(job.errorCode ? { error: { code: job.errorCode } } : {}),
});
