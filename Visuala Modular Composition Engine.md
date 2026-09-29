# PRD — Visuala Modular Composition Engine MVP

**Versi:** 0.3  
**Status:** Simplified MVP  
**Tujuan:** Mengganti worker video lama Visuala dengan composition engine berbasis AI + HyperFrames.

---

## 1. Ringkasan

Visuala akan menggunakan AI untuk menyusun video promosi dari brief pengguna dengan memanfaatkan:

- Video Recipe
- Design Pack / `frame.md`
- HyperFrames Catalog
- Visuala Internal Modules
- AI Composition Planner
- Composition Validator
- HyperFrames Renderer

AI tidak menghasilkan HTML/CSS/JavaScript secara bebas.

AI menghasilkan **Composition Spec terstruktur** yang kemudian divalidasi dan dikompilasi oleh sistem menjadi composition HyperFrames.

Alur utama:

```text
Brief + Assets
        ↓
Video Recipe
        ↓
Design Pack
        ↓
Art Direction
        ↓
Search HyperFrames Catalog
        ↓
Inspect kandidat
        ↓
AI Composition Planner
        ↓
Composition Spec
        ↓
Validation
        ↓
Compiler
        ↓
HyperFrames Composition
        ↓
Visual Check
        ↓
Preview
        ↓
User Approval
        ↓
MP4
```

Worker baru akan menggantikan worker lama setelah flow ini stabil.

---

# 2. Sasaran MVP

Visuala harus dapat:

1. Menerima brief dan asset pengguna.
2. Memahami jenis video yang ingin dibuat.
3. Menentukan konsep visual berdasarkan brief.
4. Menggunakan Design Pack untuk menjaga style.
5. Menemukan block/component relevan dari HyperFrames Catalog.
6. Menggabungkannya dengan modul internal Visuala.
7. Menghasilkan Composition Spec yang terstruktur.
8. Memvalidasi composition sebelum render.
9. Menghasilkan preview.
10. Menggunakan composition yang sama untuk menghasilkan MP4 final.

Target utama MVP bukan membuat jumlah variasi sebanyak mungkin.

Targetnya adalah membuktikan bahwa:

> Visuala dapat menghasilkan video promosi yang menarik dari brief pengguna tanpa bergantung pada satu template layout tetap.

---

# 3. Non-Goal MVP

Fitur berikut tidak termasuk MVP:

- Editor timeline manual.
- Directed revision berbasis natural language.
- AI membuat module/component baru.
- Human review workflow untuk module AI.
- Sandbox module factory.
- Automatic catalog refresh.
- Catalog cache system.
- Composition anti-repetition.
- Multiple concept generation.
- Marketplace component.
- Arbitrary HTML/JS dari prompt user.
- Compatibility dengan worker lama.

---

# 4. Input Pengguna

Minimal input:

```text
Nama produk
Jenis promosi
Deskripsi produk
Asset produk
CTA
Durasi
Aspect ratio
Style
```

Contoh:

```text
Produk:
Julumpia

Jenis:
Discount Promo

Promo:
Diskon 20%

CTA:
Pesan sekarang

Asset:
julumpia.png

Durasi:
12 detik

Aspect Ratio:
9:16

Style:
warm_artisan
```

Planner hanya boleh menggunakan fakta yang tersedia dari brief.

Data yang tidak diberikan pengguna tidak boleh dikarang.

---

# 5. Video Recipe

Video Recipe menentukan kebutuhan dasar berdasarkan jenis video.

Recipe awal MVP:

```text
product_promo
discount_promo
product_launch
menu_showcase
storefront_showcase
```

Recipe bukan template visual tetap.

Recipe hanya mendefinisikan:

- tujuan video
- informasi wajib
- beat / urutan pesan
- jenis module yang mungkin dibutuhkan
- durasi
- aspect ratio
- constraint tertentu

Contoh:

```yaml
id: discount_promo

required:
  - productName
  - discount
  - productAsset
  - cta

recommended_modules:
  - ProductHero
  - Headline
  - OfferBadge
  - CTA

duration: 12

aspect_ratio: 9:16
```

---

# 6. Design Pack

Design Pack menentukan bahasa visual video.

Satu Design Pack minimal memiliki:

```text
frame.md
manifest.json
```

Opsional:

```text
design.md
frame-showcase.html
```

`frame.md` digunakan oleh AI untuk memahami style.

`manifest.json` digunakan sistem untuk nilai terstruktur seperti:

```json
{
  "styleId": "warm_artisan",
  "version": "1",
  "colors": {},
  "typography": {},
  "spacing": {},
  "motion": {}
}
```

Design Pack menentukan antara lain:

- warna
- tipografi
- spacing
- bentuk
- photo treatment
- mood
- motion preference
- visual constraints

## Penyimpanan

### Design Pack bawaan Visuala

Disimpan bersama source/deployment worker.

Contoh:

```text
design-packs/
  warm_artisan/
    v1/
      frame.md
      manifest.json
```

### Design Pack milik customer

Disimpan pada Supabase Storage.

Contoh:

```text
design-packs/
  {tenantId}/
    {styleId}/
      {version}/
        frame.md
        manifest.json
```

Design Pack tetap memiliki version agar composition lama tetap merujuk style yang sama.

---

# 7. Art Direction

Setelah menerima brief dan design pack, AI menghasilkan Art Direction.

Art Direction berisi:

```json
{
  "mainMessage": "Diskon 20% Julumpia",
  "visualFocus": "product",
  "hierarchy": [
    "product",
    "discount",
    "cta"
  ],
  "mood": "warm artisan",
  "imageTreatment": "large product close-up",
  "motionDirection": "soft but energetic",
  "beats": [
    "product reveal",
    "offer reveal",
    "cta"
  ]
}
```

Art Direction menjadi panduan Composition Planner.

---

# 8. HyperFrames Catalog

Visuala menggunakan:

```bash
npx hyperframes catalog --json > catalog.json
```

`catalog.json` menjadi sumber discovery component HyperFrames.

Pada MVP, file ini dapat diperbarui secara manual.

Tidak diperlukan scheduler atau automatic refresh.

---

# 9. Catalog Search

AI tidak menerima seluruh `catalog.json` dalam prompt.

Visuala menyediakan operasi:

```text
searchCatalog()
inspectCatalogItem()
```

Contoh:

```text
searchCatalog(
  query = "product reveal"
)
```

Hasil:

```json
[
  {
    "id": "product-reveal",
    "type": "block",
    "description": "...",
    "duration": 4
  }
]
```

AI kemudian dapat melakukan:

```text
inspectCatalogItem("product-reveal")
```

untuk melihat metadata lebih lengkap.

Yang diperiksa antara lain:

- type
- duration
- dimensions
- variables
- assets
- dependencies
- compatibility

---

# 10. Visuala Internal Modules

Visuala tetap memiliki module sendiri untuk kebutuhan yang sangat umum.

Module awal:

```text
ProductHero
Headline
SupportingCopy
OfferBadge
Price
BrandMark
CTA
BackgroundTexture
```

Module tersebut mempunyai slot semantik dan constraint.

Contoh:

```json
{
  "id": "OfferBadge",
  "slots": {
    "text": "20% OFF"
  }
}
```

AI boleh memilih dan mengombinasikan:

```text
HyperFrames Catalog Component
+
Visuala Internal Module
```

---

# 11. AI Composition Planner

Composition Planner bertanggung jawab menyusun video.

Input:

```text
Brief
Video Recipe
Art Direction
Design Pack
Catalog Candidates
Visuala Modules
```

Output:

```text
Composition Spec
```

AI tidak menghasilkan executable code.

---

# 12. Composition Spec

Contoh sederhana:

```json
{
  "schemaVersion": "1",
  "format": {
    "aspectRatio": "9:16",
    "fps": 30,
    "durationSeconds": 12
  },

  "style": {
    "id": "warm_artisan",
    "version": "1"
  },

  "scenes": [
    {
      "id": "scene_1",
      "durationFrames": 90,

      "modules": [
        {
          "id": "ProductHero",
          "content": {
            "assetId": "asset_1"
          }
        },

        {
          "id": "Headline",
          "content": {
            "text": "Julumpia"
          }
        }
      ]
    },

    {
      "id": "scene_2",
      "durationFrames": 90,

      "modules": [
        {
          "id": "OfferBadge",
          "content": {
            "text": "20% OFF"
          }
        }
      ]
    }
  ]
}
```

Composition Spec menjadi sumber kebenaran utama video.

---

# 13. Composition Validator

Sebelum composition dirender, sistem melakukan validasi.

Minimal validation:

### Schema validation

Memastikan struktur Composition Spec valid.

### Catalog validation

Memastikan ID component benar-benar tersedia.

### Fact validation

Memastikan teks promosi berasal dari brief.

### Asset validation

Memastikan asset tersedia dan dapat diakses.

### Duration validation

Memastikan timeline tidak melebihi durasi video.

### Compatibility validation

Memastikan component dapat digunakan pada aspect ratio atau format tujuan.

Jika candidate gagal:

```text
candidate berikutnya
```

Jika semua gagal:

```text
fallback composition
```

---

# 14. Fallback

Visuala memiliki fallback composition yang sudah terbukti stabil.

Contoh:

```text
ProductHero
Headline
OfferBadge
CTA
```

Jika component HyperFrames gagal digunakan, video tetap dapat dibuat menggunakan Visuala Internal Modules.

Tujuan fallback:

> kegagalan satu component tidak boleh menggagalkan seluruh video.

---

# 15. Composition Compiler

Composition Compiler menerima:

```text
Validated Composition Spec
```

kemudian menghasilkan:

```text
HyperFrames HTML
Assets
Timeline
Sub-compositions
```

Compiler bertanggung jawab untuk:

- resolve asset
- apply style token
- inject text
- resolve module
- membuat timeline
- mengatur scene
- mengatur duration
- menghasilkan HTML composition

AI tidak melakukan proses ini secara langsung.

---

# 16. Deterministic Rendering

Composition harus dapat di-render ulang dengan hasil yang konsisten.

Gunakan:

```text
Composition Spec
Compiler Version
Design Pack Version
Asset Hash
Module Version
```

Hindari runtime behavior seperti:

```text
Date.now()
Math.random()
remote fetch saat render
```

Jika randomness diperlukan, gunakan seed.

---

# 17. Automated Visual Check

Sebelum preview ditampilkan kepada pengguna, lakukan pengecekan sederhana.

Minimal check:

- teks tidak keluar safe area
- elemen tidak saling menutupi secara ekstrem
- produk terlihat
- CTA terbaca
- gambar tidak gagal load
- scene berhasil dirender
- composition dapat di-seek
- frame awal/tengah/akhir valid

MVP tidak memerlukan AI visual scoring kompleks.

Pemeriksaan rule-based sudah cukup.

---

# 18. Preview

Setelah composition lolos validation:

```text
Composition Spec
        ↓
Compiler
        ↓
Frozen Composition Artifact
        ↓
Preview
```

User melihat hasil preview video.

Pada MVP user hanya memiliki:

```text
Approve
atau
Generate ulang
```

Tidak terdapat revision berbasis instruksi seperti:

```text
buat harga lebih besar
ganti background
ubah scene kedua
```

---

# 19. Approval dan MP4

Saat pengguna approve:

Visuala **tidak menjalankan AI planner lagi**.

Artifact yang sudah digunakan untuk preview langsung digunakan untuk export.

```text
Preview Artifact
      ↓
Approve
      ↓
HyperFrames Renderer
      ↓
MP4
```

Dengan demikian:

```text
Preview = Export
```

secara visual.

---

# 20. Artifact Versioning

Untuk setiap composition, simpan minimal:

```text
compositionId
compositionSpec
designPackVersion
compilerVersion
moduleVersions
assetHashes
compositionHash
```

Tujuan:

- composition lama tetap reproducible
- perubahan design pack tidak mengubah video sebelumnya
- perubahan module tidak merusak project lama

Tidak diperlukan versioning system kompleks pada MVP.

---

# 21. Observability Minimal

MVP hanya perlu menyimpan informasi yang membantu debugging.

Catat:

```text
compositionId
recipe
designPack
catalog components used
render status
render duration
planner latency
render error
fallback used
LLM cost
```

Tidak perlu analytics dashboard atau sistem observability lengkap.

Log database sederhana sudah cukup.

---

# 22. Worker Architecture

Arsitektur sederhana:

```text
Interviewer
     ↓
Recipe Resolver
     ↓
Design Pack Loader
     ↓
Art Director
     ↓
Catalog Search
     ↓
Composition Planner
     ↓
Validator
     ↓
Compiler
     ↓
Visual Check
     ↓
Preview
     ↓
Approval
     ↓
Renderer
     ↓
MP4
```

Worker baru ini akan menggantikan worker lama.

Tidak diperlukan abstraction untuk menjalankan dua worker dalam jangka panjang.

---

# 23. Supabase Storage

Supabase Storage digunakan untuk:

### User Assets

```text
projects/{projectId}/assets/
```

### Custom Design Pack

```text
design-packs/{tenantId}/{styleId}/{version}/
```

### Composition Artifact

```text
projects/{projectId}/compositions/{compositionId}/
```

### Final Video

```text
projects/{projectId}/exports/
```

---

# 24. Eksperimen Pertama

Gunakan satu case nyata:

```text
Julumpia
Discount 20%
9:16
12 detik
warm_artisan
```

Langkah:

```text
1. Generate catalog.json

2. Buat searchCatalog()

3. Buat inspectCatalogItem()

4. Load warm_artisan Design Pack

5. Generate Art Direction

6. AI memilih:
   HyperFrames components
   +
   Visuala modules

7. Generate Composition Spec

8. Validate

9. Compile

10. Render frame test

11. Generate preview

12. Approve

13. Render MP4
```

---

# 25. Acceptance Criteria

MVP dianggap berhasil jika:

### 1. Brief → Video

Satu brief lengkap dapat menghasilkan MP4 tanpa edit manual HTML.

### 2. Catalog Discovery

AI dapat menemukan minimal satu component HyperFrames relevan melalui `catalog.json`.

### 3. Catalog Validation

AI tidak boleh menggunakan catalog ID yang tidak tersedia.

### 4. Internal Module

Composition dapat menggabungkan HyperFrames component dan Visuala module.

### 5. Design Consistency

Output mengikuti Design Pack yang dipilih.

### 6. Fact Safety

Video tidak mengarang:

- harga
- diskon
- produk
- benefit
- CTA

yang tidak terdapat pada brief.

### 7. Preview Consistency

Preview dan MP4 menggunakan artifact yang sama.

### 8. Fallback

Jika HyperFrames component gagal, Visuala tetap menghasilkan video menggunakan fallback.

### 9. Reproducibility

Composition yang sama dapat dirender ulang dengan hasil konsisten.

### 10. Visual Safety

Tidak terdapat:

- text overflow kritis
- asset hilang
- scene kosong
- CTA tidak terbaca
- render gagal

---

# 26. Struktur Implementasi yang Disarankan

```text
video-engine/

  recipes/
    product-promo.ts
    discount-promo.ts
    product-launch.ts

  design-packs/
    warm-artisan/

  catalog/
    catalog.json
    search.ts
    inspect.ts

  modules/
    ProductHero/
    Headline/
    OfferBadge/
    CTA/

  planner/
    art-director.ts
    composition-planner.ts

  schema/
    composition.ts

  validators/
    schema-validator.ts
    fact-validator.ts
    asset-validator.ts
    catalog-validator.ts

  compiler/
    composition-compiler.ts

  renderer/
    hyperframes-renderer.ts

  visual-check/
    visual-validator.ts
```

Tujuannya agar setiap bagian memiliki tanggung jawab jelas.

---

# 27. Prinsip Implementasi

### AI memutuskan desain

AI menentukan:

- art direction
- hierarchy
- component selection
- composition
- content mapping
- motion choice

### Code menjaga keselamatan

Code menentukan:

- schema
- validation
- asset access
- duration
- compatibility
- compilation
- rendering

### HyperFrames menangani rendering

HyperFrames bertanggung jawab pada:

- composition
- timeline
- preview
- MP4 rendering

### Visuala memberikan taste

Visuala bertanggung jawab pada:

- Design Pack
- Recipe
- Internal Modules
- Planner instruction
- visual constraints

Dengan pembagian ini, AI tetap memiliki kebebasan kreatif tanpa membuat pipeline render menjadi tidak terkontrol.

---

# 28. Definisi MVP Selesai

MVP selesai ketika flow berikut bekerja end-to-end:

```text
User memasukkan brief Julumpia
        ↓
Visuala memahami Discount Promo
        ↓
warm_artisan dipilih
        ↓
AI membuat Art Direction
        ↓
AI mencari HyperFrames Catalog
        ↓
AI memilih component + Visuala module
        ↓
Composition Spec dibuat
        ↓
Validator lolos
        ↓
Compiler menghasilkan composition
        ↓
Preview muncul
        ↓
User approve
        ↓
MP4 berhasil dihasilkan
```

Itulah scope utama MVP.

Fitur tambahan hanya dikerjakan setelah flow tersebut terbukti menghasilkan video yang secara visual layak digunakan.