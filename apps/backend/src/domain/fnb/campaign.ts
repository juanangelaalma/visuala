import { z } from "zod";

const requiredText = (max: number) => z.string().trim().min(1).max(max);

const optionalText = (max: number) => z.string().trim().max(max);

const priceSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const discountSchema = z.number().int().min(1).max(100);

export const campaignBriefSchema = z.object({
  campaignName: requiredText(100),
  productName: requiredText(100),
  brandName: requiredText(100),
  originalPrice: priceSchema,
  discountPercent: discountSchema,
  promoPeriod: optionalText(100).default(""),
  cta: requiredText(80),
  productAssetId: z.uuid(),
  logoAssetId: z.uuid().nullable(),
}).strict();

export const SCENE_TIMELINE = [
  { id: "hook", type: "hook", start: 0, duration: 2 },
  { id: "product", type: "product", start: 2, duration: 4 },
  { id: "discount", type: "discount", start: 6, duration: 5 },
  { id: "end-card", type: "end-card", start: 11, duration: 4 },
] as const;

const sceneContent = {
  headline: requiredText(100),
  subheadline: optionalText(160),
  cta: optionalText(80),
  productAssetId: z.uuid(),
};

function lockedScene<const T extends typeof SCENE_TIMELINE[number]>(timing: T) {
  return z.object({
    id: z.literal(timing.id), type: z.literal(timing.type),
    start: z.literal(timing.start), duration: z.literal(timing.duration), ...sceneContent,
  }).strict();
}

export const sceneSchema = z.union([
  lockedScene(SCENE_TIMELINE[0]), lockedScene(SCENE_TIMELINE[1]),
  lockedScene(SCENE_TIMELINE[2]), lockedScene(SCENE_TIMELINE[3]),
]);

export const videoPlanSchema = z.object({
  scenes: z.tuple([
    lockedScene(SCENE_TIMELINE[0]), lockedScene(SCENE_TIMELINE[1]),
    lockedScene(SCENE_TIMELINE[2]), lockedScene(SCENE_TIMELINE[3]),
  ]),
}).strict();

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color");

export const styleTokensSchema = z.object({
  primary: hexColor, secondary: hexColor, accent: hexColor, background: hexColor, text: hexColor,
  typography: z.enum(["bold", "editorial", "clean"]),
  backgroundTreatment: z.enum(["solid", "radial"]),
  density: z.enum(["balanced", "bold"]),
}).strict().superRefine((style, context) => {
  const surfaces: Array<"background" | "secondary"> = style.backgroundTreatment === "radial" ? ["background", "secondary"] : ["background"];

  for (const surface of surfaces) {
    if (contrastRatio(style.text, style[surface]) < 4.5) {
      context.addIssue({ code: "custom", path: ["text"], message: `Text must have at least 4.5:1 contrast against ${surface}` });
    }
  }
});

export type CampaignBrief = z.infer<typeof campaignBriefSchema>;

export type Scene = z.infer<typeof sceneSchema>;

export type VideoPlan = z.infer<typeof videoPlanSchema>;

export type StyleTokens = z.infer<typeof styleTokensSchema>;

export function discountedPrice(originalPrice: number, discountPercent: number): number {
  priceSchema.parse(originalPrice);
  discountSchema.parse(discountPercent);

  // Integer arithmetic avoids a one-rupiah drift; exact halves round up.
  return Number((BigInt(originalPrice) * BigInt(100 - discountPercent) + 50n) / 100n);
}

export function formatPrice(price: number): string {
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(price);

  return `Rp ${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function luminance(color: string): number {
  const values = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;

    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(hexColor.parse(first));
  const b = luminance(hexColor.parse(second));

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function inkForColor(surface: string): string {
  return contrastRatio("#ffffff", surface) >= contrastRatio("#000000", surface) ? "#ffffff" : "#000000";
}

export const STYLE_PRESETS: Array<{ id: string; label: string; tokens: StyleTokens }> = [
  { id: "warm-artisan", label: "Warm Artisan", tokens: { primary: "#244734", secondary: "#e9be7d", accent: "#b34327", background: "#f5f2e9", text: "#222c25", typography: "editorial", backgroundTreatment: "radial", density: "balanced" } },
  { id: "night-market", label: "Night Market", tokens: { primary: "#f9da63", secondary: "#25271e", accent: "#c4f55c", background: "#141610", text: "#fff9e8", typography: "bold", backgroundTreatment: "solid", density: "bold" } },
  { id: "fresh-counter", label: "Fresh Counter", tokens: { primary: "#175a37", secondary: "#d8eac8", accent: "#f3bc48", background: "#f7faf0", text: "#153421", typography: "clean", backgroundTreatment: "radial", density: "balanced" } },
];

export function findUnsupportedSceneFacts(brief: CampaignBrief, plan: VideoPlan): string[] {
  const facts = [brief.campaignName, brief.productName, brief.brandName, brief.promoPeriod, brief.cta].join(" ").toLowerCase();

  const permittedNumbers = new Set([
    String(brief.originalPrice), String(discountedPrice(brief.originalPrice, brief.discountPercent)),
    String(brief.discountPercent), ...(facts.match(/\d+(?:[.,]\d+)*/g) ?? []).map((number) => number.replace(/[.,]/g, "")),
  ]);

  const unsupported: string[] = [];

  for (const scene of plan.scenes) {
    for (const field of ["headline", "subheadline", "cta"] as const) {
      const text = scene[field].toLowerCase();
      const percentages = [...text.matchAll(/(\d+)\s*%/g)];
      const prices = [...text.matchAll(/rp\s*(\d+(?:[.,]\d+)*)(\s*[kr](?:b|ibu)?)?/g)];
      const numbers = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
      const claims = text.match(/(?:gratis|free|halal|organik|organic|best seller|bestseller|terlaris|terbaik|nomor satu|no\.\s*1|stok terbatas|limited stock|while stocks last|hanya hari ini|today only|buy\s+\d+\s+get\s+\d+|beli\s+\d+\s+gratis\s+\d+|\d+\s*(?:oktober|october|januari|january|februari|february|maret|march|april|mei|may|juni|june|juli|july|agustus|august|september|november|desember|december))/g) ?? [];

      if (percentages.some((match) => Number(match[1]) !== brief.discountPercent && !facts.includes(match[0]))
        || prices.some((match) => {
          const value = Number(match[1]!.replace(/[.,]/g, "")) * (match[2] ? 1000 : 1);

          return value !== brief.originalPrice && value !== discountedPrice(brief.originalPrice, brief.discountPercent);
        })
        || numbers.some((number) => !permittedNumbers.has(number.replace(/[.,]/g, "")))
        || claims.some((claim) => !facts.includes(claim))) unsupported.push(`scenes.${scene.id}.${field}`);
    }
  }

  return unsupported;
}

export const draftSchema = z.object({ brief: campaignBriefSchema, plan: videoPlanSchema, style: styleTokensSchema }).strict()
  .superRefine((draft, context) => {
    for (const field of findUnsupportedSceneFacts(draft.brief, draft.plan)) {
      context.addIssue({ code: "custom", path: ["plan", ...field.split(".")], message: "Commercial facts must match the submitted brief" });
    }
  });

export type CampaignDraft = z.infer<typeof draftSchema>;
