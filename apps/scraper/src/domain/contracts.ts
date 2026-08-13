import type { ExtractionJob, ExtractionRequest, ExtractionResult, JobStage } from './model.js';

export interface JobRepository {
  createOrGet(
    request: ExtractionRequest,
  ): Promise<{ job: ExtractionJob; created: boolean }>;
  get(id: string): Promise<ExtractionJob | undefined>;
  claimNext(maxAttempts: number): Promise<ExtractionJob | undefined>;
  setStage(id: string, stage: JobStage): Promise<void>;
  succeed(id: string, result: ExtractionResult): Promise<void>;
  fail(id: string, code: string, retry: boolean): Promise<void>;
}

export interface Extractor {
  extract(
    url: string,
    signal: AbortSignal,
    onStage: (stage: JobStage) => Promise<void>,
  ): Promise<ExtractionResult>;
}
