#!/bin/sh
# One folder under /registries is one registry schema of the same name.
# Filename order runs schema SQL before data SQL. No cross-registry foreign keys.
set -eu
export LC_ALL=C

[ -d /registries ]

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -c "CREATE DATABASE registries OWNER \"${POSTGRES_USER}\";"

for dir in /registries/*; do
  [ -d "$dir" ] || continue
  for sql in "$dir"/*.sql; do
    [ -f "$sql" ] || continue
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname registries -f "$sql"
  done
done
