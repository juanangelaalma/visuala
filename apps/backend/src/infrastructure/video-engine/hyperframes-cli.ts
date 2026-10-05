import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

export const HYPERFRAMES_CLI_VERSION = "0.8.59";
export const HYPERFRAMES_CLI_PACKAGE = `hyperframes@${HYPERFRAMES_CLI_VERSION}`;

export type HyperframesCliErrorCode = "cli_failed" | "cli_unreadable";

export class HyperframesCliError extends Error {
  constructor(readonly code: HyperframesCliErrorCode, message: string) {
    super(message);
    this.name = "HyperframesCliError";
  }
}

const addResultSchema = z
  .object({
    ok: z.boolean(),
    name: z.string(),
    type: z.string(),
    written: z.array(z.string()),
    installed: z.array(z.string()),
    snippet: z.string(),
    warnings: z.array(z.string()),
  })
  .loose();

export type HyperframesAddResult = z.infer<typeof addResultSchema>;

const findingSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  selector: z.string(),
  sourceFile: z.string(),
  time: z.number().finite(),
}).loose();

export type HyperframesFinding = z.infer<typeof findingSchema>;

export class HyperframesContentError extends HyperframesCliError {
  constructor(message: string, readonly findings: readonly HyperframesFinding[]) {
    super("cli_failed", message);
    this.name = "HyperframesContentError";
  }
}

const authoredLintCodes: Readonly<Record<string, true>> = {
  root_missing_composition_id: true, root_missing_dimensions: true, root_dimensions_mismatch: true,
  unbalanced_style_tags: true, visible_markup_comment: true, missing_timeline_registry: true, timeline_id_mismatch: true,
  css_parse_error: true, repeated_id_descendant_selector: true, runtime_hidden_style_opacity: true,
  unclosed_tag_swallowed_element: true, invalid_inline_script_syntax: true, host_missing_composition_id: true,
  scoped_css_missing_wrapper: true, non_deterministic_code: true, duplicate_media_id: true,
  video_missing_muted: true, video_muted_with_declared_audio: true, video_nested_in_timed_element: true,
  self_closing_media_tag: true, base64_media_prohibited: true, media_missing_data_start: true, media_missing_id: true,
  duplicate_composition_id: true, deprecated_data_layer: true, deprecated_data_end: true,
  split_data_attribute_selector: true, template_literal_selector: true, standalone_composition_wrapped_in_template: true,
  root_composition_missing_html_wrapper: true, missing_data_no_timeline: true, requestanimationframe_in_composition: true,
  invalid_variable_values_json: true, invalid_composition_variables_declaration: true, html_dir_attribute_breaks_render: true,
  root_composition_missing_duration_source: true, gsap_fullscreen_overlay_starts_visible: true,
  gsap_animates_clip_element: true, gsap_css_transform_conflict: true, gsap_infinite_repeat: true,
  gsap_timeline_not_registered: true, gsap_timeline_registered_before_async_build: true,
  gsap_cold_seek_hidden_fromto_missing_reveal: true, gsap_from_opacity_noop: true, gsap_non_transform_motion: true,
  gsap_relative_value_second_writer: true, gsap_repeat_refresh_relative_value: true, gsap_function_value_hazard: true,
  gsap_timeline_return_used_as_tween: true, svg_drawon_css_dasharray_conflict: true, svg_measure_before_path_d: true,
  caption_exit_missing_hard_kill: true, caption_container_relative_position: true, caption_overflow_clips_scaled_words: true,
  slideshow_invalid: true, slideshow_unresolved_ref: true,
};

const authoredLayoutCodes: Readonly<Record<string, true>> = {
  clipped_text: true, text_box_overflow: true, canvas_overflow: true, container_overflow: true, content_overlap: true,
  text_occluded: true, text_not_painted: true, escaped_container: true, panel_out_of_canvas: true,
  connector_detached: true, connector_orphan: true, caption_zone_collision: true, frame_out_of_frame: true,
  sweep_static: true, rotation_pivot_drift: true, off_pivot_rotation: true,
};

const authoredMotionCodes: Readonly<Record<string, true>> = {
  motion_selector_ambiguous: true, motion_selector_missing: true, motion_appears_late: true,
  motion_out_of_order: true, motion_off_frame: true, motion_frozen: true,
};

const sectionSchema = z.object({
  ok: z.boolean(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  infoCount: z.number().int().nonnegative(),
  findings: z.array(findingSchema),
}).loose();

const checkResultSchema = z.object({
  ok: z.boolean(),
  strict: z.boolean(),
  lint: sectionSchema.extend({ filesScanned: z.number().int().nonnegative() }),
  runtime: sectionSchema,
  layout: sectionSchema.extend({
    duration: z.number().finite().nonnegative(),
    samples: z.array(z.number().finite().nonnegative()),
    truncated: z.boolean(),
  }),
  motion: sectionSchema.extend({ enabled: z.boolean(), samples: z.number().int().nonnegative() }),
  contrast: sectionSchema.extend({
    enabled: z.boolean(),
    samples: z.array(z.number().finite().nonnegative()),
    checked: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
  }),
  snapshots: z.object({ enabled: z.boolean(), files: z.array(z.string()), times: z.array(z.number()), findingFiles: z.array(z.string()) }).loose(),
}).loose();

export type HyperframesCheckResult = z.infer<typeof checkResultSchema>;

export type CommandRunner = (args: readonly string[]) => Promise<string>;

export type HyperframesCli = {
  /** With `vars`, the CLI bakes the values into the returned snippet, so a block's slots are set by the registry's own tooling. */
  add(input: { name: string; dir: string; vars?: Readonly<Record<string, string>> }): Promise<HyperframesAddResult>;
  /** Runs the browser gate (lint, runtime, layout, motion, contrast) over a composition directory. */
  check(input: { dir: string; at?: readonly number[] }): Promise<HyperframesCheckResult>;
};

/** Pinned to the producer's version and used only while compiling; the render path never shells out. */
export function createHyperframesCli(run: CommandRunner = defaultRunner): HyperframesCli {
  return {
    async add({ name, dir, vars }) {
      const args = ["add", name, "--json", "--no-clipboard", "--dir", dir];
      if (vars && Object.keys(vars).length > 0) args.push("--vars", JSON.stringify(vars));
      return parseAddResult(await run(args));
    },
    async check({ dir, at }) {
      const args = ["check", "--json", "--samples", "15", "--frame-check", "--at-transitions", dir];
      if (at?.length) args.push("--at", at.join(","));
      return parseCheckResult(await run(args));
    },
  };
}

export function parseAddResult(stdout: string): HyperframesAddResult {
  const parsed = addResultSchema.safeParse(parseJson(stdout));
  if (!parsed.success) throw unreadable("The HyperFrames CLI did not report an installed item.");
  if (!parsed.data.ok || parsed.data.snippet.trim().length === 0) {
    throw unreadable(`The HyperFrames CLI could not install ${parsed.data.name}.`);
  }
  return parsed.data;
}

export function parseCheckResult(stdout: string): HyperframesCheckResult {
  const parsed = checkResultSchema.safeParse(parseJson(stdout));
  if (!parsed.success) throw unreadable("The HyperFrames CLI did not return a complete check report.");
  const report = parsed.data;
  const sections = [report.lint, report.runtime, report.layout, report.motion, report.contrast];
  for (const section of sections) {
    const errors = section.findings.filter((finding) => finding.severity === "error").length;
    const warnings = section.findings.filter((finding) => finding.severity === "warning").length;
    const infos = section.findings.filter((finding) => finding.severity === "info").length;
    if (section.errorCount !== errors || section.warningCount !== warnings || section.infoCount !== infos || section.ok !== (errors === 0)) {
      throw unreadable("The HyperFrames CLI returned inconsistent check findings.");
    }
  }
  const isBlocking = (finding: HyperframesFinding) => finding.severity === "error" || (report.strict && finding.severity === "warning");
  const failures = sections.flatMap((section) => section.findings.filter(isBlocking));
  if (report.ok !== (failures.length === 0)) {
    throw unreadable("The HyperFrames CLI returned an inconsistent check status.");
  }
  const authored = report.lint.findings.filter(isBlocking).every((finding) => authoredLintCodes[finding.code] === true)
    && report.runtime.findings.every((finding) => !isBlocking(finding))
    && report.layout.findings.filter(isBlocking).every((finding) => authoredLayoutCodes[finding.code] === true)
    && report.motion.findings.filter(isBlocking).every((finding) => authoredMotionCodes[finding.code] === true)
    && report.contrast.findings.filter(isBlocking).every((finding) => finding.code === "contrast_aa_failure");
  const lintBlockedBrowser = report.lint.filesScanned > 0 && report.lint.errorCount > 0
    && sections.slice(1).every((section) => section.findings.length === 0)
    && report.layout.duration === 0 && report.layout.samples.length === 0 && !report.layout.truncated
    && !report.motion.enabled && report.motion.samples === 0
    && report.contrast.enabled && report.contrast.samples.length === 0
    && report.contrast.checked === 0 && report.contrast.passed === 0
    && report.snapshots.files.length === 0 && report.snapshots.times.length === 0 && report.snapshots.findingFiles.length === 0;
  const browserCompleted = report.lint.filesScanned > 0 && report.layout.duration > 0
    && report.layout.samples.length > 0 && !report.layout.truncated
    && report.contrast.enabled && report.contrast.samples.length > 0
    && report.contrast.passed <= report.contrast.checked;
  if (!browserCompleted && !(lintBlockedBrowser && authored)) {
    throw unreadable("The HyperFrames CLI did not complete the browser check.");
  }
  if (failures.length > 0) {
    const detail = failures.slice(0, 8).map((finding) => `${finding.code}: ${finding.message} (${finding.sourceFile} ${finding.selector} at ${finding.time}s)`).join("; ");
    const message = `The HyperFrames visual check failed. ${detail}`;
    if (authored) throw new HyperframesContentError(message, failures);
    throw new HyperframesCliError("cli_failed", message);
  }
  return report;
}

async function defaultRunner(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)("npx", ["--yes", HYPERFRAMES_CLI_PACKAGE, ...args], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 300_000,
    });
    return stdout;
  } catch (error) {
    if (args[0] === "check" && error && typeof error === "object"
      && "code" in error && error.code === 1 && "killed" in error && error.killed === false
      && "signal" in error && error.signal === null
      && "stdout" in error && typeof error.stdout === "string" && error.stdout.trim()) {
      try {
        parseCheckResult(error.stdout);
      } catch (reportError) {
        if (reportError instanceof HyperframesContentError) throw reportError;
      }
    }
    throw new HyperframesCliError("cli_failed", describeFailure(error));
  }
}

function describeFailure(error: unknown): string {
  const stderr = error && typeof error === "object" && "stderr" in error ? error.stderr : undefined;
  const detail = typeof stderr === "string" && stderr.trim().length > 0 ? ` ${stderr.trim().split("\n")[0]}` : "";
  return `The HyperFrames CLI failed.${detail}`;
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw unreadable("The HyperFrames CLI did not return JSON.");
  }
}

function unreadable(message: string): HyperframesCliError {
  return new HyperframesCliError("cli_unreadable", message);
}
