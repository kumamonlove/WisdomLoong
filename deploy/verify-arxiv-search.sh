#!/usr/bin/env bash
set -euo pipefail

database_name=wisdomloong
sample_size=20
minimum_success=19
session_token="arxiv-smoke-$(openssl rand -hex 24)"
session_hash="$(printf '%s' "$session_token" | sha256sum | cut -d ' ' -f 1)"

cleanup() {
  sudo -u postgres psql --dbname="$database_name" --set=ON_ERROR_STOP=1 \
    --command="DELETE FROM articles WHERE external_id = 'smoke-${session_hash}';
      DELETE FROM sessions WHERE token_hash = '${session_hash}'" >/dev/null
}
trap cleanup EXIT

user_id="$(sudo -u postgres psql --dbname="$database_name" --tuples-only --no-align \
  --command="SELECT id FROM users ORDER BY id LIMIT 1")"
if [[ ! "$user_id" =~ ^[0-9]+$ ]]; then
  echo "arXiv production verification requires at least one application user" >&2
  exit 1
fi

sudo -u postgres psql --dbname="$database_name" --set=ON_ERROR_STOP=1 \
  --command="INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES ('${session_hash}', ${user_id}, NOW() + INTERVAL '10 minutes')" >/dev/null

queries=(
  "attention is all you need"
  "openvla"
  "gemini robotics"
  "gr00t n1"
  "diffusion policy"
  "rt-2 vision language action"
  "octo robot learning"
  "pi0 robot foundation model"
  "mobile aloha"
  "saycan robot"
  "robocasa"
  "droid robot dataset"
  "aloha unleashed"
  "robot transformer"
  "vision language models robot"
  "palm-e embodied"
  "language models zero shot planners"
  "code as policies"
  "voyager minecraft"
  "generative agents"
)

results_file="$(mktemp)"
trap 'cleanup; unlink "$results_file" 2>/dev/null || true' EXIT

for query in "${queries[@]}"; do
  (
    response_file="$(mktemp)"
    status="$(curl --silent --show-error --max-time 45 \
      --cookie "wisdomloong_session=$session_token" \
      --get --data-urlencode "title=$query" \
      --output "$response_file" --write-out '%{http_code}' \
      http://127.0.0.1:3000/api/arxiv || true)"
    if [[ "$status" == "200" ]] && grep -q '"results"' "$response_file"; then
      printf '1\n' >> "$results_file"
    else
      printf '0\n' >> "$results_file"
    fi
    unlink "$response_file"
  ) &
done
wait

success_count="$(awk '$1 == 1 { count++ } END { print count + 0 }' "$results_file")"
success_rate="$(awk -v success="$success_count" -v total="$sample_size" \
  'BEGIN { printf "%.1f", success * 100 / total }')"
echo "arXiv production verification: ${success_count}/${sample_size} (${success_rate}%)"

if (( success_count < minimum_success )); then
  echo "arXiv production success rate is below 95%" >&2
  exit 1
fi

import_file="$(mktemp)"
import_status="$(curl --silent --show-error --max-time 15 \
  --cookie "wisdomloong_session=$session_token" \
  --header 'Content-Type: application/json' \
  --data "$(printf '{\"title\":\"arXiv production smoke %s\",\"abstract\":\"This non-empty abstract verifies that translation never blocks article creation.\",\"authors\":[\"WisdomLoong smoke test\"],\"publisher\":\"机构待补充\",\"publishedAt\":\"2026-08-12\",\"sourceUrl\":\"https://arxiv.org/abs/1706.03762\",\"externalId\":\"smoke-%s\",\"addToReadingList\":false,\"tags\":[\"VLA\"]}' "$session_hash" "$session_hash")" \
  --output "$import_file" --write-out '%{http_code}' \
  http://127.0.0.1:3000/api/articles/import || true)"
article_id="$(sed -n 's/.*\"articleId\":\([0-9][0-9]*\).*/\1/p' "$import_file")"
unlink "$import_file"

if [[ "$import_status" != "200" || ! "$article_id" =~ ^[0-9]+$ ]]; then
  echo "Article import production verification failed (HTTP ${import_status})" >&2
  exit 1
fi

stored_id="$(sudo -u postgres psql --dbname="$database_name" --tuples-only --no-align \
  --command="SELECT id FROM articles WHERE external_id = 'smoke-${session_hash}'")"
if [[ "$stored_id" != "$article_id" ]]; then
  echo "Article import response was not persisted" >&2
  exit 1
fi
echo "Article import production verification: persisted article ${article_id} and received readable ID"
