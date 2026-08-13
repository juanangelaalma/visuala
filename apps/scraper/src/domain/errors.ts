export class SafeError extends Error {
  constructor(
    public readonly code: string,
    message = code,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export const safeCode = (error: unknown) =>
  error instanceof SafeError ? error.code : 'EXTRACTION_FAILED';
