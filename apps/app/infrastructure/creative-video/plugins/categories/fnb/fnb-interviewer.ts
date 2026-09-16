import type { FnbBriefAnalysis } from "./fnb-brief-schema";

export type { FnbBriefAnalysis } from "./fnb-brief-schema";

export const fnbInterviewerInstructions = `Analyze the user's F&B creative brief using only user-provided facts and visual observations. Record every fact with provenance. Never invent price, contact details, flavor, ingredients, certification, health claims, discounts, location, or promotion period/date. Mark uncertain interpretations as assumptions. Ask concise required questions only for facts necessary to fulfill the stated intent, and put useful non-blocking questions under optionalQuestions.`;

type RequiredIntent = { pattern: RegExp; factKey: string; question: string };

const requiredIntents: readonly RequiredIntent[] = [
  { pattern: /\b(diskon|discount|promo\s+diskon)\b/i, factKey: "discount_rule", question: "Apa aturan atau nilai diskonnya?" },
  { pattern: /\b(harga\s+mulai|starting\s+price)\b/i, factKey: "starting_price", question: "Berapa harga mulainya?" },
  { pattern: /\b(whats\s*app|wa)\b/i, factKey: "whatsapp_contact", question: "Nomor WhatsApp mana yang harus dicantumkan?" },
];

export function applyFnbFactPolicy(analysis: FnbBriefAnalysis, trustedUserMessages: readonly string[]): FnbBriefAnalysis {
  const trustedIntent = trustedUserMessages.join("\n");
  const protectedFacts = extractProtectedFacts(trustedIntent);
  const protectedKeys = new Set(requiredIntents.map(({ factKey }) => factKey).concat("promotion_end_date"));
  const unprotectedFacts = analysis.facts.filter(({ factKey }) => !protectedKeys.has(factKey));
  const facts = [...unprotectedFacts, ...protectedFacts];
  const answered = new Set(facts.map(({ factKey }) => factKey));
  const requiredByKey = new Map(analysis.missingRequired.map((question) => [question.factKey, question]));

  for (const intent of requiredIntents) {
    if (intent.pattern.test(trustedIntent) && !answered.has(intent.factKey)) requiredByKey.set(intent.factKey, intent);
  }
  requireAmbiguousPromotionEnd(trustedIntent, answered, requiredByKey);
  for (const factKey of answered) requiredByKey.delete(factKey);

  const missingRequired = [...requiredByKey.values()].map(({ factKey, question }) => ({ factKey, question }));
  return { ...analysis, facts, missingRequired, sufficient: missingRequired.length === 0 && analysis.sufficient };
}

function extractProtectedFacts(text: string): FnbBriefAnalysis["facts"] {
  const facts: FnbBriefAnalysis["facts"] = [];
  addMatch(facts, "discount_rule", text.match(/\b(?:diskon|discount)\s+(\d+(?:[.,]\d+)?\s*%)/i)?.[1]?.replace(/\s+/g, ""));
  addMatch(facts, "starting_price", text.match(/\b(?:harga\s+mulai|starting\s+price)\s+(Rp\s?\d[\d.]*)/i)?.[1]?.replace(/\s+/g, ""));
  addMatch(facts, "whatsapp_contact", text.match(/\b(?:whats\s*app|wa)\s+(\+?\d[\d\s-]{7,}\d)/i)?.[1]?.replace(/[\s-]/g, ""));
  const promotionEnd = /\b(?:promo|promosi|diskon|penawaran)\b[^.!?\n]*\b(?:sampai|hingga|berlaku sampai)\s+([^.!?\n]+)/i.exec(text)?.[1];
  if (promotionEnd) addMatch(facts, "promotion_end_date", normalizeConcreteDate(promotionEnd));
  return facts;
}

function addMatch(facts: FnbBriefAnalysis["facts"], factKey: string, value?: string): void {
  if (value) facts.push({ factKey, value, provenance: "user" });
}

function requireAmbiguousPromotionEnd(
  trustedIntent: string,
  answered: ReadonlySet<string>,
  requiredByKey: Map<string, { factKey: string; question: string }>,
): void {
  const promotionEnd = /\b(?:promo|promosi|diskon|penawaran)\b[^.!?\n]*\b(?:sampai|hingga|berlaku sampai)\s+([^.!?\n]+)/i.exec(trustedIntent);
  if (!promotionEnd || hasConcreteDate(promotionEnd[1]) || answered.has("promotion_end_date")) return;
  requiredByKey.set("promotion_end_date", { factKey: "promotion_end_date", question: "Tanggal konkret berapa promosi berakhir?" });
}

function hasConcreteDate(value: string): boolean {
  return normalizeConcreteDate(value) !== undefined;
}

function normalizeConcreteDate(value: string): string | undefined {
  const iso = value.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return iso;
  const match = value.match(/\b(\d{1,2})\s+(jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|agu(?:stus)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?)\s+(\d{4})\b/i);
  if (!match) return undefined;
  const months: Record<string, string> = { jan: "01", januari: "01", feb: "02", februari: "02", mar: "03", maret: "03", apr: "04", april: "04", mei: "05", jun: "06", juni: "06", jul: "07", juli: "07", agu: "08", agustus: "08", sep: "09", september: "09", okt: "10", oktober: "10", nov: "11", november: "11", des: "12", desember: "12" };
  return `${match[3]}-${months[match[2].toLowerCase()]}-${match[1].padStart(2, "0")}`;
}
