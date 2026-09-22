import { describe, expect, it } from "vitest";
import { findInterviewTurnProblems, interviewTurnSchema } from "./interview";

const option = (id: string) => ({ id, label: `Opsi ${id}`, detail: null });

function turn(overrides: Record<string, unknown> = {}) {
  return {
    question: "Style visual mana yang paling sesuai?",
    control: "single_select",
    options: [option("bold_pop"), option("clean_product")],
    recommendedOptionId: "bold_pop",
    recommendationReason: "Kontras tinggi tetap terbaca di layar ponsel.",
    targetFields: ["styleId"],
    briefComplete: false,
    ...overrides,
  };
}

describe("interview turn", () => {
  it("parses a turn with a recommended option", () => {
    expect(interviewTurnSchema.safeParse(turn()).success).toBe(true);
  });

  it("rejects an unknown field and an unknown control", () => {
    expect(interviewTurnSchema.safeParse(turn({ secret: "x" })).success).toBe(false);
    expect(interviewTurnSchema.safeParse(turn({ control: "dropdown" })).success).toBe(false);
  });

  it("rejects a turn with no target field", () => {
    expect(interviewTurnSchema.safeParse(turn({ targetFields: [] })).success).toBe(false);
  });

  it("accepts a free-text turn with no options", () => {
    const parsed = interviewTurnSchema.parse(turn({ control: "free_text", options: [], recommendedOptionId: null, recommendationReason: null }));

    expect(findInterviewTurnProblems(parsed)).toEqual([]);
  });

  it("requires two options for a select control", () => {
    const parsed = interviewTurnSchema.parse(turn({ options: [option("only")], recommendedOptionId: null, recommendationReason: null }));

    expect(findInterviewTurnProblems(parsed)).toContain("options_required");
  });

  it("forbids options on a free-text turn", () => {
    expect(findInterviewTurnProblems(interviewTurnSchema.parse(turn({ control: "free_text" })))).toContain("options_not_allowed");
  });

  it("refuses a recommendation that is not one of the options", () => {
    expect(findInterviewTurnProblems(interviewTurnSchema.parse(turn({ recommendedOptionId: "premium_dark" })))).toContain("recommendation_not_listed");
  });

  it("refuses a recommendation with no reason", () => {
    expect(findInterviewTurnProblems(interviewTurnSchema.parse(turn({ recommendationReason: null })))).toContain("recommendation_reason_missing");
  });

  it("accepts a multi-select turn with no recommendation", () => {
    const parsed = interviewTurnSchema.parse(turn({ control: "multi_select", recommendedOptionId: null, recommendationReason: null }));

    expect(findInterviewTurnProblems(parsed)).toEqual([]);
  });
});
