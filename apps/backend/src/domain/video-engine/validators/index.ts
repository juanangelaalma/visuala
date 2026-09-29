import { report } from "./types";
import { validateAssets } from "./asset-validator";
import { validateCatalog } from "./catalog-validator";
import { validateCompatibility } from "./compatibility-validator";
import { validateDuration } from "./duration-validator";
import { validateFacts } from "./fact-validator";
import { validateSchema } from "./schema-validator";
import type { ValidationInput, ValidationIssue, ValidationReport } from "./types";

/** Structure runs alone and stops the chain; the other five all run, so a rejected candidate reports every reason. */
export function validateComposition(input: ValidationInput): ValidationReport {
  const { spec, issues } = validateSchema(input.spec);
  if (spec === null) return report(issues);

  const collected: ValidationIssue[] = [
    ...validateCatalog(spec, input.catalog, input.candidateIds),
    ...validateFacts(spec, input.brief, input.recipe, input.catalog),
    ...validateAssets(spec, input.assets),
    ...validateDuration(spec),
    ...validateCompatibility(spec, input.catalog),
  ];
  return report(collected);
}

export type { ValidationInput, ValidationIssue, ValidationReport, ValidationBrief, ValidationCode } from "./types";
export { validateSchema } from "./schema-validator";
export { briefValues, residual } from "../facts";
export { report } from "./types";
