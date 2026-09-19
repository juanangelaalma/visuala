import { ConcurrencyLimiter } from "@/application/ai-service/concurrency-limiter";
import { configurationError } from "@/infrastructure/ai-service/config";

type ProcessLimiterState = {
  maximumConcurrency: number;
  limiter: ConcurrencyLimiter;
};

let processLimiterState: ProcessLimiterState | undefined;

export function processConcurrencyLimiter(maximumConcurrency: number): ConcurrencyLimiter {
  if (!processLimiterState) {
    processLimiterState = {
      maximumConcurrency,
      limiter: new ConcurrencyLimiter(maximumConcurrency),
    };
  }
  if (processLimiterState.maximumConcurrency !== maximumConcurrency) throw configurationError();
  return processLimiterState.limiter;
}

export function tightenProcessConcurrencyLimiter(maximumConcurrency: number): ConcurrencyLimiter {
  if (!processLimiterState) throw configurationError();
  processLimiterState.limiter.tighten(maximumConcurrency);
  return processLimiterState.limiter;
}

export function resetProcessLimiterState(): void {
  processLimiterState = undefined;
}
