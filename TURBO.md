# Turborepo di Monorepo Visuala

Turbo adalah task runner pintar untuk monorepo.

Struktur repo:

```txt
apps/web          # landing page
apps/app          # product app
packages/ui       # shared component
packages/tailwind # shared theme
packages/config   # shared tsconfig
```

Tanpa Turbo:

```bash
cd apps/web && pnpm build
cd apps/app && pnpm build
```

Dengan Turbo:

```bash
pnpm run build
```

Turbo membaca semua package, lalu menjalankan script `build` yang ada.

## Cara Kerja

### 1. Baca workspace

Dari `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 2. Baca dependency graph

Contoh:

```txt
web -> @visuala/ui
app -> @visuala/ui
web -> @visuala/tailwind
app -> @visuala/tailwind
```

### 3. Jalankan task sesuai urutan

Kalau `web` butuh `ui`, Turbo tahu `ui` adalah dependency.

### 4. Parallel execution

Kalau `apps/web` dan `apps/app` tidak saling bergantung, Turbo bisa build bersamaan.

### 5. Cache

Kalau file tidak berubah, Turbo bisa skip kerja yang sama:

```txt
web:build cache hit
app:build cache hit
```

## Script Root

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "web:dev": "turbo dev --filter=web",
    "app:dev": "turbo dev --filter=app"
  }
}
```

Artinya:

```bash
pnpm run build
```

Build semua app/package yang punya script `build`.

```bash
pnpm run web:dev
```

Jalankan dev server landing saja.

```bash
pnpm run app:dev
```

Jalankan product app saja.

## turbo.json

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Penjelasan:

- `dependsOn: ["^build"]` = build dependency dulu
- `outputs` = folder hasil build yang boleh di-cache
- `dev.cache=false` = dev server jangan di-cache
- `dev.persistent=true` = proses dev hidup terus

## Workflow Harian

Untuk landing:

```bash
pnpm run web:dev
```

Untuk product app:

```bash
pnpm run app:dev
```

Sebelum commit/deploy:

```bash
pnpm run lint
pnpm run build
```

## Intinya

```txt
pnpm workspace = ngatur paket
turbo = ngatur task antar paket
```

Analogi:

- pnpm = manajer dependency
- Turbo = manajer pekerjaan/build/lint/dev di seluruh monorepo
