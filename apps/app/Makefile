dev:
	pnpm dev

build:
	pnpm build

lint:
	pnpm lint

test:
	pnpm test

test-unit:
	pnpm test:unit

test-e2e:
	pnpm exec playwright test $(ARGS)

test-install:
	pnpm test:install

start:
	pnpm start

supabase-up:
	pnpm dlx supabase start --workdir .

supabase-down:
	pnpm dlx supabase stop --workdir .

supabase-reset:
	pnpm dlx supabase db reset --workdir .

migration-new:
	pnpm dlx supabase migration new $(name) --workdir .

migrate:
	pnpm dlx supabase db push --local --workdir .

migrate-fresh:
	pnpm dlx supabase db reset --workdir .

supabase-status:
	pnpm dlx supabase status --workdir .

supabase-logs:
	pnpm dlx supabase logs --workdir .
