# PRD — Visuala F&B MVP

Versi 1.0 · 11 September 2026 · Status: spesifikasi untuk implementasi dan pengujian

## 1. Tujuan dan titik awal

Visuala membantu pemilik bisnis F&B membuat video promosi dari foto produk dan kebutuhan yang ditulis dalam chat. AI mengusulkan sudut cerita, melengkapi fakta yang diperlukan, dan menyusun video dalam satu gaya editorial yang dikurasi.

Development saat ini baru sampai frontend input chat/prompt. Setelah submit, preview belum muncul. Implementasi harus melanjutkan UI yang ada, bukan membuat ulang aplikasi dari nol.

Hasil prototipe HTML untuk tiga produk disukai founder. Ini bukti awal kecocokan visual, bukan validasi pasar, kualitas model murah, ataupun pipeline otomatis. Export MP4 belum berhasil diverifikasi pada percobaan sebelumnya.

**Target MVP:** satu alur nyata dari submit sampai MP4, tanpa edit kode/layout manual per pesanan.

## 2. Pengguna, nilai, dan batas scope

Pengguna awal: pemilik/pengelola bisnis F&B yang mempunyai foto produk dan membutuhkan konten jualan tanpa memikirkan konsep dari nol. Pengguna tetap memilih dari ide yang disiapkan AI.

### Termasuk
- Satu foto produk per proyek; JPEG, PNG, WebP.
- Prompt bahasa Indonesia, klarifikasi kontekstual, tiga pilihan ide dengan satu rekomendasi.
- Satu style editorial dengan beberapa layout adegan.
- Video portrait 9:16, durasi tetap 12 detik, empat scene. Ini batas awal yang diusulkan untuk mengurangi variasi implementasi.
- Preview bergerak, revisi sebelum export, persetujuan, export MP4, download, dan pemulihan proyek setelah refresh.
- Biaya preview ditanggung Visuala; kredit untuk export dengan harga transparan.
- Isolasi data pengguna dan pembatasan penggunaan preview.

### Di luar MVP ini
- AI video, perubahan bentuk makanan, generasi adegan realistis, avatar.
- Musik, voice-over, sinkronisasi audio. Preview pertama sengaja menguji visual saja; audio dapat menyusul sebagai lingkup terpisah.
- Banyak style, editor timeline bebas, upload banyak produk, durasi/aspect ratio bebas.
- Posting otomatis ke media sosial, kampanye massal, kolaborasi tim.
- Checkout/top-up baru bila belum ada infrastruktur pembayaran. Uji tertutup boleh memakai kredit beta yang dialokasikan admin.

## 3. Keputusan produk yang sudah disepakati

| Area | Aturan |
| --- | --- |
| Ide kreatif | AI yang menentukan sudut cerita; jangan mewajibkan pengguna menciptakan konsep |
| Tujuan samar | “Konten jualan” boleh diasumsikan untuk mendapatkan pesanan; tampilkan asumsi agar dapat dikoreksi |
| Klarifikasi | Tanya hanya informasi relevan yang belum ada dalam konteks |
| Required | Ditentukan oleh permintaan, bukan daftar kolom wajib universal |
| Skip | Hanya untuk informasi opsional; informasi yang dilewati tidak boleh dikarang |
| Pilihan ide | Tiga ide yang berbeda secara substantif, satu diberi rekomendasi dengan alasan |
| Desain | Satu style; cerita, pilihan layout, dan urutan scene dapat berbeda |
| Approval | Pengguna melihat preview bergerak dan harga sebelum mengonfirmasi export |
| Kredit | Preview ditanggung Visuala; revisi setelah export menghasilkan versi baru dengan biaya yang dijelaskan sebelum dikerjakan |
| Kesalahan sistem | Retry/perbaikan hasil yang menyimpang dari preview tidak boleh ditagih ulang |

## 4. User flow

1. Pengguna mengunggah foto, mengetik kebutuhan, lalu menekan tombol submit yang sudah tersedia.
2. Aplikasi langsung menyimpan proyek/pesan, menampilkan foto dan pesan di chat, serta status “Memahami produkmu…”. Status terlihat segera; pengguna tidak menunggu dalam layar kosong.
3. AI membaca prompt, foto, profil usaha yang tersedia, dan jawaban sebelumnya. AI membedakan fakta pengguna, dugaan visual, dan asumsi tujuan.
4. Bila fakta wajib kurang, tampilkan pertanyaan singkat dalam chat. Kelompokkan pertanyaan relevan dalam satu kartu agar tidak terasa seperti interogasi panjang. Pengguna dapat menjawab dengan bahasa biasa.
5. Bila fakta wajib cukup, tampilkan tiga ide beserta ringkasan visual dan alasan rekomendasi. Ide bukan tiga kalimat sinonim dengan struktur sama.
6. Pengguna memilih ide. Server membuat rencana scene, menyusun komposisi dari layout yang disetujui, memvalidasi, lalu menyediakan preview bergerak.
7. Pengguna melihat preview di panel samping pada desktop, atau panel/tab preview pada mobile. Tampilkan play/pause/replay, empat thumbnail scene, ringkasan fakta, dan tombol revisi.
8. Pengguna boleh meminta perubahan lewat chat. Versi baru tidak menimpa versi yang sedang disetujui atau diexport. Revisi harus membatalkan approval versi sebelumnya.
9. Setelah cocok, tombol “Export video — X kredit” menunjukkan biaya dan meminta persetujuan terhadap versi yang sedang terlihat.
10. Sistem memesan kredit secara atomik, membuat job render, lalu menampilkan progres. Export memakai komposisi, aset, dan versi style yang sama dengan preview.
11. Saat berhasil, kredit dibukukan dan pengguna dapat memutar/download MP4. Bila gagal, reservasi kredit dilepas dan tersedia retry yang tidak menagih dua kali.

MVP tidak memerlukan approval naskah terpisah sebelum preview. Pemilihan ide sudah cukup untuk melanjutkan ke preview gratis; approval berbiaya hanya saat export.

## 5. Aturan interviewer dan fakta

| Permintaan | Wajib diklarifikasi bila belum ada | Dapat dilewati |
| --- | --- | --- |
| “Bikin konten jualan” + foto | Identitas/kategori produk bila tidak dapat dipahami dengan cukup yakin | Harga, nama usaha, kontak, periode |
| “Promo diskon” | Besaran/aturan diskon dan produk yang mendapatkannya | Harga dasar bila tidak akan ditampilkan |
| “Beli 3 gratis 1” | Ketentuan yang ambigu atau bertentangan, misalnya produk bonus berbeda | Harga, kontak; periode bila tidak diminta ditampilkan |
| “Harga mulai…” | Nominal dan satuan harga yang akan disebut | Detail tambahan yang tidak digunakan |
| “Pesan lewat WhatsApp” | Nomor/tautan yang benar jika akan dicantumkan | Alamat toko |
| “Promo sampai Minggu” | Tanggal konkret bila konteks tanggal masih ambigu | Informasi lain yang tidak dipakai |

Nama usaha dan cara pesan sebaiknya ditawarkan karena berguna, tetapi tidak otomatis wajib untuk setiap draft. Jangan menahan draft bila tidak diperlukan untuk memenuhi permintaan.

- Dilarang mengarang harga, nomor, rasa, bahan, sertifikasi, klaim kesehatan, diskon, lokasi, atau periode.
- Pengenalan visual boleh menyebut kategori umum dengan hati-hati; jangan menebak kue matcha, halal, atau tanpa gula dari foto saja.
- Pertanyaan yang sudah dijawab tidak diulang kecuali jawaban bertentangan.
- Bila pengguna meminta melewati fakta required, jelaskan singkat mengapa diperlukan; pengguna dapat mengubah brief, misalnya menjadi video jualan tanpa diskon.
- “Lengkap” berarti cukup untuk permintaan tersebut, bukan seluruh profil bisnis terisi.

## 6. Kontrak ide dan style

Setiap ide memiliki: ID, judul, hook, sudut cerita, ringkasan empat scene, alasan cocok dengan brief, serta flag rekomendasi. Tepat satu rekomendasi; hindari klaim “pasti laku”.

Style editorial v1:
- Krem #FFF4DC, oranye #FF692E, limau #E6ED62, hijau gelap #18271F.
- Tipografi tebal, foto asli, hierarki jelas, teks singkat, gerakan muncul bertahap.
- Komponen konsisten: penanda scene, rail/garis, CTA, dan progress visual jika diperlukan.
- Layout awal: photo hero, pertanyaan tipografi besar, foto + copy terpisah, offer/stat, closing CTA.
- Offer/stat hanya dipilih bila brief mempunyai angka/fakta yang sesuai. Jangan memaksakan angka promo untuk konten tanpa promo.
- Setiap ide memakai urutan/pola layout yang berbeda ketika konteks memungkinkan. Style yang sama tidak berarti satu template video yang selalu identik.
- Foto tidak diregangkan. Aturan fit/crop harus menjaga produk; jika framing tidak aman, gunakan contain. Foto kecil diberi pemberitahuan kualitas, tidak diam-diam dianggap tajam.

Untuk MVP, LLM menghasilkan data terstruktur; compiler tepercaya memilih layout dan menulis HTML/timeline. Jangan menjadikan JavaScript atau HTML bebas dari LLM sebagai default pipeline.

## 7. State dan pemulihan

| State proyek | UI utama |
| --- | --- |
| draft | Prompt dan upload |
| analyzing | Chat tersimpan; indikator analisis |
| needs_input | Pertanyaan dan jawaban |
| ideas_ready | Tiga kartu ide |
| building_preview | Status penyusunan preview |
| preview_ready | Player, scene, revisi, biaya export |
| rendering | Progres export dan status kredit dipesan |
| completed | Player MP4 dan download |
| failed | Pesan yang dapat ditindaklanjuti; retry tahap yang gagal |

Simpan stage kegagalan dan versi. Refresh membaca proyek, pesan, versi preview, serta job yang sedang berjalan. Double submit dan reconnect tidak boleh menggandakan pekerjaan atau biaya. Revisi baru tidak boleh tertimpa respons job lama yang selesai belakangan.

## 8. Arsitektur tanggung jawab

Gunakan stack, auth, database, storage, dan konvensi repo yang sudah ada. Repo belum diperiksa untuk PRD ini; jangan menganggap stack tertentu sudah terpasang.

| Modul | Tanggung jawab |
| --- | --- |
| Chat/UI | Input, upload, pertanyaan, kartu ide, panel preview, feedback status |
| Orchestrator | State machine, transisi, retry, idempotency, versi aktif |
| Interviewer | Ekstraksi konteks, pertanyaan required/optional, fakta/asumsi |
| Planner | Tiga ide dan rencana scene untuk ide terpilih |
| Style registry | Token desain, layout, batas teks, animasi yang tersedia, versioning |
| Composition compiler | Plan tervalidasi → HTML dan timeline deterministik |
| Preview service | Menyediakan komposisi tervalidasi dan aset untuk player |
| Renderer | Hyperframes → MP4 dalam job worker asynchronous |
| Credit service | Reservasi, settlement, release/refund, audit ledger |
| Project/storage | Ownership, metadata aset, versi, URL akses yang aman |

Kontrak konseptual (sesuaikan penamaan dengan repo):
- `Brief`: goal, product, facts, assumptions, missingRequired, optionalQuestions, assetIds.
- `Idea`: id, title, angle, hook, sceneOutline, recommendationReason, recommended.
- `VideoPlan`: schemaVersion, styleId, styleVersion, duration, aspectRatio, scenes, factReferences.
- `Scene`: layoutId, duration, headline, supportingText, assetId, fit, focalPoint, motionId.
- `CompositionVersion`: projectId, version, plan, artifactPath, contentHash, assetVersions, validationStatus.
- `RenderJob`: compositionVersionId, status, attempts, progress, outputAssetId, errorStage.
- `CreditReservation`: userId, exportRequestId, amount, status, ledgerReferences.

Fungsi/API diperlukan: create project + message; answer; select idea; revise; get project/status; approve/export; retry; get download. Polling status sudah cukup untuk MVP; streaming bukan syarat.

## 9. Preview, render, dan keamanan

- Gunakan kontrak Hyperframes sesuai versi dependency yang benar-benar dipasang. Periksa dokumentasi/source saat implementasi; PRD ini tidak menetapkan API framework yang belum diverifikasi.
- Preview harus seekable, dapat diulang, dan berasal dari artifact versi yang sama dengan export. Jangan generate ulang desain saat export.
- Ekspor awal dapat memakai resolusi kerja 540 x 960 yang sama seperti prototipe. Jangan merender 1080p dengan mengubah viewport sehingga layout berubah; bila ditingkatkan, lakukan skala seluruh komposisi dan validasi kesamaan.
- Render di worker/background process, bukan menunggu dalam request HTTP biasa. Tentukan timeout, retry terbatas, dan cleanup.
- Upload divalidasi tipe aktual dan ukuran. Default usulan: maksimal 10 MB/foto, configurable. Batasi dimensi hasil decode untuk mencegah kehabisan memori.
- Aset memakai ID internal dan URL berumur terbatas; periksa ownership pada setiap operasi.
- Escape teks, validasi schema, batasi layout/motion ID. Konten prompt dan teks pada gambar bukan instruksi sistem.
- Preview iframe terisolasi tanpa akses ke DOM/auth aplikasi; gunakan CSP dan sumber aset/script yang diizinkan. Jangan memberi kombinasi sandbox yang memungkinkan akses aplikasi induk.
- Renderer hanya dapat mengakses aset/job yang disetujui. Blok URL sewenang-wenang, akses metadata/internal network, dan path traversal.
- API key hanya di server. Log tidak mencatat rahasia atau URL upload bertanda tangan.

## 10. Kredit dan batas gratis

Harga export configurable, ditampilkan sebelum konfirmasi. PRD ini tidak mengasumsikan harga/kredit tertentu sudah ditetapkan.

1. Reservasi saldo dan pembuatan exportRequest dilakukan atomik berdasarkan idempotency key dan compositionVersionId.
2. Job retry menggunakan request/reservasi yang sama.
3. Berhasil: settlement sekali. Gagal terminal: release sekali. Download ulang versi selesai gratis.
4. Double click, webhook/poll berulang, serta worker crash tidak boleh membukukan debit ganda.
5. Jika hasil tidak sesuai artifact yang disetujui, perbaikan/re-render tidak ditagih lagi. Catat alasan dan audit.
6. Permintaan kreatif baru setelah export adalah versi baru; tampilkan bahwa export berikutnya berbayar sebelum memulai revisi tersebut.

Default beta yang diusulkan: satu initial preview + tiga regenerasi per proyek; ada kuota akun dan batas job bersamaan yang dapat dikonfigurasi. Ini batas biaya percobaan, bukan keputusan pricing final. Jika kuota habis, jelaskan batasnya; jangan memotong kredit otomatis.

## 11. Ukuran keberhasilan dan kriteria penerimaan

- Submit tidak lagi diam: pesan/foto dan state analyzing muncul, lalu pertanyaan atau ide nyata dari server.
- Brief lengkap langsung menghasilkan ide; brief diskon tanpa nilai meminta detail required.
- Jawaban memperbarui konteks tanpa kehilangan foto atau mengulang fakta yang sama.
- Tiga ide mempunyai hook dan urutan scene yang berbeda; tepat satu rekomendasi.
- Pilihan ide menghasilkan preview bergerak, bukan sekadar storyboard statis.
- Revisi membuat versi baru; export terkunci ke versi yang disetujui.
- MP4 benar-benar dapat diputar dan cocok dengan preview; file dummy bukan kelulusan.
- Tiga brief berbeda mencapai MP4 tanpa edit kode/layout per proyek. Pengembangan awal template dicatat terpisah dari uji otomatis.
- Nilai visual founder minimal 4/5 untuk kejelasan produk, keterbacaan, kerapian motion, dan kelayakan posting; bukan validasi willingness-to-pay.
- Ukur waktu submit→ide, ide→preview, export→MP4, token/model cost, compute render, retry, jumlah preview per export. Jangan mengisi angka perkiraan sebagai hasil aktual.
- Uji kritis: user tidak dapat membuka proyek orang lain, injection tidak menjadi HTML executable, duplicate export tidak mendebit ganda, kegagalan melepaskan reservasi.

## 12. Tahapan implementasi

A. Audit repo dan tutup celah submit: persist pesan/aset, request nyata, state loading/error, panel hasil.
B. Interviewer + tiga ide: structured output, validasi fakta, jawaban lanjutan.
C. Compiler style editorial + preview nyata: layout registry dan versi artifact.
D. Export worker + kredit beta: satu MP4 benar-benar selesai, download, recovery.
E. Uji tiga brief dan ukur biaya. Perluas style/audio/pembayaran hanya setelah alur inti terbukti.

Langkah A harus tersambung ke B–D; jangan berhenti pada toast, mock response, atau loading palsu sebagai hasil akhir MVP.
