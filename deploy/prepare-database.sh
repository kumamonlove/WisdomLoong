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

sudo -u postgres psql \
  --dbname="${database_name}" \
  --tuples-only \
  --no-align \
  --command="SELECT FORMAT(
    'User data summary: users=%s reviews=%s annotations=%s note_pdfs=%s attachments=%s likes=%s sessions=%s reading_list=%s progress=%s reads=%s',
    (SELECT COUNT(*) FROM users),
    (SELECT COUNT(*) FROM reviews),
    (SELECT COUNT(*) FROM review_annotations),
    (SELECT COUNT(*) FROM reading_note_pdfs),
    (SELECT COUNT(*) FROM review_attachments),
    (SELECT COUNT(*) FROM review_likes),
    (SELECT COUNT(*) FROM sessions),
    (SELECT COUNT(*) FROM reading_list),
    (SELECT COUNT(*) FROM reading_progress),
    (SELECT COUNT(*) FROM article_reads)
  )"
