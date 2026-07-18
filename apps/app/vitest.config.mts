import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      all: true,
      include: [
        "application/**/*.ts",
        "domain/**/*.ts",
        "features/**/actions/**/*.ts",
        "features/**/schemas/**/*.ts",
        "infrastructure/**/*.ts",
        "app/api/**/route.ts",
        "shared/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.d.ts",
        "domain/auth/types.ts",
        "domain/billing/types.ts",
        "domain/credits/types.ts",
        "domain/pricing/types.ts",
        "features/billing/components/types.ts",
        "domain/**/*-provider.ts",
        "domain/**/*-repository.ts",
        "domain/**/contracts.ts",
        "infrastructure/supabase/database.types.ts",
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
