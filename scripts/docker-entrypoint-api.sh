#!/bin/sh
set -eu

cd /app

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

attempt=1
max_attempts="${DATABASE_WAIT_ATTEMPTS:-60}"

while ! node -e '
  const net = require("node:net");
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const socket = net.connect(Number(databaseUrl.port || 5432), databaseUrl.hostname);
  socket.setTimeout(1_000);
  socket.once("connect", () => { socket.end(); process.exit(0); });
  socket.once("error", () => process.exit(1));
  socket.once("timeout", () => { socket.destroy(); process.exit(1); });
'; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "PostgreSQL did not become reachable after ${max_attempts} attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "Applying committed Prisma migrations"
cd /app/packages/db
./node_modules/.bin/prisma migrate deploy

echo "Ensuring the default local user exists"
./node_modules/.bin/tsx prisma/seed.ts

if [ -n "${SEED_CONTENT_PACKS:-}" ]; then
  content_packs="$SEED_CONTENT_PACKS"
elif [ -n "${SEED_CONTENT_PACK:-}" ]; then
  content_packs="$SEED_CONTENT_PACK"
else
  content_packs="js-baseline-v1,js-prebaseline-v1"
fi

previous_ifs="$IFS"
IFS=','
for content_pack in $content_packs; do
  case "$content_pack" in
    ''|*[!a-z0-9.-]*)
      echo "Invalid content pack key in SEED_CONTENT_PACKS" >&2
      exit 1
      ;;
  esac
  echo "Importing content pack ${content_pack} idempotently"
  ./node_modules/.bin/tsx ../../scripts/content-import.ts --pack "$content_pack"
done
IFS="$previous_ifs"

cd /app
exec "$@"
