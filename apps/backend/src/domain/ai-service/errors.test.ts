import { describe, expect, it } from "vitest";
import { AIError, diagnosticField, sanitizedDiagnostic } from "./errors";

describe("AIError", () => {
  it("creates a normalized safe error", () => {
    const error = new AIError({
      code: "AI_AUTH_ERROR",
      safeMessage: "AI provider authentication failed",
      requestId: "request-1",
      retryable: false,
      retryAfterMs: 7_000,
      providerStatus: 401,
      providerRequestId: "provider-request-1",
      sanitizedDiagnostic: sanitizedDiagnostic(
        "provider_authentication_failure",
        diagnosticField("status", 401),
      ),
    });

    expect(error).toMatchObject({
      code: "AI_AUTH_ERROR",
      safeMessage: "AI provider authentication failed",
      requestId: "request-1",
      retryable: false,
      retryAfterMs: 7_000,
      providerStatus: 401,
      providerRequestId: "provider-request-1",
      sanitizedDiagnostic: {
        event: "provider_authentication_failure",
        fields: { status: 401 },
      },
    });
  });

  it("omits retry timing when the provider did not send it", () => {
    const error = new AIError({
      code: "AI_RATE_LIMITED",
      safeMessage: "AI provider rate limit reached",
      requestId: "request-3",
      retryable: true,
    });

    expect(error.retryAfterMs).toBeUndefined();
    expect(Object.keys(error)).not.toContain("retryAfterMs");
  });

  it("exposes only normalized error fields", () => {
    const error = new AIError({
      code: "AI_TIMEOUT",
      safeMessage: "AI provider timed out",
      requestId: "request-2",
      retryable: true,
    });

    expect(Object.keys(error).sort()).toEqual([
      "code",
      "dispatchOutcome",
      "name",
      "requestId",
      "retryable",
      "safeMessage",
    ]);
  });

  it("rejects diagnostic fields that can carry sensitive content", () => {
    expect(() => diagnosticField("prompt", "secret prompt")).toThrow(
      "Diagnostic field is not allowed: prompt",
    );
  });
});
