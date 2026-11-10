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
| Build | `cargo build -p fibershare --release` twice, as `scripts/bench.sh` times them. This run already had a release binary, so the first command recompiled the HTML crate and the server. The second command changed nothing. `npm run build` in the `e349258` tree with `node_modules` already installed. |

Lighthouse URLs: Rust `/`, `/map`, `/trace` on port 4174. Vite `/#/`, `/#/map`, `/#/trace` on port 4184.

Signed `GET /api/log` used a bench passphrase (`bench-sample-pass`) and the `fs_session` cookie from `POST /api/session`. Unsigned requests got 401 on both servers.

## Page weight

Bytes. Gzip and Brotli are the sums of each file compressed on its own.

| Page | HTML | CSS | JS / WASM | Fonts | Total | Gzip | Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rust `/` | 9,510 | 82,096 | 8,385 | 71,024 | 171,015 | 89,386 | 86,466 |
| Rust `/map` (herd and alerts) | 43,989 | 82,096 | 67,123 | 71,024 | 264,232 | 116,025 | 109,145 |
| Rust `/trace` | 9,815 | 82,096 | 8,385 | 71,024 | 171,320 | 89,421 | 86,509 |
| Rust `/rancher` | 16,156 | 96,902 | 167,819 | 71,024 | 351,901 | 140,903 | 131,192 |
| Vite, every hash route | 4,330 | 67,002 | 114,176 | 71,024 | 256,532 | 122,846 | 115,836 |

Home and trace load `chrome.js` (8,385; brotli 2,180) and no WASM. `/map` also loads `client.js` (20,824; brotli 4,090) and `client_bg.wasm` (37,914; brotli 14,084). `/rancher` loads `chrome.js`, `leaflet.css` (14,806), `leaflet.js` (147,552), and `live-map.js` (11,882), and no WASM. The Vite rancher route has extra built files that the shell does not request up front: `rancher-map-CKzLhw3K.js` (231,099; brotli 56,858) and `rancher-map-CIGW-MKW.css` (15,607; brotli 5,723). Home, the herd view, and trace are each under the Vite shell's brotli total of 115,836.

## Lighthouse

Median of 3. Score is the performance category (0–100). Times are milliseconds.

| Page | Form | Score | FCP | LCP | TBT | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Rust home | mobile | 99 | 1650.9 | 1650.9 | 0 | 0.0001376500563241792 |
| Rust home | desktop | 100 | 402.2 | 402.2 | 0 | 0.007330855406357641 |
| Rust herd and alerts | mobile | 96 | 1876.9 | 2327.4 | 0 | 0.0008086383972248102 |
| Rust herd and alerts | desktop | 100 | 443.7 | 542.9 | 0 | 0.0007229771095060174 |
| Rust trace | mobile | 98 | 1801.2 | 1802.4 | 0 | 0.0001376500563241792 |
| Rust trace | desktop | 100 | 401.3 | 421.3 | 0 | 0.000363728677964402 |
| Vite home | mobile | 95 | 2402.3 | 2402.3 | 0 | 0.0001376500563241792 |
| Vite home | desktop | 100 | 482.6 | 482.6 | 0 | 0 |
| Vite herd and alerts | mobile | 93 | 2402.2 | 2703.3 | 5.0 | 0.0001376500563241792 |
| Vite herd and alerts | desktop | 100 | 495.1 | 563.1 | 0 | 0 |
| Vite trace | mobile | 94 | 2401.8 | 2627.7 | 0 | 0.0001376500563241792 |
| Vite trace | desktop | 100 | 483.7 | 543.3 | 0 | 0.002112932827660141 |

FCP and LCP in the table are the median rounded to 0.1 ms. The TSV has the unrounded audit values.

## Local server

`oha -c 32 -n 2000`. Latency is milliseconds.

| Request | Status | p50 | p99 | req/s |
| --- | ---: | ---: | ---: | ---: |
| Rust `GET /` | 200 | 0.212286 | 1.485069 | 106061.2858170288 |
| Vite `GET /` | 200 | 2.242264 | 8.687578 | 11598.642993565682 |
| Rust `GET /api/log` unsigned | 401 | 0.195976 | 1.06293 | 129761.87981363857 |
| Vite `GET /api/log` unsigned | 401 | 0.722788 | 7.497809 | 31355.675485439944 |
| Rust `GET /api/log` signed | 200 | 0.233647 | 1.183314 | 107592.51894152847 |
| Vite `GET /api/log` signed | 200 | 1.676308 | 15.950035 | 13395.205878587903 |

| | Cold start | Idle RSS |
| --- | ---: | ---: |
| Rust release `fibershare serve` | 11 ms | 7,500 kB |
| Node `scripts/serve-local.js` | 58 ms | 59,116 kB |

## Image and build

| | Result |
| --- | --- |
| Rust image `fibershare:bench` | 87,085,496 bytes (`podman image inspect` `.Size`) |
| Vite at `e349258` | No Containerfile in that commit |
| `cargo build -p fibershare --release` | 4,426 ms (HTML and the server recompiled; the release binary was already there) |
| Same command, nothing changed | 158 ms |
| `npm run build` | 1,393 ms |

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
