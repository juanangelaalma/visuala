# Create Video: hasil audit browser

## Status

UI cukup jelas dan konsisten dengan dark/lime Visuala. Empat masalah yang terbukti sudah diperbaiki. Audit awal terhalang timeout 9Router; retry berikutnya berhasil menjalankan generation nyata, preview, perubahan style, approval, render, dan download MP4 di browser. Tidak ada mock generation atau output MP4 pengganti.

Arah: workspace creator promo F&B, ENERGY 2 / RHYTHM 2 / MOTION 1. Dark chrome memusatkan perhatian pada media; lime menandai aksi dan fokus; panel memisahkan editing, review, dan output. Radius, font operasional, dan spacing yang ada dipertahankan. Frame kosong diperkecil karena belum ada media untuk diperiksa.

## Temuan dan perbaikan

| Prioritas | Lokasi | Bukti sebelum | Perbaikan dan bukti sesudah |
| --- | --- | --- | --- |
| HIGH | `apps/app/features/auth/components/Hyperspeed.tsx:1337` | Inisialisasi renderer membuat login crash pada browser tanpa WebGL. | Pemeriksaan kemampuan WebGL 2 dan reduced motion sebelum inisialisasi. Login berhasil dipakai untuk autentikasi; reduced motion: nol canvas dan nol error runtime. |
| MEDIUM | `apps/app/features/fnb/BriefForm.tsx:48` | Upload berhasil dan thumbnail tampil, tetapi native input kembali ke “No file chosen”. | Status “Gambar produk tersimpan” menjelaskan bahwa asset tetap tersedia dan file baru menggantikannya. Terlihat setelah navigasi/reload. |
| MEDIUM | `apps/app/features/fnb/CreateCampaign.tsx:91-92` | Loading hanya memakai label tombol; error belum menyebut aksi retry. | Pengumuman status proses serta instruksi mencoba lagi, dengan draft tersimpan tetap dapat dibuka. Diuji dengan request browser yang ditahan lalu diabort. |
| MEDIUM | `apps/app/features/fnb/CampaignPreview.tsx:110-111`, `creator.css:61`, `CampaignEditor.tsx:282` | Editor tanpa storyboard meminta save yang belum tersedia, sementara frame portrait kosong mendominasi panel. | Instruksi mengarah ke Buat storyboard & style; frame kosong 160px. Approval/render tetap disabled sebelum preview valid. |

## Bukti screenshot

- [Login desktop](00-login-desktop.png), [login mobile](00-login-mobile-320.png).
- [Library desktop](01-library-desktop.png), [library mobile](01-library-mobile-320.png), [pencarian kosong](01-library-search-empty.png).
- [Create desktop](02-create-desktop.png), [bagian bawah desktop](02-create-desktop-bottom.png), [create mobile](02-create-mobile-320.png).
- [Editor desktop](03-editor-desktop.png), [bagian bawah desktop](03-editor-desktop-bottom.png), [editor mobile](03-editor-mobile-320.png), [tablet](03-editor-tablet-768.png), [CSS zoom 200%](03-editor-zoom-200.png).
- [Loading mobile](04-generation-loading-mobile.png), [error jaringan mobile](05-network-error-mobile.png). Request generation pada dua screenshot ini ditahan lalu diabort untuk menguji UI; bukan respons sukses provider.
- [Crash login sebelum fix](omp-sshots-159f25bdca5d26cf.webp), [login setelah capability guard](omp-sshots-159f2631785d26d0.webp), [library awal kosong](omp-sshots-159f2666ff9d26d1.webp), [timeout generation nyata](omp-sshots-159f271ad05d26d6.webp).

Desktop menggunakan main dengan scroll internal, sehingga screenshot atas dan bawah dipisahkan. Fixture gambar bertuliskan “GAMBAR UJI QA” dan “Placeholder, bukan foto produk”; bukan penilaian estetika video produk nyata.

## Verifikasi

- Registrasi, konfirmasi lewat inbox lokal, login, logout mobile, library, pencarian, form dan upload benar-benar dijalankan.
- Harga Rp 25.000 dengan diskon 20% menampilkan Rp 20.000. Diskon 101% ditolak dan fokus berpindah ke field diskon tanpa menghapus brief.
- Draft dan gambar pulih saat navigasi ke editor dan reload. Muat status dijalankan dengan keyboard Enter.
- Tab pada form menampilkan outline lime solid 2px dengan offset 4px. Escape menutup menu akun dan mengembalikan fokus ke trigger.
- Creator 320px tidak memiliki elemen melampaui viewport pada pemeriksaan DOM. Desktop 1440, tablet 768, dan CSS zoom 200% diperiksa. CSS zoom bukan bukti browser zoom native.
- Kontras terukur dari computed styles: muted/panel 9,32:1; putih/panel 18,10:1; input putih/hitam 21:1; hitam/lime 17,51:1.
- `pnpm exec tsc --noEmit` dan ESLint pada lima file TypeScript yang berubah lulus.
- Generation nyata: `AI request timed out`. `curl --connect-timeout 3 --max-time 5 -I http://127.0.0.1:20128/v1/models`: connection timeout.

## Retry provider dan penyelesaian end-to-end

- Endpoint `http://127.0.0.1:20128/v1/models` kini merespons HTTP 200. Listener proses 9Router terlihat pada `0.0.0.0:20128`; request structured-output nyata dengan konfigurasi backend berhasil memakai `cx/gpt-5.6-luna`.
- Campaign QA yang sama menghasilkan revisi 1 dengan empat scene, `validated: true`, dan tanpa validation errors. Setelah palette diganti ke Night Market melalui UI, save menghasilkan revisi 2 yang tervalidasi.
- Play, pause, scene jump, dan seek melalui keyboard Home/End dijalankan. Reset scene mengembalikan headline setelah edit sementara. Memilih preview revisi 1 menonaktifkan render revisi terbaru tetapi tetap menyediakan download hasil revisi 2.
- Revisi 2 disetujui melalui checkbox review dan tombol approval. Worker render selesai dengan `status: completed` dan `error: null`.
- Browser mengunduh `QA browser promo kopi-r2.mp4` hingga event `completed`, sebanyak 1.157.859 byte. FFprobe membuktikan H.264, 1080 × 1920, 30 fps, 450 frame, tepat 15 detik, tanpa stream audio.
- SHA-256 HTML yang dimuat player sama dengan `compositionHash` approved revision 2. Frame MP4 pada detik 13 diperiksa dan sesuai dengan end card preview: brand, produk QA, Rp 20.000, periode promo, dan CTA.
- Editor hasil generation pada lebar 390px tidak memiliki horizontal overflow pada pemeriksaan DOM.
- Penyebab timeout awal yang terbukti sebatas endpoint tidak dapat dijangkau saat percobaan awal. Kini endpoint dan generation berfungsi tanpa perubahan konfigurasi key/model. Tidak ada bukti untuk menyimpulkan mengapa proses provider sebelumnya tidak merespons.

Bukti tambahan:

- [Editor hasil generation desktop](06-generated-editor-desktop.png), [mobile](10-generated-editor-mobile.png).
- Preview scene: [hook](07-preview-hook.png), [product](07-preview-product.png), [discount](07-preview-discount.png), [end card](07-preview-end-card.png).
- [Approval](08-approved-desktop.png), [render berjalan](09-render-status-desktop.png), [download tersedia desktop](11-download-ready-desktop.png), [mobile](11-download-ready-mobile.png).
- [Frame MP4 asli pada detik 13](12-rendered-end-card.png), [MP4 hasil download browser](QA%20browser%20promo%20kopi-r2.mp4).


## Delivery gate terbatas

- PASS, layout jalur terjangkau: 320px tanpa horizontal overflow; field dan kontrol tetap dapat dijangkau.
- PASS, keterbacaan pasangan utama: rasio measured melampaui AA.
- PASS, state dan recovery yang diuji: empty, loading, network error, validasi form, dan draft recovery tersedia.
- PASS, arah dan identitas: dark/lime mengikuti DESIGN.md, dengan hierarchy task-based dan preview kosong yang tidak mendominasi layar.
- PASS, skenario end-to-end utama: generation nyata, scene reset, perubahan style/save, playback/pause/seek, approval, render worker, dan download browser selesai. Retry worker yang gagal tidak dijalankan pada retry provider ini.
- BELUM TERVERIFIKASI: screen reader, RTL, WebGL pada GPU yang mendukung, dan browser zoom native.

Verdict: skenario utama Create Video lulus end-to-end pada campaign QA. Pemeriksaan estetika output memakai gambar placeholder QA, bukan foto produk nyata; screen reader, RTL, dan retry worker masih di luar bukti audit ini.

`graphify update .` dicoba setelah perubahan, tetapi executable `graphify` tidak tersedia. Graph tidak diperbarui pada sesi audit ini.
