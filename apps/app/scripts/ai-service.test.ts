import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runAIServiceCommand, type AIServiceCommandDependencies } from "./ai-service-command";

describe("AI service CLI", () => {
  it.each([[[]], [["unknown"]]])("rejects absent or unknown commands", async (args) => {
    const fixture = commandFixture();
    await expect(runAIServiceCommand(args, fixture.dependencies)).rejects.toThrow(
      "Choose check-config, smoke:text, smoke:structured, or smoke:vision.",
    );
  });

  it("prints only safe configuration labels", async () => {
    const fixture = commandFixture();
    await runAIServiceCommand(["check-config"], fixture.dependencies);
    const output = fixture.logs.join("\n");
    expect(output).toContain("AI configuration: valid");
    expect(output).not.toContain("secret-key");
  });

  it("warns before a paid smoke call", async () => {
    const fixture = commandFixture();
    await runAIServiceCommand(["smoke:text"], fixture.dependencies);
    expect(fixture.events.slice(0, 2)).toEqual(["warning", "generateText"]);
  });

  it("uses fresh request IDs for each smoke call", async () => {
    const fixture = commandFixture();
    await runAIServiceCommand(["smoke:text"], fixture.dependencies);
    await runAIServiceCommand(["smoke:text"], fixture.dependencies);
    expect(fixture.requestIds).toEqual(["request-1", "request-2"]);
  });

  it("restricts profile overrides to smoke commands", async () => {
    const fixture = commandFixture();
    await expect(runAIServiceCommand(["check-config", "--profile", "secondary"], fixture.dependencies)).rejects.toThrow(
      "--profile is available only for smoke commands.",
    );
  });

  it.each([["AI_SMOKE_USER_ID", { AI_SMOKE_ASSET_ID: "asset-1" }], ["AI_SMOKE_ASSET_ID", { AI_SMOKE_USER_ID: "user-1" }]])(
    "requires %s for vision",
    async (name, environment) => {
      const fixture = commandFixture(environment);
      await expect(runAIServiceCommand(["smoke:vision"], fixture.dependencies)).rejects.toThrow(
        `${name} is required for this smoke command.`,
      );
    },
  );

  it("does not print secrets, prompts, or image identifiers", async () => {
    const fixture = commandFixture();
    await runAIServiceCommand(["smoke:vision"], fixture.dependencies);
    const output = [...fixture.logs, ...fixture.warnings].join("\n");
    expect(output).not.toMatch(/secret-key|Describe this image|asset-1/);
  });
});

function commandFixture(environment: Record<string, string> = { AI_SMOKE_USER_ID: "user-1", AI_SMOKE_ASSET_ID: "asset-1" }) {
  const events: string[] = [];
  const logs: string[] = [];
  const warnings: string[] = [];
  const requestIds: string[] = [];
  let id = 0;
  const result = {
    requestId: "provider-request",
    profileId: "primary",
    provider: "google",
    model: "gemini-test",
    providerRequestId: null,
    attemptCount: 1,
    finishReason: "stop" as const,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    estimatedCost: null,
    latencyMs: 1,
  };
  const dependencies: AIServiceCommandDependencies = {
    environment,
    createId: () => `request-${++id}`,
    checkConfiguredAIService: () => ({
      status: "valid",
      profiles: [{ id: "primary", provider: "google", model: "gemini-test" }],
      tasks: [{ task: "connection_test", profileId: "primary" }],
    }),
    createAIService: () => ({
      generateText: async (request) => { events.push("generateText"); requestIds.push(request.requestId); return { ...result, text: "ok" }; },
      generateStructured: async (request) => { events.push("generateStructured"); requestIds.push(request.requestId); return { ...result, data: request.schema.schema.parse({ status: "ok" }) }; },
    }),
    log: (message) => logs.push(message),
    warn: (message) => { events.push("warning"); warnings.push(message); },
  };
  return { dependencies, events, logs, warnings, requestIds };
}
