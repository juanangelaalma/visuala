import { describe, expect, it } from "vitest";
import { applyFnbFactPolicy, type FnbBriefAnalysis } from "./fnb-interviewer";
import { fnbBriefAnalysisSchema } from "./fnb-brief-schema";

describe("applyFnbFactPolicy", () => {
  it.each([
    ["Promo diskon untuk produk ini", "discount_rule"],
    ["Harga mulai untuk produk ini", "starting_price"],
    ["Pesan lewat WhatsApp", "whatsapp_contact"],
    ["Promo berlaku sampai Minggu", "promotion_end_date"],
  ])("requires the missing fact for %s", (prompt, factKey) => {
    const result = applyFnbFactPolicy(baseAnalysis(prompt), [prompt]);

    expect(result.missingRequired).toContainEqual(expect.objectContaining({ factKey }));
    expect(result.sufficient).toBe(false);
  });

  it("does not make optional business name mandatory for generic sales content", () => {
    expect(applyFnbFactPolicy(baseAnalysis("Buat konten jualan"), ["Buat konten jualan"]).missingRequired)
      .not.toContainEqual(expect.objectContaining({ factKey: "business_name" }));
  });

  it("does not repeat a required question whose fact was already answered", () => {
    const analysis = baseAnalysis("Pesan lewat WhatsApp +628123456789");
    analysis.facts.push({ factKey: "whatsapp_contact", value: "+628123456789", provenance: "user" });
    analysis.missingRequired.push({ factKey: "whatsapp_contact", question: "Nomor WhatsApp berapa?" });

    const result = applyFnbFactPolicy(analysis, ["Pesan lewat WhatsApp +628123456789"]);

    expect(result.missingRequired).not.toContainEqual(expect.objectContaining({ factKey: "whatsapp_contact" }));
  });

  it.each(["visual_observation", "assumption"] as const)("does not trust %s provenance for protected facts", (provenance) => {
    const analysis = baseAnalysis("AI changed goal");
    analysis.facts.push({ factKey: "discount_rule", value: "20%", provenance });

    const result = applyFnbFactPolicy(analysis, ["Buat promo diskon"]);

    expect(result.missingRequired).toContainEqual(expect.objectContaining({ factKey: "discount_rule" }));
  });

  it.each([
    ["Buat promo diskon", "discount_rule", "50%"],
    ["Tampilkan harga mulai", "starting_price", "Rp10.000"],
    ["Pesan lewat WhatsApp", "whatsapp_contact", "+628123456789"],
    ["Promo sampai Minggu", "promotion_end_date", "2026-10-20"],
  ])("rejects hallucinated %s values labeled as user provenance", (message, factKey, value) => {
    const analysis = baseAnalysis("ignored");
    analysis.facts.push({ factKey, value, provenance: "user" });

    const result = applyFnbFactPolicy(analysis, [message]);

    expect(result.missingRequired).toContainEqual(expect.objectContaining({ factKey }));
  });

  it.each([
    ["Diskon 20%", "discount_rule", "20%"],
    ["Harga mulai Rp15.000", "starting_price", "Rp15.000"],
    ["Pesan WhatsApp +628123456789", "whatsapp_contact", "+628123456789"],
  ])("extracts protected %s facts from trusted user text", (message, factKey, value) => {
    const result = applyFnbFactPolicy(baseAnalysis("ignored"), [message]);

    expect(result.facts).toContainEqual({ factKey, value, provenance: "user" });
    expect(result.missingRequired).not.toContainEqual(expect.objectContaining({ factKey }));
  });

  it("uses trusted user messages instead of the AI-authored goal", () => {
    const analysis = baseAnalysis("Pesan lewat WhatsApp dan diskon besar");

    const result = applyFnbFactPolicy(analysis, ["Buat konten produk biasa"]);

    expect(result.missingRequired).toEqual([]);
  });

  it("requires a concrete promotion date for an ambiguous relative end", () => {
    const result = applyFnbFactPolicy(baseAnalysis("ignored"), ["Promo sampai Minggu"]);

    expect(result.missingRequired).toContainEqual(expect.objectContaining({ factKey: "promotion_end_date" }));
  });

  it("accepts a concrete promotion end date from the user", () => {
    const result = applyFnbFactPolicy(baseAnalysis("ignored"), ["Promo sampai 20 September 2026"]);

    expect(result.facts).toContainEqual({ factKey: "promotion_end_date", value: "2026-09-20", provenance: "user" });
    expect(result.missingRequired).not.toContainEqual(expect.objectContaining({ factKey: "promotion_end_date" }));
  });

  it.each(["Masak sampai matang", "Harga sampai 50 ribu", "Tanggal lahir pelanggan tidak diperlukan"])("does not infer promotion dates from unrelated text: %s", (message) => {
    const result = applyFnbFactPolicy(baseAnalysis("ignored"), [message]);

    expect(result.missingRequired).not.toContainEqual(expect.objectContaining({ factKey: "promotion_end_date" }));
  });

  it("does not require a promotion start when only an end date was requested", () => {
    const result = applyFnbFactPolicy(baseAnalysis("ignored"), ["Promo sampai 20 September 2026"]);

    expect(result.missingRequired).not.toContainEqual(expect.objectContaining({ factKey: "promotion_start_date" }));
  });

  it("accepts an unknown product name", () => {
    const parsed = fnbBriefAnalysisSchema.safeParse({ ...baseAnalysis("Jualan"), product: { name: null, category: "food", confidence: 0.2 } });

    expect(parsed.success).toBe(true);
  });

  it("rejects malformed fact provenance", () => {
    const parsed = fnbBriefAnalysisSchema.safeParse({ ...baseAnalysis("Jualan"), facts: [{ factKey: "price", value: 10, provenance: "model" }] });

    expect(parsed.success).toBe(false);
  });
});

function baseAnalysis(goal: string): FnbBriefAnalysis {
  return {
    goal,
    product: { name: null, category: "food", confidence: 0.9 },
    facts: [],
    assumptions: [],
    missingRequired: [],
    optionalQuestions: [{ factKey: "business_name", question: "Apa nama bisnisnya?" }],
    sufficient: true,
  };
}
