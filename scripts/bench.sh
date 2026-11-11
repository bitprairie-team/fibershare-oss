#!/usr/bin/env bash
# Measure this Rust server against main at e349258 (Vite + scripts/serve-local.js).
# Both are production builds on this machine. Sample data only.
#
#   OLD_TREE=/tmp/old OHA=/tmp/oha scripts/bench.sh
#
# Writes docs/performance-raw.tsv. Lighthouse JSON lands in /tmp/fs-bench/lh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OLD="${OLD_TREE:-/tmp/old}"
OHA="${OHA:-/tmp/oha}"
RAW="$ROOT/docs/performance-raw.tsv"
WORK="${BENCH_WORK:-/tmp/fs-bench}"
RUST_PORT="${RUST_PORT:-4174}"
NODE_PORT="${NODE_PORT:-4184}"
PASS="${BENCH_PASSPHRASE:-bench-sample-pass}"
mkdir -p "$WORK/lh" "$WORK/bodies"
: >"$RAW"
row() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" | tee -a "$RAW"; }

bytes() { wc -c <"$1" | tr -d ' '; }
gz() { gzip -c -9 "$1" | wc -c | tr -d ' '; }
br() { brotli -c -q 11 "$1" | wc -c | tr -d ' '; }

file_weight() {
  local label="$1" file="$2"
  row weight "$label bytes" "$(bytes "$file")"
  row weight "$label gzip-9" "$(gz "$file")"
  row weight "$label brotli-11" "$(br "$file")"
}

echo "build rust release"
start=$(date +%s%N)
(cd "$ROOT" && cargo build -p fibershare --release)
row build "rust cargo build -p fibershare --release ms" "$(( ($(date +%s%N) - start) / 1000000 ))"
start=$(date +%s%N)
(cd "$ROOT" && cargo build -p fibershare --release)
row build "rust cargo build -p fibershare --release unchanged ms" "$(( ($(date +%s%N) - start) / 1000000 ))"

echo "build node production"
start=$(date +%s%N)
(cd "$OLD" && npm run build --silent)
row build "node npm run build ms" "$(( ($(date +%s%N) - start) / 1000000 ))"

# Shared assets the documents request.
file_weight "rust public/style.css" "$ROOT/public/style.css"
for font in "$ROOT"/public/fonts/*.woff2; do
  file_weight "rust $(basename "$font")" "$font"
done
file_weight "rust public/chrome.js" "$ROOT/public/chrome.js"
file_weight "rust public/wasm/client.js" "$ROOT/public/wasm/client.js"
file_weight "rust public/wasm/client_bg.wasm" "$ROOT/public/wasm/client_bg.wasm"
file_weight "rust public/vendor/leaflet/leaflet.css" "$ROOT/public/vendor/leaflet/leaflet.css"
file_weight "rust public/vendor/leaflet/leaflet.js" "$ROOT/public/vendor/leaflet/leaflet.js"
file_weight "rust public/live-map.js" "$ROOT/public/live-map.js"
# Header logos and the footer plate, requested on every HTML page.
file_weight "rust public/brand/logo-light.svg" "$ROOT/public/brand/logo-light.svg"
file_weight "rust public/brand/logo-dark.svg" "$ROOT/public/brand/logo-dark.svg"
file_weight "rust public/brand/bitprairie-tile.svg" "$ROOT/public/brand/bitprairie-tile.svg"
if [[ -f "$OLD/public/brand/bitprairie-tile.svg" ]]; then
  file_weight "node public/brand/bitprairie-tile.svg" "$OLD/public/brand/bitprairie-tile.svg"
fi
file_weight "node dist/index.html" "$OLD/dist/index.html"
while IFS= read -r asset; do
  file_weight "node dist/assets/$(basename "$asset")" "$asset"
done < <(find "$OLD/dist/assets" -type f \( -name '*.js' -o -name '*.css' -o -name '*.woff' -o -name '*.woff2' \) | sort)

# Sample passphrase hashes, one per tree. Not a secret; bench only.
(cd "$ROOT" && FIBERSHARE_PASSPHRASE="$PASS" ./target/release/fibershare passphrase)
(cd "$OLD" && node --input-type=module -e '
import { hashPassphrase } from "./server/local-auth.js";
import { writeFileSync, mkdirSync } from "node:fs";
const pass = process.argv[1];
mkdirSync(".local", {recursive:true});
writeFileSync(".local/rancher.json", JSON.stringify(hashPassphrase(pass)));
' "$PASS")

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup EXIT

if python3 - "$RUST_PORT" "$NODE_PORT" <<'PY'
import os, sys
ports = {int(p) for p in sys.argv[1:]}
busy = set()
for fn in ("/proc/net/tcp", "/proc/net/tcp6"):
    for line in open(fn):
        parts = line.split()
        if len(parts) < 4 or parts[3] != "0A":
            continue
        port = int(parts[1].rsplit(":", 1)[1], 16)
        if port in ports:
            busy.add(port)
if busy:
    print("port already in use:", sorted(busy), file=sys.stderr)
    sys.exit(1)
PY
then
  :
else
  exit 1
fi

echo "cold start rust"
start=$(date +%s%N)
(cd "$ROOT" && FIBERSHARE_HOST=127.0.0.1 FIBERSHARE_PORT="$RUST_PORT" ./target/release/fibershare serve) &
pids+=($!)
rust_pid=${pids[-1]}
for _ in $(seq 1 1000); do
  if curl -sf -o /dev/null "http://127.0.0.1:$RUST_PORT/api/health"; then break; fi
  kill -0 "$rust_pid" || { echo "rust server exited"; exit 1; }
  sleep 0.005
done
row cold "rust ms until /api/health" "$(( ($(date +%s%N) - start) / 1000000 ))"
sleep 1
row rss "rust idle VmRSS kB" "$(awk '/VmRSS/ {print $2}' /proc/"$rust_pid"/status)"

echo "cold start node"
start=$(date +%s%N)
(cd "$OLD" && FIBERSHARE_HOST=127.0.0.1 FIBERSHARE_PORT="$NODE_PORT" node scripts/serve-local.js) &
pids+=($!)
node_pid=${pids[-1]}
for _ in $(seq 1 1000); do
  if curl -sf -o /dev/null "http://127.0.0.1:$NODE_PORT/api/health"; then break; fi
  kill -0 "$node_pid" || { echo "node server exited"; exit 1; }
  sleep 0.005
done
row cold "node ms until /api/health" "$(( ($(date +%s%N) - start) / 1000000 ))"
sleep 1
row rss "node idle VmRSS kB" "$(awk '/VmRSS/ {print $2}' /proc/"$node_pid"/status)"

save_body() {
  local port="$1" path="$2" dest="$3"
  curl -sf "http://127.0.0.1:$port$path" -o "$dest"
  row html "$(basename "$dest") bytes" "$(bytes "$dest")"
  row html "$(basename "$dest") gzip-9" "$(gz "$dest")"
  row html "$(basename "$dest") brotli-11" "$(br "$dest")"
}
save_body "$RUST_PORT" "/" "$WORK/bodies/rust-home.html"
save_body "$RUST_PORT" "/map" "$WORK/bodies/rust-map.html"
save_body "$RUST_PORT" "/trace" "$WORK/bodies/rust-trace.html"
save_body "$RUST_PORT" "/architecture" "$WORK/bodies/rust-architecture.html"
save_body "$RUST_PORT" "/rancher" "$WORK/bodies/rust-rancher.html"
save_body "$NODE_PORT" "/" "$WORK/bodies/node-shell.html"

# Login cookies for GET /api/log. Unsigned is measured too.
rust_cookie=$(curl -sf -D - -o /dev/null -H 'content-type: application/json' -d "{\"passphrase\":\"$PASS\"}" "http://127.0.0.1:$RUST_PORT/api/session" | awk 'tolower($1)=="set-cookie:"{print $2}' | cut -d= -f2 | cut -d\; -f1)
node_cookie=$(curl -sf -D - -o /dev/null -H 'content-type: application/json' -d "{\"passphrase\":\"$PASS\"}" "http://127.0.0.1:$NODE_PORT/api/session" | awk 'tolower($1)=="set-cookie:"{print $2}' | cut -d= -f2 | cut -d\; -f1)
row check "rust login cookie length" "${#rust_cookie}"
row check "node login cookie length" "${#node_cookie}"

oha_one() {
  local label="$1" url="$2" cookie="${3:-}"
  local args=(-c 32 -n 2000 --no-tui -j)
  if [[ -n "$cookie" ]]; then args+=(-H "cookie: fs_session=$cookie"); fi
  local json
  json=$("$OHA" "${args[@]}" "$url")
  python3 -c '
import json,sys
label, raw = sys.argv[1], sys.argv[2]
data = json.loads(raw)
def find(obj, names):
    if isinstance(obj, dict):
        for n in names:
            if n in obj: return obj[n]
        for v in obj.values():
            got = find(v, names)
            if got is not None: return got
    return None
lat = data["latencyPercentiles"]
p50 = lat["p50"]
p99 = lat["p99"]
rps = data["summary"]["requestsPerSec"]
status = data.get("statusCodeDistribution")
print(f"oha\t{label} p50-seconds\t{p50}")
print(f"oha\t{label} p99-seconds\t{p99}")
print(f"oha\t{label} rps\t{rps}")
print(f"oha\t{label} status\t{status}")
if p50 is None:
    print("OHA_KEYS", list(data)[:40], file=sys.stderr)
    sys.exit(1)
' "$label" "$json" | tee -a "$RAW"
}

oha_one "rust GET /" "http://127.0.0.1:$RUST_PORT/"
oha_one "node GET /" "http://127.0.0.1:$NODE_PORT/"
oha_one "rust GET /api/log unsigned" "http://127.0.0.1:$RUST_PORT/api/log"
oha_one "node GET /api/log unsigned" "http://127.0.0.1:$NODE_PORT/api/log"
oha_one "rust GET /api/log signed" "http://127.0.0.1:$RUST_PORT/api/log" "$rust_cookie"
oha_one "node GET /api/log signed" "http://127.0.0.1:$NODE_PORT/api/log" "$node_cookie"

if [[ "${SKIP_LIGHTHOUSE:-0}" != 1 ]]; then
  export CHROME_PATH="${CHROME_PATH:-/usr/bin/google-chrome}"
  LH="npx --yes lighthouse@12.8.2"
  run_lh() {
    local name="$1" url="$2" preset="$3"
    local out="$WORK/lh/${name}.json"
    if [[ "$preset" == desktop ]]; then
      $LH "$url" --quiet --only-categories=performance \
        --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
        --output=json --output-path="$out" --preset=desktop
    else
      $LH "$url" --quiet --only-categories=performance \
        --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
        --output=json --output-path="$out" \
        --form-factor=mobile --screenEmulation.mobile=true
    fi
    python3 -c '
import json,sys
data=json.load(open(sys.argv[1]))
a=data["audits"]
cat=data["categories"]["performance"]["score"]
def ms(k):
    v=a[k]["numericValue"]
    return v
print("\t".join(["lh", sys.argv[2], "score", str(cat)]))
print("\t".join(["lh", sys.argv[2], "fcp-ms", str(ms("first-contentful-paint"))]))
print("\t".join(["lh", sys.argv[2], "lcp-ms", str(ms("largest-contentful-paint"))]))
print("\t".join(["lh", sys.argv[2], "tbt-ms", str(ms("total-blocking-time"))]))
print("\t".join(["lh", sys.argv[2], "cls", str(ms("cumulative-layout-shift"))]))
' "$out" "$name" | tee -a "$RAW"
  }
  # Alerts are a section of the herd view, so that URL is the alerts page too.
  for stack in rust node; do
    if [[ "$stack" == rust ]]; then base="http://127.0.0.1:$RUST_PORT"; home=/; herd=/map; trace=/trace; fi
    if [[ "$stack" == node ]]; then base="http://127.0.0.1:$NODE_PORT"; home=/#/; herd=/#/map; trace=/#/trace; fi
    for page in home herd trace; do
      eval "path=\$$page"
      for preset in mobile desktop; do
        for n in 1 2 3; do
          run_lh "${stack}-${page}-${preset}-${n}" "${base}${path}" "$preset"
        done
      done
    done
  done
fi

if command -v podman >/dev/null 2>&1; then
  ctx=$(mktemp -d)
  tar -C "$ROOT" -cf - --exclude target --exclude .git --exclude docs/performance-raw.tsv . | tar -C "$ctx" -xf -
  # Bridge DNS could not resolve index.crates.io on this VM. Host network can.
  if sudo podman build --network=host -t fibershare:bench -f "$ctx/Containerfile" "$ctx"; then
    size=$(sudo podman image inspect fibershare:bench --format '{{.Size}}')
    row image "rust podman Size bytes" "$size"
  else
    row image "rust podman build" "failed"
  fi
  rm -rf "$ctx"
else
  row image "podman" "not installed"
fi
if [[ ! -f "$OLD/Containerfile" && ! -f "$OLD/Dockerfile" ]]; then
  row image "node container file" "absent"
fi

echo "wrote $RAW"
