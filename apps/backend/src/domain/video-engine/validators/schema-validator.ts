import { compositionSpecSchema } from "../composition";
import type { CompositionSpec } from "../composition";
import type { ValidationIssue } from "./types";

/** The structural gate. Everything downstream assumes a parsed spec, so this runs first and alone. */
export function validateSchema(value: unknown): { spec: CompositionSpec | null; issues: ValidationIssue[] } {
  const parsed = compositionSpecSchema.safeParse(value);
  if (parsed.success) return { spec: parsed.data, issues: [] };

  const issues = parsed.error.issues.slice(0, 8).map((issue) => ({
    code: "schema_invalid" as const,
    message: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  }));
  return { spec: null, issues };
}
