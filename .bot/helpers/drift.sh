#!/usr/bin/env bash
# Deploy drift: PRs merged to main after the latest Cloudflare deploy time in deploys.json.
# Refresh deploys.json from Cloudflare (wrangler or the API) when logged in; otherwise keep ledger times.
# Repo homes are in repos.json (owner/name). Product repos may live under bitprairie-team
# or the owner's personal GitHub account; do not assume one org.
# Map (Workers "w:" / Pages "p:"): colorbars->w:colorbars, colorbars-pro->w:colorbars-pro,
#   moqstudio->w:moqstudio, moqFeeder->w:the-paddock, bitprairie->p:bitprairie,
#   hardknox->p:hardknox(+w:hardknox-api), streamingPortfolio->w:streamingportfolio-edge,
#   fiberShare->w:fibershare-web, artist-space->p:artistspace, ptsn->p:ptsn,
#   jessie-pine->w:artist-space-worker
# Usage:
#   export HEALTH_DIR=/path/to/a/working/dir   # holds deploys.json, repos.json, verified-live.json
#   export GH_TOKEN=$(gh auth token)           # or be logged in with gh
#   ./drift.sh
set -u
DIR="${HEALTH_DIR:-.}"
cd "$DIR"
OUT=drift.json
REPO_MAP=repos.json
echo '{}' > "$OUT"
if ! command -v gh >/dev/null; then
  echo "gh missing; skip drift" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1 && [ -z "${GH_TOKEN:-}" ]; then
  echo "gh auth gone; skip drift" >&2
  exit 1
fi
if [ ! -f "$REPO_MAP" ]; then
  echo "missing $REPO_MAP; skip drift" >&2
  exit 1
fi
total=0
skipped=0
for r in $(jq -r 'keys[]' deploys.json); do
  # Accept string timestamp or object {deployedAt, sha, version}
  d=$(jq -r --arg r "$r" '.[$r]|if type=="object" then (.deployedAt // .timestamp // empty) else . end' deploys.json)
  sha=$(jq -r --arg r "$r" '.[$r]|if type=="object" then (.sha // "UNKNOWN-SHA") else "UNKNOWN-SHA" end' deploys.json)
  full=$(jq -r --arg r "$r" '.[$r] // empty' "$REPO_MAP")
  if [ -z "$full" ]; then
    echo "$r: no repo home in $REPO_MAP; skip" >&2
    skipped=$((skipped + 1))
    continue
  fi
  prs=$(gh pr list -R "$full" --state merged --base main -L 50 --json number,title,mergedAt 2>/dev/null \
    | jq -c --arg d "$d" --argjson v "$(jq -c --arg r "$r" '.[$r].prs // []' verified-live.json 2>/dev/null || echo '[]')" '[.[]|select(.mergedAt>$d)|select(.number as $n|($v|index($n))|not)]')
  prs=${prs:-[]}
  jq --arg r "$r" --arg repo "$full" --arg d "$d" --argjson p "$prs" '.[$r]={repo:$repo,deployedAt:$d,undeployed:$p}' "$OUT" > t && mv t "$OUT"
  n=$(jq -r --arg r "$r" '.[$r].undeployed|length' "$OUT")
  total=$((total + n))
  jq -r --arg r "$r" --arg repo "$full" --arg sha "$sha" '.[$r]|"\($r) (\($repo)) deployed \(.deployedAt) sha=\($sha): \(.undeployed|length) undeployed" + (if (.undeployed|length)>0 then " -> "+(.undeployed|map("#\(.number) \(.title[0:50])")|join("; ")) else "" end)' "$OUT"
done
echo "drift total undeployed PRs: $total"
if [ "$skipped" -gt 0 ]; then
  echo "drift skipped (no repo home): $skipped" >&2
fi
