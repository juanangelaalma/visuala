import { resetProcessLimiterState } from "./process-concurrency-limiter";

export function resetProcessAIServiceLimiterForTests(): void {
  resetProcessLimiterState();
}
