#!/usr/bin/env bash
# Site + money-path health board.
# - Probes live sites: status, gate state, asset tip -> sites.json + stdout
# - Money paths -> status.json ("money paths working: N/M")
# Gates (401, Access redirect, coming-soon) count as intended (site OK; money path gated).
#
# Usage:
#   export HEALTH_DIR=/path/to/a/working/dir
#   # Optional untracked creds file (chmod 600). Never commit it or print it.
#   #   MOQ_GATE_PW, BP_GATE_PW, FS_ACCESS_ID, FS_ACCESS_SECRET
#   # PROBE_CREDS defaults to $HEALTH_DIR/probe-creds.env
#   ./check.sh
#
# Redaction note (2026-11-11 export): a leftover hardcoded gate password was removed
# from this copy. Credentials belong in the environment or an untracked env file.
set -u
DIR="${HEALTH_DIR:-.}"
OUT=$DIR/status.json
SITES_OUT=$DIR/sites.json
T=15
CREDS="${PROBE_CREDS:-$DIR/probe-creds.env}"
[ -r "$CREDS" ] && . "$CREDS"
MOQ_GATE_PW=${MOQ_GATE_PW:-}; BP_GATE_PW=${BP_GATE_PW:-}
FS_ACCESS_ID=${FS_ACCESS_ID:-}; FS_ACCESS_SECRET=${FS_ACCESS_SECRET:-}

j(){ curl -s -m $T "$@"; }
code(){ curl -s -o /dev/null -m $T -w '%{http_code}' "$@"; }

# --- site tip probe ---
SROWS=()
probe_site(){
  local name="$1" url="$2"
  local tmp body hdr meta status final redirects title tip gate note
  tmp=$(mktemp); body=$tmp.body; hdr=$tmp.hdr; meta=$tmp.meta
  curl -sS -L --max-time $T --connect-timeout 10 --compressed \
    -o "$body" -D "$hdr" \
    -w 'STATUS=%{http_code}\nFINAL=%{url_effective}\nREDIRECTS=%{num_redirects}\n' \
    "$url" > "$meta" 2>/dev/null || true
  status=$(awk -F= '/^STATUS=/{print $2}' "$meta")
  final=$(awk -F= '/^FINAL=/{print $2}' "$meta")
  redirects=$(awk -F= '/^REDIRECTS=/{print $2}' "$meta")
  tip=$(grep -Eo '(index|main|Base|catalog|LiveMoqDemo)[.-][A-Za-z0-9_-]+\.(js|css)' "$body" 2>/dev/null | sort -u | tr '\n' ' ' | sed 's/ *$//')
  title=$(tr '\n' ' ' < "$body" 2>/dev/null | grep -Eo '<title[^>]*>[^<]{0,160}</title>' | head -1 | sed 's/<[^>]*>//g')
  gate=open; note=
  if [ "$status" = "401" ] || [ "$status" = "403" ]; then
    gate=password
  elif grep -qiE 'cloudflareaccess\.com|CF_Authorization|Cloudflare Access' "$hdr" "$body" 2>/dev/null; then
    gate=access
  elif echo "$final" | grep -qi 'cloudflareaccess.com'; then
    gate=access
  elif grep -qiE 'coming soon|under construction|construction gate|Preview password required' <<<"$title $body" 2>/dev/null; then
    gate=coming-soon
  elif [ "$status" = "530" ]; then
    gate=cf-530; note=known-or-down
  elif [ -z "$status" ] || [ "$status" = "000" ]; then
    gate=down; note=unreachable
  fi
  # intended vs unexpected
  local state=ok
  case "$gate" in
    open|password|access|coming-soon) state=ok ;;
    cf-530) state=known; [ "$name" = "tomcatchex.com" ] || state=warn ;;
    down) state=fail ;;
  esac
  SROWS+=("$(jq -nc \
    --arg n "$name" --arg u "$url" --arg st "${status:-000}" --arg f "${final:-}" \
    --arg r "${redirects:-0}" --arg tip "${tip:-}" --arg title "${title:-}" \
    --arg gate "$gate" --arg state "$state" --arg note "${note:-}" \
    '{name:$n,url:$u,status:($st|tonumber? // 0),final:$f,redirects:($r|tonumber? // 0),tip:$tip,title:$title,gate:$gate,state:$state,note:$note}')")
  printf '%-28s %s %-5s gate=%-12s tip=%s\n' "$name" "${status:-000}" "$state" "$gate" "${tip:-(none)}"
  rm -f "$body" "$hdr" "$meta"
}

echo "== sites =="
# Primary fleet (morning health)
probe_site colorbars.dev            https://colorbars.dev/
probe_site colorbars.pro            https://colorbars.pro/
probe_site moqstudio.dev            https://moqstudio.dev/
probe_site moqstudio.pro            https://moqstudio.pro/
probe_site moqstudio.stream         https://moqstudio.stream/
probe_site hardknox.org             https://hardknox.org/
probe_site text.hardknox.org/health https://text.hardknox.org/health
probe_site jessiepine.com           https://jessiepine.com/
probe_site moq.hificowboy           https://moq.hificowboy.com/
probe_site bitprairie.com           https://bitprairie.com/
probe_site bitprairie/consulting    https://bitprairie.com/consulting
probe_site ai.bitprairie.com        https://ai.bitprairie.com/
probe_site si.bitprairie.com        https://si.bitprairie.com/
probe_site fibershare.app           https://fibershare.app/
probe_site ptsn.pro                 https://ptsn.pro/
probe_site streamingportfolio.com   https://streamingportfolio.com/
probe_site artist-space.com         https://artist-space.com/
probe_site artistspace.info         https://artistspace.info/
probe_site moqFeeder                https://moq.hificowboy.com/api/health
# Known noisy
probe_site tomcatchex.com           https://tomcatchex.com/

printf '%s\n' "${SROWS[@]}" | jq -s --arg t "$(date -Iseconds)" \
  '{checkedAt:$t,sites:.}' > "$SITES_OUT"

# --- money paths ---
echo "== money paths =="
R=()
add(){ R+=("$(jq -nc --arg n "$1" --argjson ok "$2" --arg d "$3" '{name:$n,ok:$ok,gated:($ok==null),detail:$d}')"); }
JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT

# moqFeeder
mh=$(code https://moq.hificowboy.com/api/health)
if [ -n "$MOQ_GATE_PW" ]; then
  curl -s -o /dev/null -m $T -c "$JAR" -H 'content-type: application/json' \
    --data "$(jq -nc --arg p "$MOQ_GATE_PW" '{password:$p,next:"/"}')" https://moq.hificowboy.com/__gate
  P=$(j -b "$JAR" https://moq.hificowboy.com/api/paddock); via=cookie
else
  P=$(j https://moq.hificowboy.com/api/paddock); via=anon
fi
if [ "$(jq -r '.siteGate // false' <<<"$P" 2>/dev/null)" = true ]; then
  add "moqFeeder checkout+feed" null "gated: unknown (site gate 401 on /api/paddock, via=$via) health=$mh"
elif [ -n "$P" ]; then
  s=$(jq -r '.data.stripe.ready' <<<"$P"); p=$(jq -r '.data.paypal.ready' <<<"$P")
  h=$(jq -r "[..|objects|select(has(\"hardwareOnline\"))|.hardwareOnline][0]" <<<"$P")
  lf=$(jq -r '.data.yard.lastFeedAt // empty' <<<"$P" 2>/dev/null)
  if [[ "$lf" =~ ^[0-9]+$ ]]; then age=$(( ( $(date +%s%3N) - lf ) / 3600000 )); else age=999; fi
  ok=false; [ "$s" = true ] && [ "$p" = true ] && [ "$h" = true ] && [ $age -lt 24 ] && ok=true
  add "moqFeeder checkout+feed" $ok "stripe=$s paypal=$p hardwareOnline=$h lastFeed=${age}h ago via=$via"
else
  add "moqFeeder checkout+feed" false "paddock unreachable health=$mh"
fi

# FiberShare
for H in fibershare.app; do
  A=(); via=anon
  [ -n "$FS_ACCESS_ID" ] && [ -n "$FS_ACCESS_SECRET" ] && {
    A=(-H "CF-Access-Client-Id: $FS_ACCESS_ID" -H "CF-Access-Client-Secret: $FS_ACCESS_SECRET"); via=service-token
  }
  hc=$(code https://$H/api/health)
  loc=$(curl -s -o /dev/null -m $T -w '%{http_code} %{redirect_url}' "${A[@]}" https://$H/api/payments/config)
  if [[ "$loc" == 30[0-9]*cloudflareaccess.com* ]] || [[ "$loc" == 401* ]] || [[ "$loc" == 403* ]]; then
    add "FiberShare $H" null "gated: unknown (Cloudflare Access ${loc%% *} on /api/payments/config, via=$via) health=$hc"
  else
    tc=$(j "${A[@]}" https://$H/api/tiers | jq -r '.tiers|length' 2>/dev/null)
    C=$(j "${A[@]}" https://$H/api/payments/config)
    st=$(jq -r '.methods.stripe' <<<"$C" 2>/dev/null)
    pp=$(jq -r '.methods.paypal' <<<"$C" 2>/dev/null)
    sc=$(jq -r '.sponsorCheckout' <<<"$C" 2>/dev/null)
    ok=false; [ "$hc" = 200 ] && [ "${tc:-0}" -gt 0 ] && [ "$st" = true ] && [ "$pp" = true ] && [ "$sc" = true ] && ok=true
    add "FiberShare $H" $ok "health=$hc tiers=${tc:-?} stripe=$st paypal=$pp sponsorCheckout=$sc via=$via"
  fi
done

# bitprairie consulting — intended private-beta sign-in gate (confirmed 2026-11-09).
# A 401 is expected, not an outage or a new blocker. Public homepage is 200 and does not link here.
via=anon; CK=()
if [ -n "$BP_GATE_PW" ]; then
  curl -s -o /dev/null -m $T -c "$JAR" --data-urlencode "password=$BP_GATE_PW" --data-urlencode "next=/consulting" https://bitprairie.com/consulting
  CK=(-b "$JAR"); via=cookie
fi
fin=$(curl -sL -o /dev/null -m $T "${CK[@]}" -w '%{http_code} %{url_effective}' https://bitprairie.com/consulting)
body=$(curl -sL -m $T "${CK[@]}" https://bitprairie.com/consulting)
code_only=${fin%% *}
gate=no; grep -qi "under construction" <<<"$body" && gate=yes
if [ "$gate" = yes ] || [ "$code_only" = "401" ] || [ "$code_only" = "403" ]; then
  add "bitprairie consulting" null "gated: intended private-beta sign-in gate ($code_only, via=$via) final=$fin — not an outage, do not list as a new blocker"
else
  ok=false; [[ "$fin" == "200 "*consulting* ]] && ok=true
  add "bitprairie consulting" $ok "final=$fin gatePage=no via=$via"
fi

# Artist Space checkout
acode=$(code https://artist-space.com/api/payments/config)
if [ "$acode" = 401 ] || [ "$acode" = 403 ]; then
  add "Artist Space checkout" null "gated: unknown (construction gate $acode on /api/payments/config); note: 5 Stripe/PayPal keys still missing (known)"
else
  C=$(j https://artist-space.com/api/payments/config)
  st=$(jq -r '.stripe' <<<"$C" 2>/dev/null); pp=$(jq -r '.paypal' <<<"$C" 2>/dev/null); md=$(jq -r '.mode' <<<"$C" 2>/dev/null)
  ms=$(jq -r '(.missing // [])|length' <<<"$C" 2>/dev/null)
  ok=false; [ "$st" = true ] && [ "$pp" = true ] && [ "$md" = sandbox ] && ok=true
  add "Artist Space checkout" $ok "http=$acode stripe=${st:-?} paypal=${pp:-?} mode=${md:-?} missing=${ms:-?}"
fi

G=()
printf '%s\n' "${R[@]}" | jq -s --argjson g "$(printf '%s\n' "${G[@]}"|jq -s .)" --arg t "$(date -Iseconds)" \
  '{checkedAt:$t,working:(map(select(.ok==true))|length),gatedUnknown:(map(select(.ok==null))|length),total:length,moneyPaths:.,gate:$g}' > "$OUT"
jq -r '.moneyPaths[]|"\(if .ok==true then "OK  " elif .ok==null then "GATE" else "FAIL" end) \(.name): \(.detail)"' "$OUT"
jq -r '"money paths working: \(.working)/\(.total)  | gated: unknown \(.gatedUnknown)/\(.total)"' "$OUT"
