# FiberShare (open source)

**FiberShare OSS** is a browser demo of ranch herd tracking and fiber traceability: a sample goat herd on a paddock grid, day Play with alerts, paddock moves, and a short tracker trail, plus a fleece lot you can trace back to the animal. It runs on sample data, works offline, and is meant for ranchers, hardware makers, and developers who want to see the idea before wiring real collars.

This repository is **not** the FiberShare app at [fibershare.app](https://fibershare.app). Ranch support pays for animals and pasture. Support is not ownership or an investment return. BitPrairie LLC builds FiberShare.

![The demo home page](docs/screenshots/home.png)

## Features (what is shipped)

- **Herd view.** Eight sample goats on a virtual paddock grid (a drawing, not GPS). Stats for trackers reporting, open alerts, and last check-in. Day **Play** scrubs one made-up day.
- **Alerts.** Low battery, quiet tracker, not-moving, out-of-paddock, SOS, plus simulated Predator Watch and Wildfire Watch on the sample day. Confirm, dismiss, or reopen; answers stay in the browser on sample data.
- **Paddock moves.** A short log of sample paddock moves and grazing notes that advances with Play.
- **Tracker trail.** Select a goat during Play to see a short trail of its last few positioned check-ins.
- **Fleece trace.** Trace the `mohair-bramble` lot through fleece and shearing records to Bramble. Viewer modes for rancher, buyer, and public. Nothing is for sale.
- **Setups.** Your own hardware, hosted by BitPrairie, or a mix.
- **Rancher sign-in and map.** Public view hides tracker details; a signed-in rancher can see real names and positions. See [docs/rancher-access.md](docs/rancher-access.md).
- **Tour.** Five short steps on the sample data (keyboard: arrows, Esc).

| Herd view | Fleece trace |
| --- | --- |
| ![Sample herd on the paddock grid](docs/screenshots/herd-map.png) | ![Fleece trace for the mohair-bramble lot](docs/screenshots/fleece-trace.png) |

## Docs and schemas

| Link | What it is |
| --- | --- |
| [docs/DIRECTION.md](docs/DIRECTION.md) | Demo vs the FiberShare app |
| [docs/rancher-access.md](docs/rancher-access.md) | Local passphrase and Cloudflare Access |
| [docs/chirpstack.md](docs/chirpstack.md) | Pull live trackers from ChirpStack v4 |
| [docs/hardware.md](docs/hardware.md) | Trackers, cameras, gateways and satellite links, with what each does on a ranch |
| [docs/paddock-cameras.md](docs/paddock-cameras.md) | Live paddock video over Media over QUIC, and how it fits FiberShare |
| [docs/schemas/](docs/schemas/README.md) | Draft animal, shearing, fleece, and fiber-lot JSON Schemas |
| [docs/schemas/examples/](docs/schemas/examples/) | Example records used by the fleece trace |
| [ROADMAP.md](ROADMAP.md) | Shipped vs planned work |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to help |

## Automated jobs

| Job | Rule |
| --- | --- |
| Flags tracker batteries below 20% | Trackers on outside power are skipped |
| Flags trackers that stop reporting | No check-in for over 2 hours |
| Flags trackers not moving near the same spot | Still checking in for over 2 hours with little movement |
| Flags a position outside the paddock | Active paddock bounds are 0-100 on the grid |
| Raises an alert when a tracker sends an SOS | The alert names the animal |
| Lists Predator Watch reports near the herd | The sample day has one simulated report |
| Lists Wildfire Watch smoke reports upwind | The rancher map adds public fire, smoke and air quality layers |
| Traces a fiber lot back to the goat | Through the fleece and shearing records |
| Checks for a new live file every 2 minutes | Live data only. The pull script runs only when you start it |

Every job is on until you turn it off, on How it works or in the herd view's Alert settings. The setting is saved in the browser. Each automated alert says which rule and reading raised it and when the rules ran, for example "Battery 14%, below the 20% limit, not on outside power." With every job off, a rancher can still answer and add alerts, save notes, mark animals checked and change the battery, quiet, and not-moving limits.

Alerts are an aid, not a guarantee. They can be late, wrong or missing, and turning a job off stops its alerts. Keep checking your animals in person. In an emergency, call 911.

The default thresholds and the rules live in `crates/core`. The pages and the server call that same crate. Each answer is stored with the rule that raised the alert.

The rancher makes every decision. Nothing moves animals, opens gates or contacts anyone without the rancher's OK.

The planned work covers fuller grazing records for each paddock, learning each tracker's normal check-in pattern, tuning the alert rules from rancher answers, and sharing a confirmed predator report with nearby ranchers. [ROADMAP.md](ROADMAP.md) has the detail.

## Hardware

FiberShare runs on LoRaWAN collar trackers, a LoRaWAN gateway and a network server on the ranch. Paddock cameras that send live pictures over Media over QUIC are being tested. They are not in this demo yet.

Planned:

- A live camera view for a signed-in rancher
- Detections from cameras sent to Predator Watch as reports the rancher confirms or dismisses
- Stills for Wildfire Watch smoke checks
- A satellite link for alerts where there is no cell signal

[docs/hardware.md](docs/hardware.md) lists the devices, what each one does on a ranch, and what is worth testing next. [docs/paddock-cameras.md](docs/paddock-cameras.md) covers the camera work.

## Setups

| Setup | What it means |
| --- | --- |
| Your own hardware | You build or buy the trackers and gateway and run the server yourself. Nothing has to leave the ranch. |
| Hosted by BitPrairie | BitPrairie runs the server and can supply the trackers. |
| A mix | Your gateway and server on the ranch, with hosted alerts from BitPrairie. |

The community network is the main part of the project. Ranchers share through a self-hosted or co-op server. The code is MIT licensed, so anyone may use it. Joining the community network through a self-hosted or co-op server is free for non-commercial and research use. BitPrairie's hosted service and hardware kits are priced to cover hardware and hosting. The hosted alerts come from Predator Watch and Wildfire Watch, which run on BitPrairie's realtime intelligence systems.

| Open source (free) | BitPrairie (commercial) |
| --- | --- |
| This demo | The hosted FiberShare app |
| Record schemas (draft) | BitPrairie's trained models and datasets |
| Self-hosting docs | Hosted alerts and relay |
| | Hardware kits and support |

Open models that BitPrairie builds on keep their own licenses.

## Your data

- Public pages never show where an animal is.
- Tracker positions stay on the server until the rancher signs in.
- In the FiberShare app, positions become cells on a private grid when they arrive. GPS coordinates are not stored.
- Each rancher owns their event history. It is shared only if they opt in.
- Planned: data shared with agencies or researchers is combined or delayed, with no exact locations.

This repository holds no secrets, API keys, mail settings or real collar data. A test checks every committed file for DevEUI-like hex strings and coordinates.

## Quick start

You need Rust 1.85 or newer.

```bash
git clone https://github.com/bitprairie-team/fibershare-oss.git
cd fibershare-oss
cargo run -p fibershare -- serve
```

Then open http://127.0.0.1:4174.

| Command | What it does |
| --- | --- |
| `cargo run -p fibershare -- serve` | Serves the pages and the API at http://127.0.0.1:4174 |
| `cargo run -p fibershare -- build` | Writes static pages into `dist/` |
| `cargo test --workspace --exclude fibershare-client --exclude fibershare-worker` | Runs the tests |
| `cargo fmt --all -- --check` and `cargo clippy -p fibershare-core -p fibershare-html -p fibershare --all-targets -- -D warnings` | Format and lint |
| `fibershare pull` | Reads your trackers from your network server into `.local/live.json`. See [docs/chirpstack.md](docs/chirpstack.md) |
| `fibershare passphrase` | Sets the rancher passphrase for local sign-in. See [docs/rancher-access.md](docs/rancher-access.md) |

The previous Vite site and Pages Functions are retired. Pages are rendered in Rust. A small WebAssembly island runs Play, the phone sheet, the theme, and the tour. Without it, the pages still show the end of the sample day.

The sample goats, events and fiber lots are in `public/data/herd.json`, `public/data/events.json` and `public/data/shop.json`.

## Live data from your own network server

The pull command supports ChirpStack v4. If your LoRaWAN collar trackers report to it, `fibershare pull` reads your devices and writes `.local/live.json`. Git ignores that file and the build leaves it out. `fibershare serve` then shows your trackers, how long ago they were pulled, and a **Hide tracker details** setting. Add `--watch=120` to keep pulling. The checks and packet format are in `crates/core`. The HTTP walk that writes the file is not finished in this branch; `fibershare pull` stops after checking the configuration.

The page reads the data from `/api/live`, never from the file. The public gets the hidden view: aliases such as Tracker 3, no device IDs, tags or positions, and grid cells from a hash. A signed-in rancher gets real values if the pull ran with `FIBERSHARE_HIDE_TRACKERS=0`. Sign-in is a passphrase on your own hardware, or Cloudflare Access on Pages, where `--push` sends the data to a KV namespace.

Setup is in [docs/chirpstack.md](docs/chirpstack.md) and [docs/rancher-access.md](docs/rancher-access.md).

## How it is built

```
Browser
  └── fibershare (one Rust binary, or a Cloudflare Worker in front of the static pages)
        ├── Pages (home, herd view, fleece trace, setups, how it works, rancher sign-in)
        ├── /data/*.json  (sample goats, events and fiber lots)
        └── /api
              ├── /api/health  (the site is up)
              ├── /api/live    (hidden data, or full data for a signed-in rancher)
              ├── /api/alerts  (a signed-in rancher's answers)
              ├── /api/log     (shared notes and checks for signed-in ranchers)
              ├── /api/session and /api/rancher/login  (passphrase, or Cloudflare Access)
              └── /api/push    (your pull sends data here with a token)
```

On your own hardware, `fibershare serve` answers `/api/live`, `/api/session`, `/api/alerts` and `/api/log` from `.local/`. The access rules are in `crates/core`. The rancher page draws an offline map so the tour works without a network. A signed-in live map of real positions is still the Leaflet view described in [docs/rancher-access.md](docs/rancher-access.md).

Self-host with podman from the `Containerfile`. The container listens on port 4174 and expects the repository mounted at `/app` so `.local` stays on the machine:

```bash
podman build -t fibershare -f Containerfile .
podman run --rm -p 127.0.0.1:4174:4174 -v "$PWD":/app:Z -w /app -e FIBERSHARE_HOST=0.0.0.0 fibershare serve
```

## Related sites

None of these sites is this repository.

- [fibershare.app](https://fibershare.app) is the FiberShare app. It needs sign-in.
- [bitprairie.com/fibershare](https://bitprairie.com/fibershare/) is the project page. [fibershare.dev](https://fibershare.dev) leads there.
- [fibershare.us](https://fibershare.us) leads to the FiberShare app.

Please do not open issues here about the FiberShare app, orders or private herd data. [docs/DIRECTION.md](docs/DIRECTION.md) explains the split between the demo and the app.

## Contributing

Ranchers, hardware makers and developers are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Chat is on [Discord](https://discord.gg/m3x8R3sF6N).

## License

[MIT](LICENSE). Copyright 2026 BitPrairie LLC.
