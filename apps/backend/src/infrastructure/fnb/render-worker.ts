import { createHash } from "node:crypto";
import { z } from "zod";
import type { CampaignRenderAttempt, CampaignRenderDispatch } from "../../application/fnb/contracts";
import { createSupabaseServiceRoleClient } from "../supabase/clients";
import { readAssetBucket } from "../ai-service/supabase-asset-object-store";
import { renderComposition } from "./hyperframes-process";

const jobSchema = z.object({ id: z.string().uuid(), campaign_id: z.string().uuid(), user_id: z.string().uuid(), revision: z.number().int(), attempt_token: z.string().uuid() });

const queuedJobSchema = jobSchema.extend({ dispatch_token: z.string().uuid() });

const versionSchema = z.object({ composition_html: z.string(), composition_hash: z.string(), validated: z.boolean(), approved_at: z.string().nullable() });

export async function executeCampaignRender(attempt: CampaignRenderAttempt): Promise<void> {
  const client = createSupabaseServiceRoleClient();
  const { data, error } = await client.rpc("claim_fnb_campaign_render", { p_job_id: attempt.jobId, p_attempt_token: attempt.attemptToken });

  if (error) throw error;

  if (!data) return;
  const job = jobSchema.parse(data);

  try {
    const { data: saved, error: readError } = await client.from("fnb_campaign_versions").select("composition_html,composition_hash,validated,approved_at").eq("campaign_id", job.campaign_id).eq("user_id", job.user_id).eq("revision", job.revision).single();

    if (readError) throw readError;
    const version = versionSchema.parse(saved);

    if (!version.validated || !version.approved_at) throw new Error("Render hanya diperbolehkan untuk version tervalidasi yang telah disetujui.");
    const hash = createHash("sha256").update(version.composition_html).digest("hex");

    if (hash !== version.composition_hash) throw new Error("Composition hash tidak sesuai approved version.");
    const bytes = await renderComposition(version.composition_html);
    const outputKey = `fnb-renders/${job.campaign_id}/${job.id}/${job.attempt_token}.mp4`;
    const bucket = client.storage.from(readAssetBucket());
    const { error: uploadError } = await bucket.upload(outputKey, bytes, { contentType: "video/mp4", upsert: false });

    if (uploadError) throw uploadError;

    const { data: completed, error: finishError } = await client.rpc("finish_fnb_campaign_render", {
      p_job_id: job.id, p_attempt_token: job.attempt_token, p_output_object_key: outputKey, p_error: null,
    });

    if (finishError) throw finishError;

    if (!completed) {
      const { error: removeError } = await bucket.remove([outputKey]);

      if (removeError) throw removeError;
    }
  } catch (error) {
    const diagnostic = "Render MP4 gagal. Coba render kembali; komposisi yang disetujui tetap tersimpan.";

    const { error: failError } = await client.rpc("finish_fnb_campaign_render", {
      p_job_id: job.id, p_attempt_token: job.attempt_token, p_output_object_key: null, p_error: diagnostic,
    });

    if (failError) console.error("F&B render failure persistence:", failError.message);
    throw error;
  }
}

export async function recoverCampaignRenders(enqueue: (dispatch: CampaignRenderDispatch) => Promise<void>): Promise<void> {
  const client = createSupabaseServiceRoleClient();
  const { data, error } = await client.rpc("recover_fnb_campaign_renders", { p_limit: 10 });

  if (error) throw error;

  for (const job of z.array(queuedJobSchema).parse(data)) {
    try {
      await enqueue({ jobId: job.id, attemptToken: job.attempt_token, dispatchToken: job.dispatch_token });
    } catch (error) {
      const { error: releaseError } = await client.rpc("release_fnb_render_dispatch", {
        p_id: job.campaign_id, p_user_id: job.user_id, p_job_id: job.id, p_dispatch_token: job.dispatch_token,
      });

      if (releaseError) throw releaseError;
      console.error("F&B render dispatch:", error instanceof Error ? error.message : error);
    }
  }
}

let recoveryTimer: NodeJS.Timeout | undefined;

let recovering = false;

export function startCampaignRenderRecovery(enqueue: (dispatch: CampaignRenderDispatch) => Promise<void>): void {
  if (recoveryTimer) return;

  const recover = async () => {
    if (recovering) return;
    recovering = true;

    try {
      await recoverCampaignRenders(enqueue);
    } catch (error) {
      console.error("F&B render recovery:", error instanceof Error ? error.message : error);
    } finally {
      recovering = false;
    }
  };

  recoveryTimer = setInterval(() => { void recover(); }, 10_000);
  recoveryTimer.unref();
  void recover();
}
