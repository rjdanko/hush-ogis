#!/usr/bin/env bash
# Applies supabase/migrations + supabase/seed to the local self-hosted stack's
# Postgres container, since there's no `supabase db push` without the CLI.
set -euo pipefail
cd "$(dirname "$0")"

for f in ../migrations/*.sql; do
  echo "==> ${f}"
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$f"
done

echo "==> seed/seed.sql"
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < ../seed/seed.sql

echo "Done."
