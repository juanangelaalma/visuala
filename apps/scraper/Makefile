.PHONY: install browser-install dev build start lint typecheck test smoke clean

install:
	pnpm install --dir ../..

browser-install:
	pnpm exec playwright install chromium

dev:
	pnpm dev

build:
	pnpm build

start:
	pnpm start

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test 

smoke:
	@test -n "$(URL)" || (echo "Usage: make smoke URL='https://id.shp.ee/...'" && exit 2)
	pnpm smoke -- "$(URL)"

clean:
	rm -rf dist
