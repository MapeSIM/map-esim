#!/usr/bin/env bash
# Idempotent repository bootstrap for MAP eSIM Cloud Agents.
# Durable setup only: system packages + node dependencies. No servers here.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Ensuring PostgreSQL is installed"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

echo "==> Installing node dependencies (npm ci)"
# postinstall runs `prisma generate`; no database required for this step.
npm ci

echo "==> install.sh complete"
