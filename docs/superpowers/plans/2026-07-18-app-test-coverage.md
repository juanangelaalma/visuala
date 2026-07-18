# Apps/App Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce 80% global V8 coverage for critical production code in `apps/app` only.

**Architecture:** Vitest collects scoped `apps/app` application, domain behavior, feature actions/schemas, infrastructure, API routes, and shared config. Existing unit boundaries mock Supabase, Xendit, auth, and service factories; Playwright and `apps/web` stay separate.

**Tech Stack:** pnpm, Turbo, Vitest 3, V8 coverage, TypeScript, Next.js 16.
  
## Global Constraints

- Scope only `apps/app`; exclude `apps/web` and shared packages.
- Require 80% globally for lines, functions, branches, and statements.
- Do not add dependencies.
- Unit tests require no live Supabase or Xendit service.
- Use BUILD-OPERATE-CHECK and one behavior per test per `references/unit-tests/rules.md` Rules 4-5.

---

### Task 1: Coverage gate and commands

**Files:**
- Modify: `apps/app/vitest.config.mts`
- Modify: `apps/app/package.json`
- Modify: `apps/app/Makefile`
- Modify: `package.json`
- Modify: `turbo.json`

**Interfaces:**
- Produces: `pnpm --filter app test:coverage`, root `pnpm app:test:coverage`, and `make coverage`.

- [ ] Add scoped coverage include/exclude globs, `all: true`, and global 80 thresholds to Vitest.
- [ ] Add app, root, Turbo, and Make coverage commands using existing Vitest/V8.
- [ ] Run `pnpm --filter app test:coverage`; expect failure below 80%, proving gate works.

### Task 2: Close critical behavioral gaps

**Files:**
- Test existing production modules under `apps/app/application`, `domain`, `features`, `infrastructure`, `app/api`, and `shared` using colocated `*.test.ts` files.

**Interfaces:**
- Consumes: production exports and existing dependency-injection boundaries.
- Produces: repeatable unit tests with mocked external boundaries.

- [ ] Use first failed coverage report to rank uncovered executable modules by criticality.
- [ ] Add one focused failing behavioral test at a time for auth, billing, pricing, actions/schemas, repositories, routes, and config.
- [ ] Run each test before expansion; verify expected failure or uncovered behavior, then keep minimal passing test.
- [ ] Repeat until `pnpm --filter app test:coverage` passes all four 80% thresholds.

### Task 3: Validation and graph refresh

**Files:**
- Modify generated graph files through Graphify update only.

- [ ] Run `pnpm --filter app test:coverage`; expect PASS and each metric at least 80%.
- [ ] Run `pnpm app:lint`; expect PASS.
- [ ] Run `pnpm --filter app exec tsc --noEmit`; expect PASS.
- [ ] Run `graphify update .`; expect graph refresh success.
- [ ] Inspect `git diff` for focused scope and no generated coverage artifacts.
