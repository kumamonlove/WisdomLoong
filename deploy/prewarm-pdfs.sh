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
  local optimized="${cache_directory}/${article_id}.pdf.linearized"
  local marker="${cache_directory}/${article_id}.pdf.fast-web-view"

  if [ -s "$target" ]; then
    if [ ! -e "$marker" ]; then
      echo "Optimizing cached PDF for first-page display: article ${article_id}"
      if qpdf --linearize "$target" "$optimized" && [ "$(head -c 5 "$optimized")" = "%PDF-" ]; then
        mv "$optimized" "$target"
        touch "$marker"
      else
        unlink "$optimized" 2>/dev/null || true
        echo "PDF fast-web optimization skipped: article ${article_id}" >&2
      fi
    fi
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
    --user-agent "WisdomLoong/1.10 deployment prewarmer" \
    --output "$temporary" \
    "https://arxiv.org/pdf/${arxiv_id}.pdf" &&
    [ "$(head -c 5 "$temporary")" = "%PDF-" ]; then
    if qpdf --linearize "$temporary" "$optimized" && [ "$(head -c 5 "$optimized")" = "%PDF-" ]; then
      mv "$optimized" "$target"
      touch "$marker"
      unlink "$temporary" 2>/dev/null || true
    else
      unlink "$optimized" 2>/dev/null || true
      mv "$temporary" "$target"
    fi
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
