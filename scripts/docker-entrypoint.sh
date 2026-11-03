#!/bin/sh
set -e
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  node dist/migrate.js
fi
exec "$@"