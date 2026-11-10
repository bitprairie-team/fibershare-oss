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
| Build | `cargo build -p fibershare --release` twice, as `scripts/bench.sh` times them. The first command rebuilt the release binary. The second command changed nothing. `npm run build` in the `e349258` tree with `node_modules` already installed. |

Lighthouse URLs: Rust `/`, `/map`, `/trace` on port 4174. Vite `/#/`, `/#/map`, `/#/trace` on port 4184.

Signed `GET /api/log` used a bench passphrase (`bench-sample-pass`) and the `fs_session` cookie from `POST /api/session`. Unsigned requests got 401 on both servers.

## Page weight

Bytes. Gzip and Brotli are the sums of each file compressed on its own.

| Page | HTML | CSS | JS / WASM | Fonts | Total | Gzip | Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rust `/` | 7,443 | 81,195 | 9,622 | 71,024 | 169,284 | 88,692 | 85,948 |
| Rust `/map` (herd and alerts) | 42,851 | 81,195 | 68,476 | 71,024 | 263,546 | 115,739 | 108,936 |
| Rust `/trace` | 7,751 | 81,195 | 9,622 | 71,024 | 169,592 | 88,755 | 86,015 |
| Rust `/rancher` | 15,524 | 96,001 | 169,056 | 71,024 | 351,605 | 140,689 | 131,102 |
| Vite, every hash route | 4,330 | 67,002 | 114,176 | 71,024 | 256,532 | 122,846 | 115,836 |

Home and trace load `chrome.js` (9,622; brotli 2,476) and no WASM. `/map` also loads `client.js` (20,824; brotli 4,090) and `client_bg.wasm` (38,030; brotli 14,100). `/rancher` loads `chrome.js`, `leaflet.css` (14,806), `leaflet.js` (147,552), and `live-map.js` (11,882), and no WASM. The Vite rancher route has extra built files that the shell does not request up front: `rancher-map-CKzLhw3K.js` (231,099; brotli 56,858) and `rancher-map-CIGW-MKW.css` (15,607; brotli 5,723). Home, the herd view, and trace are each under the Vite shell's brotli total of 115,836.

## Lighthouse

Median of 3. Score is the performance category (0–100). Times are milliseconds.

| Page | Form | Score | FCP | LCP | TBT | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Rust home | mobile | 100 | 1351.1 | 1426.1 | 0 | 0.002944381650399577 |
| Rust home | desktop | 100 | 401.0 | 421.0 | 0 | 7.450639173452412e-06 |
| Rust herd and alerts | mobile | 97 | 1726.4 | 2326.3 | 0 | 0.000246729597655623 |
| Rust herd and alerts | desktop | 100 | 422.0 | 502.0 | 0 | 0.000314426269249262 |
| Rust trace | mobile | 100 | 1200.5 | 1350.5 | 0 | 0.00010072195012298952 |
| Rust trace | desktop | 100 | 401.0 | 421.0 | 0 | 3.794941246045837e-05 |
| Vite home | mobile | 95 | 2401.5 | 2401.5 | 0 | 0 |
| Vite home | desktop | 100 | 482.5 | 482.5 | 0 | 0.007794420254624345 |
| Vite herd and alerts | mobile | 93 | 2451.4 | 2702.8 | 0 | 0 |
| Vite herd and alerts | desktop | 100 | 482.5 | 562.5 | 0 | 0.0002944923596132374 |
| Vite trace | mobile | 94 | 2401.6 | 2630.1 | 0 | 0.0001376500563241792 |
| Vite trace | desktop | 100 | 483.1 | 523.9 | 0 | 0.002112932827660141 |

FCP and LCP in the table are the median rounded to 0.1 ms. The TSV has the unrounded audit values.

## Local server

`oha -c 32 -n 2000`. Latency is milliseconds.

| Request | Status | p50 | p99 | req/s |
| --- | ---: | ---: | ---: | ---: |
| Rust `GET /` | 200 | 0.227383 | 1.00547 | 114616.51720290768 |
| Vite `GET /` | 200 | 2.228072 | 8.937835 | 11217.15170696277 |
| Rust `GET /api/log` unsigned | 401 | 0.195211 | 0.771872 | 127942.59164735745 |
| Vite `GET /api/log` unsigned | 401 | 0.848413 | 4.371347 | 29003.42085197752 |
| Rust `GET /api/log` signed | 200 | 0.230496 | 0.734109 | 116811.18546532436 |
| Vite `GET /api/log` signed | 200 | 1.574795 | 8.551224 | 16440.27719951386 |

| | Cold start | Idle RSS |
| --- | ---: | ---: |
| Rust release `fibershare serve` | 8 ms | 7,376 kB |
| Node `scripts/serve-local.js` | 58 ms | 59,072 kB |

## Image and build

| | Result |
| --- | --- |
| Rust image `fibershare:bench` | Not remeasured. `podman` is not installed on this machine. The last recorded size was 87,085,496 bytes. |
| Vite at `e349258` | No Containerfile in that commit |
| `cargo build -p fibershare --release` | 37,529 ms (the release binary was rebuilt for this run) |
| Same command, nothing changed | 78 ms |
| `npm run build` | 1,326 ms |

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
