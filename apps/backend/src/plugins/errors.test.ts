import { Elysia, t } from "elysia";
import { describe, expect, it, vi } from "vitest";
import { AIError, type AIErrorCode } from "@/domain/ai-service/errors";
import { AuthDomainError } from "@/domain/auth/errors";
import {
  BillingCheckoutIndeterminateError,
  BillingIdempotencyConflictError,
  BillingPaymentNotFoundError,
  BillingPaymentSimulationNotReadyError,
  BillingPaymentSimulationRejectedError,
  BillingPaymentSimulationUnavailableError,
  InvalidBillingPersistenceError,
  PaymentMethodUnavailableError,
  PricingPlanUnavailableError,
  UnsupportedBillingGatewayError,
} from "@/domain/billing/errors";
import { classifyStorageError, errorPlugin } from "./errors";

function buildApp() {
  return new Elysia()
    .use(errorPlugin)
    .get("/boom", () => {
      throw new Error("database detail");
    })
    .get("/unauthorized", ({ status }) => status(401, { error: "Unauthorized." }))
    .get("/teapot", ({ status }) => status(418, { error: "Teapot." }));
}

describe("error plugin", () => {
  it("returns a safe 500 and logs the unexpected error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await buildApp().handle(new Request("http://localhost/boom"));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Internal server error." });
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not log or return secrets carried by an unexpected error", async () => {
    const bearerToken = "secret-bearer-token";
    const signedUrl = "https://signed.example/video.mp4?token=secret-signature";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const app = new Elysia()
        .use(errorPlugin)
        .get("/boom", () => {
          throw Object.assign(new Error(`request failed for ${bearerToken}`), { bearerToken, signedUrl });
        });

      const response = await app.handle(new Request("http://localhost/boom", { headers: { authorization: `Bearer ${bearerToken}` } }));
      const responseText = await response.text();
      const logged = JSON.stringify(consoleError.mock.calls);

      expect(response.status).toBe(500);
      expect(responseText).not.toContain(bearerToken);
      expect(responseText).not.toContain(signedUrl);
      expect(logged).not.toContain(bearerToken);
      expect(logged).not.toContain(signedUrl);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("preserves explicit status responses instead of masking them as 500", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const unauthorized = await buildApp().handle(new Request("http://localhost/unauthorized"));
      expect(unauthorized.status).toBe(401);
      await expect(unauthorized.json()).resolves.toEqual({ error: "Unauthorized." });

      const teapot = await buildApp().handle(new Request("http://localhost/teapot"));
      expect(teapot.status).toBe(418);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns a safe 422 for an invalid body", async () => {
    const app = new Elysia().use(errorPlugin).post("/create", ({ body }) => body, { body: t.Object({ name: t.String() }) });

    const response = await app.handle(
      new Request("http://localhost/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("returns a safe 422 for an unparseable body", async () => {
    const app = new Elysia().use(errorPlugin).post("/create", ({ body }) => body, { body: t.Object({ name: t.String() }) });

    const response = await app.handle(
      new Request("http://localhost/create", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("returns a safe 404 for unknown routes", async () => {
    const response = await buildApp().handle(new Request("http://localhost/missing"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  describe("auth domain errors", () => {
    it.each([
      [new AuthDomainError("invalid_credentials", "Invalid email or password."), 401, "Invalid email or password."],
      [new AuthDomainError("session_expired", "Please sign in again."), 401, "Please sign in again."],
      [new AuthDomainError("email_not_confirmed", "Please confirm your email before logging in."), 403, "Please confirm your email before logging in."],
      [new AuthDomainError("email_already_registered", "This email is already registered."), 409, "This email is already registered."],
      [new AuthDomainError("validation_error", "Check your details."), 422, "Check your details."],
      [new AuthDomainError("rate_limited", "Please wait a moment before requesting another confirmation email."), 429, "Please wait a moment before requesting another confirmation email."],
      [new AuthDomainError("oauth_error", "Could not start Google sign in. Please try again."), 502, "Could not start Google sign in. Please try again."],
      [new AuthDomainError("server_error", "Authentication failed. Please try again."), 500, "Authentication failed. Please try again."],
    ])("maps %s to a safe response", async (error, status, message) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const app = new Elysia()
          .use(errorPlugin)
          .get("/boom", () => {
            throw error;
          });

        const response = await app.handle(new Request("http://localhost/boom"));

        expect(response.status).toBe(status);
        await expect(response.json()).resolves.toEqual({ error: message });
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("ai domain errors", () => {
    function aiError(code: AIErrorCode, extra: Partial<ConstructorParameters<typeof AIError>[0]> = {}) {
      return new AIError({ code, safeMessage: `safe:${code}`, requestId: "req-1", retryable: false, ...extra });
    }

    it.each([
      ["AI_CONFIG_ERROR", 500],
      ["AI_CAPABILITY_UNSUPPORTED", 400],
      ["AI_INPUT_INVALID", 400],
      ["AI_CANCELLED", 408],
      ["AI_REFUSED", 422],
      ["AI_RATE_LIMITED", 429],
      ["AI_AUTH_ERROR", 502],
      ["AI_INVALID_OUTPUT", 502],
      ["AI_UNAVAILABLE", 503],
      ["AI_TIMEOUT", 504],
    ] as const)("maps %s to %i", async (code, status) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const app = new Elysia()
          .use(errorPlugin)
          .get("/boom", () => {
            throw aiError(code);
          });

        const response = await app.handle(new Request("http://localhost/boom"));

        expect(response.status).toBe(status);
        await expect(response.json()).resolves.toEqual({ error: `safe:${code}`, code, requestId: "req-1", retryable: false });
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("includes retry timing only when the provider supplied it", async () => {
      const app = new Elysia()
        .use(errorPlugin)
        .get("/boom", () => {
          throw aiError("AI_RATE_LIMITED", { retryable: true, retryAfterMs: 2500 });
        });

      const response = await app.handle(new Request("http://localhost/boom"));

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toEqual({ error: "safe:AI_RATE_LIMITED", code: "AI_RATE_LIMITED", requestId: "req-1", retryable: true, retryAfterMs: 2500 });
    });
  });

  describe("billing domain errors", () => {
    it.each([
      [new BillingPaymentNotFoundError(), 404, "Not found."],
      [new PricingPlanUnavailableError(), 404, "Not found."],
      [new PaymentMethodUnavailableError(), 409, "Could not create checkout."],
      [new BillingIdempotencyConflictError(), 409, "Could not create checkout."],
      [new BillingCheckoutIndeterminateError("attempt-1"), 409, "Could not create checkout."],
      [new BillingPaymentSimulationNotReadyError(), 409, "Payment is not ready for simulation."],
      [new BillingPaymentSimulationUnavailableError(), 409, "Simulation is unavailable for this payment."],
      [new BillingPaymentSimulationRejectedError(), 502, "Simulation could not be started."],
      [new UnsupportedBillingGatewayError(), 501, "Checkout is unavailable."],
    ])("maps %s to a safe response", async (error, status, message) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const app = new Elysia()
          .use(errorPlugin)
          .get("/boom", () => {
            throw error;
          });

        const response = await app.handle(new Request("http://localhost/boom"));

        expect(response.status).toBe(status);
        await expect(response.json()).resolves.toEqual({ error: message });
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does not leak unexpected billing error details", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const app = new Elysia()
          .use(errorPlugin)
          .get("/boom", () => {
            throw new InvalidBillingPersistenceError("invalid persisted checkout actions");
          });

        const response = await app.handle(new Request("http://localhost/boom"));

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({ error: "Internal server error." });
        expect(consoleError).toHaveBeenCalledOnce();
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("storage errors", () => {
    /** The shape `storage-js` raises, without importing the SDK. */
    function storageError(name: string, message: string, status?: number) {
      return Object.assign(new Error(message), { name, ...(status === undefined ? {} : { status, statusCode: String(status) }) });
    }

    it.each([
      ["storage_bucket_missing", storageError("StorageApiError", "Bucket not found", 404), "Asset storage is not configured correctly."],
      ["storage_unavailable", storageError("StorageApiError", "The resource already exists", 409), "Asset storage is unavailable."],
      ["storage_unavailable", storageError("StorageUnknownError", "fetch failed"), "Asset storage is unavailable."],
    ] as const)("maps a storage failure to a safe 503 with code %s", async (code, error, message) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const app = new Elysia()
          .use(errorPlugin)
          .get("/boom", () => {
            throw error;
          });

        const response = await app.handle(new Request("http://localhost/boom"));

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({ error: message, code });
        // The code is logged; the provider text never is.
        expect(consoleError).toHaveBeenCalledWith("Asset storage request failed", { code });
      } finally {
        consoleError.mockRestore();
      }
    });

    it("leaves an ordinary error that merely mentions a bucket as a 500", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const app = new Elysia()
          .use(errorPlugin)
          .get("/boom", () => {
            throw new Error("Bucket not found");
          });

        const response = await app.handle(new Request("http://localhost/boom"));

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({ error: "Internal server error." });
      } finally {
        consoleError.mockRestore();
      }
    });

    it("only classifies an object that identifies itself as a storage error", () => {
      expect(classifyStorageError(storageError("StorageApiError", "Bucket not found", 404))).toBe("storage_bucket_missing");
      expect(classifyStorageError(storageError("StorageApiError", "Object not found", 404))).toBe("storage_unavailable");
      expect(classifyStorageError(null)).toBeNull();
      expect(classifyStorageError("Bucket not found")).toBeNull();
    });
  });
});
