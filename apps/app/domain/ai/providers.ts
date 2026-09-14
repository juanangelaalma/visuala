import type { GenerationStatus, VisualaModelKey } from "./types";
export type AsyncGenerationResult = { externalId: string; status: GenerationStatus; raw: unknown };
export type GenerationStatusResult = { status: GenerationStatus; outputs: string[]; raw: unknown; actualCostUsd?: number };
export interface AtlasImageProvider { generate(input: { logicalModelKey: VisualaModelKey; prompt: string; references: string[] }): Promise<AsyncGenerationResult>; getStatus(externalId: string): Promise<GenerationStatusResult> }
export interface AtlasVideoProvider { generate(input: { logicalModelKey: VisualaModelKey; prompt: string; image: string; duration: number; resolution: "720p" | "1080p" }): Promise<AsyncGenerationResult>; getStatus(externalId: string): Promise<GenerationStatusResult> }
export interface AtlasVoiceProvider { generate(input: { logicalModelKey: VisualaModelKey; text: string }): Promise<AsyncGenerationResult>; getStatus(externalId: string): Promise<GenerationStatusResult> }
