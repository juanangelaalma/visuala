# AI Coding Rules

## Project Context

Visuala is a pnpm/Turbo monorepo with:

* `apps/app`: authenticated product/admin app using Next.js App Router and layered architecture.
* `apps/web`: marketing site using Next.js App Router.
* `packages/ui`: shared UI components.
* `packages/config` and `packages/tailwind`: shared configuration packages.

All AI agents must follow the existing project conventions before introducing new patterns.

---

## 1. Workspace & Tooling

Use the existing pnpm/Turbo workflow.

* Use `pnpm` only.
* Do not introduce `npm`, `yarn`, or another lockfile.
* Prefer root scripts such as `pnpm lint`, `pnpm app:lint`, `pnpm app:build`, and existing package scripts.
* Keep changes compatible with the current workspace structure.

Before making Next.js-specific changes, check the installed Next.js documentation in:

```txt
node_modules/next/dist/docs/
```

Do not rely on outdated Next.js assumptions.

---

## 2. Architecture Rules for `apps/app`

`apps/app` follows layered architecture:

```txt
app/              Next.js routes, pages, layouts, route handlers
features/         UI, server actions, schemas, feature components
application/      use cases, services, factories
domain/           interfaces, types, domain errors
infrastructure/   Supabase/database/external adapters
```

Follow this dependency direction:

```txt
UI / routes / actions
    → application
        → domain
            ← infrastructure implements domain contracts
```

Rules:

* Business logic belongs in `application/**`.
* Domain contracts and types belong in `domain/**`.
* Supabase/database access belongs in `infrastructure/**`.
* Feature actions may call application services/use cases.
* Do not put Supabase queries directly in pages, client components, or feature actions unless there is an existing documented exception.
* Do not import infrastructure implementations into application use cases.

---

## 3. Repository & Data Mapping

Use domain-owned repository interfaces for persistence.

Rules:

* Application code depends on repository interfaces, not concrete Supabase classes.
* Supabase repositories implement domain interfaces.
* Keep `.from()`, `.select()`, `.insert()`, `.update()`, and `.delete()` calls inside infrastructure adapters.
* Database rows use `snake_case`.
* Domain models, frontend types, and UI props use `camelCase`.
* Map `snake_case ↔ camelCase` at the repository boundary only.

Avoid leaking database column names into UI, forms, domain types, or use cases.

---

## 4. Server Actions & Forms

Server actions live in feature folders:

```txt
features/**/actions
```

Rules:

* Server action files must start with `"use server"`.
* Validate form input with Zod before calling use cases.
* Put form schemas in `features/**/schemas`.
* Use `Object.fromEntries(formData)` with `schema.safeParse(...)`.
* Return small user-safe action states, for example:

```ts
{
  error?: string;
  message?: string;
}
```

* Do not return raw exception objects, Supabase errors, stack traces, or internal messages to the UI.
* Do not put mutation logic inside client components.

---

## 5. Auth & Authorization

Use existing auth helpers.

Rules:

* Admin pages, layouts, and admin mutations must call `requireAdmin()`.
* Use existing helpers such as `getCurrentUser`, `getRoleRedirectPath`, and auth service factories.
* Do not duplicate role checks in every feature.
* Do not rely only on client-side UI hiding for authorization.
* Keep route protection and redirect logic centralized.

---

## 6. API Routes & Route Handlers

Use predictable, small, user-safe responses.

Rules:

* Use `Response.json(...)`.
* Return stable response shapes.
* Hide internal error details.
* Add cache headers intentionally for public read endpoints.
* Do not expose secrets, stack traces, Supabase raw errors, or unstable response formats.

For local/static video route handlers in `apps/web`:

* Use `runtime = "nodejs"`.
* Stream files with Node read streams.
* Support `Range` requests.
* Return proper `206` and `416` responses.
* Set `Accept-Ranges`, `Content-Type`, and long-lived cache headers.

---

## 7. Database & Supabase

Database changes are SQL migrations under:

```txt
apps/app/supabase/migrations
```

Rules:

* Use timestamped migration filenames.
* Prefer append-only migrations after they are applied.
* Do not edit historical migrations unless explicitly instructed.
* Enable RLS for new tables.
* Define explicit RLS policies.
* Add constraints and indexes near table definitions.
* Explain impact before dropping, renaming, or changing existing columns.
* Use transactions for multi-step database operations where needed.

---

## 8. Next.js App Router

Follow existing App Router conventions.

Rules:

* Use `page.tsx`, `layout.tsx`, `route.ts`, `robots.ts`, and `sitemap.ts` conventions.
* Use route groups such as `(auth)` where appropriate.
* Use `_components` and `_sections` for route-local non-URL folders.
* Prefer server components by default.
* Add `"use client"` only for components that need browser state, events, or effects.
* Keep data fetching, redirects, and authorization in server components/actions where possible.
* Match the current Next.js async `params` / `searchParams` style used in the project.

For SEO metadata routes in `apps/web`:

* Use `MetadataRoute` types.
* Derive absolute URLs from:

```ts
process.env.NEXT_PUBLIC_SITE_URL ?? "https://visuala.io"
```

unless a centralized config helper is introduced.

---

## 9. Testing

Use the existing test tools.

Rules:

* Use Vitest for unit/application/domain tests.
* Use Playwright for E2E browser flows.
* Mock domain interfaces in unit tests.
* Do not require a live Supabase instance for unit tests unless integration-test infrastructure exists.
* Add tests for important use cases, schemas, domain logic, and critical flows.

---

## 10. Naming & File Conventions

Follow existing naming style.

Rules:

* TypeScript module files use `kebab-case`.
* React component files use `PascalCase`.
* Use cases should be verb-first, for example:

```txt
create-pricing-plan.ts
list-active-pricing-plans.ts
update-user-profile.ts
```

* Feature files should use names like:

```txt
thing-actions.ts
thing-schema.ts
ThingComponent.tsx
```

Avoid:

* `snake_case` filenames.
* Generic feature logic files like `utils.ts` when a clearer name is possible.
* New naming patterns without local precedent.

---

## 11. Shared UI Package

Reusable UI belongs in:

```txt
packages/ui/src
```

Rules:

* Put only truly reusable UI primitives in `packages/ui`.
* Export public components, props, and data types from:

```txt
packages/ui/src/index.ts
```

* Do not deep-import unpublished package internals from apps.
* Keep local app components inside the app if they are only used by one app.

---

## 12. Error Handling

Keep errors user-safe and consistent.

Rules:

* Map domain errors to friendly user messages.
* Use structured domain errors when different causes need different recovery behavior.
* Do not swallow destructive mutation failures silently.
* Do not expose raw infrastructure errors to users.
* Log or handle unexpected errors intentionally.

---

## 13. Agent Behavior Rules

Before changing code, every AI agent must:

1. Read this document.
2. Inspect similar existing implementations.
3. Follow the closest existing pattern.
4. Keep changes small and focused.
5. Avoid unrelated refactors.
6. Explain any architectural deviation before implementing it.

Before finishing, every AI agent must report:

```txt
Summary of changes
Files changed
Validation performed
Rule compliance notes
Risks or follow-up items
```

---

## 14. Human Decisions Still Needed

These items need project-owner confirmation before becoming strict rules:

1. Should `/admin` be added to proxy protected prefixes?
2. Should all delete actions return visible action-state errors?
3. Should route handlers always use service factories instead of direct infrastructure repositories?
4. Should every domain use structured domain errors like auth?
5. Should thin pass-through use cases remain mandatory?
6. Should all applied migrations be strictly append-only?
7. Should UI be promoted to `packages/ui` only after reuse by multiple apps?
8. Should newer `apps/web` route handlers normalize indentation to the dominant project style?
