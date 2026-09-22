# Decision: HyperFrames render engine

- **Date:** 2026-09-22
- **Status:** decided
- **Documentation:** all retrieved 2026-09-22
  - https://hyperframes.heygen.com/introduction
  - https://hyperframes.heygen.com/packages/producer
  - https://hyperframes.heygen.com/concepts/determinism
  - https://hyperframes.heygen.com/concepts/compositions
- **Version:** `@hyperframes/producer` 0.8.59, `hyperframes` CLI 0.8.59, Apache-2.0

The filename is fixed at `2026-09-21-hyperframes-render-engine.md` because
`apps/backend/src/domain/video/render-compatibility.ts` already cites it. The spike itself ran on
2026-09-22.

Spike material lives in the session scratchpad under `hyperframes-spike/`: `doctor.json`,
`matrix/index.html`, `index.template.html`, `run-matrix.sh`, `probe.mjs`, and `out/`. It is not
committed. Every value below comes from a command run on this machine.

## Verified facts

| Question | Answer | Evidence |
|---|---|---|
| Install and licence | `@hyperframes/producer` 0.8.59 and `hyperframes` 0.8.59, Apache-2.0 | `npm i hyperframes @hyperframes/producer` → `added 135 packages`; `node_modules/@hyperframes/producer/LICENSE` → `Apache License Version 2.0`; `node -e require('./node_modules/hyperframes/package.json').license` → `Apache-2.0`. `@hyperframes/producer/package.json` carries no `license` field, so the LICENSE file is the evidence. |
| Required runtime (Node / Bun / either) | **either**. Both render to completion. | `node probe.mjs` → `100% Render complete` / `probe ok complete completed` / `node exit=0`. `bun probe.mjs` → `100% Render complete` / `probe ok complete completed` / `bun exit=0`. Node v22.21.0, Bun 1.3.0. |
| Required Chrome and how it is addressed | Not the system Chrome by default. The renderer uses its own managed `chrome-headless-shell`. | `hyperframes doctor --json` → `"name":"Chrome","ok":true,"detail":"cache: $HOME/.cache/puppeteer/chrome-headless-shell/linux-153.0.8010.36/chrome-headless-shell-linux64/chrome-headless-shell"`. The render trace names the binary actually used: `/home/juanalma/.cache/hyperframes/chrome/chrome-headless-shell/linux-152.0.7977.30/chrome-headless-shell-linux64/chrome-headless-shell`. The system browser is `/usr/bin/google-chrome` (`which google-chrome`). |
| Required FFmpeg / FFprobe | ffmpeg 6.1.1-3ubuntu5, ffprobe 6.1.1-3ubuntu5, both at `/usr/bin` | `ffmpeg -version \| head -1`; `which ffmpeg ffprobe` → `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`; `doctor --json` → `"FFmpeg","ok":true,"detail":"ffmpeg 6.1.1-3ubuntu5 at /usr/bin/ffmpeg"`. |
| Runtime that successfully renders in this repo | **bun**. Both work, so the cheaper pin is kept. | The two probe exits above. No Bun-specific failure appeared, so no `tsx` fallback is needed. |
| Determinism: two identical renders, same digest | **yes** on the same host and the same capture mode. | `sha256sum ./out/det-a.mp4 ./out/det-b.mp4` → both `861d3aadc36983cab7d4acf759bd4e15ccf1513594e11e6cc97c4378599ee768`. Composition: 1080x1920, 10s, `--quality high --fps 30`. |
| Determinism: does `--docker` change the baseline? | **yes, on this host.** The container falls back to a different capture mode, so its pixels differ from the host's. Each mode is internally byte-identical. | Two `hyperframes render --docker` runs on the same composition both produced `29c5c450d005c9b47323f6a10a6b96c1d4a987e71223fd8840a54c0414a46c6c`, which differs from the host digest above. So the Docker pair matched the Docker pair while mismatching the host pair. The trace shows why: the container logs `captureMode":"screenshot"` with `software gpu`, the host logs `captureMode":"beginframe"` with `hardware gpu`. Docker removes host variance only if every host renders in Docker. |
| Element/seeking contract (`data-*`, `class="clip"`, `__timelines`) | As the docs describe it, and as the composition that rendered used it. | The docs require `data-composition-id` on the root and `class="clip"` plus timing attributes on any timed element, and show `window.__timelines["intro-anim"] = tl`. The spike's `matrix/index.html` uses exactly that shape and rendered: root `data-composition-id="matrix"` with `data-start`/`data-duration`/`data-width`/`data-height`, a child `class="scene clip"` with `data-start`/`data-duration`/`data-track-index`, and a paused GSAP timeline registered at `window.__timelines["matrix"]` then `tl.seek(0)`. |
| Local vs remote asset resolution | Relative local paths resolve against the composition file. No network is touched. | `<img src="./asset.png">` and `<script src="./gsap.min.js">` both loaded from `matrix/` and painted; every render succeeded with the network unused (no fetch warnings, no missing-asset diagnostics in any of the 18 logs). |
| Font resolution without a network fetch | `font-family: Inter` resolves from faces bundled inside the producer. No system Inter exists on this host. | `node_modules/@fontsource/inter` is present and `@hyperframes/producer` lists `@fontsource/inter` among its dependencies; `grep -rl fontsource node_modules/@hyperframes/producer/dist/` matches `index.js`, `public-server.js`, `distributed.js`. `fc-list \| grep -ci inter` → `0`, so nothing was painted from the system. |
| Per-combination render time and dimensions | All 18 combinations verified. See the matrix below. | `bash run-matrix.sh`, every row `exit=0` with matching FFprobe dimensions and an exact duration. |
| Combinations the MVP must NOT offer | **none.** All 18 rows were produced with the requested dimensions and duration. | The Step 4 table below: 18/18 `exit=0`, 18/18 dimensions exact, 18/18 duration exact. |
| `check` / `lint` result on the evidence composition | `lint` clean apart from one structural warning; `check` fails only on contrast, which the production template's scrim exists to fix. | `hyperframes lint ./matrix --json` → `"ok": true, "errorCount": 0, "warningCount": 1`, the warning being `nested_structure_needs_subcomposition` on `#scene-1`. `hyperframes check ./matrix` → Runtime 0 errors, Layout 0 issues across 9 samples, Motion 0 errors, Contrast 5 failures (`#title-1 1.22:1 (need 3:1)`), because the spike composition paints white text straight over a flat yellow frame with no scrim. |
| Peak memory and CPU observed | ~826 MiB to 870 MiB peak RSS for a 1080x1920 high-quality render; 12 cores; 13.5 GB total, ~3.1 GB available. | `/usr/bin/time -f "MAXRSS %M KB"` → `845540 KB` and `890796 KB`. `doctor --json` → `"12 cores · AMD Ryzen 5 7430U with Radeon Graphics @ 4141MHz"`, `"13.5 GB total · 3.1 GB available"`. `doctor --json` also passes `Frames cache`: `/tmp/hyperframes-extract-cache-1000 · 81.7 GB free at /tmp · default`. |

### Step 4 matrix (draft quality, 30 fps, warm extraction cache)

Every row ran `node_modules/.bin/hyperframes render --composition ./matrix/index.html
--fps 30 --quality draft`, then `ffprobe -show_entries stream=width,height,codec_name,r_frame_rate
-show_entries format=duration,size`.

| Ratio | Res | Asked | Frame | Wall | Bytes | Codec | fps | Probed duration | Exit |
|---|---|---|---|---|---|---|---|---|---|
| 9:16 | 720p | 6s | 720x1280 | 7s | 14319 | h264 | 30/1 | 6.000000 | 0 |
| 9:16 | 720p | 10s | 720x1280 | 9s | 20390 | h264 | 30/1 | 10.000000 | 0 |
| 9:16 | 720p | 15s | 720x1280 | 9s | 22790 | h264 | 30/1 | 15.000000 | 0 |
| 9:16 | 1080p | 6s | 1080x1920 | 9s | 21409 | h264 | 30/1 | 6.000000 | 0 |
| 9:16 | 1080p | 10s | 1080x1920 | 9s | 31900 | h264 | 30/1 | 10.000000 | 0 |
| 9:16 | 1080p | 15s | 1080x1920 | 10s | 34300 | h264 | 30/1 | 15.000000 | 0 |
| 1:1 | 720p | 6s | 720x720 | 7s | 13016 | h264 | 30/1 | 6.000000 | 0 |
| 1:1 | 720p | 10s | 720x720 | 7s | 17918 | h264 | 30/1 | 10.000000 | 0 |
| 1:1 | 720p | 15s | 720x720 | 8s | 20318 | h264 | 30/1 | 15.000000 | 0 |
| 1:1 | 1080p | 6s | 1080x1080 | 7s | 18699 | h264 | 30/1 | 6.000000 | 0 |
| 1:1 | 1080p | 10s | 1080x1080 | 7s | 26538 | h264 | 30/1 | 10.000000 | 0 |
| 1:1 | 1080p | 15s | 1080x1080 | 8s | 28938 | h264 | 30/1 | 15.000000 | 0 |
| 16:9 | 720p | 6s | 1280x720 | 6s | 20677 | h264 | 30/1 | 6.000000 | 0 |
| 16:9 | 720p | 10s | 1280x720 | 6s | 28307 | h264 | 30/1 | 10.000000 | 0 |
| 16:9 | 720p | 15s | 1280x720 | 8s | 30707 | h264 | 30/1 | 15.000000 | 0 |
| 16:9 | 1080p | 6s | 1920x1080 | 8s | 33698 | h264 | 30/1 | 6.000000 | 0 |
| 16:9 | 1080p | 10s | 1920x1080 | 9s | 46503 | h264 | 30/1 | 10.000000 | 0 |
| 16:9 | 1080p | 15s | 1920x1080 | 11s | 48903 | h264 | 30/1 | 15.000000 | 0 |

Notes that belong with the table:

- The first render of the session cost **76.11 s** wall for a 6 s 1080p draft file, of which the
  trace attributes **53.0 s to `setup`**. That is the one-time extraction of the browser and
  encoder into the frames cache. Every later render in the same cache reused it and cost 6 s to
  11 s. **A cold render is roughly 8x a warm one**, and the timeout default has to survive the cold
  case.
- `--quality high` at 1080x1920 / 10 s cost 10.99 s and 10.28 s wall, and produced 67199 bytes.
- No render ever produced an audio stream (`ffprobe -show_entries stream=codec_type` → `video`
  only), which matches the plan's decision that this pipeline is silent.
- The stage sizes came from `data-width` / `data-height`, so `--resolution` (supersampling) was
  deliberately left unset, exactly as the plan specifies.

## Adapter configuration

- Worker process runtime: `bun`
- `HYPERFRAMES_BROWSER_PATH`: unset in the spike; falls back to the managed
  `chrome-headless-shell` at `$HOME/.cache/hyperframes/chrome/chrome-headless-shell/linux-152.0.7977.30/chrome-headless-shell-linux64/chrome-headless-shell`.
  Set it explicitly in deployment to pin the browser, per the PRD's determinism risk.
- `HYPERFRAMES_FFMPEG_PATH`: unset in the spike; resolves to `/usr/bin/ffmpeg`. Set it explicitly in
  deployment to pin the encoder.
- `HYPERFRAMES_EXTRACT_CACHE_DIR`: default (`/tmp/hyperframes-extract-cache-1000`, 81.7 GB free).
  Leave the default on a host with a real `/tmp`; it is what makes a warm render 8x cheaper.
- Producer knobs chosen: `PRODUCER_LOW_MEMORY_MODE` = `false` (a render peaks near 870 MiB, well
  inside this host), `PRODUCER_MAX_WORKERS` = `1`, `PRODUCER_DISABLE_GPU` = `true`. The last one
  matters: this host reported `hardware gpu` on the native path and `software gpu` inside Docker,
  so the GPU is a variable to remove rather than rely on.
- Default fps: `30`
- Default quality: `standard`. The spike measured `draft` for the matrix and `high` for the
  determinism pair; `standard` sits between them and matches the plan's default.
- Measured worst single-render wall time: **76.11 s** (cold extraction cache, 6 s 1080p draft,
  first render of the session). Warm renders measured 6 s to 11 s. `RENDER_JOB_TIMEOUT_MS` default
  **600_000** (the PRD's ten minutes), which leaves roughly 8x headroom over the worst measured
  cold render on this host.

## Open questions carried into the render plan

1. **Which capture mode is canonical.** Native renders use `beginframe` with the GPU; Docker renders
   use `screenshot` with software encoding, and the two produce different bytes for the same
   composition. Determinism holds within a mode and silently does not hold across modes. The
   deployment decision is therefore "pin one mode and use it everywhere", not "pin a version". The
   plan pins the browser and encoder paths and asserts same-host determinism; a container image
   stays the deployment mitigation for cross-host work.
2. **Cross-host reproducibility is unproven.** Determinism was measured on one host only. The PRD
   lists this as a risk with a container-image mitigation, and the `--docker` result above shows a
   container is not byte-identical to a native render, so the mitigation has to be adopted for every
   host rather than added later.
3. **`@fontsource/inter` is the only font the style packs may name.** The packs name `Inter`, which
   the producer bundles. Naming any other family would be an unverified dependency on a face that
   may not be installed on the render host.
