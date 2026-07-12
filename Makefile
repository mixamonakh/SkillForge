.PHONY: up down logs ps health test check db-migrate db-seed backup restore

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

health:
	curl --fail --silent --show-error http://localhost:3000 >/dev/null
	curl --fail --silent --show-error http://localhost:4000/api/v1/health/ready >/dev/null

test:
	pnpm test

check:
	pnpm lint && pnpm typecheck && pnpm test && pnpm build

db-migrate:
	pnpm --filter @skillforge/db prisma:migrate:dev

db-seed:
	pnpm content:import -- --pack js-baseline-v1

backup:
	./scripts/backup.sh

restore:
	@test -n "$(BACKUP)" || (echo 'Usage: make restore BACKUP=./backups/<timestamp>' >&2; exit 2)
	./scripts/restore.sh "$(BACKUP)"
