# Visuala Modular Composition Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Gunakan `subagent-driven-development` atau
> `executing-plans` untuk menjalankan tugas satu per satu. Semua langkah memakai checkbox.
> Dokumen ini bukan izin implementasi massal: setiap task butuh review terpisah sebelum lanjut.

**Goal:** Mengganti worker video lama Visuala dengan composition engine: AI menghasilkan Composition
Spec terstruktur, code memvalidasi + mengkompilasi + memeriksa + mem-preview, lalu merender artifact
yang sama menjadi MP4 setelah approval.

**Spec:** `docs/superpowers/specs/2026-09-29-modular-composition-engine-design.md` (disetujui lewat
jawaban langsung pemilik: full PRD, ganti seluruh pipeline + UI, drop tabel storyboard, 5 recipe,
durasi 4–30, style `creative-mode`, CLI `hyperframes@0.8.59`, tambah font @fontsource, tabel
composition baru, Antislop DURING).

**Tech Stack:** TypeScript, Bun, Elysia, Zod 4, Vitest 3.2.4, `@hyperframes/producer` 0.8.59,
CLI `hyperframes@0.8.59` via npx, FFmpeg/FFprobe, Next 16 (React 19), pnpm 9.15.4.

---

## Global Constraints

- **TDD wajib**: tulis test yang gagal dulu untuk setiap modul baru, lalu implement sampai hijau.
- **Antislop DURING**: patuhi `antislop.md` + `skills/antislop-code/SKILL.md` saat menulis komentar.
  Komentar hanya untuk hal yang tidak terlihat dari kode (alasan, constraint, workaround), satu baris,
  tanpa separator dekoratif, tanpa emoji, tanpa narasi langkah, tanpa label kosong.
- **Jangan commit** kecuali diminta eksplisit. Jangan sentuh `.env`. Jangan revert perubahan lain.
- **Jangan upgrade** `@hyperframes/producer` atau GSAP. CLI dipin ke `0.8.59`.
- **Jangan pakai `Math.random()`/`Date.now()`/fetch remote di jalur render.**
- **Antislop mode DURING. Design Read:** promo video e-commerce, membaca neo-brutalist editorial
  poster dari `designs/creative-mode`, dial ENERGY 3 / RHYTHM 2 / MOTION 2.
- Setiap migration baru mengikuti pola `begin;/commit;`, `create table public.<name> `, RLS + revoke +
  grant `service_role`, dan ikut terdaftar di `video-migrations.test.ts`.
- Setelah kode berubah: `graphify update .`, `pnpm --filter backend lint`, `pnpm --filter backend build`,
  test terkait, dan `pnpm --filter app lint`.
- Perintah diekspos lewat Makefile (`apps/backend/Makefile`), bukan hanya script npm.
- Review per task; ukuran task dijaga kecil dan bisa diverifikasi sendiri.

## Fakta sumber dan kontrak

Semua path relatif terhadap root repository.

| Sumber | Fakta |
|---|---|
| `apps/backend/src/domain/video/render-engine.ts` | `RenderEngine` port; satu implementasi lama yang akan diganti |
| `apps/backend/src/infrastructure/video/hyperframes/hyperframes-render-engine.ts` | Pemakai `createRenderJob`/`executeRenderJob` + probe FFprobe; env knobs producer |
| `apps/backend/src/domain/video/render-manifest.ts` | Manifest beku + `renderManifestFingerprint`, `sha256Hex` |
| `apps/backend/src/application/video/render-worker.ts` | Loop klaim job, snapshot, upload, transition status |
| `apps/backend/src/application/video/{interviewer,planner,conversation}.ts` | AI terstruktur + prompt; pola registry schema `VIDEO_AI_SCHEMAS` |
| `apps/backend/src/infrastructure/ai-service/openai-responses-adapter.ts` | Tanpa tool-calling; hanya text + json_schema structured |
| `apps/backend/src/domain/video/style-packs.ts` | `StylePack` lama; tetap dipakai template lama sampai task penghapusan |
| `apps/backend/supabase/migrations/20260921000100..20260922000100` | Pola DDL, trigger `set_video_updated_at`, RLS/grants, bucket `assets` |
| `apps/backend/src/infrastructure/video/video-migrations.test.ts` | Membaca migration sebagai string; regex `create table public\.<name> ` |
| `apps/backend/src/routes/video.ts` + `routes/video.test.ts` | Kontrak endpoint + 558 baris test |
| `apps/app/features/video/api/video-api.ts` | Satu-satunya lapisan fetch browser; dites di `video-api.test.ts` |
| `stack: design` `designs/creative-mode/FRAME.md` | Sumber Design Pack: frontmatter colors/typography/spacing/components + aturan komposisi |
| CLI `hyperframes@0.8.59` | `catalog --json` (rows), `add <name> --json` (files+snippet), `check --json` (lint/layout/motion/contrast) |

---

## Milestone A — Fondasi (tanpa AI, output bisa dirender)

### Task 1 — Design Pack `creative-mode`

- [ ] Tulis `apps/backend/design-packs/creative-mode/v1/frame.md` (adaptasi `designs/creative-mode/FRAME.md`,
      bahasa panduan untuk AI: warna, tipografi, spacing, bentuk, treatment foto, mood, batasan visual).
- [ ] Tulis `manifest.json` dari frontmatter FRAME.md: `styleId: "creative-mode"`, `version: "1"`,
      `colors`, `typography`, `spacing`, `components`, `motion` (motion terbatas: enter/exit/stagger).
- [ ] `apps/backend/src/domain/video-engine/design-pack.ts`: tipe `DesignPackManifest` + zod schema +
      `readDesignPackManifest()` (validasi token wajib, tolak warna/font non-lokal).
- [ ] `apps/backend/src/infrastructure/video-engine/fs-design-pack-source.ts`: baca pack bawaan dari disk.
- [ ] Test: manifest valid, token wajib hilang ditolak, `frame.md` non-kosong, font hanya dari allowlist lokal.
- [ ] Tambah `@fontsource/archivo-black`, `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono` ke
      `apps/backend/package.json`; salin face yang dipakai ke artifact saat kompilasi (bukan fetch).

### Task 2 — Recipes

- [ ] `apps/backend/src/domain/video-engine/recipes/{product-promo,discount-promo,product-launch,menu-showcase,storefront-showcase}.ts`.
- [ ] `recipes/index.ts`: `RECIPES` allowlist + `recipeById()`; tipe `VideoRecipe { id, version, required[], recommendedModules[], beats[], duration, aspectRatio, constraints }`.
- [ ] Test per recipe: `required` cocok dengan field brief yang benar-benar ada; semua `recommendedModules`
      ada di daftar modul internal atau ditandai `catalog:`; `beats` tidak kosong.
- [ ] Test registry: `recipeById` menolak id tak dikenal; lima id sesuai PRD §5.

### Task 3 — Catalog: generate + search + inspect

- [ ] `apps/backend/scripts/generate-catalog.ts`: jalankan `npx hyperframes@0.8.59 catalog --json` lalu,
      per item block, `add <name> --json` ke scratch dir untuk menangkap files/dependencies, dan parse
      HTML-nya untuk `variables`/`duration`; tulis `catalog/catalog.json` + `catalog/catalog-details.json`.
- [ ] Makefile target `catalog` (+ `catalog-blocks`); commit kedua file hasil.
- [ ] `apps/backend/src/domain/video-engine/catalog.ts`: tipe `CatalogItem`/`CatalogItemDetails`,
      zod parse, loader dari file (tanpa network).
- [ ] `apps/backend/src/application/video-engine/catalog-search.ts`: `searchCatalog(query, {type, aspectRatio, limit})`
      (skor deterministik atas name/title/description/tags) dan `inspectCatalogItem(name)`.
- [ ] `apps/backend/src/infrastructure/video-engine/hyperframes-cli.ts`: jalankan CLI terpin
      (`npx hyperframes@0.8.59 ...`) untuk `add`/`check`, dengan timeout + hasil JSON; tidak dipakai di jalur render.
- [ ] Test: search stabil (skor, urutan, filter aspect/type), item tak ada -> `null`, loader menolak JSON cacat.

### Task 4 — Internal modules

- [ ] `modules/ProductHero`, `Headline`, `SupportingCopy`, `OfferBadge`, `Price`, `BrandMark`, `CTA`, `BackgroundTexture`.
- [ ] Kontrak `VideoModule { id, version, supportedRatios[], slots, build(input) -> {html, css} }` di `modules/types.ts`.
- [ ] Tiap modul sub-composition HTML dengan `<template>` + `data-composition-id` + `window.__timelines`,
      memakai token manifest (tanpa `Math.random`, tanpa font/token di luar manifest), teks via `escapeHtml`.
- [ ] Test: setiap modul punya slot wajib + constraint; build deterministik (dua panggilan identik);
      rasio tak didukung ditolak; teks ter-escape.

### Task 5 — Composition Spec schema + validator

- [ ] `domain/video-engine/composition.ts`: zod `compositionSpecSchema` + tipe, `COMPOSITION_SPEC_VERSION`.
- [ ] `domain/video-engine/validators/{schema,catalog,fact,asset,duration,compatibility}.ts` + `index.ts` `validateComposition()` yang mengumpulkan temuan ber-kode.
- [ ] `domain/video-engine/fallback.ts`: fallback composition stabil (ProductHero+Headline+OfferBadge+CTA).
- [ ] Test per validator: spec cacat, id catalog tak ada, teks karangan (harga/diskon/CTA di luar brief),
      asset tidak dimiliki, total frame melebihi durasi, item catalog tak kompatibel rasio; dan fallback
      selalu lolos validator.

### Task 6 — Compiler + artifact versioning

- [ ] `domain/video-engine/compiler.ts`: `compileComposition({spec, designPack, recipes, modules, catalogFiles})` ->
      `{ files, moduleVersions, assetHashes }` (index.html + sub-composition hosts + styles.css + fonts).
- [ ] `application/video-engine/compile.ts`: hashing (`compositionHash`), putar file ke artifact store,
      tulis `video-composition-artifacts` (atau struktur in-memory pada task ini, DB di Milestone C).
- [ ] `infrastructure/video-engine/composition-artifact-store.ts`: tulis/baca artifact di Storage
      (`video-compositions/{projectId}/{compositionId}/`).
- [ ] Test: compile deterministik (hash sama untuk spec sama), sub-composition ter-`data-composition-src`,
      aset + font ikut ter-vendor, catalog block memakai files hasil `add`, hash berubah bila spec/design pack berubah.

### Task 7 — Render engine + spike satu catalog block

- [ ] Pindahkan adapter render ke `infrastructure/video-engine/hyperframes-render-engine.ts` (producer 0.8.59,
      `RenderComposition` port baru berbasis artifact dir), pertahankan env knobs + probe FFprobe.
- [ ] `scripts/render-composition-smoke.ts`: render satu spec hand-written (internal modules saja) dan satu
      spec dengan satu block catalog nyata; output MP4 + probe.
- [ ] Gate manual: tonton hasilnya (seek awal/tengah/akhir) sebelum lanjut ke planner.
- [ ] Test: port render menolak artifact tanpa `index.html`; probe memvalidasi width/height/duration/fps.

---

## Milestone B — AI planner

### Task 8 — Design pack + recipe di prompt; schema AI baru

- [ ] `application/video-engine/ai-schemas.ts`: `art_direction@v1`, `composition_spec@v1` (registry terpisah dari `VIDEO_AI_SCHEMAS` lama).
- [ ] `domain/ai-service/types.ts`: tambah task `art_director`, `composition_planner`; update `AI_TASKS_JSON` di `.env.example`.
- [ ] Test: schema round-trip (toJSONSchema + parse), task baru terdaftar, config contoh valid.

### Task 9 — Art Director

- [ ] `application/video-engine/art-director.ts` + prompt: input brief + recipe + `frame.md` + ringkasan aset;
      output Art Direction (mainMessage, visualFocus, hierarchy, mood, imageTreatment, motionDirection, beats).
- [ ] Aturan prompt: hanya fakta dari brief; dilarang mengarang harga/diskon/benefit/CTA.
- [ ] Test dengan fake `AIService`: output tervalidasi; fakta di luar brief ditolak; latency dicatat.

### Task 10 — Candidate selector + Composition Planner

- [ ] `candidate-selector.ts`: untuk setiap beat jalankan `searchCatalog`, kumpulkan top-N per beat (+ inspect terpilih), hasilkan daftar kandidat ringkas.
- [ ] `composition-planner.ts` + prompt: input brief + recipe + art direction + token design pack + kandidat + daftar modul; output Composition Spec.
- [ ] Prompt planner menjelaskan struktur spec, aturan durasi/frame, dan kewajiban memakai id kandidat/modul yang ada.
- [ ] Test: kandidat kosong -> planner hanya memakai modul internal; id di luar kandidat ditolak validator; fallback dipakai bila semua kandidat gagal.

---

## Milestone C — Persistence + worker + API

### Task 11 — Migrasi database

- [ ] Migration baru: alter constraint `video_projects` (5 recipe, style `creative-mode`, durasi 4–30);
      drop `video_storyboard_revisions`; recreate `video_render_jobs` (fk `composition_artifact_id`) dan
      `video_versions` (`composition_hash`, `kind preview|final`); buat `video_art_direction_revisions`,
      `video_composition_revisions`, `video_composition_artifacts`, `video_composition_events`.
- [ ] Update `video-migrations.test.ts`: buang assertion storyboard, tambah assertion tabel baru + pola RLS/grant.
- [ ] Update repository Supabase untuk tabel baru + `video_render_jobs`/`video_versions` yang berubah.
- [ ] Test repository masing-masing (pola `supabase-*.test.ts` yang ada).

### Task 12 — Worker render baru

- [ ] `application/video-engine/render-job.ts`: klaim job -> load artifact -> render (delivery) -> upload ->
      `video_versions` -> transition status; preview memakai jalur yang sama dengan `kind: 'preview'`.
- [ ] `worker/index.ts`: pakai services baru; reclaim stale tetap.
- [ ] Test: urutan aksi (invocationCallOrder), snapshot tidak valid, fallback, timeout/abort, reclaim stale.

### Task 13 — Routes + observability

- [ ] Rework `routes/video.ts`: tambah endpoints composition (list/get/create/approve/regenerate), hapus `/storyboard` + `POST /approve`, sesuaikan payload project + render-jobs.
- [ ] `application/video-engine/observe.ts`: catat event (recipe, design pack, catalog components, fallback,
      planner latency, render duration/status/error, LLM cost) ke `video_composition_events`.
- [ ] Test `routes/video.test.ts`: auth semua endpoint, strict-body 422, idempotency, 404/409, tidak ada
      kebocoran `user_id`/`object_key`/`idempotency_key`.

---

## Milestone D — Frontend

### Task 14 — Setup form + API client

- [ ] Update `apps/app/features/video/schemas/*` + `api/video-api.ts`: 5 recipe, durasi 4–30, style `creative-mode`,
      endpoint composition baru.
- [ ] Update `VideoSetupForm`: pilihan recipe + durasi baru.
- [ ] Update `api/video-api.test.ts` + `VideoSetupForm.test.tsx` untuk kontrak baru.

### Task 15 — Workspace: preview + approve/regenerate

- [ ] Ganti `VideoBriefPanel`/`VideoStoryboardPanel` dengan panel composition (art direction, spec ringkas,
      hasil visual check, `<video>` preview draft MP4) + tombol **Setujui** / **Generate ulang**.
- [ ] Update `VideoWorkspace` (alur: chat -> buat preview -> approve -> render), `VideoApprovalPanel`,
      `ProjectStatusBadge`, `render-status-presentation`.
- [ ] Test komponen: loading/empty/error, approve sekali, regenerate membuat revisi baru, poll berhenti di status terminal.
- [ ] Antislop UI (`skills/antislop-ui/SKILL.md`) + Delivery Gate untuk panel baru; jalankan `app lint`.

### Task 16 — E2E + acceptance Julumpia

- [ ] Playwright: alur penuh (buat project -> upload aset -> chat -> preview -> approve -> render -> unduh) memakai user test sekali pakai.
- [ ] Jalankan demo Julumpia (diskon 20%, 9:16, 12 s, creative-mode) end-to-end; simpan MP4 + laporan.
- [ ] Cek acceptance PRD §25 satu per satu (discovery catalog, validasi, gabungan modul+component, konsistensi
      design, fact safety, preview=export artifact, fallback, reproducibility, visual safety).
- [ ] `graphify update .`, lint/build backend + app, `git diff --check`.

---

## Milestone E — Pembersihan

### Task 17 — Hapus pipeline lama

- [ ] Hapus `domain/video/templates/*`, `style-packs.ts`, `application/video/{planner,interviewer?}*` yang tidak dipakai,
      `infrastructure/video/hyperframes/{composition-writer,hyperframes-render-engine}.ts`, `render-smoke*`,
      dan test terkait; sisakan interviewer bila masih dipakai.
- [ ] Hapus script/target Makefile yang mati; pastikan coverage backend tetap ≥ ambang (80%).
- [ ] Full suite backend + lint/build + app lint hijau.

## Progress ledger

`.superpowers/sdd/2026-09-29-modular-composition-engine/progress.md` diperbarui per task
(baseline, status, temuan review, ruling, validation snapshot).
