export type AIErrorCode =
  | "AI_CONFIG_ERROR"
  | "AI_CAPABILITY_UNSUPPORTED"
  | "AI_AUTH_ERROR"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_INPUT_INVALID"
  | "AI_INVALID_OUTPUT"
  | "AI_REFUSED"
  | "AI_CANCELLED";

const ALLOWED_DIAGNOSTIC_FIELDS = [
  "attemptNumber",
  "code",
  "latencyMs",
  "model",
  "profileId",
  "provider",
  "providerRequestId",
  "status",
] as const;

type DiagnosticFieldName = (typeof ALLOWED_DIAGNOSTIC_FIELDS)[number];
type DiagnosticFieldValue = string | number | boolean | null;
type DiagnosticField = readonly [DiagnosticFieldName, DiagnosticFieldValue];

export type SanitizedDiagnostic = {
  event: string;
  fields: Partial<Record<DiagnosticFieldName, DiagnosticFieldValue>>;
};

export function diagnosticField(
  name: string,
  value: DiagnosticFieldValue,
): DiagnosticField {
  if (!isDiagnosticFieldName(name)) {
    throw new Error(`Diagnostic field is not allowed: ${name}`);
  }
  return [name, value];
}

export function sanitizedDiagnostic(
  event: string,
  ...fields: DiagnosticField[]
): SanitizedDiagnostic {
  return { event, fields: Object.fromEntries(fields) };
}

function isDiagnosticFieldName(name: string): name is DiagnosticFieldName {
  return (ALLOWED_DIAGNOSTIC_FIELDS as readonly string[]).includes(name);
}

export type AIErrorInput = {
  code: AIErrorCode;
  safeMessage: string;
  requestId: string;
  retryable: boolean;
  retryAfterMs?: number;
  providerStatus?: number;
  providerRequestId?: string;
  sanitizedDiagnostic?: SanitizedDiagnostic;
  dispatchOutcome?: "not_sent" | "rejected" | "ambiguous";
};

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly safeMessage: string;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly providerStatus?: number;
  readonly providerRequestId?: string;
  readonly sanitizedDiagnostic?: SanitizedDiagnostic;
  readonly dispatchOutcome: "not_sent" | "rejected" | "ambiguous";

  constructor(input: AIErrorInput) {
    super(input.safeMessage);
    this.name = "AIError";
    this.code = input.code;
    this.safeMessage = input.safeMessage;
    this.requestId = input.requestId;
    this.retryable = input.retryable;
    this.dispatchOutcome = input.dispatchOutcome ?? "not_sent";
    if (input.retryAfterMs !== undefined) {
      this.retryAfterMs = input.retryAfterMs;
    }
    if (input.providerStatus !== undefined) {
      this.providerStatus = input.providerStatus;
    }
    if (input.providerRequestId !== undefined) {
      this.providerRequestId = input.providerRequestId;
    }
    if (input.sanitizedDiagnostic !== undefined) {
      this.sanitizedDiagnostic = input.sanitizedDiagnostic;
    }
  }
}
