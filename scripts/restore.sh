#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
BACKUP_ROOT="${SKILLFORGE_BACKUP_ROOT:-${ROOT_DIR}/backups}"

usage() {
  printf 'Usage: %s ./backups/<timestamp>\n\nRestore replaces the current database and requires typing RESTORE.\n' "$0"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

if [[ -L "$1" ]]; then
  printf 'Symlink backup paths are not accepted.\n' >&2
  exit 1
fi

input_parent="$(cd -- "$(dirname -- "$1")" 2>/dev/null && pwd -P)" || {
  printf 'Backup path does not exist: %s\n' "$1" >&2
  exit 1
}
backup_dir="${input_parent}/$(basename -- "$1")"
backup_root_real="$(mkdir -p "$BACKUP_ROOT" && cd -- "$BACKUP_ROOT" && pwd -P)"

case "$backup_dir" in
  "${backup_root_real}"/*) ;;
  *)
    printf 'Backup must be inside %s\n' "$backup_root_real" >&2
    exit 1
    ;;
esac

dump_file="${backup_dir}/database.pgdump"
checksum_file="${backup_dir}/SHA256SUMS"

if [[ ! -f "$dump_file" || ! -s "$dump_file" ]]; then
  printf 'Missing or empty dump: %s\n' "$dump_file" >&2
  exit 1
fi

if [[ -L "$dump_file" ]]; then
  printf 'Symlink dump files are not accepted.\n' >&2
  exit 1
fi

cd "$backup_dir"
if [[ -f "$checksum_file" ]]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum --check SHA256SUMS
  else
    shasum -a 256 --check SHA256SUMS
  fi
else
  printf 'Missing SHA256SUMS; restore aborted.\n' >&2
  exit 1
fi

cd "$ROOT_DIR"
if docker compose ps --all --services | awk '$0 == "db" { found = 1 } END { exit !found }'; then
  # Preserve the configuration of an existing container (including the dev
  # port override) instead of recreating it from the base Compose file.
  docker compose start db
else
  docker compose up -d db
fi

if ! docker compose exec -T db sh -eu -c '
  attempts=0
  until pg_isready --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"; do
    attempts=$((attempts + 1))
    [ "$attempts" -lt 60 ] || exit 1
    sleep 1
  done
'; then
  printf 'PostgreSQL is not ready; restore aborted.\n' >&2
  exit 1
fi

if ! docker compose exec -T db pg_restore --list < "$dump_file" >/dev/null; then
  printf 'The dump is not a readable pg_dump custom archive.\n' >&2
  exit 1
fi

printf 'WARNING: this will replace the current SkillForge database.\nBackup: %s\n' "$backup_dir"
confirmation="${SKILLFORGE_RESTORE_CONFIRM:-}"
if [[ -z "$confirmation" ]]; then
  if [[ ! -t 0 ]]; then
    printf 'Interactive confirmation unavailable. Set SKILLFORGE_RESTORE_CONFIRM=RESTORE explicitly.\n' >&2
    exit 1
  fi
  read -r -p 'Type RESTORE to continue: ' confirmation
fi

if [[ "$confirmation" != "RESTORE" ]]; then
  printf 'Confirmation did not match; database was not changed.\n' >&2
  exit 1
fi

docker compose stop api web >/dev/null

restore_failed=0
docker compose exec -T db sh -eu -c '
  psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
    --command="DROP SCHEMA IF EXISTS public CASCADE" \
    --command="CREATE SCHEMA public"
' || restore_failed=1

if [[ "$restore_failed" -eq 0 ]]; then
  docker compose exec -T db sh -eu -c '
    exec pg_restore \
      --username="$POSTGRES_USER" \
      --dbname="$POSTGRES_DB" \
      --clean \
      --if-exists \
      --exit-on-error \
      --no-owner \
      --no-privileges
  ' < "$dump_file" || restore_failed=1
fi

if [[ "$restore_failed" -ne 0 ]]; then
  printf 'Restore failed. API and web remain stopped; recover from a verified backup before restarting them.\n' >&2
  exit 1
fi

docker compose up -d api web
printf 'Restore completed. Verify health and a known assessment attempt before continuing.\n'
