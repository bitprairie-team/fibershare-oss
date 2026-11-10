#!/bin/sh
# Build the browser island, then wasm-opt -Oz.
# binaryen 108 exports the funcref table under __wbindgen_externrefs.
# The glue writes JS values into that table, so point the export at the anyref table.
set -eu
cd "$(dirname "$0")/.."
version=$(awk '
  $0 ~ /^name = "wasm-bindgen"$/ { found = 1; next }
  found && $1 == "version" { gsub(/"/, "", $3); print $3; exit }
' Cargo.lock)
cargo install wasm-bindgen-cli --version "$version" --locked
cargo build -p fibershare-client --profile wasm-release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-name client --out-dir public/wasm \
  target/wasm32-unknown-unknown/wasm-release/fibershare_client.wasm
wasm-opt -Oz \
  --enable-bulk-memory \
  --enable-sign-ext \
  --enable-nontrapping-float-to-int \
  --enable-reference-types \
  -o public/wasm/client_bg.wasm public/wasm/client_bg.wasm
python3 - <<'PY'
from pathlib import Path
path = Path("public/wasm/client_bg.wasm")
data = bytearray(path.read_bytes())
name = b"__wbindgen_externrefs"
at = data.find(name)
if at < 0:
    raise SystemExit("externref export missing")
kind, index = data[at + len(name)], data[at + len(name) + 1]
if kind == 1 and index == 0:
    data[at + len(name) + 1] = 1
    path.write_bytes(data)
PY
