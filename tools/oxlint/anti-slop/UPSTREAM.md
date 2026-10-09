# Vendored anti-slop provenance

Source: repository-local `.agents/skills/install-anti-slop/assets/anti-slop/`, copied by the bundled `scripts/install.mjs`.

The originating source repository and exact source commit are unknown in the supplied skill assets; no upstream revision is inferred.

Recoverable pristine snapshot: `tools/oxlint/anti-slop-pristine.tar`, SHA-256 `b6466c945eaae895897c30c52b7bfab727f71d55a227ee25e6ac1963a279d9ef`. Extracting this archive yields the actual copied `anti-slop/` source tree before this provenance file was added.

Installed generic entry point: `tools/oxlint/anti-slop/index.ts`. The optional Effect entry point is copied at `tools/oxlint/anti-slop/effect/index.ts` but is not enabled because no direct Effect dependency was found in the application manifests.

Intentional deviations: none to copied rule implementations. A local `package.json` declares the vendored TypeScript entry points as ES modules, avoiding Node's ambiguous-module warning. Repository-specific registration and ignores live in `.oxlintrc.json`. The nested Stylistic license and provenance remain at `vendor/eslint-stylistic/LICENSE` and `vendor/eslint-stylistic/UPSTREAM.md`.

Dependencies: Oxlint and `@oxlint/plugins` are pinned together at `1.87.0`.
