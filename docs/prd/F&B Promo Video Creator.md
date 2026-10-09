# Visuala AI — Product Requirements Document

**Version:** 1.0  
**Phase:** 1 — F&B Promo Video Creator  
**Status:** Draft for Implementation  
**Date:** 8 Oktober 2026

## 1. Product Overview

Visuala AI adalah platform untuk menghasilkan video promosi F&B menggunakan AI, reusable visual components, dan Hyperframes sebagai composition/rendering engine.

Pengguna dapat membuat campaign, mengunggah gambar produk, mendapatkan storyboard dari AI, mengubah konten dan visual styling, melihat preview interaktif, kemudian mengekspor video.

**Prinsip produk: Fixed Structure, Dynamic Styling, Editable Content.**

AI membuat keputusan kreatif yang dibatasi oleh design system. AI tidak boleh membuat HTML/CSS arbitrer saat setiap campaign dijalankan.

## 2. Problem Statement

Pengguna F&B membutuhkan video promosi yang menarik, tetapi tidak selalu memiliki kemampuan desain atau editing.

Generator video yang terlalu bebas berisiko menghasilkan desain generik, harga tidak akurat, identitas brand berubah, dan revisi yang mahal.

Visuala menyelesaikan masalah ini dengan komponen reusable yang telah dikurasi, AI planning terstruktur, dan mekanisme preview sebelum final render.

## 3. Goals

1. Menghasilkan satu video promosi F&B dari campaign brief hingga MP4.
2. Menyediakan storyboard yang dapat ditinjau dan diedit.
3. Menghasilkan styling yang sesuai brand melalui design tokens.
4. Menampilkan preview interaktif tanpa perlu render MP4 untuk setiap revisi.
5. Memastikan preview dan video final berasal dari composition yang sama.
6. Memastikan informasi harga, produk, diskon, dan logo selalu akurat.

### Success Metrics (Target Pilot)

- Keberhasilan teknis end-to-end minimal 95% untuk input valid pada dataset QA internal.
- Tidak ada kesalahan kritis pada harga, diskon, nama produk, dan logo.
- Minimal 80% pengguna uji dapat menyelesaikan pembuatan video tanpa bantuan developer.
- Evaluasi visual internal memperoleh rata-rata minimal 4/5.

## 4. MVP Scope

**Included:**
- Campaign brief form.
- Upload product image dan logo.
- AI Storyboard Generation.
- AI Brand Style Recommendation.
- Storyboard Editor.
- Component dan Motion Mapping.
- HTML Composition Builder.
- Interactive Video Preview.
- Validation dan Approval.
- MP4 Render dan Download.
- Draft dan version management.

**Excluded:**
- Full video timeline editor.
- Keyframe animation editor.
- Custom component generation oleh AI.
- AI Visual Critic dan auto-revision.
- Generative video footage.
- Automatic social media publishing.
- Advanced music dan voiceover editing.

## 5. Core User Flow

1. **Create Campaign**  
   User memasukkan nama produk, jenis campaign, detail diskon, CTA, dan aset.

2. **Generate Storyboard**  
   AI membuat empat scene beserta copy dan durasinya.

3. **Edit Storyboard**  
   User mengubah teks, CTA, produk, dan visual style.

4. **Generate Preview**  
   Visuala menyusun komposisi dari existing components dan motion presets.

5. **Review Preview**  
   User dapat play, pause, seek, memilih scene, dan kembali melakukan edit.

6. **Approve & Render**  
   Sistem memvalidasi composition dan melakukan final render setelah persetujuan.

7. **Download Video**  
   Video MP4 tersedia untuk diunduh.

## 6. Storyboard Requirements

Storyboard awal terdiri dari:

| Scene | Timeline | Purpose |
|---|---|---|
| Hook | 0–2s | Menarik perhatian |
| Product Reveal | 2–6s | Menampilkan produk |
| Discount Reveal | 6–11s | Menampilkan promo |
| End Card | 11–15s | Brand dan CTA |

Setiap scene harus menyimpan ID, tipe scene, start time, duration, headline, asset references, dan field konten yang relevan.

### Editing Behavior

User dapat:
- Mengedit headline, subheadline, dan CTA.
- Mengganti product image.
- Memilih visual style/palette yang tersedia.
- Mengembalikan konten scene ke hasil AI awal.
- Menyimpan revisi.

Pada MVP awal, urutan scene dan durasi dikunci agar narasi tetap valid. Editing urutan dan durasi masuk pengembangan berikutnya.

Semua perubahan harus tervalidasi sebelum dapat menjadi composition yang siap di-preview.

## 7. Dynamic Styling Requirements

AI Brand Style Resolver menghasilkan:
- Primary, secondary, accent, background, dan text color.
- Typography preset dari allowlist.
- Background treatment dari preset yang tersedia.
- Visual density preset.

Styling disalurkan ke komponen melalui CSS design tokens.

**Constraints:**
- Tidak boleh mengubah logo dan warna asli gambar produk.
- Tidak boleh menghasilkan custom executable CSS/JS.
- Semua teks penting harus memenuhi persyaratan keterbacaan/kontras.
- Semua token harus tervalidasi dan kompatibel dengan component registry.

## 8. Interactive Preview Requirements

Preview harus mendukung:
- Play dan pause.
- Seek ke waktu tertentu.
- Scene selection.
- Current time dan total duration.
- Preview berdasarkan latest saved composition.
- Penanda preview outdated setelah terjadi perubahan draft.
- Peringatan validasi bila komposisi gagal.

Preview harus menggunakan komposisi HTML Hyperframes yang sama dengan sumber render final.

### Preview Update Flow

User mengedit scene → Save → Validate → Recompose → Check → Update Preview.

Jika composition gagal diperbarui, preview sebelumnya tetap tersedia dengan status **Outdated**, dan final render tidak dapat disetujui hingga error diselesaikan.

## 9. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Create campaign dan upload assets | P0 |
| FR-02 | AI video plan generation | P0 |
| FR-03 | AI style token recommendation | P0 |
| FR-04 | Scene-based storyboard editor | P0 |
| FR-05 | Save dan version management | P0 |
| FR-06 | Component/motion registry mapping | P0 |
| FR-07 | HTML Composition Builder | P0 |
| FR-08 | Interactive preview dan seek | P0 |
| FR-09 | Preview consistency validation | P0 |
| FR-10 | Explicit approval sebelum render | P0 |
| FR-11 | MP4 rendering dan download | P0 |
| FR-12 | Safe retry dan error handling | P0 |
| FR-13 | Scene reorder/duration editing | P1 |
| FR-14 | Campaign types tambahan | P1 |

## 10. Technical Architecture

**Frontend:** Next.js untuk Campaign Form, Storyboard Editor, Preview, dan Render Status.

**Application Layer:** Campaign Service, AI Video Planner, Brand Style Resolver, Storyboard Service, dan validation.

**Composition Layer:** Component Registry, Motion Registry, fixed Scene Mapping, Motion Adapter, dan Hyperframes Composition Builder.

**Preview:** `@hyperframes/player` menggunakan HTML composition yang tervalidasi dan versioned.

**Rendering:** Trigger.dev mengorkestrasi Hyperframes render worker.

**Persistence:** Supabase PostgreSQL dan Supabase Storage.

### Core Data Contracts

- `campaign-brief.json`: fakta bisnis dan asset IDs.
- `video-plan.json`: scene purpose, teks, urutan, dan durasi.
- `style-tokens.json`: warna, typography, dan visual preset.
- `composition-spec.json`: resolved components, variants, motions, dan bindings.
- Hyperframes Project: HTML, CSS, JS, dan local assets.

### Data Model

Tabel minimal:
- `videos`
- `video_versions`
- `video_assets`
- `render_jobs`

Approved versions harus immutable. Perubahan setelah approval harus membuat draft revision baru.

## 11. Business Rules

- Harga dan diskon dihitung atau diverifikasi secara deterministik.
- AI tidak boleh mengarang harga, periode promo, atau klaim produk.
- Setiap scene menggunakan komponen dan motion terdaftar.
- Approval hanya boleh dilakukan jika latest composition sudah tervalidasi.
- Save tidak boleh menimpa perubahan yang lebih baru secara diam-diam.
- Render job menggunakan idempotency key untuk mencegah pekerjaan duplikat.
- Asset harus authorized dan tersedia bagi preview/render worker.

## 12. Acceptance Criteria

Phase 1 dinyatakan selesai apabila:

- Campaign discount dapat dibuat dari input user.
- AI menghasilkan empat scene valid dengan total 15 detik.
- Storyboard editor menyimpan dan menampilkan perubahan.
- Dynamic styling dapat mengubah palette tanpa merusak produk/brand.
- Preview dapat dimainkan, di-seek, dan memperlihatkan revisi terbaru.
- Invalid atau outdated preview tidak dapat di-approve.
- Hyperframes validation berhasil.
- Video final sesuai preview dan dapat diunduh.
- Error rendering tidak menyebabkan hilangnya draft.
- Akses project, asset, preview, dan video dibatasi sesuai owner.

## 13. Implementation Milestones

**Milestone A — Foundation**  
Schema, registry validation, manual scene mapping, motion adapter, dan composition builder.

**Milestone B — Storyboard Editor**  
Create Campaign, Scene List, Scene Editing, Style Selection, Asset Replacement, dan Draft Revision.

**Milestone C — Live Preview**  
Versioned HTML Composition, Hyperframes Player, Playback, Seek, Preview Validation, dan Approval Gate.

**Milestone D — Render**  
Trigger.dev jobs, rendering worker, Supabase upload, download, error recovery, dan pengujian end-to-end.

## 14. Open Decisions

- Apakah musik akan masuk pada MVP pertama? Rekomendasi: mulai tanpa musik.
- Apakah durasi bisa diubah? Rekomendasi: 15 detik fixed pada pilot pertama.
- Apakah user dapat mengunggah foto dengan background? Rekomendasi: boleh, tetapi berikan panduan aset yang lebih optimal.
- Bagaimana aturan pembulatan dan tampilan harga diskon? Harus ditetapkan sebelum produksi.
- Bagaimana masa penyimpanan render dan source bundle? Harus ditetapkan sebelum produksi.

## 15. Definition of Done

Visuala Phase 1 berhasil ketika satu campaign diskon F&B dapat dibuat, diedit, di-preview, divalidasi, disetujui, dan dirender menjadi MP4 secara konsisten melalui library komponen yang sudah tersedia, tanpa membutuhkan manual editing HTML oleh pengguna.

**Kriteria kualitas terpenting:** informasi promo akurat, produk menjadi fokus visual, identitas brand terjaga, gerakan benar-benar berjalan, dan hasil preview sesuai hasil final.