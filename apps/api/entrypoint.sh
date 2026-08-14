#!/bin/sh
set -e

packages/db/node_modules/.bin/prisma migrate deploy \
  --schema packages/db/prisma/schema.prisma

exec "$@"
