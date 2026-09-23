import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      all: true,
      include: [
        "domain/**/*.ts",
        "features/**/actions/**/*.ts",
        "features/**/schemas/**/*.ts",
        "infrastructure/**/*.ts",
        "shared/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.d.ts",
        "domain/auth/types.ts",
        "domain/billing/types.ts",
        "domain/pricing/types.ts",
        "domain/video/types.ts",
        "features/billing/components/types.ts",
        "domain/**/*-provider.ts",
        "domain/**/*-repository.ts",
        "domain/**/contracts.ts",
        "**/node_modules/**",
        "**/.next/**",
        "**/coverage/**",
        "**/e2e/**",
        "supabase/**",
        "*.config.*",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
