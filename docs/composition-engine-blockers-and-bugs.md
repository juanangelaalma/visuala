# Composition Engine — Blocker, Bug, dan Status Acceptance

Terakhir diperbarui: 2026-09-30
Konteks: `Visuala Modular Composition Engine.md` (PRD v0.3), plan `docs/superpowers/plans/2026-09-29-modular-composition-engine.md`
Ledger kerja: `.superpowers/sdd/2026-09-29-modular-composition-engine/progress.md`

Dokumen ini memuat apa yang **harus dikerjakan** agar pipeline composition bisa dibuktikan end-to-end, bug yang sudah ditemukan dan diperbaiki, serta status acceptance PRD §25 per kriteria.

---

## 1. Status ringkas

- Semua kode Task 1–15 ada, konsisten, dan hijau di tingkat unit/komponen: backend 913 test lulus, app 168 test lulus, `tsc` dan lint bersih di kedua sisi.
- Engine sudah terbukti di bawah seam-nya: `compose:smoke` merender MP4 dengan byte identik antar run, termasuk memakai satu block catalog nyata, dan `hyperframes check` lolos.
- Terhadap stack nyata (Supabase lokal, backend, worker, app, 9router), satu flow **lulus end-to-end**: login, create project dengan recipe dan durasi baru, workspace, interview membuka diri sendiri dengan panggilan LLM asli, dan gate panel komposisi.
- Sisa flow (foto, plan, preview, approve, render, unduh) **belum terbukti**, dan penyebabnya bukan kode: Storage lokal tidak bisa menulis.

---

## 2. Blocker yang harus dikerjakan

### B-1 — Supabase Storage lokal tidak bisa menulis (menghalangi seluruh sisa flow)

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
bun -e 'const {createSupabaseServiceRoleClient}=await import("./src/infrastructure/supabase/clients");const c=createSupabaseServiceRoleClient(process.env);const {error}=await c.storage.from("assets").upload(`probe/${Date.now()}.txt`,new Uint8Array([1]),{contentType:"text/plain"});console.log(error ?? "storage write ok")'
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

---

## 3. Bug yang ditemukan dan sudah diperbaiki

Semuanya kelas yang sama: **satu daftar disalin ke tempat kedua, lalu salinannya tertinggal.** Unit test tidak menangkapnya karena yang diuji adalah sumber aslinya, bukan salinannya.

| # | Bug | Dampak nyata | Perbaikan |
|---|---|---|---|
| 1 | `src/schemas/video.ts` menyimpan salinan aturan output-settings dengan literal durasi lama `6 \| 10 \| 15` | Proyek 12 detik ditolak 422 `Invalid request.`; form tidak pernah maju (ditemukan oleh E2E) | Skema request memakai `outputSettingsSchema` dari domain; salinannya dihapus |
| 2 | `src/application/ai-service/resolve-config.ts` menyimpan salinan daftar task lama yang di-hardcode | Task `art_director` dan `composition_planner` ditolak `AI_CONFIG_ERROR` walau `.env` sudah benar (ditemukan saat mengisi `.env`) | Memakai satu sumber `AI_TASKS`; salinannya dihapus |
| 3 | `playwright.config.ts`: `pnpm dev -- --port 3100` | Next menerima `--` sebagai direktori proyek dan keluar; seluruh suite E2E tidak pernah bisa start | `pnpm dev --port ${port}` |
| 4 | `playwright.config.ts`: `webServer.url` menunjuk halaman app | Setiap halaman meresolusi sesi lewat `NEXT_PUBLIC_API_URL`, jadi readiness menunggu connect timeout API dan habis di 120 s | Readiness menunggu `/favicon.ico`, file statis |
| 5 | Port E2E (3100) tidak ada di `CORS_ORIGIN` (hanya 3000) | Panggilan browser diblokir CORS pada run E2E | Config menerima `PLAYWRIGHT_PORT`; run memakai 3000 dengan `reuseExistingServer` |
| 6 | Spec E2E memakai PNG 2×3 px | Form menolak gambar di bawah 200 px, jadi upload selalu gagal sebelum sampai ke server | Spec memakai PNG 400×400 sungguhan |

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
| 1 | Brief → MP4 tanpa edit HTML | **belum** | Perlu B-1; langkah manual setelah itu: jalankan `PLAYWRIGHT_VIDEO_FLOW=1` |
| 2 | AI menemukan minimal satu component catalog relevan | **sebagian** | Sisi pencarian terbukti: selector atas 386 item nyata memberi `heygen-avatar-promo-card` (1080×1920, 10 variabel string termasuk `offerValue`, `codeLabel`). Pemilihan oleh model belum jalan karena B-2 (kini beres) dan B-1 |
| 3 | AI tidak memakai catalog ID yang tidak tersedia | **terbukti di unit** | Validator `catalog_item_unknown` + `catalog_item_not_candidate`; belum lewat HTTP nyata |
| 4 | Composition menggabungkan component HyperFrames + module Visuala | **terbukti di engine** | `compose:smoke` merender satu block catalog nyata bersama modul internal, `check` lolos; belum lewat API |
| 5 | Output mengikuti Design Pack | **terbukti di engine** | Token pack di-inline dan diverifikasi lewat frame mean color pada spike |
| 6 | Fact safety (tanpa harga/diskon/produk/benefit/CTA karangan) | **terbukti di unit** | Fact validator menolak angka yang tidak ada di brief; belum lewat model nyata |
| 7 | Preview dan MP4 memakai artifact yang sama | **belum** | Butuh B-1 (artifact dan preview sama-sama menulis ke Storage) |
| 8 | Fallback tetap menghasilkan video | **terbukti di unit** | Fallback composition lolos seluruh validator; belum dirender dari jalur API |
| 9 | Reproducibility | **terbukti di engine** | Dua run `compose:smoke` menghasilkan byte identik (261530 B) |
| 10 | Visual safety (tanpa overflow kritis, aset hilang, scene kosong) | **sebagian** | `hyperframes check` exit 0 pada artifact spike; belum pada output model |

---

## 6. Cara menjalankan ulang acceptance (setelah B-1 beres)

```bash
# 1. Stack
cd apps/backend && make supabase-up && make migrate        # atau make migrate-fresh setelah reset

# 2. Backend + render worker + app (tiga terminal, atau background)
cd apps/backend && pnpm dev            # 4000
cd apps/backend && pnpm worker         # loop render
cd apps/app && pnpm dev --port 3000    # 3000, karena CORS_ORIGIN

# 3. User test sekali pakai (jangan pakai akun pribadi)
SUPA_URL=$(grep -E '^SUPABASE_URL=' apps/backend/.env | cut -d= -f2-)
SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' apps/backend/.env | cut -d= -f2-)
curl -s -X POST "$SUPA_URL/auth/v1/users" \
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

---

## 7. Catatan operasional

- User E2E sekali pakai yang dibuat pada sesi ini ada di database lokal; boleh dihapus kapan saja. Jangan memakai akun pribadi untuk E2E.
- Perintah di atas menulis data ke Supabase **lokal** saja.
- Belum ada commit untuk pekerjaan composition engine sebelum dokumen ini; lihat riwayat git untuk commit terbaru.
