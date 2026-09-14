import { describe, expect, it, vi } from "vitest";
import type {
  AIConfigOptions,
  ConnectionProfile,
  TaskConfig,
} from "../../domain/ai-service/config";
import { checkAIConfig, resolveAIConfig } from "./resolve-config";

const primaryProfile: ConnectionProfile = {
  id: "primary",
  apiFormat: "gemini-generate-content",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  apiKeyEnv: "AI_PRIMARY_API_KEY",
  modelIdEnv: "AI_PRIMARY_MODEL_ID",
  provider: "google",
  capabilities: {
    text: true,
    vision: true,
    nativeStructuredOutput: true,
  },
  limits: {
    maxInputCharacters: 24_000,
    maxOutputTokens: 4_096,
    maxImages: 1,
    maxImageBytes: 10_000_000,
    maxImageWidth: 4_096,
    maxImageHeight: 4_096,
    maxConcurrency: 4,
  },
};

const backupProfile: ConnectionProfile = {
  ...primaryProfile,
  id: "backup",
  baseUrl: "https://backup.example.com/api/",
  apiKeyEnv: "AI_BACKUP_API_KEY",
  modelIdEnv: "AI_BACKUP_MODEL_ID",
  provider: "backup-provider",
};

const taskConfigs: TaskConfig[] = [
  { task: "connection_test", profileId: "primary" },
  { task: "interviewer", profileId: "primary" },
  { task: "planner", profileId: "primary" },
  { task: "product_analysis", profileId: "primary" },
];

describe("resolveAIConfig", () => {
  it("resolves one immutable profile snapshot with exact defaults", () => {
    const environment = validEnvironment();
    const resolved = resolveAIConfig("planner", fixtureOptions(environment));

    environment.set("AI_PRIMARY_MODEL_ID", "gemini-model-b");

    expect(resolved).toEqual({
      profileId: "primary",
      apiFormat: "gemini-generate-content",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/",
      apiKey: "secret-a",
      modelId: "gemini-model-a",
      provider: "google",
      capabilities: primaryProfile.capabilities,
      limits: {
        ...primaryProfile.limits,
        attemptTimeoutMs: 30_000,
        totalDeadlineMs: 65_000,
        maxAttempts: 2,
      },
    });
  });

  it("maps different tasks to different profiles", () => {
    const options = fixtureOptions(validEnvironment(), {
      profiles: [primaryProfile, backupProfile],
      tasks: taskConfigs.map((config) =>
        config.task === "interviewer"
          ? { ...config, profileId: "backup" }
          : config,
      ),
    });

    expect(resolveAIConfig("interviewer", options).profileId).toBe("backup");
  });

  it("allows an explicit smoke profile override for a registered profile", () => {
    const resolved = resolveAIConfig(
      "connection_test",
      fixtureOptions(validEnvironment(), {
        profiles: [primaryProfile, backupProfile],
        profileOverride: "backup",
      }),
    );

    expect(resolved.profileId).toBe("backup");
  });

  it("requires credentials only for active profiles", () => {
    const environment = validEnvironment();
    environment.delete("AI_BACKUP_API_KEY");
    environment.delete("AI_BACKUP_MODEL_ID");

    expect(
      resolveAIConfig(
        "planner",
        fixtureOptions(environment, {
          profiles: [primaryProfile, backupProfile],
        }),
      ).profileId,
    ).toBe("primary");
  });

  it("rejects a profile override outside connection testing", () => {
    expectConfigError(() =>
      resolveAIConfig(
        "planner",
        fixtureOptions(validEnvironment(), { profileOverride: "primary" }),
      ),
    );
  });

  it("rejects an unregistered smoke profile override", () => {
    expectConfigError(() =>
      resolveAIConfig(
        "connection_test",
        fixtureOptions(validEnvironment(), { profileOverride: "missing" }),
      ),
    );
  });

  it("switches a compatible endpoint, model, and key through one profile", () => {
    const resolved = resolveAIConfig(
      "planner",
      fixtureOptions(validEnvironment(), {
        profiles: [{ ...backupProfile, id: "primary" }],
      }),
    );

    expect(resolved).toMatchObject({
      baseUrl: "https://backup.example.com/api/",
      apiKey: "secret-b",
      modelId: "backup-model-a",
    });
  });

  it.each([
    ["missing secret", new Map([["AI_PRIMARY_MODEL_ID", "gemini-model-a"]])],
    ["missing model", new Map([["AI_PRIMARY_API_KEY", "secret-a"]])],
  ])("rejects %s", (_name, environment) => {
    expectConfigError(() => resolveAIConfig("planner", fixtureOptions(environment)));
  });

  it.each([
    ["unknown API format", { profiles: [{ ...primaryProfile, apiFormat: "guessed" }] }],
    ["unknown task", { tasks: [{ task: "summarizer", profileId: "primary" }] }],
    ["unknown profile", { tasks: [{ task: "planner", profileId: "missing" }] }],
  ])("rejects an %s", (_name, overrides) => {
    expectConfigError(() =>
      resolveAIConfig("planner", fixtureOptions(validEnvironment(), overrides)),
    );
  });

  it.each([
    "http://provider.example.com/v1",
    "ftp://provider.example.com/v1",
    "https://user:password@provider.example.com/v1",
    "https://provider.example.com/v1?tenant=a",
    "https://provider.example.com/v1#models",
  ])("rejects unsafe base URL %s", (baseUrl) => {
    expectConfigError(() =>
      resolveAIConfig(
        "planner",
        fixtureOptions(validEnvironment(), {
          profiles: [{ ...primaryProfile, baseUrl }],
        }),
      ),
    );
  });

  it("rejects an HTTP loopback base URL by default", () => {
    const options = {
      ...fixtureOptions(validEnvironment()),
      profiles: [{ ...primaryProfile, baseUrl: "http://127.0.0.1:43123/v1beta" }],
    };

    expect(() => resolveAIConfig("connection_test", options)).toThrowError(expect.objectContaining({ code: "AI_CONFIG_ERROR" }));
  });

  it("accepts an HTTP loopback base URL with an explicit fixture option", () => {
    const config = resolveAIConfig("connection_test", {
      ...fixtureOptions(validEnvironment()),
      profiles: [{ ...primaryProfile, baseUrl: "http://127.0.0.1:43123/v1beta" }],
      allowInsecureLoopback: true,
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:43123/v1beta/");
  });

  it.each([
    { maxInputCharacters: 0 },
    { maxOutputTokens: -1 },
    { maxImages: -1 },
    { maxConcurrency: 0 },
    { attemptTimeoutMs: 0 },
    { totalDeadlineMs: 29_999, attemptTimeoutMs: 30_000 },
    { maxAttempts: 0 },
  ])("rejects invalid limits %#", (limits) => {
    expectConfigError(() =>
      resolveAIConfig(
        "planner",
        fixtureOptions(validEnvironment(), {
          profiles: [{ ...primaryProfile, limits: { ...primaryProfile.limits, ...limits } }],
        }),
      ),
    );
  });

  it.each([
    { maxInputCharacters: 24_001 },
    { maxOutputTokens: 4_097 },
    { maxImages: 2 },
    { maxConcurrency: 5 },
  ])("rejects task limits that loosen the profile %#", (limits) => {
    expectConfigError(() =>
      resolveAIConfig(
        "planner",
        fixtureOptions(validEnvironment(), {
          tasks: taskConfigs.map((config) =>
            config.task === "planner" ? { ...config, limits } : config,
          ),
        }),
      ),
    );
  });

  it.each(["pricingVersion", "source", "currency"] as const)(
    "rejects pricing without %s",
    (missingField) => {
      const pricing = {
        pricingVersion: "2026-09",
        source: "provider-price-list",
        currency: "USD",
        inputPerMillionTokens: 1,
      };
      delete pricing[missingField];

      expectConfigError(() =>
        resolveAIConfig(
          "planner",
          fixtureOptions(validEnvironment(), {
            profiles: [{ ...primaryProfile, pricing }],
          }),
        ),
      );
    },
  );
});

describe("checkAIConfig", () => {
  it("applies a profile override only while checking connection_test", () => {
    const options = fixtureOptions(validEnvironment(), {
      profiles: [primaryProfile, backupProfile],
      profileOverride: "backup",
    });

    expect(checkAIConfig(options)).toEqual([
      "backup",
      "primary",
      "primary",
      "primary",
    ]);
  });

  it("checks every active task profile without networking", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const options = fixtureOptions(validEnvironment(), {
        profiles: [primaryProfile, backupProfile],
        tasks: taskConfigs.map((config) =>
          config.task === "interviewer"
            ? { ...config, profileId: "backup" }
            : config,
        ),
      });

      expect(checkAIConfig(options)).toEqual([
        "primary",
        "backup",
        "primary",
        "primary",
      ]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("allows an unused profile without credentials", () => {
    const environment = validEnvironment();
    environment.delete("AI_BACKUP_API_KEY");
    environment.delete("AI_BACKUP_MODEL_ID");

    expect(
      checkAIConfig(
        fixtureOptions(environment, {
          profiles: [primaryProfile, backupProfile],
        }),
      ),
    ).toHaveLength(4);
  });
});

function validEnvironment(): Map<string, string> {
  return new Map([
    ["AI_PRIMARY_API_KEY", "secret-a"],
    ["AI_PRIMARY_MODEL_ID", "gemini-model-a"],
    ["AI_BACKUP_API_KEY", "secret-b"],
    ["AI_BACKUP_MODEL_ID", "backup-model-a"],
  ]);
}

function fixtureOptions(
  environment: Map<string, string>,
  overrides: Partial<AIConfigOptions> = {},
): AIConfigOptions {
  return {
    profiles: [primaryProfile],
    tasks: taskConfigs,
    registeredApiFormats: ["gemini-generate-content"],
    getEnvironmentValue: (name) => environment.get(name),
    ...overrides,
  };
}

function expectConfigError(operation: () => unknown): void {
  expect(operation).toThrowError(
    expect.objectContaining({ code: "AI_CONFIG_ERROR" }),
  );
}
