#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
BACKUP_ROOT="${SKILLFORGE_BACKUP_ROOT:-${ROOT_DIR}/backups}"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf 'Usage: %s\n\nEnvironment:\n  SKILLFORGE_BACKUP_ROOT  Backup directory (default: ./backups)\n' "$0"
  exit 0
fi

if [[ $# -ne 0 ]]; then
  printf 'backup.sh does not accept positional arguments. Use SKILLFORGE_BACKUP_ROOT.\n' >&2
  exit 2
fi

cd "$ROOT_DIR"

if ! docker compose ps --status running --services | awk '$0 == "db" { found = 1 } END { exit !found }'; then
  printf 'The Compose db service is not running. Start it before backup.\n' >&2
  exit 1
fi

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
mkdir -p "$BACKUP_ROOT"
temporary_dir="$(mktemp -d "${BACKUP_ROOT}/.${timestamp}.tmp.XXXXXX")"
final_dir="${BACKUP_ROOT}/${timestamp}"

cleanup() {
  rm -rf -- "$temporary_dir"
}
trap cleanup EXIT

printf 'Creating PostgreSQL backup...\n'
docker compose exec -T db sh -eu -c '
  exec pg_dump \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges
' > "${temporary_dir}/database.pgdump"

if [[ ! -s "${temporary_dir}/database.pgdump" ]]; then
  printf 'pg_dump produced an empty file; backup aborted.\n' >&2
  exit 1
fi

manifest_list="${temporary_dir}/content-manifests.list"
find content/packs -type f \( -name 'manifest.json' -o -name 'manifest.yaml' -o -name 'manifest.yml' \) -print \
  | LC_ALL=C sort > "$manifest_list"
if [[ ! -s "$manifest_list" ]]; then
  printf 'No content pack manifests found; backup aborted.\n' >&2
  exit 1
fi

tar -czf "${temporary_dir}/content-manifests.tar.gz" -T "$manifest_list"

app_version="$(node -p "require('./package.json').version" 2>/dev/null || printf 'unknown')"
postgres_version="$(docker compose exec -T db postgres --version | tr -d '\r')"
compose_project="${COMPOSE_PROJECT_NAME:-skillforge}"
postgres_volume="${POSTGRES_VOLUME_NAME:-skillforge_postgres_data}"
schema_migration="$(
  docker compose exec -T db sh -eu -c '
    psql \
      --username="$POSTGRES_USER" \
      --dbname="$POSTGRES_DB" \
      --tuples-only \
      --no-align \
      --command="
        SELECT migration_name
        FROM \"_prisma_migrations\"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY finished_at DESC
        LIMIT 1
      "
  ' 2>/dev/null || true
)"
schema_migration="$(printf '%s' "$schema_migration" | tr -d '\r\n ')"
schema_migration="${schema_migration:-unavailable}"

printf 'created_at_utc=%s\napp_version=%s\npostgres_version=%s\ncompose_project=%s\npostgres_volume=%s\nschema_migration=%s\n' \
  "$timestamp" "$app_version" "$postgres_version" "$compose_project" "$postgres_volume" "$schema_migration" \
  > "${temporary_dir}/metadata.txt"

if command -v sha256sum >/dev/null 2>&1; then
  checksum_command=(sha256sum)
else
  checksum_command=(shasum -a 256)
fi

(
  cd "$temporary_dir"
  "${checksum_command[@]}" \
    database.pgdump \
    content-manifests.tar.gz \
    content-manifests.list \
    metadata.txt \
    > SHA256SUMS
)

if [[ -e "$final_dir" ]]; then
  printf 'Backup path already exists: %s\n' "$final_dir" >&2
  exit 1
fi

mv -- "$temporary_dir" "$final_dir"
trap - EXIT

printf 'Backup created: %s\n' "$final_dir"
