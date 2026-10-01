import type { AIError } from "./errors";
import type { ProviderResultMetadata } from "./types";

export class OutputValidationError extends Error {
  constructor(readonly error: AIError, readonly provider: ProviderResultMetadata) {
    super(error.safeMessage);
  }
}
