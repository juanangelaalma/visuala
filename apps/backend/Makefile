dev:
	pnpm dev

start:
	pnpm start

build:
	pnpm build

worker:
	pnpm worker

lint:
	pnpm lint

test:
	pnpm test

test-unit:
	pnpm test:unit

test-file:
	pnpm test -- $(ARGS)

test-watch:
	pnpm test:unit:watch

coverage:
	pnpm test:coverage

refresh: refresh-cache

refresh-cache:
	rm -rf coverage .turbo

refresh-deps:
	rm -rf node_modules coverage ../../node_modules
	pnpm install --prod=false --dir ../..

env:
	@if [ -f .env ]; then \
		echo ".env already exists - leaving it untouched"; \
	else \
		echo "creating .env from ../app/.env"; \
		{ echo "PORT=4000"; \
		  echo "APP_URL=http://localhost:3000"; \
		  echo "CORS_ORIGIN=http://localhost:3000"; \
		  echo ""; \
		  grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ASSET_BUCKET|ADMIN_EMAILS|AI_[A-Z0-9_]+|BILLING_[A-Z_]+|XENDIT_[A-Z_]+)=' ../app/.env; \
		  echo "SUPABASE_ANON_KEY=$$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' ../app/.env | cut -d= -f2-)"; \
		} > .env; \
	fi

health:
	@curl -fsS --max-time 3 http://127.0.0.1:$${PORT:-4000}/health || echo "backend is not reachable"

supabase-up:
	pnpm dlx supabase start --workdir .

supabase-down:
	pnpm dlx supabase stop --workdir .

supabase-reset:
	pnpm dlx supabase db reset --workdir .

supabase-status:
	pnpm dlx supabase status --workdir .

supabase-logs:
	pnpm dlx supabase logs --workdir .

migrate:
	pnpm dlx supabase db push --local --workdir .

migrate-fresh:
	pnpm dlx supabase db reset --workdir .

migration-new:
	pnpm dlx supabase migration new $(name) --workdir .

seed:
	@eval "$$(pnpm dlx supabase status -o env --override-name db.url=DATABASE_URL 2>/dev/null)"; \
	psql "$$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
