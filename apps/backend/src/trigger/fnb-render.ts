import { task } from "@trigger.dev/sdk";
import { z } from "zod";
import { executeCampaignRender } from "../infrastructure/fnb/render-worker";
import type { CampaignRenderAttempt } from "../application/fnb/contracts";

const attemptSchema = z.object({ jobId: z.string().uuid(), attemptToken: z.string().uuid() });

export const fnbCampaignRender = task({
  id: "fnb-campaign-render",
  maxDuration: 1500,
  retry: { maxAttempts: 1 },
  machine: { preset: "medium-2x" },
  run: async (payload: CampaignRenderAttempt) => {
    const attempt = attemptSchema.parse(payload);
    await executeCampaignRender(attempt);

    return attempt;
  },
});
