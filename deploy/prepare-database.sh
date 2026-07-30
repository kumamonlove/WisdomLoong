#!/usr/bin/env bash
set -eu

database_name=wisdomloong
application_role=admin

if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql
fi

sudo systemctl enable --now postgresql

if ! sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname = '${application_role}'" |
  grep -q 1; then
  sudo -u postgres createuser "${application_role}"
fi

sudo -u postgres psql -c "ALTER ROLE ${application_role} LOGIN"

if ! sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${database_name}'" |
  grep -q 1; then
  sudo -u postgres createdb --owner="${application_role}" "${database_name}"
fi

sudo -u postgres psql -c \
  "ALTER DATABASE ${database_name} OWNER TO ${application_role}"

sudo -u postgres psql \
  --dbname="${database_name}" \
  --set=ON_ERROR_STOP=1 \
  --file=/tmp/schema.sql
