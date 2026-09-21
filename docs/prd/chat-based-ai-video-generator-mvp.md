# PRD — Chat-Based AI Video Generator untuk Produk F&B

**Status:** Draft v1  
**Tanggal:** 2026-03-10  
**Target platform:** Web (`apps/app`) dengan API ElysiaJS (`apps/backend`)  
**Fokus MVP:** Video motion promosi produk F&B menggunakan HyperFrames

## 1. Executive Summary

### Problem Statement

Pelaku UMKM F&B membutuhkan video promosi yang menarik, tetapi proses menyusun konsep, menulis naskah, membuat motion design, menambahkan voice-over, musik, dan caption membutuhkan kemampuan editing, waktu, dan biaya yang tidak selalu mereka miliki.

### Proposed Solution

Membangun generator video berbasis percakapan dengan antarmuka seperti ChatGPT, Gemini, atau Claude. Pengguna mengunggah beberapa gambar produk, memilih pengaturan output, lalu menjelaskan video yang ingin dibuat. AI menganalisis aset dan mengumpulkan informasi yang masih kurang melalui pertanyaan satu per satu dengan opsi interaktif dan rekomendasi. Setelah pengguna menyetujui brief serta script/storyboard, sistem membuat video motion melalui HyperFrames, menyimpan setiap versi, dan menyediakan hasil MP4 untuk diunduh.

### Success Criteria

1. Pengguna dapat menyelesaikan alur dari pembuatan proyek hingga mengunduh MP4 tanpa menggunakan editor video manual.
2. Semua render yang berhasil harus mengikuti pilihan tipe video, durasi, rasio, resolusi, bahasa, voice-over, musik, dan caption yang telah disetujui pengguna.
3. Render 6, 10, atau 15 detik selesai dalam waktu maksimal 10 menit sejak job mulai diproses, tidak termasuk waktu antre. Target persentil keberhasilannya masih **TBD** setelah benchmark HyperFrames pada lingkungan lokal dan cloud.
4. Setiap proyek membatasi render ulang pascahasil pertama hingga maksimal tiga kali dan mempertahankan seluruh versi yang berhasil dibuat.
5. Produk mengukur funnel `project_created → brief_approved → render_succeeded → video_downloaded`; target konversi setiap tahap ditentukan setelah baseline uji pengguna tersedia (**TBD**).

## 2. User Experience & Functionality

### User Personas

#### Persona utama — Pemilik UMKM F&B

- Menjual makanan atau minuman melalui WhatsApp, marketplace, media sosial, atau toko fisik.
- Memiliki gambar produk tetapi tidak harus memahami scripting, motion design, editing, atau prompt engineering.
- Membutuhkan video siap unggah untuk promosi dalam format media sosial.

#### Persona sekunder — TBD pasca-MVP

Social media manager dan agensi dapat memakai fondasi yang sama, tetapi kebutuhan kolaborasi, multi-brand, approval tim, dan volume render tinggi tidak termasuk MVP.

### User Flow

1. Pengguna masuk menggunakan sistem autentikasi yang sudah tersedia.
2. Pengguna membuat proyek video baru.
3. Sebelum percakapan dimulai, pengguna memilih:
   - Tipe video: promosi produk, diskon/promo harga, peluncuran produk baru, atau menu/etalase beberapa produk.
   - Durasi: 6, 10, atau 15 detik.
   - Rasio: 9:16, 1:1, atau 16:9.
   - Resolusi: 720p atau 1080p.
   - Bahasa voice-over.
   - Voice-over: aktif secara default dan dapat dimatikan.
   - Musik latar: aktif secara default dan dapat dimatikan.
- Style visual: Bold Pop, Clean Product, Warm Artisan, Premium Dark, atau rekomendasi AI yang dapat diubah pengguna.
4. Pengguna mengunggah beberapa gambar produk dan menyatakan bahwa ia memiliki hak untuk menggunakannya.
5. Pengguna mengirim prompt, misalnya “buat video jualan produk ini.”
6. Sistem memvalidasi dan memoderasi prompt serta file.
7. AI menganalisis gambar dan pesan pengguna untuk menentukan informasi yang sudah tersedia dan yang masih kurang.
8. AI mengajukan satu pertanyaan pada satu waktu. Pertanyaan dapat memakai single-select atau multi-select, menandai opsi yang direkomendasikan, dan tetap menerima jawaban teks bebas.
9. Pertanyaan berikutnya dipilih secara dinamis berdasarkan tipe video, aset, jawaban sebelumnya, serta data yang belum lengkap. Informasi dapat mencakup nama produk, harga, promo, CTA, tujuan pemesanan, audiens, identitas merek, dan gaya visual.
10. Saat kebutuhan sudah cukup, AI menghasilkan ringkasan brief serta script/storyboard terstruktur.
11. Pengguna dapat meminta perubahan melalui chat atau menyetujui brief dan script/storyboard.
12. Setelah persetujuan eksplisit, sistem membuat komposisi HyperFrames dan menjalankan render secara asynchronous.
13. UI menampilkan status job dan hasil render tanpa mewajibkan halaman tetap terbuka.
14. Pengguna memutar dan mengunduh MP4.
15. Pengguna dapat meminta revisi melalui chat. Setiap revisi yang dikonfirmasi membuat versi baru dan menggunakan satu dari maksimal tiga kesempatan render ulang.
16. Pengguna dapat membuka dan mengunduh versi terdahulu serta menghapus proyek.

### User Stories

#### Story 1 — Membuat proyek dan menentukan output

**Sebagai** pemilik UMKM F&B, **saya ingin** memilih tipe dan format video sebelum memulai percakapan **sehingga** AI memberikan pertanyaan dan hasil yang sesuai kanal pemasaran saya.

**Acceptance Criteria:**

- Pengguna dapat memilih empat tipe video: promosi produk, diskon/promo harga, peluncuran produk baru, dan menu/etalase beberapa produk.
- Pengguna wajib memilih satu durasi: 6, 10, atau 15 detik.
- Pengguna wajib memilih satu rasio: 9:16, 1:1, atau 16:9.
- Pengguna wajib memilih 720p atau 1080p.
- Voice-over dan musik aktif secara default tetapi dapat dimatikan secara terpisah.
- Pengguna dapat memilih satu preset style atau menerima rekomendasi AI yang disertai alasan; pilihan tetap dapat diubah melalui chat sebelum approval.
- Sistem hanya menawarkan template dan style pack yang kompatibel dengan tipe, durasi, rasio, resolusi, dan aset proyek.
- Jika voice-over aktif, pengguna wajib memilih bahasa dari daftar bahasa yang didukung.
- Caption disertakan ketika voice-over aktif dan harus sinkron dengan naskah final.
- Sistem menyimpan snapshot pengaturan per versi sehingga perubahan berikutnya tidak mengubah versi yang telah selesai.
- Dukungan nyata HyperFrames untuk seluruh kombinasi rasio dan resolusi diverifikasi melalui technical spike sebelum implementasi render dinyatakan selesai.

#### Story 2 — Mengunggah aset produk

**Sebagai** pengguna, **saya ingin** mengunggah beberapa gambar produk **sehingga** AI dapat memahami produk dan memakai gambar tersebut dalam video.

**Acceptance Criteria:**

- MVP menerima JPEG, PNG, dan WebP.
- Batas jumlah gambar per proyek, total ukuran proyek, dan dimensi minimum/maksimum ditetapkan setelah benchmark storage, vision model, dan renderer (**TBD**).
- Setiap file divalidasi berdasarkan isi aktual, bukan hanya nama file atau header MIME.
- Pengguna wajib mengonfirmasi hak penggunaan aset sebelum file diproses.
- File yang gagal validasi atau moderasi tidak dapat dipakai dalam analisis maupun render.
- Aset hanya dapat dibaca oleh pemilik proyek dan layanan backend/worker yang berwenang.
- UI memperlihatkan status upload, progress, kegagalan, retry, thumbnail, dan aksi hapus.

#### Story 3 — Menyusun brief melalui percakapan adaptif

**Sebagai** pengguna nonteknis, **saya ingin** AI menanyakan informasi yang kurang satu per satu **sehingga** saya tidak perlu menulis prompt lengkap atau memahami struktur creative brief.

**Acceptance Criteria:**

- AI tidak menanyakan kembali informasi yang telah tersedia secara jelas dari prompt, pengaturan, aset, atau jawaban sebelumnya.
- Dalam satu giliran, AI hanya mengajukan satu pertanyaan utama.
- Pertanyaan dapat memiliki opsi single-select atau multi-select, satu opsi bertanda `Recommended` bila rekomendasi dapat dipertanggungjawabkan, dan input “Lainnya”.
- Multi-select mendukung pemilihan lebih dari satu opsi sebelum konfirmasi.
- Rekomendasi harus disertai alasan singkat yang relevan dengan produk atau tipe video; rekomendasi tidak boleh dipilih diam-diam.
- Pengguna dapat menjawab dengan teks bebas, memilih opsi, mengganti jawaban lama, atau meminta penjelasan.
- Sistem menjaga state brief terstruktur secara terpisah dari transkrip chat.
- Pertanyaan wajib bersifat dinamis berdasarkan tipe video. Contoh: video diskon memerlukan detail promo, sementara video menu memerlukan daftar item.
- Sistem tidak melanjutkan ke tahap persetujuan selama field wajib untuk konsep terpilih masih belum tersedia.
- Bila pengguna tidak mengetahui suatu informasi, AI dapat menawarkan alternatif yang tidak mengarang fakta komersial, misalnya menghilangkan harga alih-alih menciptakan harga.

#### Story 4 — Meninjau brief dan storyboard

**Sebagai** pengguna, **saya ingin** memeriksa brief serta script/storyboard sebelum render **sehingga** saya dapat memperbaiki informasi yang salah sebelum proses mahal dimulai.

**Acceptance Criteria:**

- Ringkasan menampilkan sekurang-kurangnya tipe video, tujuan, produk, pesan utama, penawaran, CTA, tujuan pemesanan, gaya visual, rasio, durasi, resolusi, bahasa, voice-over, musik, dan caption.
- Storyboard membagi durasi menjadi scene/beat dengan time range, visual, teks layar, voice-over, caption, aset yang digunakan, musik/SFX, dan transisi.
- Total durasi scene harus sama dengan durasi proyek yang dipilih.
- Pengguna dapat mengubah brief atau storyboard melalui chat tanpa mengedit JSON atau kode.
- Tombol render hanya aktif setelah brief dan storyboard lolos validasi serta pengguna memberi persetujuan eksplisit.
- Persetujuan menyimpan snapshot immutable dari brief, storyboard, prompt version, model, dan pengaturan yang digunakan oleh render tersebut.

#### Story 5 — Menghasilkan video motion

**Sebagai** pengguna, **saya ingin** sistem mengubah storyboard yang disetujui menjadi video motion **sehingga** saya memperoleh video promosi tanpa melakukan editing manual.

**Acceptance Criteria:**

- Sistem menghasilkan proyek/komposisi HyperFrames dari schema storyboard yang tervalidasi; output LLM tidak dieksekusi langsung sebagai kode tanpa validasi dan pembatasan.
- Render berjalan sebagai job asynchronous dengan status minimal `queued`, `preparing`, `rendering`, `succeeded`, `failed`, dan `cancelled`.
- Refresh atau penutupan halaman tidak membatalkan job yang sudah diterima.
- UI menampilkan tahap render, waktu mulai, dan pesan error aman yang dapat ditindaklanjuti.
- Hasil akhir berupa MP4 pada rasio, durasi, dan resolusi yang dipilih.
- Jika voice-over aktif, track voice-over tersedia dan sesuai script yang disetujui.
- Jika musik aktif, musik latar tersedia dan tidak menutupi keterdengaran voice-over.
- Jika voice-over aktif, caption tersedia, terbaca, dan mengikuti timing narasi.
- Hasil tidak memiliki watermark.
- Video dapat diputar dalam aplikasi dan diunduh pemilik proyek.
- Job yang gagal karena gangguan sementara dapat di-retry secara idempotent tanpa membuat versi pengguna ganda.
- Render yang telah mulai diproses ditargetkan selesai maksimal 10 menit; observability harus memisahkan waktu antre dari waktu proses.

#### Story 6 — Merevisi video melalui chat

**Sebagai** pengguna, **saya ingin** meminta revisi menggunakan bahasa natural **sehingga** saya dapat memperbaiki video tanpa memakai timeline editor.

**Acceptance Criteria:**

- Pengguna dapat meminta perubahan pada copy, harga, CTA, style, musik, voice-over, caption, urutan scene, aset, dan pengaturan output selama perubahan didukung MVP.
- AI menampilkan ringkasan perubahan dan storyboard terbaru sebelum render ulang.
- Render ulang hanya dijalankan setelah persetujuan pengguna.
- Setiap proyek memiliki maksimal tiga render ulang setelah render pertama berhasil.
- Render yang gagal karena kegagalan sistem tidak mengurangi kuota revisi.
- Render yang dibatalkan sebelum worker mulai tidak mengurangi kuota revisi.
- Setelah tiga render ulang berhasil dimulai atas persetujuan pengguna, UI menonaktifkan render revisi berikutnya dan menjelaskan batas tersebut.
- Seluruh versi video, snapshot brief, storyboard, dan pengaturannya tetap tersedia.
- Pengguna dapat memutar serta mengunduh versi sebelumnya.

#### Story 7 — Membuka kembali dan menghapus proyek

**Sebagai** pengguna, **saya ingin** proyek tersimpan sampai saya menghapusnya **sehingga** saya dapat melanjutkan percakapan dan mengambil kembali versi video di kemudian hari.

**Acceptance Criteria:**

- Daftar proyek menampilkan judul, thumbnail, tipe, status terakhir, dan waktu pembaruan.
- Membuka proyek memulihkan chat, structured brief, aset, storyboard, status job, dan semua versi video.
- Pengguna hanya dapat mengakses proyek miliknya.
- Penghapusan membutuhkan konfirmasi.
- Penghapusan menghapus atau menjadwalkan penghapusan chat, brief, storyboard, input asset, artefak render, dan output video dari storage.
- Batas waktu penyelesaian penghapusan fisik dan kebijakan backup ditetapkan pada kebijakan retensi (**TBD**).

### Non-Goals

MVP tidak mencakup:

- Editor timeline atau canvas manual.
- Kolaborasi tim, komentar reviewer, dan approval multi-user.
- Template marketplace atau pembuatan template oleh pengguna.
- Input video mentah; MVP berfokus pada beberapa gambar produk.
- Avatar presenter atau talking-head.
- Lip-sync.
- Distribusi langsung ke TikTok, Instagram, YouTube, marketplace, atau WhatsApp.
- Analytics performa iklan atau media sosial.
- Penerjemahan otomatis ke banyak bahasa dalam satu proyek.
- Training/fine-tuning model khusus pengguna.
- Credit charging, billing per render, dan watermark. Sistem kredit yang telah tersedia tidak diintegrasikan pada MVP ini.
- SLA render skala produksi, multi-region rendering, atau distributed rendering penuh sebelum benchmark cloud tersedia.
- Dukungan persona agensi dan social media manager sebagai workflow khusus.

## 3. AI System Requirements (If Applicable)

### Tool Requirements

#### LLM dan provider

- Semua panggilan model dilakukan server-side melalui `apps/backend`; API key tidak pernah dikirim ke browser.
- Provider target adalah 9Router.
- Format API 9Router yang akan dipakai—OpenAI-compatible `/responses` atau `/chat/completions`—harus diverifikasi melalui technical spike. Keputusan akhir dicatat sebagai adapter ID eksplisit; backend tidak boleh menebak format berdasarkan URL.
- Adapter baru harus mengikuti kontrak provider-neutral AI service yang sudah ada: timeout, cancellation, retry terbatas, normalized errors, usage telemetry, structured output validation, dan server-owned task mapping.
- Task minimal untuk fitur ini:
  - `product_analysis`: memahami aset produk.
  - `interviewer`: menentukan pertanyaan berikutnya dan memperbarui brief.
  - `planner`: menghasilkan brief final dan storyboard.
  - `revision_planner`: menerjemahkan permintaan revisi menjadi perubahan terstruktur.
  - `moderation`: moderasi prompt dan metadata; moderasi file dapat membutuhkan provider/tool terpisah.
- Prompt sistem, schema, model, provider profile, dan batas output dikendalikan backend. Pengguna tidak dapat mengirim `instructions`, memilih base URL, atau memilih model secara langsung.

#### Structured output

Semua keluaran yang memengaruhi aplikasi harus menggunakan schema berversi dan divalidasi dengan Zod, minimal:

- `InterviewTurn`: pertanyaan, jenis kontrol, opsi, rekomendasi, alasan, field target, dan kondisi kelengkapan.
- `VideoBrief`: fakta produk, tujuan, penawaran, CTA, order destination, audiens, visual style, serta output settings.
- `Storyboard`: scenes/beats, timing, copy, voice-over, caption, asset references, audio cues, dan transition intent.
- `RevisionPlan`: perubahan yang diminta, bagian terdampak, dan kebutuhan konfirmasi.
- `RenderManifest`: input deterministik untuk renderer tanpa arbitrary executable code.

Jika output tidak valid, sistem tidak boleh mengarang default bisnis seperti harga, diskon, alamat, atau nomor pemesanan. Sistem meminta klarifikasi atau menampilkan error yang dapat dipulihkan.

#### Asset analysis

- Vision model hanya menerima asset internal yang dimiliki pengguna dan sudah lolos validasi.
- Analisis dapat mengidentifikasi kategori produk, warna dominan, kemasan, teks yang tampak, dan kemungkinan komposisi visual.
- Hasil OCR atau analisis visual tidak dianggap fakta final untuk harga, kandungan, klaim kesehatan, promo, atau alamat; pengguna harus mengonfirmasi informasi komersial yang akan tampil.
- MVP harus memperluas batas service saat ini yang hanya mendukung satu gambar per operasi atau mengorkestrasi analisis beberapa gambar secara aman. Pendekatan final ditentukan dalam technical spike.

#### Media generation and rendering

- HyperFrames menjadi render engine untuk komposisi motion.
- Integrasi dibungkus dalam `RenderEngine`/`HyperFramesRenderer` agar proses lokal dapat dipindahkan ke cloud worker tanpa mengubah domain proyek.
- Komposisi harus deterministik dan hanya memakai aset yang dibekukan untuk version tersebut.
- Voice-over memerlukan provider TTS (**TBD**).
- Musik memerlukan katalog berlisensi atau provider generatif dengan hak penggunaan yang jelas (**TBD**).
- Caption diturunkan dari script/timing voice-over yang disetujui dan disimpan sebagai data terstruktur.
- Musik dan voice-over harus melalui mixing rule yang menjaga voice-over tetap jelas; target loudness dan ducking final ditentukan melalui benchmark audio (**TBD**).

### Template, Style Pack, and Deterministic Variation

HyperFrames digunakan sebagai deterministic HTML/CSS/JavaScript renderer, bukan sebagai generator visual acak pada saat render. Sistem membentuk video dari tiga lapisan yang terpisah:

- **Template** menentukan struktur scene, safe area, slot aset, hierarchy teks, dan pola transisi yang diizinkan. Template dipilih dari registry/allowlist berdasarkan tipe video, durasi, rasio, serta jumlah aset.
- **Style pack** menentukan visual language lintas-template: palette, typography, caption treatment, surface, shape, motion energy, dan keluarga transisi. Preset awal MVP adalah `bold_pop`, `clean_product`, `warm_artisan`, dan `premium_dark`.
- **Variant seed** dapat menghasilkan variasi layout, timing kecil, dekorasi, atau pilihan transisi yang tetap berada dalam constraint template. Randomness wajib seeded dan diselesaikan sebelum render sehingga manifest yang sama selalu menghasilkan frame yang sama.

Pengguna dapat memilih style pada setup awal, menerima rekomendasi AI yang disertai alasan, memilih style lain melalui chat, atau meminta penyesuaian yang dapat dipetakan ke variable allowlisted. Rekomendasi tidak boleh dipilih diam-diam. AI boleh merekomendasikan template, tetapi pemilihan template final dilakukan backend dari registry yang tervalidasi; model tidak menulis atau mengeksekusi arbitrary HTML, CSS, atau JavaScript.

`VideoBrief` menyimpan sekurang-kurangnya `styleId`, alasan/referensi pilihan, dan style overrides yang diizinkan. `Storyboard` menyatakan template intent per scene tanpa mengandung executable code. `RenderManifest` menyimpan `templateId`, version template, `styleId`, version style pack, normalized style variables, dan `variantSeed`. Seluruh nilai tersebut menjadi bagian immutable dari version snapshot.

Acceptance criteria tambahan:

- Setup menyediakan pilihan preset style dengan preview ringkas serta opsi rekomendasi AI.
- Pengguna dapat mengganti style melalui chat sebelum approval dan saat revisi.
- Setiap kombinasi template/style yang ditawarkan harus lolos smoke test pada rasio, resolusi, dan durasi terkait.
- Template atau style yang tidak kompatibel dengan pengaturan proyek tidak ditawarkan.
- Render ulang dari manifest dan dependency version yang sama harus menghasilkan output visual yang deterministik.
- Variasi tidak boleh mengubah fakta komersial, isi copy yang disetujui, CTA, harga, urutan wajib, atau total durasi.
- Perubahan style pada revisi membuat version baru dan tidak mengubah hasil video sebelumnya.
- Jika style custom tidak dapat dipetakan ke variable allowlisted, sistem meminta pengguna memilih alternatif yang didukung.

### Evaluation Strategy

#### Dataset evaluasi

Buat benchmark internal minimal 40 skenario sebelum pilot:

- 10 promosi produk.
- 10 diskon/promo harga.
- 10 peluncuran produk.
- 10 menu/etalase beberapa produk.

Dataset harus mencakup gambar bersih, latar ramai, teks pada kemasan, beberapa produk, informasi prompt lengkap, informasi prompt tidak lengkap, Bahasa Indonesia, dan bahasa tambahan yang kelak didukung.

#### Evaluasi interviewer

Untuk setiap skenario, reviewer manusia membuat expected required fields dan daftar fakta yang dilarang untuk dikarang.

- **Field coverage:** seluruh field wajib dikumpulkan sebelum approval.
- **Redundant-question rate:** persentase pertanyaan yang jawabannya sudah tersedia.
- **Unsupported-fact rate:** jumlah fakta komersial yang dibuat tanpa input pengguna; target wajib `0` pada benchmark kelulusan.
- **Conversation length:** jumlah pertanyaan sampai brief siap; baseline dikumpulkan, target final **TBD**.
- **Recommendation relevance:** dinilai reviewer dengan rubrik 1–5; ambang kelulusan **TBD**.

#### Evaluasi brief dan storyboard

- Schema validity harus 100% pada output yang diteruskan ke aplikasi.
- Total timing scene harus tepat sama dengan durasi pilihan.
- Copy, harga, promo, CTA, order destination, dan nama produk harus dapat dilacak ke input/konfirmasi pengguna.
- Storyboard harus memenuhi batas aman teks per scene dan area caption yang ditentukan design system.
- Reviewer menilai kesesuaian pesan, coherence, keterbacaan, serta kecocokan dengan tipe video menggunakan rubrik berversi.

#### Evaluasi hasil video

Automated checks:

- File dapat didekode sebagai MP4.
- Resolusi, aspect ratio, frame rate, audio stream, dan durasi berada dalam toleransi yang ditentukan renderer.
- Tidak ada missing asset, frame kosong tak terencana, teks terpotong, atau caption di luar safe area.
- Voice-over, musik, dan caption hadir sesuai pengaturan.
- Render determinism diuji dari manifest dan dependency version yang sama.

Human review:

- Produk mudah dikenali.
- Pesan utama dan CTA terbaca.
- Motion tidak mengganggu keterbacaan.
- Voice-over dapat dipahami di atas musik.
- Caption sinkron dan tidak menutupi informasi penting.
- Hasil sesuai dengan brief/storyboard yang disetujui.

#### Online metrics

Sistem mencatat tanpa menyimpan rahasia provider atau prompt sensitif di log operasional:

- Project creation rate.
- Brief approval rate.
- Median jumlah pertanyaan.
- Render success/failure rate.
- Queue time dan processing time p50/p95.
- Revision rate dan alasan revisi.
- Download rate.
- Provider token/cost telemetry.
- Kegagalan moderasi dan validasi aset.

Target produk selain batas render maksimal 10 menit tetap **TBD** sampai baseline pilot tersedia.

## 4. Technical Specifications

### Architecture Overview

#### Komponen

1. **Frontend — `apps/app`**
   - Next.js 16.2.9 dan React 19.
   - Halaman daftar proyek, workspace chat, upload manager, settings, brief/storyboard approval, render status, video player, version history, dan download.
   - Mengakses backend melalui authenticated API client; tidak mengakses 9Router atau renderer secara langsung.

2. **Backend API — `apps/backend`**
   - ElysiaJS/Bun.
   - Mengelola autentikasi, otorisasi, project state, chat orchestration, schema validation, approval, revision limits, storage metadata, dan render-job lifecycle.
   - Memanggil provider-neutral AI service dan tidak menyebarkan provider-specific contracts ke route/domain video.

3. **AI orchestration**
   - Memakai fondasi `domain/ai-service`, `application/ai-service`, dan `infrastructure/ai-service` yang sudah ada.
   - Menambahkan adapter OpenAI-compatible untuk format 9Router yang telah diverifikasi.
   - Menyimpan state brief terstruktur di database; transkrip chat bukan satu-satunya source of truth.

4. **Supabase**
   - Supabase Auth untuk identitas pengguna.
   - Postgres untuk proyek, pesan, brief, storyboard, jobs, versions, dan metadata aset.
   - Supabase Storage sebagai target penyimpanan sementara/persisten proyek sesuai keputusan produk: data disimpan sampai pengguna menghapus proyek.
   - Bucket harus private dan akses melalui signed URL berumur pendek atau server proxy.

5. **Render worker**
   - MVP lokal: worker dapat berjalan pada mesin/deployment yang sama, tetapi harus berupa proses/job boundary terpisah dari request HTTP.
   - Deployment berikutnya: worker dipindahkan ke cloud tanpa mengubah public API atau schema job.
   - Worker mengambil immutable render manifest, materializes aset, membangun komposisi HyperFrames, menjalankan validasi, merender MP4, mengunggah hasil, dan memperbarui status job.

6. **Media services**
   - TTS provider: **TBD**.
   - Musik/katalog audio: **TBD**.
   - Moderasi gambar dan teks: **TBD**, dengan interface provider-neutral.

#### Data flow

```text
Browser
  → authenticated Elysia API
  → project/settings + private asset upload
  → moderation
  → vision product analysis
  → interviewer loop
  → structured brief
  → structured storyboard
  → explicit user approval
  → immutable render manifest + queued job
  → local/cloud worker
  → HyperFrames composition + VO/music/captions
  → MP4 upload
  → version record
  → authenticated preview/download
```

#### State machine proyek

Status proyek minimal:

```text
draft
→ interviewing
→ awaiting_approval
→ approved
→ rendering
→ ready
→ revision_draft
→ rendering
→ ready

Any active state → moderation_blocked | failed | deleted
```

Status render job minimal:

```text
queued → preparing → rendering → uploading → succeeded
                  ↘ failed
queued/preparing  → cancelled
```

Transisi harus divalidasi backend dan bersifat idempotent.

#### Data model konseptual

- `video_projects`
- `video_projects` juga menyimpan `style_id` aktif; snapshot version menyimpan `template_id`, template version, style pack version, normalized style variables, dan deterministic variant seed.
  - owner, title, type, current status, selected duration/ratio/resolution, audio toggles, language, revision render count.
- `video_project_assets`
  - owner/project, private object key, MIME, size, dimensions, hash, moderation status, ownership confirmation.
- `video_messages`
  - project, role, content, structured controls/options, timestamp.
- `video_brief_revisions`
  - version, schema version, structured brief, completion status, source message IDs.
- `video_storyboard_revisions`
  - version, schema version, structured scenes, total duration, approval metadata.
- `video_render_jobs`
  - idempotency key, immutable input snapshot, status, attempts, queue/start/finish timestamps, safe error code.
- `video_versions`
  - version number, render job, output object key, duration, ratio, resolution, manifest hash, parent version.
- `video_moderation_events`
  - subject type, provider result, policy version, decision, timestamps; jangan menyimpan raw sensitive payload jika tidak diperlukan.

Nama tabel final dapat menyesuaikan convention repository, tetapi ownership dan version immutability wajib dipertahankan.

### Integration Points

#### Existing AI service

Kondisi repository saat PRD dibuat:

- Backend sudah memiliki authenticated routes untuk text generation dan image assets.
- AI service mendukung task `connection_test`, `interviewer`, `planner`, dan `product_analysis`.
- Implementasi adapter saat ini hanya mendukung `google-generate-content`.
- Structured output, timeout, retry, cancellation, concurrency, asset ownership, dan usage telemetry sudah memiliki fondasi.
- Asset AI saat ini disimpan melalui R2, sedangkan target fitur menurut keputusan produk adalah Supabase Storage.
- Service vision saat ini membatasi satu asset dalam satu operasi.
- Sistem credit dan billing tersedia, tetapi sengaja tidak dihubungkan ke video MVP.

Kebutuhan integrasi:

1. Tambahkan adapter 9Router sesuai endpoint terverifikasi.
2. Tambahkan server-owned structured routes/use cases untuk interview, planning, revision, dan approval; jangan menjadikan generic client instructions sebagai business contract.
3. Rekonsiliasi storage:
   - Target MVP menggunakan Supabase Storage.
   - Implementasikan `SupabaseAssetObjectStore` di belakang interface yang sudah ada atau dokumentasikan migrasi terkontrol dari R2.
   - Hindari menyimpan asset yang sama secara permanen pada dua provider tanpa kebutuhan jelas.
4. Perluas orchestration beberapa gambar tanpa menghilangkan ownership/integrity checks.
5. Hubungkan project ID pada telemetry untuk tracing tanpa membuat AI service bergantung langsung pada tabel video.

#### API surface konseptual

Nama endpoint final mengikuti convention Elysia yang ada. Surface minimal:

- `POST /video-projects`
- `GET /video-projects`
- `GET /video-projects/:projectId`
- `DELETE /video-projects/:projectId`
- `POST /video-projects/:projectId/assets`
- `DELETE /video-projects/:projectId/assets/:assetId`
- `POST /video-projects/:projectId/messages`
- `POST /video-projects/:projectId/approve`
- `POST /video-projects/:projectId/render-jobs`
- `GET /video-projects/:projectId/render-jobs/:jobId`
- `POST /video-projects/:projectId/render-jobs/:jobId/cancel`
- `GET /video-projects/:projectId/versions`
- `GET /video-projects/:projectId/versions/:versionId/download`

Polling dapat digunakan pada MVP. Server-Sent Events/WebSocket untuk progress real-time merupakan optimasi jika polling tidak memenuhi pengalaman pengguna.

#### Authentication and authorization

- Semua project, asset, message, approval, render, preview, dan download endpoints wajib authenticated.
- Setiap query dan mutation diverifikasi dengan `user.id` pemilik.
- Service role hanya digunakan di backend/worker.
- RLS diterapkan sebagai defense in depth pada tabel dan storage objects.
- Signed URL memiliki masa berlaku terbatas dan tidak disimpan sebagai canonical asset reference.

#### HyperFrames

- HyperFrames belum terpasang pada repository dan harus melalui technical spike sebelum estimasi implementasi dikunci.
- Spike harus memverifikasi:
  - Lisensi dan cara instalasi/deployment.
  - API/CLI untuk validasi, preview, dan render.
  - Dukungan 9:16, 1:1, dan 16:9.
  - Dukungan output 720p dan 1080p.
  - Render MP4 dengan voice-over, musik, dan caption.
  - Performa untuk durasi 6, 10, dan 15 detik.
  - Determinism, timeout, cancellation, cleanup, dan exit codes.
  - Resource CPU, RAM, disk, browser/runtime, dan concurrency lokal/cloud.
- Jika batas native renderer berbeda, UI tidak boleh menawarkan kombinasi yang belum lolos validasi teknis.

### Security & Privacy

- Pengguna wajib menyatakan memiliki hak atas setiap aset yang diunggah.
- Prompt dan file dimoderasi sebelum dipakai untuk AI planning atau render.
- Kebijakan kategori terlarang dan mekanisme banding/false positive masih **TBD**.
- Prompt injection dari teks pada gambar diperlakukan sebagai konten tidak tepercaya; instruksi yang terbaca dari aset tidak boleh mengubah system policy atau memicu tool execution.
- Output LLM selalu divalidasi terhadap schema dan tidak dieksekusi sebagai arbitrary JavaScript, shell command, HTML aktif, atau path filesystem.
- Renderer berjalan dalam sandbox/container dengan filesystem sementara, network egress terbatas, batas CPU/RAM/disk, timeout, dan allowlist asset source.
- Nama file pengguna tidak digunakan langsung sebagai path.
- Canonical storage reference menggunakan object key internal, bukan URL publik.
- Secret 9Router, TTS, storage, Supabase service role, dan renderer hanya tersedia server-side.
- Log tidak boleh memuat API key, signed URL, raw file bytes, nomor pemesanan lengkap, atau payload provider mentah.
- Chat, brief, aset, storyboard, serta semua versi video disimpan sampai pengguna menghapus proyek.
- Penghapusan proyek harus menghapus data aplikasi dan object storage terkait; retensi backup dan audit minimal ditentukan sebelum produksi (**TBD**).
- Enkripsi in transit wajib; enkripsi at rest mengikuti Supabase/cloud provider.
- Download dan preview harus memverifikasi ownership setiap kali akses diberikan.
- Rate limit diterapkan pada upload, chat, approval, dan render untuk mencegah abuse walaupun credit charging belum aktif.

## 5. Risks & Roadmap

### Phased Rollout

#### MVP — F&B chat-to-video

- Empat tipe video: promosi, diskon, peluncuran produk, dan menu/etalase.
- Input beberapa gambar JPEG/PNG/WebP.
- Settings awal: durasi 6/10/15 detik, rasio 9:16/1:1/16:9, resolusi 720p/1080p, bahasa, toggle voice-over, dan toggle musik.
- Chat interviewer adaptif dengan pertanyaan satu per satu, opsi interaktif, multi-select, dan rekomendasi.
- Product analysis, structured brief, dan structured storyboard.
- Approval sebelum render.
- HyperFrames local worker dengan target maksimal 10 menit processing time.
- MP4 dengan voice-over, musik, dan caption sesuai settings.
- Download, persistent projects, seluruh version history, dan maksimal tiga render revisi.
- Rights confirmation dan moderasi.
- Tanpa credit charging dan tanpa watermark.

**Exit criteria MVP:** seluruh acceptance criteria prioritas MVP lolos test; 40-scenario AI benchmark dijalankan; seluruh kombinasi output yang ditawarkan lolos render smoke test; keamanan ownership diuji; dan target waktu render diuji pada hardware/deployment yang didokumentasikan.

#### v1.1 — Reliability dan cloud rendering

- Memindahkan worker ke cloud queue/compute.
- Distributed concurrency control, retry policy, dead-letter jobs, dan capacity monitoring.
- Progress update yang lebih real-time.
- Optimasi cache/reuse untuk revisi ringan.
- Integrasi credit charging per render setelah cost model disetujui.
- Penambahan bahasa, voice, dan pilihan musik berdasarkan data penggunaan.
- Automated quality gate sebelum hasil ditampilkan.

#### v2.0 — Workflow profesional

- Input video, logo kit, dan brand kit reusable.
- Template library serta style presets yang lebih luas.
- Kolaborasi tim dan approval multi-user.
- Timeline/canvas editing bila terbukti diperlukan.
- Publish langsung ke kanal pemasaran.
- Batch generation dan multi-variant ads.
- Analytics performa kreatif dan rekomendasi iterasi.

### Technical Risks

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Format API 9Router belum dipastikan | Adapter gagal atau structured output tidak kompatibel | Technical spike untuk `/responses` vs `/chat/completions`, vision, JSON schema, usage, timeout, dan error mapping sebelum implementasi fitur |
| HyperFrames belum terpasang | Ketidakpastian resolusi, performa, dan deployment | Spike render matriks 3 rasio × 2 resolusi × 3 durasi; dokumentasikan hardware dan waktu render |
| Render lokal memblokir API | Timeout HTTP dan aplikasi tidak responsif | Pisahkan render worker/job dari request API sejak MVP walaupun berada pada mesin yang sama |
| Render melewati 10 menit | UX buruk dan biaya compute meningkat | Benchmark scene complexity, timeout, resource limit, progress state, dan pembatasan template/efek MVP |
| Storage target berbeda dari implementasi AI asset saat ini | Duplikasi data dan kompleksitas ownership | Gunakan interface object store; implementasikan adapter Supabase Storage dan satu canonical object key |
| AI service saat ini hanya mendukung satu gambar | Analisis menu/multi-product tidak lengkap | Batch analysis terkontrol atau perluas kontrak multi-asset dengan limit eksplisit dan tests |
| LLM mengarang harga/promo/klaim | Risiko reputasi dan hukum | Provenance per field, explicit confirmation, unsupported-fact evaluation target 0, dan approval sebelum render |
| Arbitrary code dari LLM | Remote code execution pada worker | Render manifest allowlisted; generator deterministik; sandbox; tidak mengeksekusi code mentah model |
| Voice-over dan musik belum memiliki provider | Fitur wajib tidak dapat selesai | Pilih provider dan lisensi pada technical spike; sediakan interfaces dan fixture tests |
| Caption tidak sinkron | Hasil terlihat tidak profesional | Timing dari TTS/alignment, automated duration checks, dan visual safe-area checks |
| Revisi memicu biaya berulang | Biaya provider/compute sulit dikontrol | Batas tiga render ulang, telemetry biaya, idempotency, dan reuse aset; credit charging ditunda tetapi instrumentation diwajibkan |
| Kegagalan job mengurangi revisi pengguna | Pengguna dirugikan | Increment revision count hanya ketika approved rerender benar-benar mulai; system failure tidak dihitung |
| Penghapusan proyek tidak lengkap | Risiko privasi | Cascade deletion workflow, object cleanup queue, reconciliation job, dan audit deletion status |
| Moderasi terlalu ketat atau longgar | False positive atau konten bermasalah | Policy versioning, reason codes, benchmark moderasi, dan mekanisme review **TBD** |
| Render cloud berbeda dari lokal | Hasil atau font/media berubah | Pin dependency, browser, font, codec, HyperFrames version, dan manifest hash dalam container image |

### Open Decisions / TBD

Keputusan berikut belum diberikan atau belum dapat diverifikasi dan tidak diasumsikan dalam PRD:

1. Deadline MVP, jumlah pengguna awal, render per hari, dan budget infrastructure.
2. Target persentil keberhasilan untuk batas processing maksimal 10 menit.
3. Endpoint pasti, model, vision support, dan structured-output behavior 9Router.
4. TTS provider, daftar bahasa awal, pilihan voice, dan hak penggunaan output.
5. Sumber/katalog musik, model lisensi, dan apakah pengguna boleh mengunggah audio sendiri.
6. Provider serta kebijakan moderasi teks/gambar.
7. Batas jumlah file, ukuran total proyek, dan dimensi aset.
8. Kebijakan retensi backup serta batas waktu penghapusan fisik setelah pengguna menghapus proyek.
9. Frame rate output dan toleransi teknis durasi.
10. Target funnel bisnis setelah baseline pilot tersedia.
