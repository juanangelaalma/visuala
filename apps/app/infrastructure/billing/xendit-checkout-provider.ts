import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { BillingGateway } from "@/domain/billing/contracts";
import type { BillingPayment, NormalizedWebhook, PaymentMethod, ProviderAttempt, ProviderAttemptStatus } from "@/domain/billing/types";
import type { BillingConfig } from "@/shared/config/billing";

const API_URL = "https://api.xendit.co/v3/payment_requests";
const API_VERSION = "2024-11-11";
const MAX_ACTIONS = 8;
const MAX_ACTION_VALUE_LENGTH = 4096;

const actionSchema = z.object({
  type: z.string(),
  descriptor: z.string(),
  value: z.string().max(MAX_ACTION_VALUE_LENGTH),
}).passthrough();

const paymentSchema = z.object({
  payment_request_id: z.string().min(1),
  reference_id: z.string().min(1),
  status: z.string().min(1),
  actions: z.array(actionSchema).max(MAX_ACTIONS).default([]),
  created: z.string().datetime().optional(),
  updated: z.string().datetime().optional(),
}).passthrough();

const webhookPaymentSchema = z.object({
  payment_id: z.string().min(1),
  payment_request_id: z.string().min(1),
  reference_id: z.string().min(1),
  status: z.string().min(1),
  request_amount: z.number().finite().positive(),
  currency: z.literal("IDR"),
  channel_code: z.string().min(1),
  created: z.string().datetime().optional(),
  updated: z.string().datetime().optional(),
});

const v3WebhookSchema = z.object({
  event: z.string().min(1),
  created: z.string().datetime(),
  api_version: z.string().min(1),
  data: webhookPaymentSchema,
});

const legacyWebhookSchema = webhookPaymentSchema.extend({
  event: z.string().min(1).optional(),
});

type Fetch = typeof fetch;

export class XenditProviderError extends Error {
  constructor(public readonly category: "configuration" | "invalid_response" | "rejected" | "not_found") {
    super(`Xendit request failed: ${category}`);
  }
}

export class XenditAmbiguousOutcomeError extends Error {
  constructor() {
    super("Xendit request outcome is ambiguous");
  }
}

export class XenditWebhookVerificationError extends Error {
  constructor() {
    super("Xendit webhook verification failed");
  }
}

export class XenditCheckoutProvider implements BillingGateway {
  constructor(private readonly config: BillingConfig, private readonly fetchImplementation: Fetch = fetch) {}

  async createCheckout(attempt: ProviderAttempt, payment: BillingPayment, method: PaymentMethod) {
    if (!this.config.checkoutEnabled || !this.config.qrisEnabled || method.kind !== "qris" || payment.currency !== "IDR" || attempt.environment !== this.config.environment) {
      throw new XenditProviderError("configuration");
    }
    // Xendit documents no idempotency header here; an ambiguous create remains unknown and requires manual review.
    const result = await this.request(API_URL, {
      method: "POST",
      body: JSON.stringify({ reference_id: attempt.providerReference, type: "PAY", country: "ID", currency: "IDR", request_amount: payment.priceAmount, capture_method: "AUTOMATIC", channel_code: "QRIS", channel_properties: {} }),
    }, true);
    return normalizePayment(result);
  }

  async retrievePayment(providerPaymentId: string) {
    if (!providerPaymentId) throw new XenditProviderError("configuration");
    const result = await this.request(`${API_URL}/${encodeURIComponent(providerPaymentId)}`, { method: "GET" }, false);
    return normalizePayment(result);
  }

  verifyWebhookToken(callbackToken: string | null): void {
    if (!constantTimeEqual(callbackToken, this.config.webhookToken)) throw new XenditWebhookVerificationError();
  }

  verifyAndNormalizeWebhook(callbackToken: string | null, payload: unknown): NormalizedWebhook {
    this.verifyWebhookToken(callbackToken);
    const v3Event = v3WebhookSchema.safeParse(payload);
    if (v3Event.success) return normalizeWebhook(this.config.environment, v3Event.data.event, v3Event.data.data, v3Event.data.data.updated ?? v3Event.data.created);
    const legacyEvent = legacyWebhookSchema.safeParse(payload);
    if (!legacyEvent.success) throw new XenditWebhookVerificationError();
    const occurredAt = legacyEvent.data.updated ?? legacyEvent.data.created;
    if (!occurredAt) throw new XenditWebhookVerificationError();
    return normalizeWebhook(this.config.environment, legacyEvent.data.event ?? "payment", legacyEvent.data, occurredAt);
  }

  private async request(url: string, init: RequestInit, creation: boolean): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, { ...init, headers: { Authorization: `Basic ${Buffer.from(`${this.config.apiKey}:`).toString("base64")}`, "api-version": API_VERSION, "content-type": "application/json" }, signal: AbortSignal.timeout(this.config.requestTimeoutMs) });
    } catch {
      if (creation) throw new XenditAmbiguousOutcomeError();
      throw new XenditProviderError("rejected");
    }
    if (response.status === 404) throw new XenditProviderError("not_found");
    if (!response.ok) throw new XenditProviderError("rejected");
    try {
      return await response.json();
    } catch {
      throw new XenditProviderError("invalid_response");
    }
  }
}

function normalizePayment(payload: unknown) {
  const parsed = paymentSchema.safeParse(payload);
  if (!parsed.success) throw new XenditProviderError("invalid_response");
  return { providerPaymentId: parsed.data.payment_request_id, status: normalizeAttemptStatus(parsed.data.status), actions: parsed.data.actions.filter((action) => action.type === "PRESENT_TO_CUSTOMER" && action.descriptor === "QR_STRING").map((action) => ({ type: "qr_code" as const, value: action.value, expiresAt: null })), expiresAt: null };
}

function normalizeWebhook(environment: BillingConfig["environment"], eventType: string, value: z.infer<typeof webhookPaymentSchema>, occurredAt: string): NormalizedWebhook {
  const status = normalizeWebhookStatus(eventType, value.status);
  const version = "xendit-webhook-v2";
  const canonical = [version, environment, eventType, value.payment_id, value.payment_request_id, value.reference_id, value.status, occurredAt, String(value.request_amount), value.currency].join("\n");
  return { provider: "xendit", environment, deduplicationKey: `${version}:${createHash("sha256").update(canonical).digest("hex")}`, eventType, status, providerReference: value.reference_id, providerPaymentId: value.payment_request_id, amount: value.request_amount, currency: value.currency, occurredAt };
}

function normalizeAttemptStatus(status: string): ProviderAttemptStatus {
  switch (status.toUpperCase()) {
    case "SUCCEEDED": case "COMPLETED": case "PAID": return "paid";
    case "REQUIRES_ACTION": return "requires_action";
    case "FAILED": case "CANCELED": case "CANCELLED": return "failed";
    case "EXPIRED": return "expired";
    default: return "pending";
  }
}

function normalizeWebhookStatus(eventType: string, status: string): NormalizedWebhook["status"] {
  if (!eventType.toLowerCase().startsWith("payment")) return "ignored";
  switch (status.toUpperCase()) {
    case "SUCCEEDED": case "COMPLETED": case "PAID": return "paid";
    case "REQUIRES_ACTION": return "requires_action";
    case "FAILED": return "failed";
    case "EXPIRED": return "expired";
    case "CANCELED": case "CANCELLED": return "cancelled";
    case "PENDING": case "ACCEPTING_PAYMENTS": return "pending";
    default: return "requires_review";
  }
}

function constantTimeEqual(actual: string | null, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual ?? "").digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return actual !== null && timingSafeEqual(actualDigest, expectedDigest);
}
