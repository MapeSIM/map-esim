#!/usr/bin/env bash
# Per-boot runtime initialization for MAP eSIM Cloud Agents.
# Idempotent: start Postgres, ensure the dev role/database, provision a local
# .env.local (only if missing), apply migrations, and bootstrap the admin user.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_USER="mapesim"
PG_PASSWORD="mapesim"
PG_DB="mapesim"
DB_URL="postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:5432/${PG_DB}?schema=public"

echo "==> Starting PostgreSQL cluster"
sudo pg_ctlcluster 16 main start 2>/dev/null || true
# Wait for readiness.
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then break; fi
  sleep 1
done

echo "==> Ensuring role and database exist"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PG_USER}') THEN
    CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASSWORD}';
  END IF;
END \$\$;
ALTER ROLE ${PG_USER} CREATEDB;
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1; then
  sudo -u postgres createdb -O "${PG_USER}" "${PG_DB}"
fi

# .env (read by the Prisma CLI, which does not read .env.local).
if [ ! -f .env ]; then
  echo "==> Writing .env for Prisma CLI"
  printf 'DATABASE_URL=%s\n' "${DB_URL}" > .env
fi

# .env.local (read by Next.js and tsx/@next/env scripts). Generated once with
# safe dev defaults. Provider/SMTP secrets are intentionally left empty so
# provider order + email paths fail closed until real secrets are supplied.
if [ ! -f .env.local ]; then
  echo "==> Generating .env.local with dev defaults"
  AUTH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  ICCID_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  ORDER_ACCESS="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  CRON_SECRET="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  cat > .env.local <<ENV
DATABASE_URL=${DB_URL}

AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=http://localhost:3000

VESIM_ENVIRONMENT=staging
VESIM_BASE_URL=https://www.vesim.xyz
VESIM_EMAIL=
VESIM_PASSWORD=
VESIM_LIVE_BROKER_HOSTS=www.vesim.world

ENABLE_GUEST_VESIM_CHECKOUT=false
APP_BASE_URL=http://localhost:3000

ORDER_ACCESS_SECRET=${ORDER_ACCESS}
ICCID_ENCRYPTION_KEY=${ICCID_KEY}

EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_SECURITY_USER=security@mapesim.com
SMTP_SECURITY_PASSWORD=
SMTP_ORDERS_USER=orders@mapesim.com
SMTP_ORDERS_PASSWORD=
SMTP_BILLING_USER=billing@mapesim.com
SMTP_BILLING_PASSWORD=
SMTP_SUPPORT_USER=support@mapesim.com
SMTP_SUPPORT_PASSWORD=
EMAIL_REPLY_TO=support@mapesim.com
EMAIL_TEST_RECIPIENT=

CRON_SECRET=${CRON_SECRET}

INITIAL_ADMIN_NAME=Dev Admin
INITIAL_ADMIN_EMAIL=admin@mapesim.local
INITIAL_ADMIN_PASSWORD=DevAdminPass123!
ENV
fi

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Bootstrapping admin user (idempotent)"
npm run admin:seed || true

echo "==> start.sh complete"
