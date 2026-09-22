import type { AIMessage } from "../../domain/ai-service/types";
import { REQUIRED_BRIEF_FIELDS, type VideoBrief, type VideoBriefDraft } from "../../domain/video/brief";
import { INTERVIEW_TURN_CONTROLS } from "../../domain/video/interview";
import { MAX_SCENE_COPY_CHARS, MAX_SCENE_TITLE_CHARS, STORYBOARD_TRANSITIONS } from "../../domain/video/storyboard";
import type { VideoMessage, VideoProject } from "../../domain/video/types";

/** Bump when the wording below changes: the version is frozen into every `generated_by` snapshot. */
export const INTERVIEWER_PROMPT_VERSION = "interviewer@v1";
export const PLANNER_PROMPT_VERSION = "planner@v1";

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  id: "Bahasa Indonesia",
  en: "English",
};

function languageName(language: string): string {
  return LANGUAGE_NAMES[language] ?? language;
}

function outputSettingsLine(project: VideoProject): string {
  const { settings } = project;
  return [
    `${settings.durationSeconds}s`,
    settings.aspectRatio,
    settings.resolution,
    `voice-over: ${settings.voiceOverEnabled ? "on" : "off"}`,
    `music: ${settings.musicEnabled ? "on" : "off"}`,
  ].join(", ");
}

/** The system instruction for the interviewer turn. Kept in English; the question itself is not. */
export function interviewerInstructions(input: {
  project: VideoProject;
  draft: VideoBriefDraft | null;
  assetCount: number;
}): string {
  const { project } = input;
  return [
    "You are the interviewer for an AI video generator used by small food and beverage businesses.",
    "You maintain one structured brief and ask exactly one question per turn.",
    "",
    `Video type: ${project.videoType}`,
    `Required before the brief is complete: ${REQUIRED_BRIEF_FIELDS[project.videoType].join(", ")}`,
    `Output settings: ${outputSettingsLine(project)}`,
    `Language for the question: ${languageName(project.settings.language)}`,
    `Visual style: ${project.styleId}`,
    `Product images the user uploaded: ${input.assetCount}`,
    "",
    "Brief draft so far (JSON, null means still unknown):",
    input.draft ? JSON.stringify(input.draft) : "none yet",
    "",
    "Rules:",
    "- Return the complete updated draft every turn, keeping every field you already know.",
    `- Fill a field only from something the user said or confirmed. Never invent a price, discount, address, phone number, brand, health claim, or product fact. Leave it null instead.`,
    "- Ask about at most one field, the most useful missing one, and write the question in the language given above.",
    `- When the answer has a natural set of choices, use control "single_select" or "multi_select" with 2 to 6 options and give each a short label. Use "free_text" when the answer must be typed.`,
    `- Valid controls: ${INTERVIEW_TURN_CONTROLS.join(", ")}.`,
    "- When one choice is clearly better for this product or video type, set recommendedOptionId to that option's id and explain it in one sentence in recommendationReason. Never recommend silently.",
    "- When the user does not know a value, offer an answer that leaves it out instead of inventing one.",
    "- Set briefComplete to true only when every required field is filled and every commercial value came from the user.",
    "- targetFields names the draft fields this question resolves.",
  ].join("\n");
}

/** The system instruction for the planner turn. */
export function plannerInstructions(input: {
  project: VideoProject;
  brief: VideoBrief;
  assetIds: readonly string[];
}): string {
  const { project, brief } = input;
  const voiceOverOn = project.settings.voiceOverEnabled;
  return [
    "You are the planner for an AI video generator. Turn one confirmed brief into one storyboard.",
    "",
    `Duration: exactly ${project.settings.durationSeconds} seconds`,
    `Aspect ratio: ${project.settings.aspectRatio}`,
    `Resolution: ${project.settings.resolution}`,
    `Style: ${project.styleId}`,
    `Language for on-screen text, voice-over, and caption: ${languageName(project.settings.language)}`,
    `Music: ${project.settings.musicEnabled ? "on" : "off"}`,
    `Asset ids you may reference: ${input.assetIds.join(", ")}`,
    "",
    "Confirmed brief (return it unchanged):",
    JSON.stringify(brief),
    "",
    "Storyboard rules:",
    "- Return at least one scene. The first scene starts at 0 seconds.",
    "- Scene timings must abut with no gap and add up to exactly the duration above. Do not overlap.",
    "- Every scene lists at least one asset id taken from the list above. Never invent an id.",
    `- onScreenTitle at most ${MAX_SCENE_TITLE_CHARS} characters. onScreenCopy at most ${MAX_SCENE_COPY_CHARS} characters.`,
    voiceOverOn
      ? "- Every scene needs a voiceOver and a caption, both written in the language above and drawn from the brief's own copy."
      : "- Set voiceOver and caption to null on every scene.",
    `- transition is one of: ${STORYBOARD_TRANSITIONS.join(", ")}.`,
    "- Use only copy and facts from the confirmed brief. Add no price, discount, address, or claim that is not already in it.",
  ].join("\n");
}

/** The stored transcript, in the shape the AI service accepts. */
export function transcriptMessages(transcript: readonly VideoMessage[]): AIMessage[] {
  return transcript.map((message) => ({ role: message.role, content: message.content }));
}
