# Composition Engine — Blocker, Bug, dan Status Acceptance

Terakhir diperbarui: 2026-09-30
Konteks: `Visuala Modular Composition Engine.md` (PRD v0.3), plan `docs/superpowers/plans/2026-09-29-modular-composition-engine.md`
Ledger kerja: `.superpowers/sdd/2026-09-29-modular-composition-engine/progress.md`

Dokumen ini memuat apa yang **harus dikerjakan** agar pipeline composition bisa dibuktikan end-to-end, bug yang sudah ditemukan dan diperbaiki, serta status acceptance PRD §25 per kriteria.

---

## 0. Mulai dari sini (sesi berikutnya)

**Status.** Kode Task 1–15 selesai, dan **seluruh suite E2E lulus terhadap stack nyata**:
`PLAYWRIGHT_VIDEO_FLOW=1 PLAYWRIGHT_PORT=3000 NODE_ENV=test pnpm exec playwright test e2e/video-flow.spec.ts`
→ **3 passed (4.4m)**. Flow penuh (brief → komposisi → preview → setujui → render final → kontrol unduh) terbukti
lewat browser, bukan hanya di unit. Yang diperbaiki sesi ini: **B-1, B-3, B-4, B-5, B-6**. Sisa: satu anomali
terbuka (lihat B-7) yang **tidak** menghalangi acceptance karena sistem pulih sendiri.

**Urutan kerja berikutnya (opsional).**

1. Selidiki **B-7**: satu klik `Susun preview` memicu **dua** pass compose. Pass pertama jatuh ke fallback,
   dan preview-nya tidak bisa diantre karena artifact fallback bersifat content-addressed (dipakai ulang dari
   run lain, tidak tertaut ke revisi itu). Pass kedua sukses dan itulah yang dirender.
2. Kalau mau, tambah assertion E2E yang mengklik `Unduh` (bukan hanya memastikan tombolnya tampil) setelah
   app dijalankan dengan `NODE_ENV=development` supaya URL loopback lolos.

**Yang tidak terbawa antar sesi.** Isi scratchpad sesi (kredensial user E2E, backup `.env`), dan proses
background. **Yang persisten.** Semua kode dan dokumen ini di git, plus ledger lokal di
`.superpowers/sdd/2026-09-29-modular-composition-engine/progress.md` (gitignored oleh `.gitignore` direktori
itu, tapi tetap ada di disk dan boleh dibaca).

**Riwayat commit.** Pekerjaan engine ada di commit `4c6e812` (`--wip-- [skip ci]`, dibuat pemilik repo di
tengah sesi, 196 file termasuk plan dan spec). Sisanya ada di `b1cf7ed` (frontend Task 14–15, spec Playwright
beserta dua perbaikan config-nya, dua perbaikan bug, dan dokumen ini). `.env` **tidak** ikut ter-commit
(gitignored), jadi environment baru harus menambahkan dua entri task di B-2.

**Kalau environment baru dan `.env` belum punya task engine**, `compose` akan gagal dengan `AI_CONFIG_ERROR`
sebelum memanggil model. Itu gejala B-2, bukan masalah provider.

---

## 1. Status ringkas

- Semua kode Task 1–15 ada, konsisten, dan hijau di tingkat unit/komponen: backend 913 test lulus, app 168 test lulus, `tsc` dan lint bersih di kedua sisi.
- Engine sudah terbukti di bawah seam-nya: `compose:smoke` merender MP4 dengan byte identik antar run, termasuk memakai satu block catalog nyata, dan `hyperframes check` lolos.
- Terhadap stack nyata (Supabase lokal, backend, worker, app, 9router), flow **login → create project →
  interview → brief lengkap** lulus dengan panggilan LLM asli, dan gate panel komposisi tampil benar.
- Sisa flow (foto, plan, preview, approve, render, unduh) **belum terbukti**. Pada run E2E terakhir: 2 test
  lulus, 1 gagal. Jalur `compose` (yang belum pernah berjalan sebelum B-1 beres) sekarang berhenti di
  **B-4**: panggilan planner ditolak provider karena skemanya tidak strict-compatible. Rantai sebelum itu
  sudah jalan untuk pertama kalinya — Art Director memanggil model nyata dan hasilnya lolos gate beat dan
  traceability.

---

## 2. Blocker yang harus dikerjakan

### B-1 — Supabase Storage lokal tidak bisa menulis — SELESAI

**Selesai (2026-09-30).** Akar masalahnya bukan "image Storage perlu me-refresh skema", tapi **image yang
berjalan lebih tua daripada skema di volume**: container memakai `storage-api:v1.70.3` (migrasi sampai
`0062-object-versioning-core`, menulis dengan `ON CONFLICT (name, bucket_id)` polos) sedangkan volume sudah
dimigrasikan oleh `v1.77.0` (migrasi sampai `0072-drop-bucketid-objname-index`, yang menjatuhkan indeks unik
penuh itu dan meninggalkan indeks parsial). Jadi `ON CONFLICT` tidak punya arbiter. `v1.77.0` sudah ada di
disk, dan CLI 2.118.0 memilihnya. Perbaikannya cukup perintah di bawah: `make supabase-down && make supabase-up`
memulai ulang container dengan `v1.77.0` (volume DB tetap, "Starting database from backup"), dan probe
langsung mengembalikan `storage write ok`. Tidak perlu reset, tidak perlu menambal skema.

**Catatan probe.** MIME di probe asli (`text/plain`) **tidak** ada di `allowed_mime_types` bucket `assets`,
jadi probe itu menjawab 415 `invalid_mime_type` — error yang berbeda dari B-1 dan menyesatkan. Pakai MIME yang
memang diizinkan (`image/png`) seperti di bawah.

**Gejala.** Setiap upload objek ditolak. Baik `upsert: true` maupun `upsert: false`:

```
StorageApiError: database error, code: 42P10   (HTTP 500)
```

Storage menjawab HTTP 500 dan di aplikasi muncul sebagai `Asset storage is unavailable.` (`storage_unavailable`). Terlihat di UI sebagai `julumpia.png: Asset storage is unavailable.`

**Diagnosis.** `42P10` adalah "tidak ada unique/exclusion constraint yang cocok dengan spesifikasi `ON CONFLICT`". Di database lokal ini, `storage.objects` hanya punya indeks unik **parsial** pada `(bucket_id, name)` plus satu indeks unik yang menyertakan `version`:

```
idx_objects_current_version      UNIQUE (bucket_id, name) WHERE archived_at IS NULL
idx_objects_null_version         UNIQUE (bucket_id, name) WHERE NOT is_versioned
objects_bucket_id_name_version_key UNIQUE (bucket_id, name, version)
```

Storage yang berjalan menulis dengan `ON CONFLICT (bucket_id, name)` polos, sehingga tidak bisa menginferensi indeks mana pun. Artinya **image Storage tidak sinkron dengan skema storage di stack ini** (skema dari versi berbeda). Ini bukan masalah aplikasi: kode kita hanya memanggil SDK `storage.from('assets').upload(...)`, dan bucket `assets` sendiri sudah benar (ada, privat, `file_size_limit` 500 MB, `allowed_mime_types` sudah dilebarkan oleh migrasi composition engine).

**Dampak.** Menghalangi: upload foto produk, penulisan artifact di langkah compose (`video-compositions/...`), dan semua upload hasil render (preview maupun final). Jadi preview, approve, dan MP4 tidak bisa jalan sampai ini diperbaiki.

**Yang harus dikerjakan (pilih satu, urut dari yang paling tidak merusak).**

1. **Restart stack** supaya service Storage menerapkan skema untuk versinya:
   ```bash
   make supabase-down && make supabase-up      # volume DB biasanya tetap
   ```
   Lalu ulangi probe di bagian "Cara memverifikasi perbaikan".
2. **Reset database lokal** bila restart tidak menyembuhkan. Ini menghapus data lokal:
   ```bash
   make supabase-reset                          # atau: make migrate-fresh
   ```
3. **Perbaikan terakhir (jangan jadi pilihan pertama):** menambal skema vendor dengan indeks unik penuh `(bucket_id, name)`. Berisiko terhadap model versioning Storage, jadi hanya kalau 1 dan 2 gagal, dan sebaiknya dengan versi CLI/stack yang dipin.

**Cara memverifikasi perbaikan.** Dari `apps/backend`:

```bash
bun -e 'const {createSupabaseServiceRoleClient}=await import("./src/infrastructure/supabase/clients");const c=createSupabaseServiceRoleClient(process.env);const {error}=await c.storage.from("assets").upload(`probe/${Date.now()}.png`,new Uint8Array([1]),{contentType:"image/png"});console.log(error ?? "storage write ok")'
```

`storage write ok` berarti B-1 selesai.

### B-2 — Task AI untuk engine (sudah diperbaiki di `.env` lokal, tapi perlu disebar)

`AI_TASKS_JSON` di `apps/backend/.env` hanya memuat empat task lama, sedangkan engine memanggil dua task baru. Sudah ditambahkan pada sesi ini (hanya baris `AI_TASKS_JSON` yang berubah, 30 baris lain byte-identik):

```json
{"task":"art_director","profileId":"local-primary"},
{"task":"composition_planner","profileId":"local-primary"}
```

`pnpm ai:check-config` sekarang melaporkan **7 task valid**. Dua hal yang masih perlu dikerjakan manusia:

1. `.env` **tidak ikut ter-commit** (memang di-gitignore), jadi setiap environment lain (staging, mesin anggota tim lain) harus menambahkan dua entri yang sama. `.env.example` sudah memuat komentar daftar nama task yang valid, termasuk dua task baru ini.
2. Tanpa dua entri itu, `compose` gagal di `AI_CONFIG_ERROR` **sebelum** memanggil model, sehingga gejalanya menyesatkan (terlihat seperti masalah provider, padahal masalah daftar task).

### B-3 — Dua panggilan engine mengirim `messages: []` — SELESAI

**Gejala.** `POST /video-projects/:id/compositions` dijawab **400 `AI_INPUT_INVALID` "AI request messages are
invalid."** dalam ~0,1 s (sebelum ada panggilan model apa pun). Panel menampilkan alert itu dan tetap di state
tanpa komposisi, sehingga tombol `Setujui dan render` tidak pernah ada dan test E2E-nya habis di timeout 600 s.
Ditemukan pada run E2E pertama setelah B-1 beres — jalur `compose` memang belum pernah benar-benar dieksekusi.

**Sebab.** `art-director.ts` dan `composition-planner.ts` mengirim `messages: []`, sedangkan AI service
mewajibkan minimal satu pesan (`requireValidMessages`, dan satu test menyatakan itu sengaja). Semua pemanggil
lain — interviewer, kedua smoke command — selalu mengirim minimal satu pesan; hanya dua pemanggil baru ini yang
menyimpang. Unit test engine tidak menangkapnya karena memakai `AIService` palsu yang melewati validasi.

**Perbaikan.** Keduanya sekarang mengirim satu giliran user ("Give the art direction for this video." /
"Write the composition spec for this video."). Terverifikasi: `pnpm --filter backend lint` bersih, 12 test
engine lulus, dan `compose` sudah melewati titik ini — seorang Art Director revision benar-benar tertulis.

### B-4 — Skema planner tidak lolos structured output `strict` — SELESAI

**Selesai (2026-09-30).** Dipisah menjadi dua skema: `compositionSpecSchema` tetap bentuk domain (dipakai
validator, compiler, fallback), dan `compositionSpecWireSchema` baru adalah bentuk yang dikirim ke provider.
`content` pada wire berbentuk array `{ key, value }` (bukan map, karena strict melarang objek berkunci dinamis),
dan `version`/`transition` tidak ditawarkan sama sekali (keduanya tidak pernah dipakai `instance.version`, dan
`transition` selalu di-default `cut`). `compositionSpecFromWire` melipat balik ke bentuk domain, jadi
compiler/validator tidak berubah. Terverifikasi: provider menerima skema itu dengan `strict: true` (HTTP 200),
`pnpm --filter backend lint` bersih, dan **914 test backend lulus** termasuk guard baru di
`ai-schemas.test.ts` yang menolak `propertyNames` dan properti yang tidak ada di `required`.

**Gejala (sebelum perbaikan).**

**Sebab.** `compositionSpecSchema` (`domain/video-engine/composition.ts`) berisi
`content: z.record(z.string(), z.string())` — zod menghasilkan `propertyNames`, dan strict mode melarangnya —
serta field opsional `version` (module) dan `transition` (scene), sedangkan strict mode mewajibkan setiap
properti masuk `required`. Provider (9router → `cx/gpt-5.6-luna`) menolak dengan 400 `invalid_json_schema`
berurutan:

```
'propertyNames' is not permitted.
'required' is required to be supplied and to be an array including every key in properties. Missing 'version'.
```

Skema Art Director dan interviewer strict-compatible, jadi keduanya lewat; hanya `composition_spec` yang tidak.

**Kenapa `strict: false` bukan perbaikan.** Gateway menerima skema yang sama dengan `strict: false` (HTTP 200),
tetapi modelnya lalu **menghilangkan field wajib** (`format`) dan melanggar pola id (`scene-1` alih-alih
snake_case); zod parse gagal. Strict memang sedang bekerja, jadi jangan dimatikan.

**Keputusan yang diambil.** Opsi `version`/`transition` wajib-nullable ditolak: keduanya tidak pernah dibaca
dari model (`instance.version` tidak dipakai di mana pun, dan `transition` selalu di-default `cut`), jadi
menawarkannya hanya menambah field yang harus diarang model. Wire schema karena itu tidak memuat keduanya.

### B-5 — Prompt planner menyebut id modul tanpa slot-nya, dan ground tone sebagai indeks — SELESAI

**Gejala.** Setelah B-4, compose lolos tapi `isFallback: true` dengan belasan `internal_module_unknown`: model
memakai id snake_case (`product_hero`, `background_texture`, `offer_badge`, `headline`, `cta`), sedangkan
registry memakai CamelCase (`ProductHero`, …). Model juga tidak bisa tahu slot apa yang dimiliki tiap modul
karena prompt hanya mendaftar id-nya, dan `designPackTokenSummary` mencetak `Object.keys(GROUND_TONES)` — yaitu
`"0, 1, 2, 3, 4, 5"`, bukan nama tone. Rencana model jadi selalu ditolak dan fallback yang jalan.

**Perbaikan.** Prompt planner membangun daftar modul dari `INTERNAL_MODULES` (id + tiap slot: nama, kind,
required, maxLength) dan menambah aturan bahwa id modul dan kunci slot **case-sensitive** serta harus disalin
apa adanya; `designPackTokenSummary` memakai `GROUND_TONES.join(", ")`. Sesudahnya compose lewat API langsung
sukses: `isFallback: false`, `validationIssues: []`, 29 s.

### B-6 — Respons `/versions` tidak punya `kind`, skema klien mewajibkannya — SELESAI

**Gejala.** Panel render berhenti memperbarui daftar versi: status tetap "Merender" dan muncul alert
**"Tidak dapat memuat status render."**; "Hasil video" tetap kosong sehingga tombol `Unduh` (target test) tidak
pernah tampil, walau job-nya sudah `succeeded` di database. Snapshot kegagalan E2E menunjukkan persis keadaan itu.

**Sebab.** `RenderStatusPanel` mem-poll lewat `getRenderStatus` dan mem-parse hasilnya dengan
`videoVersionListSchema`, yang mewajibkan `kind`. Tetapi `VersionResponse` di backend sengaja tidak memuat
`kind` (daftar versi memang finals-only, dan ada test yang mengunci bentuk itu), sehingga parse melempar,
`pollError` terpasang, dan `versions` tidak pernah di-set. Load halaman biasa tidak melewati skema itu, jadi bug
ini hanya muncul di jalur refresh setelah approve.

**Perbaikan.** `kind` dibuang dari `videoVersionSchema` dan dari tipe `VideoVersion` klien (tidak ada kode UI
yang membacanya) beserta komentarnya yang usang; fixture test disesuaikan. Alternatif lain — menambah `kind` ke
respons backend — ditolak karena proyeksi finals-only itu memang disengaja dan diuji.

### B-7 — Satu klik `Susun preview` memicu dua pass compose — TERBUKA (tidak menghalangi)

**Gejala.** Di tiap run render, satu proyek mencatat **dua** art-direction revision dan **dua** composition
revision berurutan beberapa detik: yang pertama sering fallback, yang kedua selalu yang dipakai. Hanya compose
kedua yang mengantre preview.

**Dugaan.** Artefak bersifat content-addressed: `SupabaseCompositionArtifactRepository.create` memakai ulang
baris dengan `composition_hash` yang sama (ada unique index pada hash). Fallback yang deterministik menghasilkan
byte identik antar proyek, jadi artifact fallback sebuah revisi baru bisa menunjuk ke baris milik proyek/revisi
lain; `queueRenderJob` mencari artifact lewat `findByCompositionRevision(revision.id)` dan gagal untuk revisi
itu, sehingga preview pass pertama tidak bisa diantre. Penyebab pasti "kenapa dua pass" belum dilacak.

**Kenapa belum diperbaiki.** Flow tetap sukses (pass kedua valid) dan acceptance tidak bergantung padanya; ini
pemborosan satu panggilan model per preview, bukan kegagalan. Perlu keputusan pemilik sebelum diubah.

---

## 3. Bug yang ditemukan dan sudah diperbaiki

Bug 1–2 kelas yang sama: **satu daftar disalin ke tempat kedua, lalu salinannya tertinggal.** Unit test tidak menangkapnya karena yang diuji adalah sumber aslinya, bukan salinannya. Bug 3–6 adalah konfigurasi E2E; bug 7–11 adalah pelanggaran kontrak antara dua sisi (engine vs AI service, prompt vs registry, klien vs respons backend) yang hanya muncul saat seluruh stack benar-benar dijalankan. Semuanya ditemukan oleh run E2E.

| # | Bug | Dampak nyata | Perbaikan |
|---|---|---|---|
| 1 | `src/schemas/video.ts` menyimpan salinan aturan output-settings dengan literal durasi lama `6 \| 10 \| 15` | Proyek 12 detik ditolak 422 `Invalid request.`; form tidak pernah maju (ditemukan oleh E2E) | Skema request memakai `outputSettingsSchema` dari domain; salinannya dihapus |
| 2 | `src/application/ai-service/resolve-config.ts` menyimpan salinan daftar task lama yang di-hardcode | Task `art_director` dan `composition_planner` ditolak `AI_CONFIG_ERROR` walau `.env` sudah benar (ditemukan saat mengisi `.env`) | Memakai satu sumber `AI_TASKS`; salinannya dihapus |
| 3 | `playwright.config.ts`: `pnpm dev -- --port 3100` | Next menerima `--` sebagai direktori proyek dan keluar; seluruh suite E2E tidak pernah bisa start | `pnpm dev --port ${port}` |
| 4 | `playwright.config.ts`: `webServer.url` menunjuk halaman app | Setiap halaman meresolusi sesi lewat `NEXT_PUBLIC_API_URL`, jadi readiness menunggu connect timeout API dan habis di 120 s | Readiness menunggu `/favicon.ico`, file statis |
| 5 | Port E2E (3100) tidak ada di `CORS_ORIGIN` (hanya 3000) | Panggilan browser diblokir CORS pada run E2E | Config menerima `PLAYWRIGHT_PORT`; run memakai 3000 dengan `reuseExistingServer` |
| 6 | Spec E2E memakai PNG 2×3 px | Form menolak gambar di bawah 200 px, jadi upload selalu gagal sebelum sampai ke server | Spec memakai PNG 400×400 sungguhan |
| 7 | `art-director.ts` dan `composition-planner.ts` mengirim `messages: []` (lihat B-3) | `compose` selalu 400 `AI_INPUT_INVALID` sebelum memanggil model; flow render tidak pernah bisa jalan | Keduanya mengirim satu giliran user |
| 8 | `compositionSpecSchema` memakai map berkunci dinamis + field opsional, lalu dikirim sebagai skema `strict` (lihat B-4) | Provider menolak dengan 400 `invalid_json_schema`; planner tidak pernah berjalan | Skema wire terpisah + `compositionSpecFromWire`; guard test menolak `propertyNames` dan properti di luar `required` |
| 9 | Prompt planner mendaftar id modul tanpa slot dan mencetak ground tone lewat `Object.keys` (lihat B-5) | Model memakai id snake_case dan menebak kunci slot; rencananya selalu ditolak dan fallback yang dirender | Prompt membangun daftar dari `INTERNAL_MODULES` + aturan case-sensitive; `GROUND_TONES.join(", ")` |
| 10 | Skema klien mewajibkan `versions[].kind` yang respons backend sengaja tidak kirim (lihat B-6) | Poll panel render melempar, daftar versi tak pernah diperbarui, tombol `Unduh` tak pernah muncul | `kind` dibuang dari skema dan tipe klien |
| 11 | Spec E2E menunggu `getByText("Selesai")` | Dua elemen cocok (label status render dan "Belum ada video yang **selesai** dirender."), strict mode violation | Menunggu tombol `Unduh` yang memang target test |

**Verifikasi akhir:** `pnpm --filter backend lint` bersih, 914 test backend lulus; `pnpm --filter app exec tsc --noEmit` bersih, `pnpm --filter app lint` 0 error, 168 test app lulus; suite E2E **3 passed**.

---

## 4. Temuan kecil, belum diperbaiki (keputusan produk)

1. **Konfirmasi hak aset diwajibkan walau tidak ada aset.** Form menolak submit dengan "Konfirmasikan hak penggunaan aset untuk melanjutkan." meski tidak ada satu pun file. Sejak aset tidak lagi wajib (composition bisa jalan dengan modul internal), gate ini meminta konfirmasi atas "tidak ada". Perlu keputusan pemilik: lewati gate saat aset kosong, atau tetap wajibkan dengan alasan yang eksplisit.
2. **Variabel catalog belum diverifikasi terhadap deklarasi block.** Compiler mengirim nilai via `add --vars`; variabel yang tidak dideklarasikan block akan diam-diam kembali ke default, bukan gagal. Pengecekan ini butuh membaca HTML block yang sudah di-vendor, jadi tempatnya di langkah compile.
3. **Video pendek menyempitkan kandidat catalog.** Pada 6 detik hanya 1 kandidat, karena block promo di catalog hampir semuanya 10–12 detik. Bukan bug, tapi konsekuensi pilihan durasi.
4. **Kontras dan layout mobile belum diukur di browser.** Panel baru memakai token yang sudah ada (`neutral-450`/`neutral-500` di atas `surface`), bukan warna baru, tapi belum diuji terhadap R-25 (WCAG AA) dan R-03 di breakpoint nyata.

---

## 5. Acceptance PRD §25 — status per kriteria

| # | Kriteria | Status | Bukti / yang kurang |
|---|---|---|---|
| 1 | Brief → MP4 tanpa edit HTML | **terbukti lewat browser** | E2E `PLAYWRIGHT_VIDEO_FLOW=1`: **3 passed**. Proyek 841e17e3 menjalankan brief → komposisi model → preview v1 `succeeded` → setujui → final v2 `succeeded` → tombol `Unduh` tampil, tanpa satu baris HTML |
| 2 | AI menemukan minimal satu component catalog relevan | **sebagian** | Sisi pencarian (kode) terbukti: selector atas 386 item nyata memberi `heygen-avatar-promo-card`. Tetapi di run E2E ini model **tidak memilih** block katalog (`catalog_components` kosong), jadi "AI memakai component relevan" belum terbukti lewat model |
| 3 | AI tidak memakai catalog ID yang tidak tersedia | **terbukti di unit** | Validator `catalog_item_unknown` + `catalog_item_not_candidate`. Di E2E tidak ada id katalog yang disebut, jadi tidak teruji di sana |
| 4 | Composition menggabungkan component HyperFrames + module Visuala | **terbukti di engine** | `compose:smoke` merender satu block catalog nyata bersama modul internal, `check` lolos. Rencana model di E2E hanya memakai modul internal |
| 5 | Output mengikuti Design Pack | **terbukti di engine** | Token pack di-inline; event run E2E mencatat `design_pack_id = creative-mode` untuk rencana model |
| 6 | Fact safety (tanpa harga/diskon/produk/benefit/CTA karangan) | **terbukti lewat model nyata** | Rencana model lolos **seluruh** validator (`is_fallback: false`, `validationIssues: []`), termasuk fact validator; Art Director-nya juga lolos gate traceability terhadap brief |
| 7 | Preview dan MP4 memakai artifact yang sama | **terbukti lewat API** | Preview v1 dan final v2 punya `composition_hash` identik (`777a6dce…`) dan artifact yang sama (`56e36c1d`), jadi yang ditonton sama dengan yang diunduh |
| 8 | Fallback tetap menghasilkan video | **terbukti di engine** | Fallback lolos seluruh validator dan dirender di `compose:smoke`. Lewat API, jalur fallback menghasilkan revisi + event, tapi preview-nya tidak ter-antre karena artifact fallback dipakai ulang (B-7) |
| 9 | Reproducibility | **terbukti di engine** | Dua run `compose:smoke` menghasilkan byte identik (261530 B); artefak juga content-addressed lewat `composition_hash` |
| 10 | Visual safety (tanpa overflow kritis, aset hilang, scene kosong) | **sebagian** | `hyperframes check` exit 0 pada artifact spike, dan gate probe worker (`render_output_invalid`) lolos untuk preview + final run E2E; belum ada inspeksi visual otomatis pada output model |

---

## 6. Cara menjalankan ulang acceptance (stack lengkap)

Prasyarat stack penuh: **9router harus hidup** di `127.0.0.1:20128` (perintah: `9router -n --skip-update`),
Supabase lokal, backend, render worker, dan app. Tanpa 9router, interview dan planner tidak jalan.

```bash
# 1. Stack (B-1 tidak perlu diulang bila volume sudah dari v1.77.0)
cd apps/backend && make supabase-up && make migrate        # atau make migrate-fresh setelah reset
# verifikasi storage: bun -e '...image/png...'  (bagian B-1) → "storage write ok"

# 2. Backend + render worker + app (tiga terminal, atau background)
cd apps/backend && pnpm dev            # 4000
cd apps/backend && pnpm worker         # loop render
cd apps/app && pnpm dev --port 3000    # 3000, karena CORS_ORIGIN

# 3. User test sekali pakai (jangan pakai akun pribadi)
SUPA_URL=$(grep -E '^SUPABASE_URL=' apps/backend/.env | cut -d= -f2-)
SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' apps/backend/.env | cut -d= -f2-)
curl -s -X POST "$SUPA_URL/auth/v1/admin/users" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "content-type: application/json" \
  -d '{"email":"e2e-video@visuala.test","password":"<pilih>","email_confirm":true}'

# 4. E2E
cd apps/app
PLAYWRIGHT_PORT=3000 \
PLAYWRIGHT_USER_EMAIL=e2e-video@visuala.test \
PLAYWRIGHT_USER_PASSWORD=<pilihan di atas> \
PLAYWRIGHT_VIDEO_FLOW=1 \
NODE_ENV=test pnpm exec playwright test e2e/video-flow.spec.ts --reporter=line
```

`PLAYWRIGHT_VIDEO_FLOW=1` diperlukan karena test itu menghabiskan satu panggilan model dan satu render nyata (draft preview lalu delivery). Tanpa flag itu, hanya test yang murah yang jalan.

Prasyarat yang mudah terlupa: `NODE_ENV=test` untuk suite app (kalau tidak, React production build tidak punya `act` dan semua test komponen gagal dengan `React.act is not a function`), dan `PLAYWRIGHT_PORT=3000` agar cocok dengan `CORS_ORIGIN`.

Catatan dari run 2026-09-30 (suite hijau dengan `NODE_ENV=production` di shell):
- Shell ini mengekspor `NODE_ENV=production`, jadi `pnpm dev` mewarisinya dan Next memperingatkan "non-standard NODE_ENV". Server tetap jalan dan suite lulus, tapi bundle klien melihat NODE_ENV=production, dan `downloadVersion` hanya mengizinkan URL `http://localhost` bila NODE_ENV `development`/`test` (`isDevelopmentLoopbackUrl`). Test hanya memastikan tombol `Unduh` tampil; kalau kelak test **mengklik** tombol itu, jalankan app dengan `NODE_ENV=development pnpm dev --port 3000`.
- Satu klik `Susun preview` memicu dua pass compose (lihat **B-7**). Anggaran E2E memperhitungkannya.
- `compose` yang gagal karena error provider (bukan karena output tidak valid) **tidak** jatuh ke fallback: `runCompositionPlanner` hanya mengganti ke fallback ketika hasil model gagal validasi, bukan ketika panggilan AI-nya error.

---

## 7. Catatan operasional

- **Run 2026-09-30 (akhir):** Supabase (volume sama, image Storage `v1.77.0`), backend (4000), render worker,
  9router (`127.0.0.1:20128`), dan app (3000) dinyalakan. Suite E2E **3 passed (4.4m)**. User sekali pakai:
  `e2e-video-1790753843@visuala.test` (password di scratchpad sesi, tidak masuk dokumen). Perubahan kode sesi
  ini: `messages: []` → satu giliran user di dua pemanggil engine; skema wire planner + adapter
  (`compositionSpecFromWire`); prompt planner (slot modul + tone + aturan case-sensitive); `kind` dibuang dari
  skema/tipe versi klien; frontend mengantre preview setelah compose; spec E2E menunggu tombol `Unduh`.
- **Yang masih hidup di akhir sesi terakhir:** backend (4000), render worker, dan app (3000). Ketiganya boleh
  dipakai untuk mencoba flow manual, tapi tidak dijamin hidup setelah sesi ditutup. Menghentikannya:
  `kill $(ss -ltnp | grep -E ':4000|:3000' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)` dan
  `pkill -f "bun src/worker/index.ts"`. Mulai ulang dengan perintah di bagian 6.
- User E2E sekali pakai yang dibuat pada sesi ini ada di database lokal; boleh dihapus kapan saja. Jangan
  memakai akun pribadi untuk E2E.
- Perintah di atas menulis data ke Supabase **lokal** saja.
- Belum ada commit untuk pekerjaan composition engine sebelum dokumen ini; lihat riwayat git untuk commit terbaru.
