#!/bin/sh
set -eu

PORT="${PORT:-2167}"
APP_ENV="${APP_ENV:-production}"
DEFAULT_TIMEZONE="${DEFAULT_TIMEZONE:-Asia/Shanghai}"

if [ -z "${LINK_SIGNING_SECRET:-}" ]; then
  LINK_SIGNING_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  echo "LINK_SIGNING_SECRET was not set; using an ephemeral secret for this container." >&2
fi

mkdir -p /data

pnpm exec wrangler d1 migrations apply sloop-db --local --persist-to /data

exec pnpm exec wrangler dev \
  --ip 0.0.0.0 \
  --port "$PORT" \
  --persist-to /data \
  --var "APP_ENV:$APP_ENV" \
  --var "DEFAULT_TIMEZONE:$DEFAULT_TIMEZONE" \
  --var "LINK_SIGNING_SECRET:$LINK_SIGNING_SECRET"
