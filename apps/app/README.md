# Visuala: F&B Promo Video Creator

Buat Video sekarang menggunakan brief campaign, storyboard empat scene, library komponen F&B yang sudah ada, preview tervalidasi, approval, dan render MP4. Implementasi mengikuti [PRD](../../docs/prd/F&B%20Promo%20Video%20Creator.md). Tidak ada pemotongan, pembelian, atau prasyarat credit pada alur creator.

## Alur pengguna

1. Buka **Buat Video**, isi nama campaign/produk/brand, harga asli, diskon, CTA, dan periode promo opsional.
2. Konfirmasi hak penggunaan lalu unggah gambar produk; logo opsional. Format PNG/JPEG/WebP, maksimum 10 MiB per gambar.
3. **Buat storyboard & style** memanggil AI nyata. Model memilih fragmen fakta dan preset yang diizinkan, bukan HTML/CSS/JS atau klaim produk baru.
4. Edit headline, subheadline, CTA, gambar per scene, dan palette preset. **Reset scene** mengembalikan konten AI awal.
5. **Simpan & perbarui preview** membuat revisi dan menjalankan Hyperframes. Perubahan belum disimpan atau revisi invalid memblokir approval; preview valid sebelumnya tetap tersedia.
6. Mainkan, pause, seek, dan lompat antar-scene. Tinjau revisi terbaru, centang konfirmasi, lalu **Setujui revisi ini**.
7. **Render MP4** memproses komposisi revisi yang disetujui. Status, retry untuk kegagalan, dan **Unduh MP4** tersedia di editor.

Output tetap **15 detik, 1080 × 1920, portrait 9:16, 30 fps**, tanpa musik/voiceover. Hook 0–2s, product 2–6s, discount 6–11s, end card 11–15s. Harga rupiah dihitung dengan integer arithmetic dan pembulatan half-up, bukan hasil perkiraan AI.

## Halaman dan data

- `/dashboard`: library campaign milik pengguna, pencarian, status, dan akses editor.
- `/dashboard/videos/new`: brief dan upload.
- `/dashboard/videos/:id`: storyboard, style, revisi, preview, approval, dan hasil render.
- `/api/fnb-campaigns/...`: bridge same-origin; session Supabase diteruskan server-side sebagai `session.access_token`. Request mutasi harus berasal dari origin aplikasi.

`features/fnb/api.ts` memvalidasi respons JSON sebelum dipakai sebagai data domain. API key AI tidak dikirim ke browser. Supabase frontend/backend harus menunjuk instance yang sama; anon key atau key 9Router bukan token sesi pengguna.

Draft lokal dipulihkan melalui session storage, dengan validasi dan basis revisi tetap. Save memakai compare-and-swap: konflik tidak menimpa perubahan server diam-diam atau membuang edit lokal. Mengganti revisi/edit membatalkan konfirmasi review. Mengembalikan versi lama membuat draft lokal untuk disimpan sebagai revisi baru, bukan mengubah approved version.

Brief, video plan, dan style tokens tersimpan dalam JSON draft/version; resolved component/motion/bindings dalam `composition_spec`. Project Hyperframes menyimpan HTML mandiri dengan CSS, authored motion, GSAP, image bytes, dan font WOFF2 yang dibekukan. Player memakai `srcdoc` dan runtime resmi Hyperframes. SHA-256 sumber preview harus sama dengan approved version yang dibaca worker; worker tidak membuat ulang video dari draft terbaru. Hasil render lama tetap dapat diunduh sesudah ada draft baru.

## Menjalankan

Dari root workspace, gunakan pnpm 9.15.4:

```bash
pnpm install
pnpm backend:dev
pnpm app:dev
```

Jalankan dua command dev pada terminal terpisah. Default frontend `http://localhost:3000`, backend `http://localhost:4000`. Pertahankan konfigurasi Supabase yang sudah ada. Jika backend `.env` belum ada, `make -C apps/backend env` menyalin konfigurasi app; file yang ada tidak ditimpa.

Backend perlu Node 22+ untuk CLI Hyperframes, Bun untuk server, Chrome/Chromium beserta native libraries, dan migrasi F&B yang dijelaskan dalam [panduan backend](../backend/docs/chat-video-generator.md). Static FFmpeg/FFprobe disediakan dependency backend. `HYPERFRAMES_BROWSER_PATH` dapat menunjuk executable atau wrapper Chrome yang benar; path mesin lokal tidak boleh dianggap portable.

9Router dikonfigurasi di backend pada `http://127.0.0.1:20128/v1` melalui adapter OpenAI Responses. Gunakan API key/model yang memang tersedia; jangan membuat kredensial atau model pengganti. Koneksi provider tidak menentukan validitas token Supabase.

Development menggunakan renderer lokal nyata. Production menggunakan Trigger.dev dan membutuhkan project reference, secret, worker deployment, dan environment Supabase yang nyata. Task, guarded dispatch leases, stale-job recovery, dan attempt-scoped upload tersedia, tetapi cloud deployment tidak diverifikasi karena kredensial project tidak tersedia. Jangan menganggap `pnpm trigger:deploy` telah dijalankan. Panduan backend mencantumkan command dan prasyarat lengkap.

## Bukti verifikasi

### Audit browser Create Video

- Browser nyata menjalankan registrasi dan konfirmasi email lokal, login, library kosong/terisi, pencarian, brief, upload PNG berlabel placeholder QA, validasi diskon, dan pemulihan draft pada editor.
- Screenshot audit tersedia di `artifacts/create-video-ui-audit/` pada root workspace, termasuk desktop 1440, mobile 320, tablet 768, loading, error, dan editor kosong. Desktop menggunakan scroll internal; screenshot bagian bawah disimpan terpisah.
- Generation nyata pada audit ini gagal dengan `AI request timed out`; koneksi langsung ke `http://127.0.0.1:20128/v1/models` juga timeout. Preview tervalidasi, approval, render, dan download tidak terverifikasi pada audit ini. Bukti keberhasilan historis di bawah bukan hasil audit ini.
- Background login kini memeriksa kemampuan WebGL 2 dan preferensi reduced motion sebelum menginisialisasi animasi. Pada browser tanpa WebGL, login tidak lagi crash; reduced motion menghasilkan nol canvas dan nol error runtime pada smoke.
- Upload tersimpan memiliki status teks di samping thumbnail. Generation memiliki pengumuman loading dan instruksi retry. Editor tanpa storyboard mengarahkan ke generation, bukan instruksi save yang belum tersedia; frame preview kosong dibatasi 160px agar tidak mendominasi panel.
- Tab menampilkan outline lime 2px; Escape menutup menu akun dan mengembalikan fokus. Diskon 101% ditolak validasi native dengan fokus pada field. Approval dan render tetap disabled tanpa preview valid.
- Kontras computed: muted/panel 9,32:1, putih/panel 18,10:1, input putih/hitam 21:1, dan tombol utama hitam/lime 17,51:1. Tidak ada overflow horizontal pada creator 320px; layout juga diperiksa dengan CSS zoom 200%, bukan emulasi browser zoom.
- Loading dan recovery akibat kegagalan jaringan juga diuji dengan mengabort request browser sebelum mencapai provider. Skenario ini hanya membuktikan state UI, bukan keberhasilan generation.
- `pnpm exec tsc --noEmit` dan ESLint pada lima file TypeScript yang berubah lulus. Screen reader, RTL, playback, scene editing, dan worker render tidak diverifikasi pada audit ini.

### Bukti implementasi sebelumnya

- Suite backend: 77 file / 788 tes lulus; suite frontend: 11 file / 101 tes lulus.
- Backend dan frontend `tsc --noEmit` serta ESLint app lulus.
- Generation 9Router nyata, upload Supabase, CAS conflict, akses tanpa auth/beda owner, preview, dan approval telah dijalankan, bukan menggunakan mock provider.
- Worker lokal menghasilkan MP4 H.264 1080 × 1920, 30 fps, 450 frame, tepat 15 detik, tanpa audio. Browser benar-benar mengunduh 723.413 byte; hash bytes cocok dengan output Storage.
- SHA-256 HTML yang dimuat player cocok dengan approved version. Frame end-card sekitar 12,9 detik dibandingkan dengan frame hasil encode; produk, harga, brand, CTA, dan layout sesuai.
- Edit berikutnya disimpan sebagai revisi 7, tervalidasi dan ditampilkan preview, sementara MP4 revisi 6 tetap tersedia. Edit yang belum disimpan memblokir approval/render tanpa menghapus preview lama.
- Smoke PostgreSQL nyata menguji intake paralel, dispatch lease ownership, duplicate worker claim, stale completion, rotated retry attempt, draft baru yang tidak ditimpa worker lama, dan approved-version immutability.
- Kegagalan renderer nyata diikuti retry melalui UI menyelesaikan job ID dan idempotency key yang sama; draft revisi 7 tetap belum disetujui dan download revisi 6 tetap tersedia.
- Pada pengecekan ulang terakhir, generation baru mengembalikan `504 AI_TIMEOUT`; akses langsung port 20128 dari WSL juga timeout. Draft dan output tetap tersimpan. Ini batas konektivitas provider saat pengecekan tersebut, bukan klaim bahwa provider selalu tersedia.
- Hyperframes browser validation berhasil; enam static guidance warnings pada komposisi smoke tidak disamakan dengan error runtime/layout/contrast. Kontras AA dan error audit tetap memblokir approval.
- Oxlint scope implementasi: 33 file, nol error/warning; pass autofix kedua tidak mengubah bytes source. Repo tidak mempunyai command formatter terpisah. Full-repo anti-slop masih melaporkan 1.707 error dan 16 warning pada source legacy/library yang tidak diubah; rules tidak dilemahkan.
- `graphify update .` telah dicoba tetapi executable `graphify` tidak tersedia pada environment ini.

## Anti-slop dan arah visual

Mode **DURING**, dengan arah dari `DESIGN.md`: workspace promo F&B untuk creator, bahasa visual dark/lime Visuala, **ENERGY 2 / RHYTHM 2 / MOTION 1**. Design Read dinyatakan sebelum implementasi frontend.

Alasan keputusan utama:

- Dark chrome menjaga perhatian pada media dan mengikuti identitas creative tool yang sudah ada.
- Lime menandai aksi utama, selection, dan focus, bukan dekorasi setiap panel.
- Brief/storyboard di kiri dan preview/approval di kanan memisahkan editing dari pemeriksaan hasil; mobile menggunakan satu kolom dalam urutan kerja.
- Panel mengelompokkan tugas berbeda, bukan feature-card marketing. Radius input, tombol, dan panel dibedakan.
- Typography operasional yang sudah ada dipertahankan untuk form padat; font video dibekukan agar preview/render tidak bergantung font remote.
- Spacing memisahkan brief, storyboard, style, preview, dan approval; tidak ada section pengisi.
- Ikon yang dipertahankan menunjukkan campaign/create/account; toolbar dekoratif dan footer `href="#"` dihapus dari shell creator.
- Motion aplikasi dibatasi feedback interaksi; motion video berasal dari preset library untuk reveal produk, diskon, dan CTA.

Plugin Oxlint ada di [`tools/oxlint/anti-slop`](../../tools/oxlint/anti-slop), dengan dependency `oxlint` dan `@oxlint/plugins` sama-sama dipin 1.87.0. Generic rules aktif pada severity error; Effect plugin tidak diaktifkan karena tidak ada dependency langsung yang memenuhi syarat. [Provenance](../../tools/oxlint/anti-slop/UPSTREAM.md) mencatat snapshot pristine yang recoverable, bukan commit upstream yang ditebak. Temuan legacy seluruh repo dilaporkan terpisah, tanpa menonaktifkan rule atau melakukan cleanup semantik di luar fitur.

## Delivery Gate: creator UI

Gate berikut ditinjau parent setelah live UI smoke. Cakupan: create/library/editor dan shell yang digunakan creator, bukan audit ulang seluruh billing/auth UI lama. Bukti mencakup click-through live, pengukuran DOM, screenshot desktop/mobile, browser download, dan pemeriksaan sumber. File skill/prototype QA bukan konten produksi.

### Hard Gate

- R-02 PASS: teks UI creator yang diamati tidak berisi em dash; rentang waktu memakai en dash.
- R-03 PASS: desktop 1440, tablet 768, dan mobile 390 diperiksa; tidak ada horizontal overflow atau teks keluar panel.
- R-17 PASS: tidak ada statistik pelanggan/uptime tanpa sumber; durasi, dimensi, harga, dan status berasal dari data nyata.
- R-18 PASS: tidak ada testimonial, avatar pelanggan fiktif, atau jabatan buatan.
- R-23 PASS: logo Visuala/library milik repo digunakan ulang; media berasal dari upload berizin, bukan aset brand baru yang dibuat diam-diam.
- R-24 PASS: navigation creator menuju halaman nyata; footer ghost links dan default Profile Settings yang tidak punya halaman tidak ditampilkan.
- R-25 PASS: computed muted-text contrast 9,32:1 dan white-text 18,10:1 pada panel; focus 15,09:1, primary-button 17,51:1; Hyperframes contrast audit tidak menemukan kegagalan AA pada smoke approved.
- R-26 PASS: form, upload, scene controls, style dropdown, save, version switch, player, approval, render, retry, dan download memiliki perilaku nyata; tidak ada tombol dekoratif.
- R-27 PASS: empty library/search, loading preview/save/render, validasi form, failed composition, dan provider/error recovery memiliki feedback serta mempertahankan draft.
- R-28 PASS: tidak ada FAQ template pada creator.
- R-32 PASS: keyboard mengubah seek ke 11,01s; menu account fokus ke Logout, Escape menutup dan mengembalikan focus; outline terlihat 2px, target kontrol feature aktif minimal 44px pada mobile.
- R-33 PASS: perubahan ditulis dalam source components/styles, bukan script eksternal yang menambal CSS/source saat runtime.
- R-34 PASS: tidak ada theme toggle setengah jadi; tema dark yang dikirim diperiksa secara nyata.
- R-35 PASS: app dijalankan dan click-through direkam untuk brief/upload/edit/reset/style/version/review/approval/play/pause/seek/render/download/search; MP4 benar-benar diunduh dan diperiksa ffprobe.
- R-36 PASS: tidak ada klaim compliance, keamanan absolut, performa, atau pelanggan yang dibuat-buat; hasil pemeriksaan dan batas cloud/provider dinyatakan terpisah.
- R-37 PASS: arah `DESIGN.md` dan Design Read dark/lime ENERGY 2 / RHYTHM 2 / MOTION 1 mendahului penulisan frontend.
- R-38 PASS: tidak ada tim, fitur dummy, ghost navigation, atau konten pelanggan fiktif pada creator; campaign QA jelas fixture dan dibersihkan sesudah smoke.

### Purpose-Gate

- R-01 PASS: tidak ada gradient/glow default pada app chrome; palette/background video berasal dari preset yang membingkai produk.
- R-04 PASS: ikon terbatas pada navigasi dan aksi sesuai fungsi; tidak ada sparkle/robot/magic sebagai feature identity.
- R-06 PASS: alasan typography ditulis di atas; label form normal, tanpa terminal aesthetic atau tracking marketing.
- R-07 PASS: app tidak memakai grid/dot/blueprint background dekoratif.
- R-08 PASS: CTA menyebut aksi dan tidak memakai panah pada setiap tombol.
- R-09 PASS: status/revisi menyampaikan state nyata, bukan badge AI Powered/Beta/Secure yang mengulang headline.
- R-10 PASS: tidak ada tumpukan glassmorphism; panel memiliki permukaan solid.
- R-12 PASS: panel memakai border/grouping, bukan large-shadow pada seluruh komponen.
- R-13 PASS: accent/focus tunggal, tanpa glow serentak di kartu, tombol, dan background.
- R-14 PASS: brief, storyboard, style, preview, dan approval punya struktur sesuai tugas, bukan kartu feature identik.
- R-19 PASS: motion app sesuai MOTION 1; animasi video mempunyai tujuan reveal yang diminta PRD dan bergerak dalam smoke.
- R-22 PASS: tidak ada ilustrasi generic blob; produk berasal dari file upload dan preview adalah hasil komposisi nyata.

### Liveliness

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 dinyatakan dan mengikuti arah yang ada.
- Consistency PASS: hierarchy dark/lime, panel operasional bervariasi, dan feedback interaksi konsisten pada create/library/editor.
- Focal point PASS: media preview atau aksi tahap aktif menjadi fokus; approval/render dikunci saat draft/preview belum siap.
- Whitespace PASS: gap panel dan kelompok field membatasi tahap kerja; mobile tetap mengikuti urutan yang sama.
- Accent PASS: lime dipakai pada selection, aksi, dan keyboard focus; surface lain tetap netral.
- Identity motif PASS: portrait product canvas, scene timing tetap, dan dark/lime workspace mengikat interface pada promo F&B.
- Design Read PASS: deklarasi workspace F&B dark/lime dengan dials 2/2/1 ada sebelum edit frontend pertama.

### Craftsmanship & Quality Locks

- C-1 PASS: alasan warna/layout/type/spacing/panel/icon/motion ditulis, bukan karena default model.
- C-2 PASS: controls creator menjalankan operasi nyata; fake search/settings/notification chrome dan footer ghost links tidak dipakai.
- C-3 PASS: section mengikuti brief, storyboard, style, preview, approval, dan render, bukan template landing page.
- C-4 PASS: empty/loading/error, draft recovery, desktop/tablet/mobile, dan keyboard diperiksa; invalid revision mempertahankan preview/output sebelumnya.
- C-5 PASS: harga, revision/status, source identity, dan MP4 metadata berasal dari input/persistence/hasil pemeriksaan, bukan klaim buatan.
- R-05 PASS: composition workspace dibangun untuk editing dan review, bukan hero + feature cards, fake stats, atau footer template.
- R-11 PASS: panel, input, dan tombol memakai radius berbeda; tidak semua elemen pill-shaped.
- R-15 PASS: CTA spesifik: Buat storyboard & style, Simpan & perbarui preview, Setujui revisi ini, Render MP4, Unduh MP4.
- R-16 PASS: tidak ada buzzword marketing AI Powered/Seamless/Revolutionary pada copy creator.
- R-20 PASS: portrait F&B stage, timing scene, palette milik campaign, dan workflow price/discount menjaga identitas fungsi, bukan generic dashboard demo.
- R-21 PASS: dark default mengikuti creative-tool direction yang sudah ada; tidak ada theme requirement yang ditunda.
- R-29 PASS: chrome memakai neutral + lime; swatches/media menampilkan palette campaign sebagai data, bukan lima accent UI yang bersaing.
- R-30 PASS: identitas Visuala yang ada dipertahankan; tidak dibuat clone Linear/Vercel/Stripe/Notion.
- R-31 PASS: setiap keputusan visual utama memiliki alasan satu baris pada bagian arah visual.
