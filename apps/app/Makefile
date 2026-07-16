dev:
	pnpm dev

refresh: refresh-cache

refresh-cache:
	rm -rf .next

refresh-deps:
	rm -rf node_modules .next ../../node_modules ../../packages/ui/node_modules
	pnpm install --dir ../..

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

seed:
	@eval "$$(pnpm dlx supabase status -o env --override-name db.url=DATABASE_URL 2>/dev/null)"; \
	psql "$$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql

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
