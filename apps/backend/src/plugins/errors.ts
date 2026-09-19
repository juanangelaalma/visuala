import { Elysia } from "elysia";
import { AIError, type AIErrorCode } from "@/domain/ai-service/errors";
import { AuthDomainError, type AuthErrorCode } from "@/domain/auth/errors";
import {
  BillingCheckoutIndeterminateError,
  BillingIdempotencyConflictError,
  BillingPaymentNotFoundError,
  BillingPaymentOwnershipError,
  BillingPaymentSimulationNotReadyError,
  BillingPaymentSimulationRejectedError,
  BillingPaymentSimulationUnavailableError,
  BillingPaymentSimulationUnknownError,
  PaymentMethodUnavailableError,
  PricingPlanUnavailableError,
  UnsupportedBillingGatewayError,
} from "@/domain/billing/errors";

type MappedError = { status: number; body: Record<string, unknown> };

const authErrorStatus: Record<AuthErrorCode, number> = {
  invalid_credentials: 401,
  session_expired: 401,
  email_not_confirmed: 403,
  email_already_registered: 409,
  validation_error: 422,
  rate_limited: 429,
  oauth_error: 502,
  server_error: 500,
};

const aiErrorStatus: Record<AIErrorCode, number> = {
  AI_CONFIG_ERROR: 500,
  AI_CAPABILITY_UNSUPPORTED: 400,
  AI_INPUT_INVALID: 400,
  AI_CANCELLED: 408,
  AI_REFUSED: 422,
  AI_RATE_LIMITED: 429,
  AI_AUTH_ERROR: 502,
  AI_INVALID_OUTPUT: 502,
  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
};

function mapDomainError(error: unknown): MappedError | null {
  if (error instanceof AuthDomainError) return { status: authErrorStatus[error.code], body: { error: error.message } };

  if (error instanceof AIError) {
    return {
      status: aiErrorStatus[error.code],
      body: {
        error: error.safeMessage,
        code: error.code,
        requestId: error.requestId,
        retryable: error.retryable,
        ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
      },
    };
  }

  if (error instanceof BillingPaymentNotFoundError || error instanceof PricingPlanUnavailableError) return { status: 404, body: { error: "Not found." } };
  if (error instanceof BillingPaymentOwnershipError) return { status: 403, body: { error: "Forbidden." } };
  if (error instanceof UnsupportedBillingGatewayError) return { status: 501, body: { error: "Checkout is unavailable." } };
  if (error instanceof BillingPaymentSimulationNotReadyError) return { status: 409, body: { error: "Payment is not ready for simulation." } };
  if (error instanceof BillingPaymentSimulationUnavailableError) return { status: 409, body: { error: "Simulation is unavailable for this payment." } };
  if (error instanceof BillingPaymentSimulationRejectedError) return { status: 502, body: { error: "Simulation could not be started." } };
  if (error instanceof BillingPaymentSimulationUnknownError) return { status: 502, body: { error: "Simulation status is unknown. Refresh payment status before retrying." } };
  if (error instanceof PaymentMethodUnavailableError || error instanceof BillingIdempotencyConflictError || error instanceof BillingCheckoutIndeterminateError) {
    return { status: 409, body: { error: "Could not create checkout." } };
  }

  return null;
}

export const errorPlugin = new Elysia({ name: "errors" }).onError({ as: "global" }, ({ code, error, set }) => {
  if (code === "VALIDATION" || code === "PARSE") {
    set.status = 422;
    return { error: "Invalid request." };
  }

  if (code === "NOT_FOUND") {
    set.status = 404;
    return { error: "Not found." };
  }

  const mapped = mapDomainError(error);
  if (mapped) {
    set.status = mapped.status;
    return mapped.body;
  }

  console.error("Unhandled backend error", error);
  set.status = 500;
  return { error: "Internal server error." };
});
