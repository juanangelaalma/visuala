# HyperFrames Template Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Gunakan `subagent-driven-development` atau `executing-plans` untuk menjalankan tugas satu per satu. Semua langkah memakai checkbox. Dokumen ini bukan izin implementasi atau commit.

**Goal:** Menambah enam template kreatif berbeda sehingga total menjadi delapan, dengan koreografi premium yang koheren, deterministik, terbaca, dan dapat dirender menggunakan pipeline sekarang.

**Architecture:** Pertahankan kontrak `RenderTemplate`, manifest, materialisasi aset, dan engine. Pilih template secara deterministik dari `videoType`, `styleId`, serta `aspectRatio` yang sudah tersedia; bekukan ID/version saat enqueue seperti sekarang. Bangun dua pilot sebelum empat template berikutnya, tanpa gallery, perubahan schema, dependency, atau renderer baru.

**Tech Stack:** TypeScript, Vitest 3.2.4, GSAP **3.14.2**, `@hyperframes/producer` **0.8.59**, FFmpeg/FFprobe, pnpm 9.15.4; script smoke memakai Bun melalui pnpm.

**Spec:** Strategi yang disetujui dalam percakapan: 5–8 template berbeda, dipersempit menjadi **enam tambahan/delapan total**, pilot dua dahulu, advanced coherent motion, Antislop selama perencanaan, perubahan minimum. Tidak ada dokumen spec terpisah yang diklaim telah disetujui.

## Global Constraints

- Rencana saja pada sesi penulisan ini; jangan ubah aplikasi atau commit.
- **Blocker eksekusi:** `antislop.md` dan `skills/antislop-ui/SKILL.md` belum ditemukan. Pemilik harus menyediakan lokasi/isinya sebelum implementasi atau persetujuan visual. Membaca aturan desain lain bukan pengganti compliance Antislop.
- Baca `docs/ai-coding-rules..md`, `AGENTS.md`, dan `DESIGN.md` saat eksekusi. Aturan brand aplikasi tidak berarti semua video harus berpalet lime: empat style pack video yang sudah ada tetap otoritatif.
- Tidak ada gallery, picker, API baru, schema/migration, dependency, audio pipeline, shader/WebGL, atau upgrade producer/GSAP.
- Gunakan pnpm saja. Jangan menjalankan installer CLI terbaru atau mengandalkan fitur skill terbaru yang belum diverifikasi pada producer 0.8.59.
- Jangan ubah dua template lama, `baseStyles`, atau nilai/version style pack lama; hindari perubahan output job beku.
- Tidak ada commit kecuali pengguna memberi izin eksplisit; tidak ada langkah commit otomatis.
- Setelah implementasi kode, jalankan `graphify update .`; bukan pada tahap penulisan rencana ini.

## Fakta sumber dan kontrak

Semua path relatif terhadap root repository.

| Sumber | Fakta |
|---|---|
| `apps/backend/src/domain/video/templates/registry.ts` | Registry dua template; selector memakai first match; resolver ID lalu pemeriksaan version |
| `apps/backend/src/domain/video/templates/product-spotlight.ts` | `product-spotlight@1.0.0`; product promo/launch; image fullscreen, title rise |
| `apps/backend/src/domain/video/templates/offer-board.ts` | `offer-board@1.0.0`; discount/menu; card dan offer plate persisten |
| `apps/backend/src/domain/video/style-packs.ts` | Empat style pack `1.0.0`; Inter lokal; motion hanya energy/enterSeconds |
| `apps/backend/src/application/video/render-jobs.ts` | `createRenderJob` memilih template sekali sebelum membekukan input snapshot |
| `apps/backend/src/domain/video/composition.ts` | `buildComposition(manifest)` menghasilkan index.html/styles.css; ID komposisi `main` |
| `apps/backend/src/domain/video/render-manifest.ts` | Scene timing, transition, copy, aset hash, ID/version, seed sudah tersedia |
| `apps/backend/src/domain/video/storyboard.ts` | Judul maksimum 40 karakter, copy 90, normalisasi minimum scene 0.5 detik; cut/fade/slide/zoom |
| `apps/backend/src/domain/video/settings.ts` | Empat video type; tiga ratio; 720p/1080p; 6/10/15 detik |
| `apps/backend/src/infrastructure/video/hyperframes/composition-writer.ts` | Salin GSAP/aset lokal, verifikasi hash aset sebelum render |
| `apps/backend/src/infrastructure/video/hyperframes/hyperframes-render-engine.ts` | Producer best-effort; FFprobe gate bukan pemeriksaan visual |
| `apps/backend/src/scripts/render-smoke.ts` | Template/style hardcoded; flag ratio/resolution/duration/keep tersedia |
| `apps/backend/package.json` | `lint` dan `build` sama-sama `tsc --noEmit`; tidak ada script `typecheck` terpisah |

Kontrak berikut tetap:

```ts
export type TemplateInput = { manifest: RenderManifest; stylePack: StylePack };
export type RenderTemplate = {
  id: string;
  version: string;
  supports: readonly VideoType[];
  aspectRatios: readonly VideoAspectRatio[];
  build(input: TemplateInput): { html: string; css: string };
};
```

`manifestFixture(overrides: Partial<RenderManifest> = {})` dan `manifestSceneFixture(overrides: Partial<RenderManifestScene> = {})` tersedia di `apps/backend/src/domain/video/render-manifest.test-helpers.ts`. Fixture aset tidak berisi bytes gambar nyata: pakai smoke runner untuk validasi browser/render.

## Kebijakan selection dan kompatibilitas

Tambahkan optional `styleId?: VideoStyleId` hanya pada input fungsi selector internal; **bukan** field schema baru. Tanpa styleId, hasil lama tetap. Callsite produksi memberikan `project.styleId` setelah gate visual lulus.

Mapping final untuk semua ratio:

| videoType | bold_pop | clean_product | warm_artisan | premium_dark |
|---|---|---|---|---|
| product_promo | product-spotlight | editorial-split | artisan-detail | gallery-reveal |
| product_launch | kinetic-type | editorial-split | artisan-detail | gallery-reveal |
| discount_promo | offer-takeover | offer-board | offer-board | offer-takeover |
| menu_showcase | menu-sequence | offer-board | menu-sequence | menu-sequence |

- Default utama `product_promo + bold_pop` tetap `product-spotlight`.
- Mapping baru berlaku untuk **job baru**, termasuk permintaan rerender yang membuat job baru; bukan re-execution job beku. Sampaikan perbedaan ini dalam release review.
- Job yang sudah mengandung `templateId/templateVersion` tetap di-resolve oleh `templateById`, tidak dipilih ulang.
- Pilot hanya mengaktifkan empat sel: product promo/launch × clean_product/premium_dark. Sel lain tetap default lama sampai gelombang kedua lolos.
- Semua enam template dapat dibangun dengan empat style pack; mapping membatasi pasangan pilihan default, bukan kontrak build.
- Jangan mengganti version template lama. Resolver belum mendukung beberapa versi satu ID; versioning historis di luar scope.
- `stylePackVersion` saat ini dicatat tetapi `buildComposition` mencari pack berdasarkan ID. Jangan mengubah pack dalam pekerjaan ini; jangan mengklaim celah version resolution sudah diperbaiki.

## Konsep dan spesifikasi koreografi

Semua template baru memakai version `1.0.0`, ratio `9:16`, `1:1`, `16:9`, safe area minimal 8% sisi pendek, dan aset lokal yang direferensikan scene. Pilih image pertama secara deterministik mengikuti urutan `scene.assetIds`; jangan bergantung urutan upload global. Tanpa image, tampilkan surface/teks yang bermakna, bukan broken image. Tidak menciptakan harga, rating, klaim, atau annotation dari model baru.

| ID / export | supports | Layout berbeda | Koreografi utama |
|---|---|---|---|
| `editorial-split` / `editorialSplit` — pilot | product_promo, product_launch | Landscape: image 58%, copy 42%; portrait: image atas 55%, copy bawah; square: split 52/48 | Image panel bergeser 8% sisi pendek; headline masuk berlawanan 3%; copy menyusul sekali; divider menjadi penghubung antar-scene. Tidak membuat semua elemen melayang |
| `gallery-reveal` / `galleryReveal` — pilot | product_promo, product_launch | Produk dalam aperture besar, ruang kosong jelas; caption/copy di luar aperture, bukan card berlapis | Aperture overflow-hidden dengan image bergerak masuk; image scale 1.035 ke 1 selama awal scene; judul muncul setelah image menetap; akhir scale searah untuk zoom, tanpa lonjakan arah |
| `kinetic-type` / `kineticType` | product_launch | Judul dominan 60% area, image crop pendamping; bukan centered hero yang sama | Maksimum empat kelompok kata judul, stagger total dibatasi entrance; satu aksen garis tumbuh bersama kata penekanan; copy tetap stabil. Tidak memecah karakter atau mengambil ukuran DOM saat tween |
| `artisan-detail` / `artisanDetail` | product_promo, product_launch | Close-up image 65%, kolom catatan 35%; portrait catatan di bawah | Image drift maksimal 2% hanya selama entrance, dua blok copy masuk berurutan; garis tipis mengikuti munculnya blok. Tidak memberi label bahan/proses yang tidak ada pada approved copy |
| `menu-sequence` / `menuSequence` | menu_showcase | Daftar menu editorial di satu sisi, image berganti di sisi lain; portrait daftar bawah | Baris masuk berurutan dengan total stagger dibatasi; image handoff searah; harga tetap statis setelah masuk. Jika menuItems kosong, pakai judul/copy scene, tanpa menu palsu |
| `offer-takeover` / `offerTakeover` | discount_promo | Offer typography dominan, image di sudut kontras, brand/offer rail persisten | Offer scale 0.96 ke 1 sekali; image slide pendek menyusul; CTA menetap. Pakai keyMessage/CTA/menu prices yang tersedia, bukan parser yang menebak diskon |

### Timing scene: aturan implementasi bersama

Untuk `D = endSeconds - startSeconds`, hitung waktu di build time, bukan wall clock:

```ts
export function sceneTiming(duration: number, enterSeconds: number) {
  if (duration < 1.5) return { enter: 0, exit: 0, hold: duration, stagger: 0 };
  const enter = Math.min(enterSeconds, duration * 0.18);
  const exit = Math.min(0.3, duration * 0.12);
  return { enter, exit, hold: duration - enter - exit, stagger: enter / 4 };
}
```

- Normal scene: entrance selesai pada `start + enter`; stable reading hold hingga `end - exit`; semua teks maksimum panjang tampil bersama selama hold. Stagger termasuk entrance, bukan ditambahkan setelahnya.
- Scene <1.5 detik: hard cut, teks/image langsung visible, tidak ada stagger/zoom/exit. Jangan mengubah approved timing untuk menyembunyikan masalah. Scene 0.5 detik dengan copy panjang tetap risiko keterbacaan; gate visual harus menolak kombinasi itu untuk rilis, bukan mengecilkan font ekstrem atau membuang copy.
- Scene terakhir: tahan CTA/copy hingga akhir; jangan fade-to-blank.
- `cut`: boundary langsung, tanpa tween keluar. `fade`: fade surface/image antar state dengan teks tetap memiliki hold. `slide`: exit/entry bergerak satu arah pada sumbu dominan. `zoom`: scale keluar/masuk searah, tidak flip arah mendadak.
- Scope minimum tidak memanjangkan clip melewati approved scene interval. Match-motion dilakukan pada kedua sisi boundary dengan background opak yang sama; bukan mengklaim crossfade overlap. Crossfade sejati yang butuh overlap di luar interval tidak termasuk rilis ini.
- Satu paused GSAP timeline pada `window.__timelines["main"]`; fromTo memakai posisi absolut dan `immediateRender: false` untuk scene lanjut. Initial state harus benar pada seek langsung/backward; gate browser membuktikannya.
- Animate wrapper visual di dalam `.clip`; lifecycle clip milik framework. Tidak tween `display`, visibility clip, top/left/width/height. Gunakan transform/opacity; aperture via overflow-hidden, bukan plugin/shader.
- Root/frame sizing eksplisit; opaque background pada child full-frame untuk menghindari flash. ID unik berdasarkan scene.order; user text hanya melalui `escapeHtml`, tidak diinterpolasi ke JavaScript.
- Tidak `Math.random`, clock, timer, fetch/font CDN, infinite repeat, ambient wobble, parallax tanpa fungsi, atau motion mengejar semua elemen. `variantSeed` boleh tetap tidak digunakan; tidak perlu variasi acak demi fitur ini.

### Readability/style compatibility

- Gunakan palette/typography pack; jangan menambah style IDs. Scale numeric typography pack berdasarkan sisi pendek hanya dalam template baru, tanpa mengubah CSS lama.
- Semua copy disediakan pada opaque/scrim-backed surface: teks kecil contrast minimal 4.5:1, teks besar 3:1. Accent yang lemah tidak dipakai sebagai teks kecil di atas background.
- Gunakan `px(manifest, value)` dan safe area existing; portrait perlu layout tersendiri, bukan hanya scale landscape.
- Tidak truncate harga, judul, copy, atau CTA. Menu panjang dibagi ke blok/scene yang ada hanya jika semua item tetap terbaca; jika tidak muat tanpa mengubah durasi, gate menolak fixture tersebut dan catat keterbatasan. Jangan diam-diam drop item.
- Caption adalah overlay di atas film; bukan band global yang menggeser seluruh frame. Hindari benturan lokal melalui layout template. Jangan mengklaim dukungan audio baru.
- Tidak flashing/strobe; gerak pendek dan hold panjang untuk mengurangi beban visual. MP4 tidak mengikuti `prefers-reduced-motion`; jangan menjanjikan toggle yang tidak ada. Player aksesibel existing tidak diubah.

## Peta file implementasi

**Baru:**
- `apps/backend/src/domain/video/templates/scene-timing.ts`: helper waktu pure di atas.
- `apps/backend/src/domain/video/templates/scene-timing.test.ts`: batas durasi/hold.
- `apps/backend/src/domain/video/templates/editorial-split.ts`
- `apps/backend/src/domain/video/templates/gallery-reveal.ts`
- `apps/backend/src/domain/video/templates/kinetic-type.ts`
- `apps/backend/src/domain/video/templates/artisan-detail.ts`
- `apps/backend/src/domain/video/templates/menu-sequence.ts`
- `apps/backend/src/domain/video/templates/offer-takeover.ts`

**Ubah:**
- `apps/backend/src/domain/video/templates/registry.ts`: registrasi dan mapping internal.
- `apps/backend/src/domain/video/templates/registry.test.ts`: mapping/reachability/legacy.
- `apps/backend/src/domain/video/composition.test.ts`: semua template, format, escaping, determinisme.
- `apps/backend/src/application/video/render-jobs.ts`: satu argumen `styleId` pada callsite setelah gate.
- `apps/backend/src/application/video/render-jobs.test.ts`: snapshot selection baru dan idempotensi.
- `apps/backend/src/scripts/render-smoke.ts`: selector template/style, validasi flag, menu/content fixtures untuk review.

**Baca/reuse, tidak diubah:** `templates/styles.ts`, `templates/escape-html.ts`, `style-packs.ts`, `composition.ts`, `render-manifest.ts`, `render-manifest.test-helpers.ts`, writer/engine/tests, `settings.ts`, `storyboard.ts`, `render-input.ts`. Tidak ada file frontend dalam scope.

## Task 0 — Prasyarat dan baseline, tanpa kode

- [ ] Dapatkan dua file Antislop dari pemilik; baca core lalu UI skill. Jika belum tersedia, berhenti sebelum implementasi. Rekonsiliasi konsep/timing rencana terhadap isinya; jangan menandai gate compliant tanpa bukti.
- [ ] Baca ulang path sumber pada tabel; pastikan versi dependency dan callsite belum bergeser.
- [ ] Jalankan baseline berikut dari root dan simpan hasil di catatan eksekusi, tanpa membuat dokumentasi tambahan otomatis:

```bash
pnpm --filter backend lint
pnpm --filter backend build
pnpm --filter backend test -- src/domain/video/templates/registry.test.ts src/domain/video/composition.test.ts src/application/video/render-jobs.test.ts
```

Expected: exit 0. Kegagalan baseline dicatat terpisah; jangan refactor area lain.

## Task 1 — Helper timing yang dapat diuji

**Files:** buat `apps/backend/src/domain/video/templates/scene-timing.ts` dan `.test.ts`.
**Interface:** `sceneTiming(duration: number, enterSeconds: number): { enter: number; exit: number; hold: number; stagger: number }`; input durasi valid berasal manifest tervalidasi, bukan API baru.

- [ ] Tulis test berikut dahulu:

```ts
import { describe, expect, it } from "vitest";
import { sceneTiming } from "./scene-timing";

describe("sceneTiming", () => {
  it.each([0.5, 1, 1.49])("keeps short scene %s static", (duration) => {
    expect(sceneTiming(duration, 0.7)).toEqual({ enter: 0, exit: 0, hold: duration, stagger: 0 });
  });
  it.each([1.5, 2, 4, 6, 10, 15])("preserves reading time for %s", (duration) => {
    const timing = sceneTiming(duration, 0.7);
    expect(timing.enter + timing.hold + timing.exit).toBeCloseTo(duration);
    expect(timing.hold).toBeGreaterThanOrEqual(duration * 0.7 - 0.000001);
    expect(timing.stagger * 4).toBeLessThanOrEqual(timing.enter);
  });
});
```

- [ ] Run `pnpm --filter backend test -- src/domain/video/templates/scene-timing.test.ts`; expected FAIL karena helper belum ada.
- [ ] Implementasikan persis helper di bagian timing; tanpa dependency atau config baru.
- [ ] Run command yang sama; expected PASS.

## Task 2 — Dua pilot, belum mengganti selection produksi

**Files:** buat `editorial-split.ts`, `gallery-reveal.ts` pada direktori template; ubah `registry.ts`, `composition.test.ts`.
**Interface:** export `editorialSplit: RenderTemplate`, `galleryReveal: RenderTemplate`; imports eksplisit dan append ke `RENDER_TEMPLATES`. `selectTemplate` masih perilaku lama.

- [ ] Tambahkan `RENDER_TEMPLATES` import dan test berikut ke `composition.test.ts`; daftar ID pilot harus diuji eksplisit agar test tidak lolos ketika registrasi terlupa:

```ts
it.each(["editorial-split", "gallery-reveal"])("builds registered pilot %s", (templateId) => {
  const manifest = manifestFixture({ templateId, templateVersion: "1.0.0" });
  const first = buildComposition(manifest);
  expect(first.files).toEqual(buildComposition(manifest).files);
  const html = first.files.find((file) => file.path === "index.html")?.contents ?? "";
  expect(html).toContain('data-composition-id="main"');
  expect(html).toContain('gsap.timeline({ paused: true })');
  expect(html).toContain('window.__timelines["main"]');
  expect(html).not.toMatch(/https?:\/\//);
});
```

- [ ] Run `pnpm --filter backend test -- src/domain/video/composition.test.ts`; expected FAIL unknown template.
- [ ] Implementasikan kedua layout/koreografi sesuai tabel dan timing helper, gunakan existing imports `escapeHtml`, `baseStyles`, `px`, serta type `RenderTemplate`. Buat HTML/CSS langsung seperti dua template lama; tidak membuat template factory/DSL. Scope CSS untuk masing-masing layout. Reuse shell existing sebagai pola, bukan mengedit output legacy.
- [ ] Register kedua export; run test yang sama dan registry tests. Expected empat template; default selector belum berubah.
- [ ] Tambahkan short-scene fixture 0.5 detik dan long-copy fixture pada test matrix Task 5 sebelum visual review.

## Task 3 — Smoke pilot dan gate visual A

**Files:** ubah `apps/backend/src/scripts/render-smoke.ts`; read `settings.ts`, `templates/registry.ts`, `style-packs.ts`.
**Interface script baru:** existing flags tetap; tambah `--template`, `--style`, `--content standard|long|menu|short`. Default template/style/content tetap `product-spotlight`, `bold_pop`, `standard`.

- [ ] Sebelum filesystem/render, validasi flag dengan Zod yang sudah terpasang dan enum settings. Jangan terus memakai `as` untuk menerima input user tanpa validasi. Tolak template unknown, style unknown, ratio unsupported, duration selain 6/10/15, resolution selain 720p/1080p, serta content unknown.
- [ ] Resolusi template memakai ID allowlist; gunakan `template.version`, `stylePackFor(styleId).version`, dan `template.supports[0]` sebagai videoType fixture, bukan hardcoded product promo. Contoh bagian inti:

```ts
const template = RENDER_TEMPLATES.find((entry) => entry.id === templateId);
if (!template || !template.aspectRatios.includes(aspectRatio)) {
  throw new Error("Unsupported smoke template or aspect ratio.");
}
const videoType = template.supports[0];
if (!videoType) throw new Error("Smoke template has no supported video type.");
```

- [ ] Content `standard`: dua scene setengah durasi, seperti sekarang. `long`: title `"A".repeat(40)`, copy `"B".repeat(90)`, CTA panjang 80 karakter untuk stress overflow. `menu`: tiga item bernama Kopi Susu/Teh Melati/Roti Bakar dengan harga Rp25.000/Rp15.000/Rp20.000. `short`: scene pertama 0.5 detik, kedua sisa durasi, approved copy pendek; jangan memalsukan total duration.
- [ ] Tetap gunakan gambar lokal FFmpeg, objectStore in-memory, asset hash nyata. Simpan composition/MP4 hanya dengan `--keep`. Jangan menjadikan gambar warna smoke sebagai bukti art direction premium; gunakan aset foto lokal berizin dalam fixture review operator sebelum approval.
- [ ] Jalankan negatif: `pnpm --filter backend render:smoke --template unknown`; expected nonzero sebelum mkdir/render. Jalankan pilot:

```bash
pnpm --filter backend render:smoke --template editorial-split --style clean_product --aspect-ratio 9:16 --resolution 720p --duration 6 --keep
pnpm --filter backend render:smoke --template gallery-reveal --style premium_dark --aspect-ratio 16:9 --resolution 1080p --duration 10 --keep
```

**Gate visual A — terpisah dari kelulusan test:**
- [ ] Inspect semua scene pada start, akhir entrance, midpoint, boundary ±1 frame, frame terakhir; tidak ada black flash, overlap teks, crop produk tak disengaja, CTA hilang, atau font fallback.
- [ ] Uji seek mundur/acak pada composition lokal dengan browser/runtime pinned, bandingkan frame waktu sama setelah seek linear. Jangan menyebut source-string determinism sebagai bukti seek safety.
- [ ] Review pilot dengan foto lokal nyata, tiga ratio, empat style; approve identitas berbeda dan motion continuity oleh pengguna sebelum selector produksi diaktifkan.
- [ ] Bila tidak tersedia tool browser/CLI kompatibel pinned, gate tetap belum lulus. Jangan install CLI latest atau melewati gate dengan FFprobe saja.

## Task 4 — Mapping pilot dan pembekuan job

**Files:** `registry.ts`, `registry.test.ts`, `render-jobs.ts`, `render-jobs.test.ts` pada path peta file.
**Interface baru:** `selectTemplate(input: { videoType: VideoType; aspectRatio: VideoAspectRatio; styleId?: VideoStyleId }): RenderTemplate`.

- [ ] Tambah `VideoStyleId` type import. Buat constant mapping internal hanya empat pasangan pilot; tahap Task 5 memperluas menjadi tabel final. Tanpa pasangan atau tanpa styleId, jalankan pencarian default lama. Sel pilihan harus lolos `supports` dan `aspectRatios`; mapping yang invalid harus throw, bukan silently fallback.
- [ ] Tambah test berikut ke registry tests sebelum implementasi:

```ts
it("keeps legacy selection without a style", () => {
  expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16" }).id).toBe("product-spotlight");
});
it("selects a reachable pilot from existing inputs", () => {
  expect(selectTemplate({ videoType: "product_promo", aspectRatio: "9:16", styleId: "clean_product" }).id).toBe("editorial-split");
});
```

- [ ] Run `pnpm --filter backend test -- src/domain/video/templates/registry.test.ts`; expected FAIL pilot expectation sebelum perubahan.
- [ ] Implementasikan resolver berdasarkan ID map, tidak index array/random. Sesudah gate A, ubah callsite:

```ts
const template = selectTemplate({
  videoType: project.videoType,
  aspectRatio: project.settings.aspectRatio,
  styleId: project.styleId,
});
```

- [ ] Tambah test berikut di `render-jobs.test.ts` yang memakai helper lokal `dependencies`, `project`, `storyboardRevision`, `buildApprovalSnapshot`, konstanta existing:

```ts
it("freezes the style-selected pilot in a new job", async () => {
  const deps = dependencies();
  const selectedProject = { ...project("approved"), styleId: "clean_product" as const };
  deps.projects.getOwned.mockResolvedValue(selectedProject);
  deps.storyboardRevisions.latestOwned.mockResolvedValue({
    ...storyboardRevision(APPROVED_AT),
    approvalSnapshot: buildApprovalSnapshot({
      project: { videoType: selectedProject.videoType, styleId: selectedProject.styleId, settings },
      briefRevision: { id: BRIEF_ID, version: 1 },
      storyboardRevision: { id: STORYBOARD_ID, version: 1 },
      generatedBy: GENERATED_BY,
      approvedAt: APPROVED_AT,
    }),
  });
  await createRenderJob({ userId: USER_ID, projectId: PROJECT_ID, idempotencyKey: "render-pilot-1" }, deps);
  expect(deps.jobs.create.mock.calls[0]?.[0].inputSnapshot).toMatchObject({
    templateId: "editorial-split", templateVersion: "1.0.0", styleId: "clean_product",
  });
});
```

- [ ] Run registry/composition/render-jobs tests; existing product_promo/bold_pop snapshot dan idempotency tests harus tetap PASS. Tambah frozen legacy composition dengan style clean_product dan template product-spotlight; hasil harus tetap layout legacy, bukan pilot.

## Task 5 — Empat template berikutnya dan mapping final

**Files:** buat `kinetic-type.ts`, `artisan-detail.ts`, `menu-sequence.ts`, `offer-takeover.ts`; ubah registry/tests/composition tests. Tidak mengubah callsite lagi.
**Interfaces:** export `kineticType`, `artisanDetail`, `menuSequence`, `offerTakeover`, masing-masing `RenderTemplate` sesuai tabel konsep.

- [ ] Tambahkan empat ID pada test build eksplisit Task 2 sebelum menulis template. Run composition tests; expected FAIL.
- [ ] Implementasikan tiap layout dan choreography sesuai tabel, satu template sekali, lalu run composition tests terfokus. Terapkan fallback menu kosong dan missing optional content; commercial facts tetap escaped.
- [ ] Append empat export ke registry; total delapan. Perluas mapping internal dengan tabel final setelah gate B, bukan saat template baru sekadar dikompilasi.
- [ ] Setelah gate visual B disetujui, tambahkan test mapping berikut ke `registry.test.ts` sebelum mengaktifkan mapping final; expected FAIL dahulu, lalu PASS setelah mapping diterapkan. Jangan memasang test final ini pada checkpoint Task 5 yang masih memakai mapping pilot. Imports: `VIDEO_ASPECT_RATIOS`, `VIDEO_TYPES`, `VIDEO_STYLE_IDS` dari `../settings`:

```ts
it("reaches all eight templates without changing legacy defaults", () => {
  const reached = new Set<string>();
  for (const videoType of VIDEO_TYPES) {
    for (const styleId of VIDEO_STYLE_IDS) {
      for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
        const template = selectTemplate({ videoType, styleId, aspectRatio });
        reached.add(template.id);
        expect(template.supports).toContain(videoType);
        expect(template.aspectRatios).toContain(aspectRatio);
      }
    }
  }
  expect([...reached].sort()).toEqual([
    "artisan-detail", "editorial-split", "gallery-reveal", "kinetic-type",
    "menu-sequence", "offer-board", "offer-takeover", "product-spotlight",
  ]);
});
```

- [ ] Tambahkan table-driven assertions untuk **setiap sel** tabel final; expected IDs harus literal sesuai tabel, bukan diturunkan dari mapping implementasi. Pertahankan legacy selector tests tanpa style.
- [ ] Tambah matrix composition di `composition.test.ts` memakai imports `RENDER_TEMPLATES`, `VIDEO_STYLE_IDS`, `VIDEO_ASPECT_RATIOS`, `VIDEO_RESOLUTIONS`, `VIDEO_DURATIONS_SECONDS`, `frameDimensions`:

```ts
it("builds deterministic sources across the supported matrix", () => {
  for (const template of RENDER_TEMPLATES) {
    for (const styleId of VIDEO_STYLE_IDS) {
      for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
        for (const resolution of VIDEO_RESOLUTIONS) {
          for (const durationSeconds of VIDEO_DURATIONS_SECONDS) {
            const manifest = manifestFixture({
              templateId: template.id, templateVersion: template.version,
              videoType: template.supports[0]!, styleId, aspectRatio, resolution, durationSeconds,
              ...frameDimensions({ aspectRatio, resolution }),
              scenes: [manifestSceneFixture({ endSeconds: durationSeconds })],
            });
            const source = buildComposition(manifest);
            expect(source.files).toEqual(buildComposition(manifest).files);
            expect(source.files.map((file) => file.path)).toEqual(["index.html", "styles.css"]);
            for (const file of source.files) expect(file.contents).not.toMatch(/https?:\/\//);
          }
        }
      }
    }
  }
});
```

- [ ] Parameterisasikan existing escaping/user-text-out-of-script tests untuk seluruh delapan ID. Tambahkan kasus `brandName/callToAction/caption = null`, `menuItems = []`, scene tanpa asset, title 40/copy 90, dan first scene 0.5 detik. Assert string approved tetap ada/escaped; tidak menuntut semua template menampilkan field opsional yang tidak relevan.
- [ ] Run `pnpm --filter backend test -- src/domain/video`; expected PASS. Source tests tidak menggantikan gate visual.

## Task 6 — Gate visual B, render acceptance, dan rollout

**Files:** tidak menambah produksi; gunakan script smoke dan engine test existing. Review mapping final sebelum mengaktifkannya.

- [ ] Jalankan minimal enam template × tiga ratio pada 720p/6 detik; masing-masing memakai style default dari tabel. Jalankan keenamnya juga pada 1080p/15 detik untuk beban render. Tambahkan 10 detik, seluruh style pack, long/menu/short fixtures sebagai source matrix dan sampled visual stress; bukan mengklaim setiap kombinasi telah dirender.
- [ ] Contoh command setelah perubahan runner tersedia:

```bash
pnpm --filter backend render:smoke --template kinetic-type --style bold_pop --aspect-ratio 1:1 --resolution 720p --duration 6 --content long --keep
pnpm --filter backend render:smoke --template artisan-detail --style warm_artisan --aspect-ratio 9:16 --resolution 1080p --duration 15 --keep
pnpm --filter backend render:smoke --template menu-sequence --style warm_artisan --aspect-ratio 16:9 --resolution 720p --duration 10 --content menu --keep
pnpm --filter backend render:smoke --template offer-takeover --style premium_dark --aspect-ratio 9:16 --resolution 720p --duration 6 --content short --keep
```

- [ ] Repeat frame/seek inspection gate A; tambahkan batas waktu scene semua transition enum. Gunakan foto lokal nyata untuk approval art direction. Tolak jika keenam template hanya berbeda warna, commercial fact terpotong, terlalu banyak gerak, tidak ada hold, menu overflow, atau copy tak terbaca.
- [ ] Pengguna approve hasil visual empat template lanjutan. Setelah itu aktifkan tabel mapping final dan jalankan reachability test. Sebelum approval, registry boleh memuat template untuk smoke tetapi default selection belum diarahkan ke sana.
- [ ] Jalankan final checks dari root:

```bash
pnpm --filter backend lint
pnpm --filter backend build
pnpm --filter backend test
RENDER_ENGINE_E2E=1 pnpm --filter backend test -- src/infrastructure/video/hyperframes/hyperframes-render-engine.test.ts
graphify update .
```

`lint` dan `build` adalah dua alias pemeriksaan TypeScript, bukan ESLint dua kali. E2E existing menguji render nyata/determinisme fixture legacy; smoke matrix baru wajib melengkapinya. Chromium/FFmpeg diperlukan. Global HyperFrames CLI belum terverifikasi tersedia; tidak ada command `hyperframes check` yang diklaim berjalan dalam proyek ini.

- [ ] Bandingkan batas FFprobe existing: dimensions exact, duration toleransi 1/24 detik, FPS toleransi 0.5, output nonempty dan di bawah max bytes. Tambahkan penilaian visual manusia; best-effort producer tidak menjamin frame siap.
- [ ] Laporkan Summary, Files changed, Validation, Rule compliance, Risks. Bedakan command yang benar-benar dijalankan, skipped, dan gagal. Jangan commit tanpa izin.

### Rollback

- Jika pilot gagal: jangan aktifkan empat sel mapping pilot; pertahankan default lama.
- Jika gelombang dua gagal: pertahankan mapping pilot yang sudah disetujui; nonaktifkan hanya sel baru.
- Setelah job baru terlanjur dibuat: rollback **selection untuk job mendatang saja**. Pertahankan semua template ID/version yang sudah dibekukan sampai job/versi terkait tidak membutuhkannya; jangan menghapus file/registry entry atau mengganti old manifest ke template lain.
- Jangan rollback dengan deploy binary lama yang tidak mengenal ID baru saat job ID tersebut masih antre. Hentikan enqueue baru bila perlu; drain/retry job memakai implementasi yang mengenal ID-nya.
- Jika bug visual harus mengubah output ID/version yang sudah dipublikasikan, hentikan rollout dan minta keputusan versioning; jangan diam-diam patch hasil frozen render.

## Self-review rencana

- [x] Enam tambahan/delapan total; dua pilot; kontrak dan pinned engine dipertahankan.
- [x] Mapping konkret mencapai semua template; default tanpa style dan job beku dibedakan dari job baru.
- [x] Path, signatures, fixtures, dependency, scripts berdasarkan sumber yang dibaca.
- [x] Test contoh memakai Vitest existing; seluruh perubahan tetap backend; tidak schema/gallery/dependency.
- [x] Motion seek-safe, short-scene fallback, readable hold, style compatibility, aset lokal, contrast dan overflow memiliki gate eksplisit.
- [x] Gate kode dipisahkan dari visual approval; FFprobe tidak diklaim membuktikan kualitas visual.
- [x] Missing Antislop menjadi blocker eksekusi; tidak ada klaim compliance fiktif.
- [x] Tidak menjalankan test/render saat menulis rencana; semua expected results adalah target eksekusi, bukan hasil observasi.
- [x] Commit hanya dengan izin; graphify update setelah implementasi; rollback menjaga frozen IDs.
