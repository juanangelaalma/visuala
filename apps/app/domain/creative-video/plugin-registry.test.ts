import { describe, expect, it, vi } from "vitest";
import type { CategoryPlugin, StylePlugin } from "./contracts";
import {
  IncompatiblePluginError,
  PluginNotFoundError,
} from "./errors";
import { PluginRegistry } from "./plugin-registry";

const categoryPlugin: CategoryPlugin = {
  ref: { id: "fnb", version: "1" },
  supportedAssetRoles: [],
  brief: {
    schema: {} as CategoryPlugin["brief"]["schema"],
    schemaVersion: "1",
    interviewerInstructions: "",
    interviewerPromptVersion: "1",
    requiredFacts: [],
    optionalFacts: [], postValidate: (brief) => brief,
  },
  plan: {
    schemaVersion: "v1",
    schema: {} as CategoryPlugin["plan"]["schema"],
    plannerInstructions: "",
    plannerPromptVersion: "1",
    constraints: [],
  },
  supportedStyleCapabilities: ["vertical-video"],
  testFixtures: [],
  acceptanceExamples: [],
};

const stylePlugin: StylePlugin = {
  ref: { id: "editorial", version: "1" },
  tokens: {},
  typographyRequirements: [],
  layoutIds: [],
  motionIds: [],
  sceneConstraints: [],
  textConstraints: {
    headlineMaxLength: 80,
    supportingTextMaxLength: 140,
  },
  capabilities: ["vertical-video"],
  runtimeDependencies: {},
  compile: vi.fn(),
  supportsScene: vi.fn(),
};

describe("PluginRegistry", () => {
  it("resolves exact build-time category versions", () => {
    const registry = new PluginRegistry([categoryPlugin], [stylePlugin]);

    expect(registry.resolveCategory({ id: "fnb", version: "1" })).toBe(
      categoryPlugin,
    );
  });

  it("resolves exact build-time style versions", () => {
    const registry = new PluginRegistry([categoryPlugin], [stylePlugin]);

    expect(registry.resolveStyle({ id: "editorial", version: "1" })).toBe(
      stylePlugin,
    );
  });

  it("rejects an unknown category version", () => {
    const registry = new PluginRegistry([categoryPlugin], [stylePlugin]);

    expect(() =>
      registry.resolveCategory({ id: "fnb", version: "2" }),
    ).toThrow(PluginNotFoundError);
  });

  it("rejects a style missing a required category capability", () => {
    const registry = new PluginRegistry([categoryPlugin], [
      { ...stylePlugin, capabilities: [] },
    ]);

    expect(() =>
      registry.assertCompatible(categoryPlugin, {
        ...stylePlugin,
        capabilities: [],
      }),
    ).toThrow(IncompatiblePluginError);
  });

  it("accepts a style that provides every required category capability", () => {
    const registry = new PluginRegistry([categoryPlugin], [stylePlugin]);

    expect(() =>
      registry.assertCompatible(categoryPlugin, stylePlugin),
    ).not.toThrow();
  });
});
