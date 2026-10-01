import { z, type ZodType } from "zod";
import { artDirectionSchema } from "../../domain/video-engine/art-direction";
import { compositionSpecWireSchema } from "../../domain/video-engine/composition";

/** Bump together with the schemas it names: the key is the name@version the adapter looks up. */
export const VIDEO_ENGINE_AI_SCHEMA_VERSION = "v1";

export const ART_DIRECTION_SCHEMA_NAME = "art_direction";
export const COMPOSITION_SPEC_SCHEMA_NAME = "composition_spec";

/** Registered separately from the old `VIDEO_AI_SCHEMAS`, which goes away with the old pipeline. */
export const VIDEO_ENGINE_AI_SCHEMAS: Readonly<Record<string, ZodType>> = {
  [`${ART_DIRECTION_SCHEMA_NAME}@${VIDEO_ENGINE_AI_SCHEMA_VERSION}`]: artDirectionSchema,
  [`${COMPOSITION_SPEC_SCHEMA_NAME}@${VIDEO_ENGINE_AI_SCHEMA_VERSION}`]: compositionSpecWireSchema,
};
