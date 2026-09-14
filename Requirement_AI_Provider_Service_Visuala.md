# Requirement AI Provider Service — Visuala

Versi 1.1 · 12 September 2026 · Penambahan kontrak provider-agnostic dan connection profile

## 1. Tujuan dan posisi pekerjaan

Bangun satu modul backend yang menjadi pintu masuk seluruh panggilan AI di Visuala. Modul ini akan digunakan oleh interviewer dan planner ketika fitur tersebut dikembangkan.

Development aplikasi baru sampai frontend input chat/prompt. Pekerjaan ini adalah fondasi sebelum mengimplementasikan flow bisnis dalam PRD MVP. Hasil tahap ini adalah service yang teruji dan siap dipanggil backend; belum menghasilkan preview video.

Gunakan aplikasi dan stack repo yang sudah ada. Tidak perlu microservice, server terpisah, atau dashboard pengaturan provider.

## 2. Scope

### Wajib pada tahap ini

- Service provider-agnostic dengan satu integrasi provider nyata dan adapter berdasarkan format API.
- Connection profile server-side: format API, endpoint, referensi API key, model ID, dan capability model.
- Input teks, riwayat pesan, dan satu foto produk.
- Output teks serta output terstruktur yang divalidasi schema di server.
- Pemilihan konfigurasi model berdasarkan nama tugas internal.
- Timeout, pembatalan, retry terbatas, dan error dengan format konsisten.
- Catatan penggunaan, latency, jumlah attempt, dan perkiraan biaya bila datanya tersedia.
- Pemeriksaan konfigurasi tanpa panggilan berbayar serta smoke test live yang dijalankan secara eksplisit.
- Contoh pemanggilan internal dan tes untuk skenario kegagalan penting.

### Bukan scope tahap ini

- Prompt bisnis interviewer/planner lengkap, pilihan tiga ide, state machine proyek.
- Preview, Hyperframes, renderer, video/audio/image generation.
- Kredit pelanggan, top-up, pembayaran, atau pricing produk.
- Multi-provider fallback otomatis, model routing dinamis, tool calling/agent loop, vector database.
- Streaming dan abstraksi seluruh fitur semua provider. Mulai dengan respons lengkap non-streaming.

## 3. Keputusan provider dan model

Provider/model belum ditentukan dalam dokumen ini. Audit repo terlebih dahulu:

1. Bila provider sudah dikonfigurasi dan mendukung kebutuhan, gunakan integrasi itu.
2. Bila belum ada, minta keputusan provider kepada developer setelah interface, validasi, dan fixture test selesai dibuat.
3. Jangan mengisi model ID fiktif, mengambil credential dari tempat lain, atau memasang beberapa SDK tanpa kebutuhan.
4. Periksa dokumentasi resmi versi SDK/API yang dipilih saat implementasi. Dukungan gambar dan structured output harus diverifikasi, bukan diasumsikan dari nama provider.

Satu model yang mendukung teks, gambar, dan structured output cukup untuk awal. Konfigurasi model per tugas disediakan agar nanti dapat diganti tanpa mengubah caller.

### 3.1 Kontrak provider-agnostic

Interviewer dan planner hanya menggunakan interface AIService. Tidak boleh ada import SDK provider, conditional berdasarkan merek provider, atau format response provider di kedua caller tersebut.

| Perubahan | Perubahan implementasi yang diizinkan |
| --- | --- |
| Model pada profile yang sama | Ubah model ID dan capability/limit bila berbeda; caller tetap sama |
| Provider dengan format API yang sudah kompatibel | Ubah endpoint, API key, model ID, dan metadata capability; tanpa adapter baru |
| Provider dengan format API berbeda | Tambahkan adapter yang mengimplementasikan kontrak sama dan daftarkan formatnya; caller tetap sama |
| Model tidak mendukung fitur request | Error capability yang jelas; jangan menghilangkan gambar atau schema diam-diam |

Istilah agnostic berarti perbedaan provider berhenti di adapter, bukan jaminan semua endpoint bisa langsung digunakan. Kompatibilitas mencakup autentikasi, operasi API, format pesan/gambar, structured output, response, dan error. Label “OpenAI-compatible” saja tidak cukup: adapter harus menyebut kontrak operasi yang didukung secara spesifik. Jangan mengasumsikan API Chat Completions dan Responses dapat saling ditukar.

Untuk format kompatibel yang sama, developer cukup mengganti endpoint, key, dan model ID setelah format adapter dipilih. Capability dan batas model tetap perlu dikonfigurasi/diverifikasi ketika model berubah. Jangan meng-hardcode hostname vendor sehingga endpoint kompatibel lain selalu membutuhkan perubahan kode.

### 3.2 Connection profile

Sediakan profile bernama, misalnya `primary` dan `alternative`. Satu profile aktif sudah cukup untuk MVP; mendukung beberapa profile tidak berarti membangun fallback otomatis atau memasang semua adapter.

| Field profile | Requirement |
| --- | --- |
| id | Nama internal yang stabil |
| apiFormat | ID format/adapter terdaftar, termasuk operasi API yang digunakan |
| baseUrl | Base endpoint HTTPS dari konfigurasi backend tepercaya |
| apiKeyEnv | Nama environment variable/secret reference; bukan key literal dalam file konfigurasi |
| modelId | ID model dari konfigurasi, tidak tertanam pada caller |
| capabilities | Dukungan teks, gambar, dan native structured output pada profile/model tersebut |
| limits | Batas input/output/foto dan timeout yang didukung |
| providerLabel | Identitas provider untuk usage/pricing, bukan penentu format request |

Contoh konseptual konfigurasi; bukan klaim dukungan provider tertentu:

```yaml
connections:
  primary:
    apiFormat: openai-chat-completions-compatible
    baseUrl: ${AI_PRIMARY_BASE_URL}
    apiKeyEnv: AI_PRIMARY_API_KEY
    modelId: ${AI_PRIMARY_MODEL_ID}
    capabilities:
      text: true
      vision: true
      nativeStructuredOutput: true
tasks:
  connection_test: { connection: primary }
  interviewer: { connection: primary }
  planner: { connection: primary }
```

Nilai capability di contoh adalah kebutuhan target, bukan hasil deteksi. Implementasikan adapter format contoh hanya jika sesuai provider yang dipilih dan dokumentasi resminya. Format lain didaftarkan secara eksplisit, tidak ditebak dari URL.

- Task menentukan profile melalui mapping server. Jika caller internal boleh override profile untuk smoke test, hanya izinkan profile terdaftar; frontend tidak boleh memilih endpoint atau secret.
- Profile alternative opsional. Profile yang tidak digunakan tidak wajib punya credential. Profile yang digunakan tetapi tidak lengkap gagal sebelum network call.
- baseUrl didefinisikan sebagai base path; adapter menyusun path operasi secara konsisten agar tidak terjadi duplikasi path seperti `/v1/v1`.
- Custom endpoint hanya dari konfigurasi operator, dengan host tepercaya dan validasi URL; redirect tidak boleh membocorkan Authorization ke host lain. Jangan menonaktifkan pemeriksaan TLS untuk mendukung endpoint baru.
- Resolve konfigurasi satu kali per operasi. Seluruh retry memakai snapshot profile yang sama agar request tidak berpindah provider ketika konfigurasi berubah.
- Catat profile ID dan model/provider yang dipakai pada usage. Jangan mencatat secret atau query URL yang sensitif.
- Documentasikan bahwa perubahan env/config dapat memerlukan restart/redeploy; hot reload tidak diwajibkan.

## 4. Pembagian tanggung jawab

| Komponen | Tanggung jawab |
| --- | --- |
| AIService | Validasi input, resolve task config, memanggil adapter, validasi output, error normalization, usage |
| ProviderAdapter | Mengubah request internal ke format provider; menerjemahkan response/error/usage kembali |
| ConnectionRegistry + ModelConfig | Mapping task ke profile; resolve adapter, endpoint, secret reference, model, capability, limits, dan timeout |
| AssetResolver | Memastikan foto boleh diakses caller, memvalidasi file, menyediakan bytes/URL yang aman bagi adapter |
| UsageRecorder | Menyimpan metadata request dan setiap attempt tanpa menyimpan secrets |
| Caller, misalnya Interviewer | Menyusun instruksi bisnis dan schema; menangani jawaban dalam flow produk |

Gunakan fasilitas repo yang sudah ada untuk asset, logging, validation, dan persistence. Komponen di atas adalah batas tanggung jawab, tidak semuanya harus menjadi class/file tersendiri.

## 5. Interface internal

Sediakan dua operasi konseptual:

```ts
ai.generateText(request): Promise<TextResult>
ai.generateStructured(requestWithSchema): Promise<StructuredResult<T>>
```

Nama dan tipe final mengikuti bahasa serta framework repo. Ini bukan endpoint publik yang bebas menerima semua parameter dari browser.

### Request

| Field | Aturan |
| --- | --- |
| requestId | ID operasi untuk tracing; tiap attempt punya ID sendiri |
| task | Nama tugas allowlist, misalnya `connection_test`, `interviewer`, `planner` |
| context | userId dari autentikasi server; projectId opsional dan ownership diperiksa |
| instructions | Instruksi tepercaya yang disusun server/caller |
| messages | Urutan user/assistant dengan content teks dan referensi foto yang tervalidasi |
| schema | Hanya untuk generateStructured; schema server-side, memiliki nama/versi |
| promptVersion | Versi instruksi caller untuk melacak perubahan hasil |
| abortSignal | Bila runtime mendukung pembatalan |

Provider, model, API key, base URL, timeout maksimum, dan batas token berasal dari konfigurasi server. Client tidak boleh bebas menentukannya.

### Result

- `requestId`, `providerRequestId` bila tersedia, `provider`, `model` aktual, `attemptCount`.
- `text` pada generateText; `data` tervalidasi pada generateStructured.
- `finishReason` yang dinormalisasi; penolakan/truncation tidak dilaporkan sebagai output terstruktur sukses.
- `usage`: inputTokens, outputTokens, totalTokens; field yang tidak diberikan provider bernilai null, bukan 0.
- `estimatedCost`: amount, currency, pricingVersion/source bila dapat dihitung; null jika tidak diketahui.
- `latencyMs` total operasi; catatan latency per attempt tersedia di UsageRecorder.

SDK response mentah tidak bocor ke UI. Caller tidak perlu memahami format SDK masing-masing provider.

## 6. Requirement fungsional

### AI-01 — Konfigurasi

- API key hanya tersedia di backend. Tidak boleh masuk bundle frontend, response, fixture, atau log.
- Validasi konfigurasi sebelum melakukan network call. API key/model tidak ada → `AI_CONFIG_ERROR` yang jelas.
- `.env.example` berisi nama variabel dan placeholder saja; sesuaikan dengan provider yang dipilih.
- Model config mempunyai capability flag untuk vision dan structured output. Model tidak cocok → `AI_CAPABILITY_UNSUPPORTED` sebelum request terkirim.
- Konfigurasi cukup melalui env/config file; belum perlu tabel pengaturan dan dashboard admin.
- Gunakan connection profile pada bagian 3.2. Penggantian provider yang kompatibel harus dapat dilakukan melalui konfigurasi tanpa menyunting AIService atau caller.

### AI-02 — Teks dan konteks

- Pertahankan urutan pesan dan bedakan instruksi server dari pesan pengguna.
- Validasi pesan kosong, panjang input, dan batas konteks. Jangan diam-diam memotong fakta penting.
- Batas input dan output configurable per task. Jangan mengirim parameter seperti temperature jika model tidak mendukungnya.
- Hindari shared mutable history: konteks request pengguna A tidak boleh terbawa ke B.

### AI-03 — Foto produk

- Terima assetId internal, bukan URL bebas dari browser.
- AssetResolver memeriksa ownership, MIME aktual, ukuran, dan dimensi decode.
- Batas awal usulan: satu foto, JPEG/PNG/WebP, maksimal 10 MB; sesuaikan lagi dengan batas provider yang lebih rendah.
- Kirim bytes atau URL sementara sesuai dukungan provider. Jangan menganggap URL yang hanya dapat diakses aplikasi dapat diakses provider.
- Dilarang mengunduh URL arbitrer, internal network, atau path file dari input pengguna.
- Jangan menulis base64 foto/signed URL ke log. AssetResolver dapat memakai storage existing; membuat sistem upload baru bukan syarat bila sudah tersedia.

### AI-04 — Structured output

- Gunakan fasilitas structured output/schema native provider jika tersedia; tetap validasi hasil dengan schema runtime di server.
- Model/provider yang tidak memenuhi kebutuhan harus gagal jelas; jangan diam-diam kembali ke free-text parsing yang rapuh.
- JSON sintaktis benar tetapi tidak sesuai schema dianggap gagal.
- Tolak hasil truncated, refusal, atau data kosong; jangan menyulapnya menjadi object sukses dengan field default.
- Jangan menggunakan eval, mengeksekusi output, atau menghapus bagian JSON secara sembarangan agar lolos.
- Perbaikan otomatis isi/schema oleh LLM tidak wajib tahap ini. Laporkan `AI_INVALID_OUTPUT`; orchestration repair dapat ditambahkan kemudian dengan budget eksplisit.
- Schema test cukup sederhana, misalnya ringkasan permintaan dan pertanyaan yang masih diperlukan. Ini fixture integrasi, bukan implementasi interviewer bisnis.

### AI-05 — Timeout, retry, dan pembatalan

Default usulan yang configurable: timeout per attempt 30 detik, deadline total 65 detik, maksimal 2 attempt total. Deadline lebih pendek dari batas runtime deployment dan mencakup waktu tunggu retry.

- Retry hanya error sementara yang diketahui aman menurut kontrak provider, misalnya rate limit/transient service error. Hormati Retry-After dan gunakan backoff dengan jitter dalam deadline.
- Tidak retry untuk auth error, input invalid, unsupported model/capability, refusal, atau schema invalid.
- Bila timeout/putus koneksi setelah request mungkin diproses, jangan menjanjikan at-most-once billing. Default tidak auto-retry status ambigu; tandai usage/biaya tidak diketahui.
- SDK retry dan retry service tidak boleh bertumpuk. Tetapkan satu pemilik retry.
- Abort menghentikan attempt dan retry berikutnya sejauh SDK mendukung; abort tidak menjamin provider tidak menagih pekerjaan yang sudah diterima.
- requestId untuk tracing bukan jaminan idempotency provider. Gunakan provider idempotency hanya jika tersedia dan terdokumentasi.

### AI-06 — Error konsisten

Minimal code: `AI_CONFIG_ERROR`, `AI_CAPABILITY_UNSUPPORTED`, `AI_AUTH_ERROR`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_INPUT_INVALID`, `AI_INVALID_OUTPUT`, `AI_REFUSED`, `AI_CANCELLED`.

Setiap error berisi code, safeMessage, requestId, retryable, dan provider status/requestId jika tersedia. Detail teknis sensitif hanya untuk diagnostik server yang sudah disanitasi. Jangan meneruskan error mentah provider ke client.

### AI-07 — Usage dan observability

- Catat per operasi dan per attempt: task, prompt/schema version, provider/model, timestamp, status, latency, token usage, error code, dan provider request ID.
- Simpan metadata dengan mekanisme repo yang sudah ada. Bila tidak ada, buat tabel usage sederhana beserta migrasi.
- Total biaya operasi harus memperhitungkan seluruh attempt; bila salah satu attempt tidak diketahui, tandai total tidak lengkap.
- Perkiraan biaya memakai rate model yang dikonfigurasi dan versioned. Jangan mengasumsikan semua provider hanya menagih input/output token biasa; cached/reasoning/image usage perlu mapping sesuai dokumentasi.
- Default tidak menyimpan prompt, response lengkap, API key, foto, atau signed URL dalam log.
- Usage provider berbeda dari kredit pengguna Visuala. Service ini tidak mengurangi saldo pelanggan.

### AI-08 — Akses dan test harness

- Service hanya dipanggil backend tepercaya. Jangan expose endpoint generate generik tanpa auth dan batas penggunaan.
- Test harness awal berupa command/script internal. Jika diperlukan endpoint dev, batasi ke development/admin dan jangan aktifkan tanpa perlindungan pada production.
- `checkConfig` tidak memanggil provider. `smokeTest` explicit dan dapat menghabiskan token; jangan berjalan pada startup, health check, atau setiap refresh.
- Terapkan batas input/output dan concurrency sederhana untuk mencegah panggilan tanpa batas; gunakan limit existing bila ada.

## 7. Kriteria penerimaan

| Skenario | Bukti kelulusan |
| --- | --- |
| Teks sederhana | Respons live berupa teks, model/request ID/latency tercatat |
| Teks + foto | Request benar-benar menyertakan foto; respons relevan secara visual, bukan fixture |
| Structured output | Data memenuhi schema runtime |
| Output salah/refused/truncated | Error yang sesuai, tidak dianggap sukses |
| API key belum ada/salah | Konfigurasi/auth error jelas; tidak diulang tanpa batas |
| Rate limit/transient | Retry terbatas sesuai deadline, seluruh attempt tercatat |
| Timeout ambigu | Status/biaya unknown tercatat tanpa klaim tidak ditagih |
| Asset pengguna lain | Ditolak sebelum dikirim ke provider |
| Konfigurasi model diubah | Caller tetap memakai interface sama; capability tetap diperiksa |
| Endpoint/key/model diganti ke server dengan kontrak kompatibel | Request menuju profile baru tanpa perubahan caller; uji dengan dua fixture HTTP endpoint, dan live hanya jika tersedia |
| Dua task memakai profile berbeda | Model, credential, usage, dan konteks tidak tertukar |
| Format API belum terdaftar | Gagal konfigurasi sebelum network call; tidak ditebak sebagai format default |
| Tanpa credential saat development | Fixture tests dapat dijalankan, tetapi integrasi live dilaporkan belum teruji |

Tes error/retry/schema memakai fake adapter terkontrol agar deterministik dan tidak menghabiskan token. Live smoke test terpisah dan dijalankan hanya saat credential serta otorisasi tersedia. Hindari assertion jawaban LLM persis sama; periksa schema, keberadaan output, dan relevansi dengan input.

## 8. Deliverables coding agent

1. AIService dan satu ProviderAdapter yang mengikuti repo.
2. Connection registry/profile, mapping model/task, input/output schema, normalized errors, dan contoh cara mengganti endpoint/key/model tanpa mengedit caller.
3. Integrasi AssetResolver dan UsageRecorder dengan komponen existing.
4. Environment example, migrasi bila diperlukan, contoh generateText dan generateStructured.
5. Fixture tests + command live smoke test + README setup.
6. Laporan yang membedakan kode tersedia, fixture test lulus, dan integrasi live lulus.

## 9. Prompt siap pakai untuk coding agent

```text
Implementasikan AI Provider Service untuk Visuala berdasarkan dokumen ini.

Konteks: aplikasi sudah memiliki frontend chat/prompt, tetapi belum tersambung ke proses AI. Fokus tugas saat ini hanya fondasi backend AI Provider Service; interviewer, planner, preview, renderer, dan billing pelanggan dikerjakan setelahnya.

Mulai dengan membaca AGENTS.md serta audit stack, package manager, auth, storage, logging, validation, dan provider configuration yang sudah ada. Lanjutkan repo existing dan pertahankan perubahan pengguna. Jangan membuat proyek atau microservice baru.

Bangun interface internal generateText dan generateStructured, lalu satu adapter provider nyata. Provider/model mengikuti konfigurasi existing yang cocok. Bila belum ada pilihan provider, selesaikan interface, fixture tests, dan wiring yang tidak bergantung credential, kemudian minta pilihan provider; jangan memilih sembarang atau mengarang model ID.

Service wajib provider-agnostic sesuai bagian 3.1–3.2. Caller tidak mengimpor SDK provider. Gunakan named connection profiles berisi apiFormat, baseUrl, apiKeyEnv/secret reference, modelId, capability, dan limits; mapping task menentukan profile. Untuk provider berformat kompatibel, pergantian endpoint, key, dan model harus cukup melalui konfigurasi dengan capability yang diverifikasi. Format berbeda membutuhkan adapter baru melalui registry, tanpa mengubah interviewer/planner. Bedakan kontrak Chat Completions dan Responses; jangan menganggap label OpenAI-compatible menjamin vision atau native structured output. Tidak perlu auto-fallback, hot reload, atau semua SDK sekaligus. Uji pergantian profile memakai dua fixture HTTP endpoint agar translasi request dan pemilihan credential benar-benar teruji.

Verifikasi SDK/API melalui dokumentasi resmi sebelum menulis integrasi. Model harus mendukung teks, gambar, serta structured output. Simpan model config per task di server. Jangan membuka API key, provider URL, system instructions, schema, atau parameter model sebagai pilihan bebas dari client.

Implementasikan validasi input, ownership foto, schema runtime output, normalized errors, timeout/deadline, retry terbatas dengan satu pemilik retry, serta pencatatan usage per attempt. Jangan retry otomatis hasil invalid atau timeout yang status penerimaannya ambigu. Field usage/cost yang tidak diketahui harus null/unknown, bukan nol.

Service tidak memiliki logika bisnis interviewer atau planner. Caller nantinya menyediakan instruksi dan schema server-side. AIService hanya menangani kontrak teknis request/response. Output model tidak boleh dieksekusi sebagai kode.

Gunakan fake adapter untuk tes error/retry agar hemat biaya. Sediakan command checkConfig tanpa panggilan jaringan dan live smoke test explicit untuk teks, teks+foto, serta structured output. Mock tidak boleh diam-diam aktif sebagai fallback production. Jangan melakukan panggilan berbayar jika otorisasi belum tersedia.

Ikuti seluruh kriteria penerimaan dan deliverables dalam dokumen. Setelah implementasi, laporkan file yang berubah, setup/env yang diperlukan tanpa nilainya, test yang benar-benar dijalankan, serta blocker. Jangan menyatakan koneksi provider live berhasil jika hanya diuji dengan fixture. Jika credential belum ada, jangan berhenti sebelum seluruh bagian yang bisa dikerjakan tanpa credential selesai.
```

Dokumen ini menjadi tahap fondasi sebelum PRD_Visuala_FNB_MVP.md. Setelah service lulus, lanjutkan interviewer → planner → compiler/preview → export.
