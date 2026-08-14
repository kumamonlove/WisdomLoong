#!/usr/bin/env bash
set -euo pipefail

database_name=wisdomloong
sample_size=20
threshold_seconds=2.000
session_token="pdf-performance-$(openssl rand -hex 24)"
session_hash="$(printf '%s' "$session_token" | sha256sum | cut -d ' ' -f 1)"

cleanup() {
  sudo -u postgres psql --dbname="$database_name" --set=ON_ERROR_STOP=1 \
    --command="DELETE FROM sessions WHERE token_hash = '${session_hash}'" >/dev/null
}
trap cleanup EXIT

user_id="$(sudo -u postgres psql --dbname="$database_name" --tuples-only --no-align \
  --command="SELECT id FROM users ORDER BY id LIMIT 1")"
if [[ ! "$user_id" =~ ^[0-9]+$ ]]; then
  echo "PDF performance verification requires at least one application user" >&2
  exit 1
fi

sudo -u postgres psql --dbname="$database_name" --set=ON_ERROR_STOP=1 \
  --command="INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES ('${session_hash}', ${user_id}, NOW() + INTERVAL '10 minutes')" >/dev/null

mapfile -t article_ids < <(
  sudo -u postgres psql --dbname="$database_name" --tuples-only --no-align \
    --command="SELECT id FROM articles ORDER BY id DESC LIMIT ${sample_size}"
)
if (( ${#article_ids[@]} == 0 )); then
  echo "PDF performance verification found no articles" >&2
  exit 1
fi

successful=0
for article_id in "${article_ids[@]}"; do
  result="$(curl --silent --show-error --max-time 10 \
    --cookie "wisdomloong_session=${session_token}" \
    --range 0-524287 \
    --output /dev/null --write-out '%{http_code} %{time_total}' \
    "http://127.0.0.1:3000/api/articles/${article_id}/pdf" || true)"
  status="${result%% *}"
  duration="${result##* }"
  if [[ "$status" =~ ^20[06]$ ]] && awk -v value="$duration" -v limit="$threshold_seconds" 'BEGIN { exit !(value <= limit) }'; then
    successful=$((successful + 1))
  else
    echo "PDF performance miss: article ${article_id}, HTTP ${status}, ${duration}s" >&2
  fi
done

total="${#article_ids[@]}"
required=$(( (total * 95 + 99) / 100 ))
rate="$(awk -v success="$successful" -v count="$total" 'BEGIN { printf "%.1f", success * 100 / count }')"
echo "PDF performance verification: ${successful}/${total} (${rate}%) within ${threshold_seconds}s"
if (( successful < required )); then
  echo "PDF performance is below the required 95% within 2 seconds" >&2
  exit 1
fi
