import { describe, expect, it } from "vitest";
import { AIError, type AIErrorCode } from "@/domain/ai-service/errors";
import { ApiError, failure, workerAuthorized } from "./_shared";

describe("AI API boundary", () => {
  it("uses constant-time compatible worker auth behavior", () => {
    expect(workerAuthorized("Bearer correct", "correct")).toBe(true);
    expect(workerAuthorized("Bearer wrong", "correct")).toBe(false);
    expect(workerAuthorized(null, "correct")).toBe(false);
  });

  it("sanitizes unexpected failures", async () => {
    expect(await failure(new Error("secret provider detail")).json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } });
  });

  it("keeps stable expected errors", async () => {
    expect(await failure(new ApiError(409, "CONFLICT", "Already queued")).json()).toEqual({ error: { code: "CONFLICT", message: "Already queued" } });
  });

  it.each<[AIErrorCode, number, string]>([
    ["AI_CONFIG_ERROR", 503, "The AI service is not configured."], ["AI_CAPABILITY_UNSUPPORTED", 422, "The requested AI operation is not supported."],
    ["AI_AUTH_ERROR", 503, "The AI service is unavailable."], ["AI_RATE_LIMITED", 429, "The AI service is busy. Try again later."],
    ["AI_TIMEOUT", 504, "The AI request timed out."], ["AI_UNAVAILABLE", 503, "The AI service is unavailable."],
    ["AI_INPUT_INVALID", 400, "The AI input is invalid."], ["AI_INVALID_OUTPUT", 502, "The AI service returned an invalid response."],
    ["AI_REFUSED", 422, "The AI service could not complete this request."], ["AI_CANCELLED", 499, "The AI request was cancelled."],
  ])("maps %s without exposing provider diagnostics", async (code, status, message) => {
    const error = new AIError({ code, safeMessage: "secret provider detail", requestId: "request-1", retryable: false, providerStatus: 418, providerRequestId: "secret" });
    const response = failure(error);
    expect({ status: response.status, body: await response.json() }).toEqual({ status, body: { error: { code, message } } });
  });
});
