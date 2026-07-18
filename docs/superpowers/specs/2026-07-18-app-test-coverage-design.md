# Apps/App Test Coverage Design

## Scope

Coverage applies only to `apps/app`. `apps/web` and shared workspace packages remain outside this milestone.

Critical production code includes auth and billing behavior across:

- `application/**`
- `domain/**`
- `features/**/actions/**`
- `features/**/schemas/**`
- `infrastructure/**`
- critical route handlers under `app/api/**`
- relevant shared configuration under `shared/**`

Generated files, type-only modules, test files, E2E files, build output, Supabase migrations, and framework configuration remain excluded.

## Tooling

Use installed Vitest and `@vitest/coverage-v8`. Add an `apps/app` coverage script and expose it through the root Turbo workflow without adding dependencies.

## Coverage Policy

CI fails unless global coverage reaches 80% independently for:

- lines
- functions
- branches
- statements

Coverage collection includes scoped production files even when tests do not import them, preventing untested files from disappearing from results.

## Test Strategy

Prefer focused behavioral unit tests around application use cases, domain behavior, Zod schemas, infrastructure adapters, server actions, and webhook handlers. Mock domain contracts and external boundaries. Unit tests must not require live Supabase or Xendit services.

Playwright remains separate from V8 unit coverage because browser coverage is not required for this milestone.

## Validation

Run:

1. `pnpm --filter app test:coverage`
2. `pnpm app:lint`
3. existing app typecheck command if present; otherwise `pnpm --filter app exec tsc --noEmit`
4. `graphify update .`

Success means tests pass and all four global metrics meet 80% for scoped `apps/app` production code.

## Non-goals

- coverage for `apps/web`
- coverage for shared packages
- per-file thresholds
- browser/E2E coverage aggregation
- new test or reporting dependencies
