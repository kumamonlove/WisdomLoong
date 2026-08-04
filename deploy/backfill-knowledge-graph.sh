#!/usr/bin/env bash
set -eu

database_name=wisdomloong
session_token="$(openssl rand -hex 32)"
session_hash="$(printf '%s' "$session_token" | sha256sum | cut -d' ' -f1)"

user_id="$(sudo -u postgres psql --dbname="$database_name" --tuples-only --no-align \
  --command="SELECT id FROM users ORDER BY id LIMIT 1")"
if [ -z "$user_id" ]; then
  echo "Knowledge graph backfill skipped: no users"
  exit 0
fi

cleanup() {
  sudo -u postgres psql --dbname="$database_name" --set=ON_ERROR_STOP=1 \
    --command="DELETE FROM sessions WHERE token_hash = '$session_hash'" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

sudo -u postgres psql --dbname="$database_name" --set=ON_ERROR_STOP=1 \
  --command="INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES ('$session_hash', $user_id, NOW() + INTERVAL '2 hours')
    ON CONFLICT (token_hash) DO NOTHING" >/dev/null

domains="$(sudo -u postgres psql --dbname="$database_name" --tuples-only --no-align --command="
  WITH domain_counts AS (
    SELECT tag AS domain, COUNT(DISTINCT articles.id)::int AS article_count
    FROM articles
    CROSS JOIN LATERAL UNNEST(
      CASE WHEN CARDINALITY(articles.tags) > 0 THEN articles.tags ELSE ARRAY[articles.category] END
    ) tag
    WHERE tag <> '全部'
    GROUP BY tag
  ), analyzed AS (
    SELECT domain, COUNT(*)::int AS analyzed_count
    FROM knowledge_graph_nodes
    GROUP BY domain
  )
  SELECT domain_counts.domain
  FROM domain_counts
  LEFT JOIN knowledge_graph_domains USING (domain)
  LEFT JOIN analyzed USING (domain)
  WHERE knowledge_graph_domains.status IS DISTINCT FROM 'ready'
     OR COALESCE(analyzed.analyzed_count, 0) <> domain_counts.article_count
     OR COALESCE(knowledge_graph_domains.article_count, 0) <> domain_counts.article_count
  ORDER BY domain_counts.article_count DESC, domain_counts.domain
")"

if [ -z "$domains" ]; then
  echo "Knowledge graph backfill candidates: 0"
  exit 0
fi

candidate_count="$(printf '%s\n' "$domains" | sed '/^$/d' | wc -l)"
echo "Knowledge graph backfill candidates: $candidate_count"

while IFS= read -r domain; do
  [ -n "$domain" ] || continue
  payload="$(DOMAIN_VALUE="$domain" node -e \
    'process.stdout.write(JSON.stringify({domain: process.env.DOMAIN_VALUE}))')"
  if curl --fail --silent --show-error --max-time 210 \
    --cookie "wisdomloong_session=$session_token" \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    http://127.0.0.1:3000/api/knowledge-graph >/dev/null; then
    echo "Knowledge graph updated: $domain"
  else
    echo "Knowledge graph deferred: $domain" >&2
  fi
done <<EOF
$domains
EOF
