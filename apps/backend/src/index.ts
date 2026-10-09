import { app } from "@/app";
import { getEnv } from "@/env";
import { enqueueCampaignRender } from "@/application/fnb/render";
import { startCampaignRenderRecovery } from "@/infrastructure/fnb/render-worker";

const env = getEnv();
app.listen(env.PORT);
startCampaignRenderRecovery(enqueueCampaignRender);

console.log(`Backend listening on port ${env.PORT}`);
