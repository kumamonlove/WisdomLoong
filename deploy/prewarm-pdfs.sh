#!/usr/bin/env bash
set -u

cache_directory="${PDF_CACHE_DIR:-/srv/wisdomloong/pdf-cache}"
max_parallel=4
active_jobs=0

download_pdf() {
  local article_id="$1"
  local source_url="$2"
  local arxiv_id
  local target="${cache_directory}/${article_id}.pdf"
  local temporary="${cache_directory}/${article_id}.pdf.download"

  if [ -s "$target" ]; then
    echo "PDF cache hit: article ${article_id}"
    return 0
  fi

  if [[ "$source_url" =~ arxiv\.org/(abs|pdf)/([^/?#]+) ]]; then
    arxiv_id="${BASH_REMATCH[2]%.pdf}"
  else
    return 0
  fi

  echo "Prewarming PDF: article ${article_id}"
  if curl --location --fail --silent --show-error \
    --retry 2 --connect-timeout 10 --max-time 120 \
    --user-agent "WisdomLoong/1.7 deployment prewarmer" \
    --output "$temporary" \
    "https://arxiv.org/pdf/${arxiv_id}.pdf" &&
    [ "$(head -c 5 "$temporary")" = "%PDF-" ]; then
    mv "$temporary" "$target"
    echo "PDF cached: article ${article_id}"
  else
    unlink "$temporary" 2>/dev/null || true
    echo "PDF prewarm skipped: article ${article_id}" >&2
  fi
}

while IFS=$'\t' read -r article_id source_url; do
  [ -n "$article_id" ] || continue
  download_pdf "$article_id" "$source_url" &
  active_jobs=$((active_jobs + 1))
  if [ "$active_jobs" -ge "$max_parallel" ]; then
    wait -n || true
    active_jobs=$((active_jobs - 1))
  fi
done < <(
  sudo -u postgres psql \
    --dbname=wisdomloong \
    --tuples-only \
    --no-align \
    --field-separator=$'\t' \
    --command="SELECT id, source_url FROM articles ORDER BY id"
)

wait || true
