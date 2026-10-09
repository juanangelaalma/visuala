import { createAIService } from "../ai-service/services";
import { createVideoProjectServices } from "../video/services";
import { createSupabaseServiceRoleClient } from "../../infrastructure/supabase/clients";
import { SupabaseCampaignRepository } from "../../infrastructure/fnb/supabase-campaign-repository";
import { buildComposition } from "./composition";
import { PLANNER_SCHEMA_KEY, plannerChoiceSchema } from "./planner";
import { enqueueCampaignRender, validateComposition } from "./render";
import type { CampaignServices } from "./campaigns";

export function createCampaignServices(environment: Readonly<Record<string, string | undefined>> = process.env): CampaignServices {
  return {
    ...createVideoProjectServices(environment),
    campaigns: new SupabaseCampaignRepository(createSupabaseServiceRoleClient(environment)),
    createAI: () => createAIService({ environment, schemas: { [PLANNER_SCHEMA_KEY]: plannerChoiceSchema } }),
    build: buildComposition,
    validate: validateComposition,
    enqueue: enqueueCampaignRender,
  };
}
