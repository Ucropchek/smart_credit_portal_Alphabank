#!/bin/sh
# Apply every ML schema file in /ml-sql, then load registry folders.
# The subshell keeps set -e inside this file when the Postgres entrypoint sources it.
(
  set -eu
  export LC_ALL=C

  for sql in /ml-sql/*.sql; do
    [ -f "$sql" ] || continue
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$sql"
  done

  sh /registries/init-registries.sh
)
