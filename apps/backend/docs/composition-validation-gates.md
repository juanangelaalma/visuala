# Composition Validation Gates

This reference describes the checks applied while composing a video preview. Some codes are specific findings; others are wrapper errors that contain those findings.

## Final composition errors

| Code | Description |
|---|---|
| `composition_html_invalid` | The generated HTML did not satisfy the structure or resource contract after the allowed generations. |
| `composition_visual_check_failed` | The generated HTML did not pass recognized visual or geometry checks after the allowed generations. |
| `CompositionGenerationError` | Backend error carrying the final composition code, issue codes, and number of generations. The HTTP response is a safe 502 and does not expose generated HTML or internal exception details. |

These final codes summarize the failure. Use the specific issue codes below to understand what failed.

## HTML structure validation

| Issue code | Description |
|---|---|
| `html_document_invalid` | The response must be a complete HTML document from `<!doctype html>` through `</html>`, not a fragment or Markdown. |
| `html_root_invalid` | The document must contain exactly one `main` composition root with matching frame rate, duration, dimensions, a `main` timeline registration, and the local GSAP script. Both `window.__timelines.main = tl` and `window.__timelines["main"] = tl` are accepted. |
| `html_scenes_invalid` | The HTML must contain every storyboard scene in the approved order with matching IDs, track, start time, and duration. |
| `html_resource_external` | The document must not load unapproved remote resources, including remote script/image/link/video/source/iframe URLs, remote CSS imports, or remote CSS `url(...)` resources. |

## Visual geometry findings

The geometry gate captures frames inside scenes, near scene endings, and around scene boundaries.

| Issue code | Description |
|---|---|
| `content_zone_missing` | A scene has no direct `.hf-scene__content` content zone. |
| `module_out_of_zone` | An important module extends outside its scene content zone. |
| `important_text_missing` | Important text is hidden, too transparent, or not painted in the readable sample near the end of its scene. |
| `text_out_of_frame` | Readable text extends outside the output frame. |
| `text_overflow` | Text extends beyond its allocated module width. |
| `text_clipped` | Text is clipped by an ancestor with hidden, clipped, auto, or scroll overflow. |
| `important_image_missing` | An important image is not sufficiently visible in the readable sample near the end of its scene. |
| `image_missing` | An image failed to load or has no decodable image data. |
| `text_overlap` | Two readable text elements overlap. |
| `image_text_overlap` | Readable text overlaps the bounding box of a module containing an important image. |
| `blank_boundary` | No foreground text or image is painted around a scene boundary. |
| `scene_missing` | The number of scenes in the rendered HTML differs from the approved storyboard. |

**Product-zone note:** `image_text_overlap` currently compares text against the entire `.hf-module` product bounding box, not just the visible image pixels. A finding means text entered the protected product zone; it does not necessarily prove that the text covers image pixels. Auto-correction does not relax this rule.

## Visual checker execution and resource errors

| Code | Description |
|---|---|
| `visual_check_unreadable` | The visual check could not complete or its capture report is incomplete. This is not treated as evidence that the authored HTML is wrong. |
| `font_missing` | A required font did not load. |
| `runtime_error` | The browser reported an uncaught page error while capturing the composition. |
| `asset_request_failed` | A browser resource request failed. |
| `asset_http_failed` | A browser resource returned an HTTP error status. |

## HyperFrames CLI wrapper errors

| Code | Description |
|---|---|
| `cli_failed` | The HyperFrames CLI reported a failed check or the process failed. This is a wrapper code; inspect the individual finding codes for the reason. Only positively classified author-content findings can trigger HTML correction. |
| `cli_unreadable` | The CLI report is missing, malformed, incomplete, or internally inconsistent, so the backend cannot safely use it. |

## HyperFrames authored-content findings

The following finding codes are allowlisted as authored-content problems that may be passed to HTML correction when the CLI report is complete and the findings meet the classification rules.

### Root, HTML, CSS, and JavaScript

| Finding code | Description |
|---|---|
| `root_missing_composition_id` | The composition root has no composition ID. |
| `root_missing_dimensions` | The composition root is missing its dimensions. |
| `root_dimensions_mismatch` | The root dimensions do not match the requested output format. |
| `root_composition_missing_html_wrapper` | A root composition is missing a required HTML wrapper. |
| `unbalanced_style_tags` | Style tags are not balanced. |
| `visible_markup_comment` | A markup comment is visible as rendered content. |
| `css_parse_error` | CSS could not be parsed. |
| `repeated_id_descendant_selector` | A descendant selector repeats an ID in a suspicious or invalid pattern. |
| `scoped_css_missing_wrapper` | Scoped CSS is missing the wrapper required to constrain it. |
| `split_data_attribute_selector` | A data-attribute selector is split or malformed. |
| `template_literal_selector` | A template-literal selector creates a selector hazard. |
| `html_dir_attribute_breaks_render` | The HTML `dir` attribute interferes with rendering. |
| `invalid_inline_script_syntax` | Inline JavaScript has invalid syntax. |

### Timeline and animation

| Finding code | Description |
|---|---|
| `missing_timeline_registry` | The timeline registry is missing. |
| `timeline_id_mismatch` | The registered timeline ID does not match the composition ID. |
| `missing_data_no_timeline` | Required timeline metadata is missing. |
| `gsap_timeline_not_registered` | A GSAP timeline was not registered. |
| `gsap_timeline_registered_before_async_build` | The timeline was registered before its asynchronous construction completed. |
| `gsap_cold_seek_hidden_fromto_missing_reveal` | A direct seek can leave an element hidden because the animation has no valid reveal state. |
| `gsap_from_opacity_noop` | An opacity `from` animation does not create an effective visible transition. |
| `gsap_fullscreen_overlay_starts_visible` | A full-screen overlay is visible before its intended start. |
| `gsap_animates_clip_element` | GSAP animates a clip element in an unsupported or unsafe way. |
| `gsap_css_transform_conflict` | A GSAP transform conflicts with a CSS transform. |
| `gsap_infinite_repeat` | The animation repeats infinitely, which is unsuitable for a finite render. |
| `gsap_non_transform_motion` | Motion uses a property that the checker does not recognize as supported transform motion. |
| `gsap_relative_value_second_writer` | Multiple writers to a relative animation value can produce conflicting results. |
| `gsap_repeat_refresh_relative_value` | A relative value can change unexpectedly when an animation repeats. |
| `gsap_function_value_hazard` | A function-based animation value can make seeking or rendering nondeterministic. |
| `gsap_timeline_return_used_as_tween` | A timeline return value is used where a tween is expected. |

### Media and slideshow markup

| Finding code | Description |
|---|---|
| `duplicate_media_id` | Multiple media elements use the same ID. |
| `video_missing_muted` | A video element is not muted as required. |
| `video_muted_with_declared_audio` | A video is muted although the composition declares audio. |
| `video_nested_in_timed_element` | A video is nested in a timed element that the renderer does not support. |
| `self_closing_media_tag` | A media tag uses an invalid self-closing form. |
| `base64_media_prohibited` | Media is embedded as base64 where that is prohibited. |
| `media_missing_data_start` | A media element has no start-time metadata. |
| `media_missing_id` | A media element has no ID. |
| `slideshow_invalid` | A slideshow declaration is invalid. |
| `slideshow_unresolved_ref` | A slideshow reference cannot be resolved. |

### Composition host, variables, and timing

| Finding code | Description |
|---|---|
| `host_missing_composition_id` | A sub-composition host has no composition ID. |
| `invalid_variable_values_json` | Variable values contain invalid JSON. |
| `invalid_composition_variables_declaration` | The composition variable declaration is invalid. |
| `standalone_composition_wrapped_in_template` | A standalone composition is wrapped in a template unexpectedly. |
| `root_composition_missing_duration_source` | The root composition has no valid duration source. |
| `deprecated_data_layer` | The document uses a deprecated data-layer attribute. |
| `deprecated_data_end` | The document uses a deprecated end-time attribute. |
| `requestanimationframe_in_composition` | `requestAnimationFrame` is used, making composition timing nondeterministic. |

### Layout and readability

| Finding code | Description |
|---|---|
| `clipped_text` | Text is clipped. |
| `text_box_overflow` | Text overflows its allocated box. |
| `canvas_overflow` | Content extends outside the canvas. |
| `container_overflow` | Content extends outside its container. |
| `content_overlap` | Content regions overlap. |
| `text_occluded` | Text is obscured by another element. |
| `text_not_painted` | Text is not actually painted in the captured frame. |
| `escaped_container` | An element has escaped its expected container. |
| `panel_out_of_canvas` | A panel extends outside the canvas. |
| `connector_detached` | A connector is detached from the element it should connect to. |
| `connector_orphan` | A connector has no matching element. |
| `caption_zone_collision` | A caption collides with a protected content zone. |
| `frame_out_of_frame` | A frame element extends outside the output frame. |
| `sweep_static` | A sweep element expected to move remains static. |
| `rotation_pivot_drift` | The apparent pivot drifts during rotation. |
| `off_pivot_rotation` | Rotation uses the wrong pivot point. |

### Motion and contrast

| Finding code | Description |
|---|---|
| `motion_selector_ambiguous` | A motion selector matches more targets than intended. |
| `motion_selector_missing` | A motion selector matches no target. |
| `motion_appears_late` | Motion starts too late. |
| `motion_out_of_order` | Motion occurs in the wrong order. |
| `motion_off_frame` | Motion takes its target outside the frame. |
| `motion_frozen` | Motion appears frozen. |
| `contrast_aa_failure` | Text contrast fails the WCAG AA threshold. |

## Findings that do not trigger HTML correction

The backend does not ask the model to regenerate HTML when a failure may be caused by infrastructure or when the report does not prove an authored-content problem. Examples include:

- `visual_check_unreadable`
- `font_missing` and image/resource loading failures
- `runtime_error`, `asset_request_failed`, and `asset_http_failed`
- `cli_unreadable`
- unknown finding codes
- mixed reports containing both correctable content findings and system/unclassified findings

Therefore, `cli_failed` by itself does **not** mean the HTML should be regenerated. The backend must recognize the finding and verify that the report is complete. Browser, worker, resource, AI, installer, writer, and storage failures stop without HTML correction.
