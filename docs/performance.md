# Performance, measured on one machine

Compared commit `e349258` (Vite production build, `node scripts/serve-local.js`) with this branch's release binary (`cargo build -p fibershare --release`, `fibershare serve`). Both ran on this VM, sample data only. Nothing below is an estimate. The raw rows are in [performance-raw.tsv](performance-raw.tsv). Reproduce them with [scripts/bench.sh](../scripts/bench.sh).

The Vite site is one `index.html` for every route. The hash router paints home, the herd view, and trace in the browser. Alerts are a section of the herd view, so home, herd, and trace are the three documents. This branch sends a different HTML file per path. Alerts are in `/map`.

## Method

| Item | How it was measured |
| --- | --- |
| Page weight | Response or built file, `gzip -9`, `brotli -q 11`. A page total is the sum of the HTML plus the CSS, font, JS, and WASM files that document requests. Fonts count because `@font-face` points at them. The `.woff` fallbacks on the Vite site are not in the total. Leaflet is only on `/rancher`. |
| Lighthouse | `lighthouse@12.8.2`, Chrome headless (`--headless=new --no-sandbox --disable-gpu`), performance category only, 3 runs, median. Mobile is simulated slow 4G (`rttMs` 150, throughput 1638.4 kbps, CPU 4×) at 412×823. Desktop is the desktop preset (`rttMs` 40, CPU 1×) at 1350×940. |
| Throughput | `oha` 1.8.0, `-c 32 -n 2000`, both servers up. p50 and p99 are `latencyPercentiles`. req/s is `summary.requestsPerSec`. |
| Cold start | Nanoseconds from process spawn until `GET /api/health` returns, polled every 5 ms. The binary and `node` were already in the page cache. |
| Idle RSS | `VmRSS` in `/proc/<pid>/status`, one second after health, before the load test. |
| Image | `sudo podman build -t fibershare:bench -f Containerfile` from a context that left out `.git` and `target/`. `podman image inspect` `.Size`. `e349258` has no Containerfile. |
| Build | `cargo build -p fibershare --release` with the crate cache warm and `target/release` empty, then a second run with nothing changed. `npm run build` in the `e349258` tree with `node_modules` already installed. |

Lighthouse URLs: Rust `/`, `/map`, `/trace` on port 4174. Vite `/#/`, `/#/map`, `/#/trace` on port 4184.

Signed `GET /api/log` used a bench passphrase (`bench-sample-pass`) and the `fs_session` cookie from `POST /api/session`. Unsigned requests got 401 on both servers.

## Page weight

Bytes. Gzip and Brotli are the sums of each file compressed on its own.

| Page | HTML | CSS | JS / WASM | Fonts | Total | Gzip | Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rust `/` | 9,518 | 82,096 | 689,694 | 71,024 | 852,332 | 292,093 | 243,789 |
| Rust `/map` (herd and alerts) | 43,923 | 82,096 | 689,694 | 71,024 | 886,737 | 297,425 | 248,272 |
| Rust `/trace` | 9,823 | 82,096 | 689,694 | 71,024 | 852,637 | 292,128 | 243,839 |
| Rust `/rancher` | 9,708 | 96,902 | 839,092 | 71,024 | 1,016,726 | 338,952 | 284,473 |
| Vite, every hash route | 4,330 | 67,002 | 114,176 | 71,024 | 256,532 | 122,851 | 115,836 |

Rust JS/WASM is `client.js` (26,179) plus `client_bg.wasm` (663,515). `/rancher` also requests `leaflet.css` (14,806), `leaflet.js` (147,552), and `live-map.js` (1,846). The Vite rancher route has extra built files that the shell does not request up front: `rancher-map-CKzLhw3K.js` (231,099; gzip 66,318; brotli 56,858) and `rancher-map-CIGW-MKW.css` (15,607; gzip 6,478; brotli 5,723).

## Lighthouse

Median of 3. Score is the performance category (0–100). Times are milliseconds.

| Page | Form | Score | FCP | LCP | TBT | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Rust home | mobile | 99 | 1652.0 | 1727.0 | 0 | 0.0001376500563241792 |
| Rust home | desktop | 100 | 361.4 | 381.4 | 0 | 0.007863963375925922 |
| Rust herd and alerts | mobile | 98 | 1802.4 | 1877.4 | 0 | 0.0008086383972248102 |
| Rust herd and alerts | desktop | 100 | 444.0 | 482.1 | 0 | 0.0006651694458844923 |
| Rust trace | mobile | 99 | 1501.4 | 1576.4 | 0 | 0.0001376500563241792 |
| Rust trace | desktop | 100 | 361.6 | 381.6 | 0 | 0.0003607897771074467 |
| Vite home | mobile | 95 | 2402.4 | 2402.4 | 0 | 0.0001376500563241792 |
| Vite home | desktop | 100 | 481.9 | 481.9 | 0 | 0.007794420254624345 |
| Vite herd and alerts | mobile | 93 | 2453.8 | 2703.0 | 0 | 0.0001376500563241792 |
| Vite herd and alerts | desktop | 100 | 496.2 | 563.7 | 0 | 0 |
| Vite trace | mobile | 94 | 2402.3 | 2628.5 | 0 | 0.0001376500563241792 |
| Vite trace | desktop | 100 | 483.0 | 523.0 | 0 | 0.002112932827660141 |

FCP and LCP in the table are the median rounded to 0.1 ms. The TSV has the unrounded audit values.

## Local server

`oha -c 32 -n 2000`. Latency is milliseconds.

| Request | Status | p50 | p99 | req/s |
| --- | ---: | ---: | ---: | ---: |
| Rust `GET /` | 200 | 0.277042 | 1.239972 | 88075.87031620779 |
| Vite `GET /` | 200 | 2.735859 | 20.753269 | 9332.198992102913 |
| Rust `GET /api/log` unsigned | 401 | 0.251532 | 0.945483 | 107525.9625468793 |
| Vite `GET /api/log` unsigned | 401 | 0.864194 | 5.392082 | 28341.777175389052 |
| Rust `GET /api/log` signed | 200 | 0.285730 | 1.013318 | 93658.24126494072 |
| Vite `GET /api/log` signed | 200 | 1.930137 | 6.850218 | 14264.04353568667 |

| | Cold start | Idle RSS |
| --- | ---: | ---: |
| Rust release `fibershare serve` | 9 ms | 7,348 kB |
| Node `scripts/serve-local.js` | 81 ms | 58,900 kB |

## Image and build

| | Result |
| --- | --- |
| Rust image `fibershare:bench` | 87,061,944 bytes (`podman image inspect` `.Size`) |
| Vite at `e349258` | No Containerfile in that commit |
| `cargo build -p fibershare --release` | 39,886 ms |
| Same command, nothing changed | 145 ms |
| `npm run build` | 1,479 ms |

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

The image measured here was built from a copy of the tree that omitted `.git` and `target/`. Those directories are not inputs to the binary the Containerfile compiles.
