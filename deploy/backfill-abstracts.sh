#!/usr/bin/env bash
set -eu

release="$1"

if ! command -v pdftotext >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y poppler-utils
fi

set -a
. /etc/wisdomloong.env
set +a

export PDF_CACHE_DIR=/srv/wisdomloong/pdf-cache
cd "$release"
/usr/bin/node backfill-article-abstracts.mjs
