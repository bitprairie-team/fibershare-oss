# Performance, measured on one machine

Compared commit `e349258` (Vite production build, `node scripts/serve-local.js`) with this branch's release binary (`cargo build -p fibershare --release`, `fibershare serve`). Both ran on this VM, sample data only. Nothing below is an estimate. The raw rows are in [performance-raw.tsv](performance-raw.tsv). Reproduce them with [scripts/bench.sh](../scripts/bench.sh).

The Vite site is one `index.html` for every route. The hash router paints home, the herd view, and trace in the browser. Alerts are a section of the herd view, so home, herd, and trace are the three documents. This branch sends a different HTML file per path. Alerts are in `/map`.

## Method

| Item | How it was measured |
| --- | --- |
| Page weight | Response or built file, `gzip -9`, `brotli -q 11`. A page total is the sum of the HTML plus the CSS, font, JS, WASM, and image files that document requests. Fonts count because `@font-face` points at them. Header logos and the footer plate count because the markup includes them (both theme logos are in the HTML; CSS hides one). Favicons and the social card are not in the total. The `.woff` fallbacks on the Vite site are not in the total. Leaflet is only on `/rancher`. The Vite totals in this writeup still omit the old footer tile (4,477 bytes, brotli 1,204), which was the only header or footer image on that shell. |
| Lighthouse | `lighthouse@12.8.2`, Chrome headless (`--headless=new --no-sandbox --disable-gpu`), performance category only, 3 runs, median. Mobile is simulated slow 4G (`rttMs` 150, throughput 1638.4 kbps, CPU 4×) at 412×823. Desktop is the desktop preset (`rttMs` 40, CPU 1×) at 1350×940. |
| Throughput | `oha` 1.8.0, `-c 32 -n 2000`, both servers up. p50 and p99 are `latencyPercentiles`. req/s is `summary.requestsPerSec`. |
| Cold start | Nanoseconds from process spawn until `GET /api/health` returns, polled every 5 ms. The binary and `node` were already in the page cache. |
| Idle RSS | `VmRSS` in `/proc/<pid>/status`, one second after health, before the load test. |
| Image | `sudo podman build -t fibershare:bench -f Containerfile` from a context that left out `.git` and `target/`. `podman image inspect` `.Size`. `e349258` has no Containerfile. |
| Build | `cargo build -p fibershare --release` twice, as `scripts/bench.sh` times them. This run started without a release binary, so the first command compiled the server and its dependencies. The second command changed nothing. `npm run build` in the `e349258` tree with `node_modules` already installed. |

Lighthouse URLs: Rust `/`, `/map`, `/trace` on port 4174. Vite `/#/`, `/#/map`, `/#/trace` on port 4184.

Signed `GET /api/log` used a bench passphrase (`bench-sample-pass`) and the `fs_session` cookie from `POST /api/session`. Unsigned requests got 401 on both servers.

## Page weight

Bytes. Gzip and Brotli are the sums of each file compressed on its own.

| Page | HTML | CSS | JS / WASM | Fonts | Images | Total | Gzip | Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rust `/` | 8,486 | 81,446 | 9,668 | 71,024 | 47,595 | 218,219 | 106,396 | 99,279 |
| Rust `/map` (herd and alerts) | 43,794 | 81,446 | 68,522 | 71,024 | 47,595 | 312,381 | 133,397 | 122,217 |
| Rust `/trace` | 8,698 | 81,446 | 9,668 | 71,024 | 47,595 | 218,431 | 106,432 | 99,321 |
| Rust `/rancher` | 16,475 | 96,252 | 169,102 | 71,024 | 47,595 | 400,448 | 158,384 | 144,410 |
| Vite, every hash route | 4,330 | 67,002 | 114,176 | 71,024 | — | 256,532 | 122,846 | 115,836 |

Home and trace load `chrome.js` (9,668; brotli 2,487) and no WASM. `/map` also loads `client.js` (20,824; brotli 4,090) and `client_bg.wasm` (38,030; brotli 14,100). `/rancher` loads `chrome.js`, `leaflet.css` (14,806), `leaflet.js` (147,552), and `live-map.js` (11,882), and no WASM. Every Rust page also requests `logo-light.svg` (10,726; brotli 3,245), `logo-dark.svg` (10,726; brotli 3,246), and `bitprairie-tile.svg` (26,143; brotli 6,721). The Vite rancher route has extra built files that the shell does not request up front: `rancher-map-CKzLhw3K.js` (231,099; brotli 56,858) and `rancher-map-CIGW-MKW.css` (15,607; brotli 5,723). Home and trace stay under the Vite shell's brotli total of 115,836 (99,279 and 99,321). `/map` is now above it at 122,217, mostly from the official marks plus the WASM island. Adding the old Vite footer tile (brotli 1,204) to the Vite total would not change that /map result.

## Lighthouse

Median of 3. Score is the performance category (0–100). Times are milliseconds.

| Page | Form | Score | FCP | LCP | TBT | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Rust home | mobile | 100 | 1351.0 | 1651.0 | 0 | 0.002944381650399577 |
| Rust home | desktop | 100 | 401.0 | 420.3 | 0 | 7.450639173452412e-06 |
| Rust herd and alerts | mobile | 95 | 1879.1 | 2629.1 | 0 | 0.0002531697553670517 |
| Rust herd and alerts | desktop | 100 | 441.0 | 561.0 | 0 | 0.0002800979150494108 |
| Rust trace | mobile | 100 | 1350.8 | 1650.8 | 0 | 0.00010072195012298952 |
| Rust trace | desktop | 100 | 401.3 | 421.3 | 0 | 3.794941246045837e-05 |
| Vite home | mobile | 95 | 2402.4 | 2402.4 | 0 | 0.0001376500563241792 |
| Vite home | desktop | 100 | 484.0 | 484.0 | 0 | 0.007794420254624345 |
| Vite herd and alerts | mobile | 93 | 2404.1 | 2702.5 | 3 | 0 |
| Vite herd and alerts | desktop | 100 | 495.3 | 563.7 | 0 | 0 |
| Vite trace | mobile | 94 | 2402.2 | 2628.4 | 0 | 0.0001376500563241792 |
| Vite trace | desktop | 100 | 483.6 | 524.1 | 0 | 0.002112932827660141 |

FCP and LCP in the table are the median rounded to 0.1 ms. The TSV has the unrounded audit values.

## Local server

`oha -c 32 -n 2000`. Latency is milliseconds.

| Request | Status | p50 | p99 | req/s |
| --- | ---: | ---: | ---: | ---: |
| Rust `GET /` | 200 | 0.187508 | 1.282506 | 111989.5133019744 |
| Vite `GET /` | 200 | 2.310374 | 9.373251 | 11371.603399433943 |
| Rust `GET /api/log` unsigned | 401 | 0.201925 | 0.913847 | 129304.72397352899 |
| Vite `GET /api/log` unsigned | 401 | 0.865137 | 5.462525 | 30518.64638938625 |
| Rust `GET /api/log` signed | 200 | 0.231459 | 0.835817 | 115364.95675227343 |
| Vite `GET /api/log` signed | 200 | 1.593911 | 8.797407 | 16694.688283583455 |

| | Cold start | Idle RSS |
| --- | ---: | ---: |
| Rust release `fibershare serve` | 14 ms | 7,388 kB |
| Node `scripts/serve-local.js` | 61 ms | 59,100 kB |

## Image and build

| | Result |
| --- | --- |
| Rust image `fibershare:bench` | Not remeasured. `podman` is not installed on this machine. The last recorded size was 87,085,496 bytes. |
| Vite at `e349258` | No Containerfile in that commit |
| `cargo build -p fibershare --release` | 35,656 ms (no release binary yet, so dependencies compiled too) |
| Same command, nothing changed | 109 ms |
| `npm run build` | 1,377 ms |

## Reproduce

From a checkout of `e349258` at `OLD_TREE` (this run used `/tmp/old`, after `npm ci`):

```bash
OLD_TREE=/tmp/old OHA=/tmp/oha scripts/bench.sh
```

The script refuses to start if port 4174 or 4184 is already taken. Lighthouse needs Chrome and `npx`. Page weight needs `gzip` and `brotli`. The container step is:

```bash
# /etc/containers/registries.conf: unqualified-search-registries = ["docker.io"]
sudo podman build --network=host -t fibershare:bench -f Containerfile .
sudo podman image inspect fibershare:bench --format '{{.Size}}'
```

This run did not rebuild the image, because `podman` is not installed here. The earlier image was built from a copy of the tree that omitted `.git` and `target/`. Those directories are not inputs to the binary the Containerfile compiles.
