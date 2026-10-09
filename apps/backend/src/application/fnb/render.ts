import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { runHyperframes, withCompositionProject } from "../../infrastructure/fnb/hyperframes-process";
import { executeCampaignRender } from "../../infrastructure/fnb/render-worker";
import type { CampaignRenderDispatch } from "./contracts";

const findingsSchema = z.object({ findings: z.array(z.object({ code: z.string(), severity: z.string(), message: z.string() })) });

const checkResultSchema = z.object({
  ok: z.boolean(),
  browserSkipped: z.boolean(),
  lint: findingsSchema,
  runtime: findingsSchema,
  layout: findingsSchema,
  motion: findingsSchema,
  contrast: findingsSchema,
});

export async function validateComposition(html: string): Promise<string[]> {
  try {
    const output = await withCompositionProject(html, (directory) => runHyperframes(directory, ["check", "--json"], 120_000));
    const result = checkResultSchema.parse(JSON.parse(output));

    if (result.browserSkipped) return ["Browser Hyperframes tidak menjalankan validasi. Periksa konfigurasi Chrome, lalu simpan kembali."];
    const failures: string[] = [];

    for (const audit of [result.lint, result.runtime, result.layout, result.motion, result.contrast]) {
      for (const finding of audit.findings) {
        if (finding.severity === "error" || finding.code === "contrast_aa_failure") failures.push(`${finding.code}: ${finding.message}`);
      }
    }

    if (failures.length) return failures;

    if (!result.ok) return ["Hyperframes tidak dapat memvalidasi composition. Simpan kembali setelah memperbaiki konten atau style."];

    return [];
  } catch (error) {
    console.error("F&B composition validation:", error);

    return ["Validasi composition gagal. Periksa konfigurasi renderer dan Chrome di server, lalu simpan kembali. Draft dan preview sebelumnya tetap tersimpan."];
  }
}

export async function enqueueCampaignRender(dispatch: CampaignRenderDispatch): Promise<void> {
  const driver = process.env.FNB_RENDER_DRIVER ?? (process.env.NODE_ENV === "production" ? "trigger" : "local");
  const attempt = { jobId: dispatch.jobId, attemptToken: dispatch.attemptToken };

  if (driver === "trigger") {
    if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY diperlukan untuk render worker Trigger.dev.");
    const idempotencyKey = await idempotencyKeys.create(`${attempt.jobId}:${attempt.attemptToken}`, { scope: "global" });
    await tasks.trigger("fnb-campaign-render", attempt, { idempotencyKey, idempotencyKeyTTL: "30m" });

    return;
  }

  if (driver !== "local") throw new Error("FNB_RENDER_DRIVER harus local atau trigger.");
  void executeCampaignRender(attempt).catch((error) => console.error("F&B render worker:", error instanceof Error ? error.message : error));
}
