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

test-file:
	pnpm test -- $(ARGS)

coverage:
	pnpm test:coverage

test-e2e:
	pnpm exec playwright test $(ARGS)

test-install:
	pnpm test:install

start:
	pnpm start

supabase-up:
	$(MAKE) -C ../backend supabase-up

supabase-down:
	$(MAKE) -C ../backend supabase-down

supabase-reset:
	$(MAKE) -C ../backend supabase-reset

seed:
	$(MAKE) -C ../backend seed

migration-new:
	$(MAKE) -C ../backend migration-new name=$(name)

migrate:
	$(MAKE) -C ../backend migrate

migrate-fresh:
	$(MAKE) -C ../backend migrate-fresh

supabase-status:
	$(MAKE) -C ../backend supabase-status

supabase-logs:
	$(MAKE) -C ../backend supabase-logs
