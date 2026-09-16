# Creative Video Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable creative-video domain, plugin registry, persistence, upload, interviewer, clarification, and three-concept dashboard flow.

**Architecture:** A generic creative-video application layer depends on small domain contracts. Build-time category and style plugins provide versioned behavior, Supabase/R2 adapters persist owned state and assets, and the existing provider-neutral `AIService` supplies structured F&B analysis and concepts.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Zod 4, Supabase, private R2, existing `AIService`, Vitest, Playwright, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-09-14-creative-video-fnb-mvp-design.md`

## Global Constraints

- Read relevant installed Next.js guides under `node_modules/next/dist/docs/` before changing routes, server actions, caching, async request APIs, or runtime declarations.
- Use `pnpm` only and preserve unrelated scraper work while resolving the existing `pnpm-lock.yaml` conflict.
- Keep UI/routes/actions -> application -> domain, with infrastructure implementing domain contracts.
- Keep Supabase queries in infrastructure and map snake_case to camelCase only at repository boundaries.
- Require authentication and owner-scoped queries for every project operation.
- Use server-owned Zod schemas for every AI structured output; never accept HTML, JavaScript, URLs, or plugin IDs from model output.
- Use one JPEG, PNG, or WebP asset per project, at most 10 MB by default.
- Keep plugins build-time, explicit, versioned, and allowlisted.
- Export and credit behavior are outside this foundation plan.
- Follow red-green-refactor and run focused tests after every change.
- Do not run paid live AI smoke tests without explicit authorization.
- Run `graphify update .` after source changes.

---

### Task 1: Resolve Workspace And Establish Domain Contracts

**Files:**
- Modify: `pnpm-lock.yaml`
- Create: `apps/app/domain/creative-video/types.ts`
- Create: `apps/app/domain/creative-video/contracts.ts`
- Create: `apps/app/domain/creative-video/errors.ts`
- Create: `apps/app/domain/creative-video/state-machine.ts`
- Test: `apps/app/domain/creative-video/state-machine.test.ts`

**Interfaces:**
- Consumes: existing workspace configuration and TypeScript conventions.
- Produces: `CreativeProjectState`, `CreativeCategory`, `CreativeProject`, `ConversationMessage`, `BriefSnapshot`, `Concept`, `VideoPlan`, `CompositionVersion`, `ExportRequest`, `RenderJob`, `CreativeVideoRepository`, `CategoryPlugin`, `StylePlugin`, `CreativeVideoError`, and `assertProjectTransition(from, to)`.

- [ ] **Step 1: Inspect lock conflict without discarding scraper changes**

Run: `git diff --cc -- pnpm-lock.yaml`

Expected: conflict sections identify both the current app dependencies and unrelated scraper additions.

- [ ] **Step 2: Resolve only the lockfile conflict**

Run: `pnpm install --lockfile-only`

Expected: `pnpm-lock.yaml` has no conflict markers and retains `apps/scraper` plus every existing workspace importer. If pnpm cannot parse the conflicted file, manually remove conflict markers with `apply_patch`, preserving the union, then rerun the command.

- [ ] **Step 3: Verify the workspace lock**

Run: `pnpm install --lockfile-only --frozen-lockfile`

Expected: exit 0 and no package removal unrelated to this feature.

- [ ] **Step 4: Write failing state-machine tests**

```ts
import { describe, expect, it } from "vitest";
import { InvalidProjectTransitionError } from "./errors";
import { assertProjectTransition } from "./state-machine";

describe("assertProjectTransition", () => {
  it.each([
    ["draft", "analyzing"],
    ["analyzing", "needs_input"],
    ["analyzing", "concepts_ready"],
    ["concepts_ready", "building_preview"],
    ["building_preview", "preview_ready"],
    ["preview_ready", "rendering"],
    ["rendering", "completed"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(() => assertProjectTransition(from, to)).not.toThrow();
  });

  it("rejects skipping directly from draft to completed", () => {
    expect(() => assertProjectTransition("draft", "completed"))
      .toThrow(InvalidProjectTransitionError);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter app test -- domain/creative-video/state-machine.test.ts`

Expected: FAIL because the creative-video domain does not exist.

- [ ] **Step 6: Implement minimal typed contracts and transitions**

```ts
export const creativeProjectStates = [
  "draft", "analyzing", "needs_input", "concepts_ready",
  "building_preview", "preview_ready", "rendering", "completed", "failed",
] as const;
export type CreativeProjectState = (typeof creativeProjectStates)[number];

export type VersionRef = { id: string; version: string };
export type CreativeProject = {
  id: string;
  userId: string;
  category: CreativeCategory;
  state: CreativeProjectState;
  revision: number;
  assetId: string;
  activeConceptId: string | null;
  activeCompositionVersionId: string | null;
  failedStage: "analysis" | "planning" | "compilation" | "rendering" | null;
  errorCode: string | null;
  previewGenerationCount: number;
  previewQuota: number;
  createdAt: string;
  updatedAt: string;
};
```

Define the remaining spec-owned types in focused sections in `types.ts`, repository/plugin interfaces in `contracts.ts`, and a transition map in `state-machine.ts`. Allow any active processing state to enter `failed`; retry transitions must return only to the corresponding processing state.

- [ ] **Step 7: Run domain tests and typecheck**

Run: `pnpm --filter app test -- domain/creative-video/state-machine.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the foundation**

```bash
git add pnpm-lock.yaml apps/app/domain/creative-video
git commit -m "feat: add creative video domain"
```

### Task 2: Build Versioned Plugin Registries

**Files:**
- Create: `apps/app/domain/creative-video/plugin-registry.ts`
- Test: `apps/app/domain/creative-video/plugin-registry.test.ts`
- Create: `apps/app/infrastructure/creative-video/plugins/create-plugin-registry.ts`
- Create: `apps/app/infrastructure/creative-video/plugins/categories/fnb/fnb-category-plugin.ts`
- Create: `apps/app/infrastructure/creative-video/plugins/styles/editorial/editorial-style-plugin.ts`

**Interfaces:**
- Consumes: `CategoryPlugin`, `StylePlugin`, and `VersionRef` from Task 1.
- Produces: `PluginRegistry.resolveCategory(ref)`, `resolveStyle(ref)`, `assertCompatible(category, style)`, `fnbCategoryPlugin`, `editorialStylePlugin`, and `createCreativeVideoPluginRegistry()`.

- [ ] **Step 1: Write failing registry tests**

```ts
describe("PluginRegistry", () => {
  it("resolves exact build-time versions", () => {
    const registry = new PluginRegistry([fnbCategory], [editorialStyle]);
    expect(registry.resolveCategory({ id: "fnb", version: "1" })).toBe(fnbCategory);
    expect(registry.resolveStyle({ id: "editorial", version: "1" })).toBe(editorialStyle);
  });

  it("rejects unknown versions and incompatible styles", () => {
    const registry = new PluginRegistry([fnbCategory], [editorialStyle]);
    expect(() => registry.resolveCategory({ id: "fnb", version: "2" })).toThrow();
    expect(() => registry.assertCompatible(fnbCategory, incompatibleStyle)).toThrow();
  });
});
```

- [ ] **Step 2: Run registry tests to verify failure**

Run: `pnpm --filter app test -- domain/creative-video/plugin-registry.test.ts`

Expected: FAIL because `PluginRegistry` is missing.

- [ ] **Step 3: Implement exact-version registry and plugin manifests**

```ts
export class PluginRegistry {
  constructor(
    private readonly categories: readonly CategoryPlugin[],
    private readonly styles: readonly StylePlugin[],
  ) {}

  resolveCategory(ref: VersionRef): CategoryPlugin {
    return requirePlugin(this.categories, ref, "category");
  }

  resolveStyle(ref: VersionRef): StylePlugin {
    return requirePlugin(this.styles, ref, "style");
  }

  assertCompatible(category: CategoryPlugin, style: StylePlugin): void {
    if (!category.supportedStyleCapabilities.every((item) => style.capabilities.includes(item))) {
      throw new IncompatiblePluginError(category.ref.id, style.ref.id);
    }
  }
}
```

Register `fnb@1` and `editorial@1`. Keep F&B prompt/schema policy fields empty only where later tasks provide concrete implementations; do not introduce orchestrator ID branches.

- [ ] **Step 4: Run registry tests**

Run: `pnpm --filter app test -- domain/creative-video/plugin-registry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit plugin boundaries**

```bash
git add apps/app/domain/creative-video apps/app/infrastructure/creative-video/plugins
git commit -m "feat: add creative video plugin registry"
```

### Task 3: Add Owned Creative Project Persistence

**Files:**
- Create: `apps/app/supabase/migrations/20260914000000_create_creative_video_foundation.sql`
- Modify: `apps/app/infrastructure/supabase/database.types.ts`
- Create: `apps/app/infrastructure/creative-video/supabase-creative-video-repository.ts`
- Test: `apps/app/infrastructure/creative-video/supabase-creative-video-repository.test.ts`

**Interfaces:**
- Consumes: domain entities and `CreativeVideoRepository` from Task 1.
- Produces: `SupabaseCreativeVideoRepository` supporting owner-scoped create/read, append message, replace analysis snapshot, store concept set, and compare-and-set project transition.

- [ ] **Step 1: Write failing repository mapping and ownership tests**

```ts
it("maps owned project rows to camelCase", async () => {
  const supabase = fakeSupabaseReturning(projectRow);
  const repository = new SupabaseCreativeVideoRepository(supabase);
  await expect(repository.getOwnedProject("project-1", "user-1"))
    .resolves.toMatchObject({ id: "project-1", userId: "user-1", revision: 2 });
  expect(supabase.filters).toContainEqual(["user_id", "user-1"]);
});

it("rejects a stale expected revision", async () => {
  const repository = new SupabaseCreativeVideoRepository(fakeConflictSupabase());
  await expect(repository.transition({
    projectId: "project-1", userId: "user-1", expectedRevision: 1,
    state: "needs_input",
  })).rejects.toThrow(ProjectRevisionConflictError);
});
```

- [ ] **Step 2: Run repository tests to verify failure**

Run: `pnpm --filter app test -- infrastructure/creative-video/supabase-creative-video-repository.test.ts`

Expected: FAIL because the repository and migration are absent.

- [ ] **Step 3: Create append-only migration**

Create tables `creative_projects`, `creative_messages`, `creative_brief_snapshots`, `creative_concept_sets`, and `creative_concepts`. Include owner IDs, project revisions, plugin IDs/versions, immutable JSONB snapshots, timestamps, unique message idempotency keys, foreign keys, constraints, indexes, RLS, and explicit authenticated owner policies. Add an atomic SQL function `transition_owned_creative_project(project_id, user_id, expected_revision, next_state, patch)` that increments revision only on a match.

- [ ] **Step 4: Regenerate or extend database types and implement mapping**

Implement every `.from()`, filter, insert, and RPC only in `SupabaseCreativeVideoRepository`. Map database rows in named mapping functions and return `null` for another user's missing project rather than leaking existence.

- [ ] **Step 5: Run repository tests**

Run: `pnpm --filter app test -- infrastructure/creative-video/supabase-creative-video-repository.test.ts`

Expected: PASS.

- [ ] **Step 6: Validate migration syntax against local Supabase if configured**

Run: `pnpm --filter app test -- infrastructure/creative-video/supabase-creative-video-repository.test.ts`

Expected: PASS. If the repository has a Supabase migration validation script by implementation time, run that script too and record its exact output.

- [ ] **Step 7: Commit persistence**

```bash
git add apps/app/supabase/migrations/20260914000000_create_creative_video_foundation.sql apps/app/infrastructure/supabase/database.types.ts apps/app/infrastructure/creative-video
git commit -m "feat: persist creative video projects"
```

### Task 4: Create Project With Validated Product Asset

**Files:**
- Create: `apps/app/application/creative-video/create-project.ts`
- Test: `apps/app/application/creative-video/create-project.test.ts`
- Create: `apps/app/features/creative-video/schemas/project-schema.ts`
- Test: `apps/app/features/creative-video/schemas/project-schema.test.ts`
- Create: `apps/app/features/creative-video/actions/project-actions.ts`
- Test: `apps/app/features/creative-video/actions/project-actions.test.ts`
- Modify: `apps/app/application/ai-service/register-asset.ts`
- Modify: `apps/app/infrastructure/ai-service/create-ai-service.ts`

**Interfaces:**
- Consumes: `CreativeVideoRepository`, plugin registry, existing `registerAsset`, authenticated user, and private R2 asset services.
- Produces: `createCreativeProject(dependencies, input): Promise<CreativeProjectAggregate>` and `createCreativeProjectAction(state, formData): Promise<CreativeVideoActionState>`.

- [ ] **Step 1: Write schema tests for prompt and one real image**

```ts
it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
  const image = new File([validFixtureBytes(type)], "product", { type });
  expect(createProjectSchema.safeParse({ prompt: "Buat konten jualan", image }).success).toBe(true);
});

it("rejects an empty prompt and oversized upload", () => {
  expect(createProjectSchema.safeParse({ prompt: " ", image: oversizedFile }).success).toBe(false);
});
```

- [ ] **Step 2: Run schema tests to verify failure**

Run: `pnpm --filter app test -- features/creative-video/schemas/project-schema.test.ts`

Expected: FAIL because the schema is absent.

- [ ] **Step 3: Implement safe form schema**

Use a Zod custom check for one `File`, non-empty Indonesian prompt-length limits, and 10 MB browser-side byte ceiling. Treat browser MIME as preliminary only; reuse `registerAsset` magic-byte and decoded-dimension validation as authoritative.

- [ ] **Step 4: Write failing create-project use-case tests**

```ts
it("registers the image and persists project/message before analysis", async () => {
  const result = await createCreativeProject(deps, {
    userId: "user-1", prompt: "Buat konten jualan", image,
    idempotencyKey: "submit-1", category: { id: "fnb", version: "1" },
  });
  expect(deps.assets.register).toHaveBeenCalledBefore(deps.projects.create);
  expect(deps.projects.create).toHaveBeenCalledWith(expect.objectContaining({ state: "analyzing" }));
  expect(result.project.state).toBe("analyzing");
});

it("returns the existing aggregate for duplicate submit", async () => {
  deps.projects.findByCreateKey.mockResolvedValue(existingAggregate);
  await expect(createCreativeProject(deps, duplicateInput)).resolves.toBe(existingAggregate);
  expect(deps.assets.register).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run use-case tests to verify failure**

Run: `pnpm --filter app test -- application/creative-video/create-project.test.ts`

Expected: FAIL because the use case is missing.

- [ ] **Step 6: Implement create-project transaction boundary**

Register the asset through an exposed asset-registration dependency, resolve `fnb@1`, and create project plus first user message atomically under the idempotency key. Return the aggregate in `analyzing` state. Ensure orphan asset cleanup is attempted if project persistence fails.

- [ ] **Step 7: Implement and test server action**

Start the action file with `"use server"`, parse `Object.fromEntries(formData)` plus `formData.get("image")`, obtain the authenticated user through existing auth services, invoke the use case, and return only `{ projectId, revision, state, error?, message? }`. Log sanitized server diagnostics, not prompts or signed URLs.

- [ ] **Step 8: Run project tests**

Run: `pnpm --filter app test -- features/creative-video application/creative-video/create-project.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit project creation**

```bash
git add apps/app/application/creative-video apps/app/features/creative-video apps/app/application/ai-service/register-asset.ts apps/app/infrastructure/ai-service/create-ai-service.ts
git commit -m "feat: create creative video projects"
```

### Task 5: Implement F&B Interviewer Policy And AI Adapter

**Files:**
- Create: `apps/app/infrastructure/creative-video/plugins/categories/fnb/fnb-brief-schema.ts`
- Create: `apps/app/infrastructure/creative-video/plugins/categories/fnb/fnb-interviewer.ts`
- Test: `apps/app/infrastructure/creative-video/plugins/categories/fnb/fnb-interviewer.test.ts`
- Create: `apps/app/infrastructure/creative-video/ai-service-brief-interpreter.ts`
- Test: `apps/app/infrastructure/creative-video/ai-service-brief-interpreter.test.ts`
- Create: `apps/app/application/creative-video/analyze-project.ts`
- Test: `apps/app/application/creative-video/analyze-project.test.ts`

**Interfaces:**
- Consumes: `AIService.generateStructured`, owned asset ID, ordered messages, `fnb@1`, and repository compare-and-set methods.
- Produces: `fnbBriefAnalysisSchema`, `FnbBriefAnalysis`, `AIServiceBriefInterpreter.interpret(input)`, and `analyzeCreativeProject(dependencies, input)`.

- [ ] **Step 1: Write failing F&B policy/schema tests**

```ts
it.each([
  ["Promo diskon untuk produk ini", "discount_rule"],
  ["Harga mulai untuk produk ini", "starting_price"],
  ["Pesan lewat WhatsApp", "whatsapp_contact"],
])("requires the missing fact for %s", (prompt, factKey) => {
  const result = applyFnbFactPolicy(baseAnalysis(prompt));
  expect(result.missingRequired).toContainEqual(expect.objectContaining({ factKey }));
});

it("does not make optional business name mandatory for generic sales content", () => {
  expect(applyFnbFactPolicy(baseAnalysis("Buat konten jualan")).missingRequired)
    .not.toContainEqual(expect.objectContaining({ factKey: "business_name" }));
});
```

- [ ] **Step 2: Run policy tests to verify failure**

Run: `pnpm --filter app test -- infrastructure/creative-video/plugins/categories/fnb/fnb-interviewer.test.ts`

Expected: FAIL because the F&B interviewer is absent.

- [ ] **Step 3: Implement schema, prompt, and deterministic policy guard**

Define a structured schema that records goal, product/category confidence,
facts with provenance (`user`, `visual_observation`, `assumption`), missing
required questions, optional questions, and sufficiency. The trusted prompt
must enumerate forbidden inventions from the spec. Apply deterministic checks
after AI output so explicit discount/price/WhatsApp/date intents cannot be
marked sufficient without their required fact.

- [ ] **Step 4: Write failing AI adapter tests**

```ts
it("calls the interviewer task with project context and owned asset", async () => {
  await interpreter.interpret(input);
  expect(ai.generateStructured).toHaveBeenCalledWith(expect.objectContaining({
    task: "interviewer",
    context: { userId: "user-1", projectId: "project-1" },
    promptVersion: "fnb-interviewer-v1",
    messages: expect.arrayContaining([expect.objectContaining({ assetId: "asset-1" })]),
  }));
});
```

- [ ] **Step 5: Implement AI adapter and analysis orchestration**

Call `createAIService({ schemas: { "fnb-brief-analysis@v1": fnbBriefAnalysisSchema } })`. Persist the immutable brief snapshot. Compare `sourceRevision` before applying the result. Transition to `needs_input` when required facts remain; otherwise invoke concept generation in Task 6. Map `AIError` to safe creative-video error codes.

- [ ] **Step 6: Run interviewer tests**

Run: `pnpm --filter app test -- infrastructure/creative-video/plugins/categories/fnb application/creative-video/analyze-project.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit interviewer**

```bash
git add apps/app/infrastructure/creative-video apps/app/application/creative-video
git commit -m "feat: analyze fnb creative briefs"
```

### Task 6: Generate Exactly Three Concepts

**Files:**
- Create: `apps/app/infrastructure/creative-video/plugins/categories/fnb/fnb-concept-schema.ts`
- Create: `apps/app/infrastructure/creative-video/ai-service-concept-planner.ts`
- Test: `apps/app/infrastructure/creative-video/ai-service-concept-planner.test.ts`
- Create: `apps/app/application/creative-video/generate-concepts.ts`
- Test: `apps/app/application/creative-video/generate-concepts.test.ts`

**Interfaces:**
- Consumes: sufficient `BriefSnapshot`, `AIService`, F&B plugin prompt/schema, repository concept-set persistence.
- Produces: `fnbConceptSetSchema`, `AIServiceConceptPlanner.generateConcepts(input)`, and `generateCreativeConcepts(dependencies, input)`.

- [ ] **Step 1: Write failing schema invariant tests**

```ts
it("requires exactly three concepts and one recommendation", () => {
  expect(fnbConceptSetSchema.safeParse(twoConcepts).success).toBe(false);
  expect(fnbConceptSetSchema.safeParse(threeRecommended).success).toBe(false);
  expect(fnbConceptSetSchema.safeParse(validThreeConcepts).success).toBe(true);
});

it("rejects duplicate hooks and scene outlines", () => {
  expect(fnbConceptSetSchema.safeParse(duplicateConcepts).success).toBe(false);
});
```

- [ ] **Step 2: Run concept tests to verify failure**

Run: `pnpm --filter app test -- infrastructure/creative-video/ai-service-concept-planner.test.ts application/creative-video/generate-concepts.test.ts`

Expected: FAIL because schemas/use case are missing.

- [ ] **Step 3: Implement concept schema and post-validation**

Require `id`, `title`, `hook`, `angle`, exactly four scene-outline strings, fit reason, recommendation reason, and boolean recommendation. Add normalized duplicate checks across hooks/angles/outlines and reject guaranteed-sales wording such as `pasti laku`.

- [ ] **Step 4: Implement AI concept planner and persistence**

Use `AIService.generateStructured` with task `planner`, schema key
`fnb-concept-set@v1`, and prompt version `fnb-concepts-v1`. Persist all three
concepts in one transaction, then compare-and-set the project from `analyzing`
to `concepts_ready` at the source revision. Discard stale completion.

- [ ] **Step 5: Run concept tests**

Run: `pnpm --filter app test -- infrastructure/creative-video/ai-service-concept-planner.test.ts application/creative-video/generate-concepts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit concepts**

```bash
git add apps/app/infrastructure/creative-video apps/app/application/creative-video
git commit -m "feat: generate fnb creative concepts"
```

### Task 7: Answer Clarifications Without Losing Context

**Files:**
- Create: `apps/app/application/creative-video/answer-clarification.ts`
- Test: `apps/app/application/creative-video/answer-clarification.test.ts`
- Modify: `apps/app/features/creative-video/schemas/project-schema.ts`
- Modify: `apps/app/features/creative-video/actions/project-actions.ts`
- Modify: `apps/app/features/creative-video/actions/project-actions.test.ts`

**Interfaces:**
- Consumes: repository append-message/transition, `analyzeCreativeProject`, expected revision, user ID.
- Produces: `answerCreativeVideoClarification(dependencies, input)` and `answerCreativeVideoAction(state, formData)`.

- [ ] **Step 1: Write failing clarification tests**

```ts
it("appends an answer and reuses prior facts and asset", async () => {
  await answerCreativeVideoClarification(deps, {
    projectId: "project-1", userId: "user-1", expectedRevision: 3,
    answer: "Diskon 20% untuk semua varian", idempotencyKey: "answer-1",
  });
  expect(deps.projects.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
    projectId: "project-1", role: "user",
  }));
  expect(deps.interpreter.interpret).toHaveBeenCalledWith(expect.objectContaining({
    assetId: "asset-1",
    previousBrief: expect.objectContaining({ id: "brief-1" }),
  }));
});

it("does not duplicate an answer idempotency key", async () => {
  deps.projects.findMessageByKey.mockResolvedValue(existingAnswer);
  await answerCreativeVideoClarification(deps, duplicateInput);
  expect(deps.projects.appendMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run clarification tests to verify failure**

Run: `pnpm --filter app test -- application/creative-video/answer-clarification.test.ts features/creative-video/actions/project-actions.test.ts`

Expected: FAIL because answer behavior is missing.

- [ ] **Step 3: Implement answer use case and action**

Allow answers only from `needs_input`, append once, transition through
`analyzing`, and call the interviewer with ordered messages, latest brief, and
the original asset. On revision conflict return a safe refresh-required state.

- [ ] **Step 4: Run clarification tests**

Run: `pnpm --filter app test -- application/creative-video/answer-clarification.test.ts features/creative-video/actions/project-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit clarification flow**

```bash
git add apps/app/application/creative-video apps/app/features/creative-video
git commit -m "feat: answer creative brief questions"
```

### Task 8: Build Recoverable Dashboard Chat And Concept UI

**Files:**
- Modify: `apps/app/app/dashboard/page.tsx`
- Create: `apps/app/application/creative-video/get-owned-project.ts`
- Test: `apps/app/application/creative-video/get-owned-project.test.ts`
- Create: `apps/app/application/creative-video/services.ts`
- Create: `apps/app/features/creative-video/components/CreativeVideoWorkspace.tsx`
- Create: `apps/app/features/creative-video/components/CreativeComposer.tsx`
- Create: `apps/app/features/creative-video/components/ConversationTimeline.tsx`
- Create: `apps/app/features/creative-video/components/ClarificationCard.tsx`
- Create: `apps/app/features/creative-video/components/ConceptCard.tsx`
- Create: `apps/app/features/creative-video/components/ConceptGrid.tsx`
- Test: `apps/app/features/creative-video/components/creative-video-workspace.test.tsx`
- Create: `apps/app/app/api/creative-projects/[projectId]/status/route.ts`
- Test: `apps/app/app/api/creative-projects/[projectId]/status/route.test.ts`

**Interfaces:**
- Consumes: create/answer actions, owned project aggregate, authenticated user, current Next.js async `searchParams`/`params` contract.
- Produces: dashboard `?project=<id>` recovery, responsive chat/concept UI, and `GET /api/creative-projects/:projectId/status?revision=N`.

- [ ] **Step 1: Read exact Next.js 16 docs before route/UI work**

Run: `pnpm --filter app exec next info`

Expected: confirms Next.js 16.2.9. Read the installed App Router pages/layouts, route handlers, server/client components, and server actions guides located under `node_modules/next/dist/docs/` and record any relevant breaking API notes in the task log.

- [ ] **Step 2: Write failing workspace rendering tests**

```tsx
it("renders analysis immediately after submit state", () => {
  const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={analyzingAggregate} />);
  expect(html).toContain("Memahami produkmu");
  expect(html).toContain("Buat konten jualan");
});

it("renders one grouped clarification card", () => {
  const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={needsInputAggregate} />);
  expect(html.match(/Jawab singkat/g)).toHaveLength(1);
});

it("renders three concepts and one recommendation", () => {
  const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={conceptsAggregate} />);
  expect(html.match(/Pilih ide/g)).toHaveLength(3);
  expect(html.match(/Rekomendasi/g)).toHaveLength(1);
});
```

- [ ] **Step 3: Run UI tests to verify failure**

Run: `pnpm --filter app test -- features/creative-video/components/creative-video-workspace.test.tsx`

Expected: FAIL because workspace components do not exist.

- [ ] **Step 4: Implement server recovery and responsive workspace**

Make `/dashboard` an authenticated server component. Resolve optional project
query state using the installed async API contract, load only the owned
aggregate, and render the existing dark shell. Implement desktop chat/empty
preview columns and mobile Chat/Preview tabs. Use lime primary actions,
rounded dark panels, visible labels, and existing typography/tokens.

- [ ] **Step 5: Implement safe status polling route**

Return `{ projectId, revision, state, updatedAt, aggregate? }`. If client
revision is current, return a small unchanged response. Require authentication,
scope by owner, hide missing-vs-foreign distinction, and return stable safe
errors.

- [ ] **Step 6: Run component and route tests**

Run: `pnpm --filter app test -- features/creative-video app/api/creative-projects application/creative-video/get-owned-project.test.ts`

Expected: PASS.

- [ ] **Step 7: Run foundation slice verification**

Run: `pnpm --filter app test`

Expected: all app Vitest tests PASS.

Run: `pnpm app:lint`

Expected: exit 0.

Run: `pnpm app:build`

Expected: exit 0 with no route/runtime errors.

- [ ] **Step 8: Update graph and inspect final diff**

Run: `graphify update .`

Expected: graph update completes.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 9: Commit dashboard slice**

```bash
git add apps/app/app/dashboard/page.tsx apps/app/app/api/creative-projects apps/app/application/creative-video apps/app/features/creative-video apps/app/infrastructure/creative-video graphify-out
git commit -m "feat: add fnb creative brief workspace"
```

## Foundation Completion Criteria

- Authenticated submit persists one validated image and prompt before AI work.
- Dashboard immediately shows the submitted content and analysis status.
- F&B required facts produce contextual grouped questions.
- Answers retain the image and prior context.
- Sufficient briefs produce exactly three distinct concepts and one explained recommendation.
- Refresh restores the owner-scoped aggregate.
- Plugin lookup is exact-versioned and has no category-ID branches in orchestration.
- Focused tests, full app tests, lint, build, and graph update pass.
