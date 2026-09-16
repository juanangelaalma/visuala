import type { CategoryPlugin, StylePlugin } from "./contracts";
import { IncompatiblePluginError, PluginNotFoundError } from "./errors";
import type { VersionRef } from "./types";

type PluginKind = "category" | "style";

function requirePlugin<T extends { ref: VersionRef }>(
  plugins: readonly T[],
  ref: VersionRef,
  kind: PluginKind,
): T {
  const plugin = plugins.find(
    (candidate) =>
      candidate.ref.id === ref.id && candidate.ref.version === ref.version,
  );

  if (!plugin) {
    throw new PluginNotFoundError(kind, ref.id, ref.version);
  }

  return plugin;
}

export class PluginRegistry {
  constructor(
    private readonly categories: readonly CategoryPlugin[],
    private readonly styles: readonly StylePlugin[],
  ) {}

  resolveCategory(ref: VersionRef): CategoryPlugin {
    return requirePlugin(this.categories, ref, "category");
  }

  resolveStyle(ref: VersionRef): StylePlugin {
    return requirePlugin(this.styles, ref, "style");
  }

  assertCompatible(category: CategoryPlugin, style: StylePlugin): void {
    const isCompatible = category.supportedStyleCapabilities.every(
      (capability) => style.capabilities.includes(capability),
    );

    if (!isCompatible) {
      throw new IncompatiblePluginError(category.ref.id, style.ref.id);
    }
  }
}
