#!/bin/bash
# Runs ONE approved Cloudflare step from DEPLOYMENT.md (steps 4-7: local copy + preview only).
# There is deliberately no production step here. Usage: scripts/cf-step.sh <step-name>
set -eo pipefail
cd "$(dirname "$0")/.."
export NVM_DIR=/Users/lbn/Desktop/.nvm
. "$NVM_DIR/nvm.sh" >/dev/null
nvm use 22 >/dev/null

DB=backups/dev-20261013-1015.db   # copy of the real database; the original is never opened here

case "${1:-}" in
  create-dbs)
    npx wrangler d1 create jentis-db-preview --location apac
    npx wrangler d1 create jentis-db-prod --location apac ;;
  list-dbs)            npx wrangler d1 list ;;
  migrate-local)       npm run db:migrate:local ;;
  export)              python3 -I scripts/sqlite_to_d1.py export "$DB" data-export/jentis-data.sql ;;
  import-local)        npx wrangler d1 execute jentis-db-prod --local --file=data-export/jentis-data.sql ;;
  fingerprint-local)   npm run db:fingerprint:local ;;
  fingerprint-laptop)  python3 -I scripts/sqlite_to_d1.py fingerprint "$DB" ;;
  migrate-preview)     npm run db:migrate:preview ;;
  import-preview)      npx wrangler d1 execute jentis-db-preview --remote --env preview --file=data-export/jentis-data.sql ;;
  fingerprint-preview) npm run db:fingerprint:preview ;;
  fingerprint-preview-values) npx wrangler d1 execute jentis-db-preview --remote --env preview --json --command "$(grep -v "^--" scripts/reconcile.sql)" ;;
  deploy-preview)      npm run deploy:preview ;;
  dev)                 exec npx next dev -p 3001 ;;
  *) echo "Unknown step: ${1:-<none>}"; exit 2 ;;
esac
