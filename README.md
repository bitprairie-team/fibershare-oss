# FiberShare (open source)

FiberShare is a ranch program from BitPrairie LLC. It started with goats, fiber, and keeping ranches going. It is growing into a network of local ranchers in southern Oregon ranch country, with gear on the ranch: collar trackers, paddock cameras, and predator and wildfire detection.

The aim is to keep animals safe, give local communities and local government programs early warning, and keep local supply chains going.

Support for a ranch pays for animals and pasture. It is not ownership or an investment return.

This repository is a demo. It is for people who want to read the code, run a sample copy, or help improve it. It is not the FiberShare app at [fibershare.app](https://fibershare.app).

## Three ways to take part

1. **Run your own local system.** Use the open code and docs to set up a system on your own ranch or land. It is free and open source.
2. **Join the community network.** Share with other ranchers through a self-hosted or co-op setup. This is the main part of the project. It is non-commercial, and it is fine for research use.
3. **Join the commercial network.** Use BitPrairie's hosted services and ready-to-go gear. This part is small. It mainly covers the cost of hardware and hosting.

## Three setups

These match the setups on [bitprairie.com](https://www.bitprairie.com).

| Setup | What it means |
| --- | --- |
| Your own hardware | You build or buy the gear and run it yourself. |
| Hosted by BitPrairie | BitPrairie runs the hosting for you. |
| A mix of both | Your gear on the ranch, with BitPrairie hosting the parts you choose. |

The gear is meant to hold up outside: 3D-printed ASA cases, solar panels, and LoRa radios.

## What is open, and what BitPrairie offers

| Community (free, open source) | Commercial (BitPrairie) |
| --- | --- |
| This demo | The hosted FiberShare app |
| Open schemas (draft) | BitPrairie's own trained models |
| Self-hosting docs | Hosted alerting and relay |
| Non-commercial and research use | Ready-to-go hardware kits |
| | Support |

Only BitPrairie's own trained models stay private. The open public models it builds on keep their own licenses.

## The wider project

- **FiberShare app** at [fibershare.app](https://fibershare.app): ranch sponsorship, a live collar map, and a fiber shop. Basic records for animals, shearing, fleece, and fiber lots are in use, and the tools are being upgraded.
- **Predator Watch** at [bitprairie.com/predator-watch](https://bitprairie.com/predator-watch/): early warning about predators near livestock, so ranchers can act without lethal force. Phase 3, training models on BitPrairie's own regional data, is in progress.
- **Wildfire Watch** at [bitprairie.com/wildfire-watch](https://bitprairie.com/wildfire-watch/): early wildfire detection.
- **moqFeeder**: a related project for paddock video over Media over QUIC.

Predator Watch and Wildfire Watch share the same sensors and run on the same LoRa radios and solar power on the ranch.

The feed of livestock movement and distress events from LoRa collars to Predator Watch is built and tested. The feed of ranch sensor readings to Wildfire Watch is still being built.

Planned:

- A wildfire relay to local and government alerting systems.

An upload page at upload.bitprairie.com is coming soon. People on the [mailing list](https://bitprairie.com/predator-watch/#subscribe) will get upload access.

## Your data

- Location data is stripped or blurred. No one can tell where a photo or an animal was.
- Training data stays on BitPrairie's own hardware. It is used for training and testing only. No one else sees it.
- Each rancher's event history belongs to that rancher. It is shared only if they opt in.
- Any sharing with agencies or researchers is aggregated or delayed, and has no exact locations.

## What this demo does

- Shows sample goats on a pasture drawing. The pins are positions on the drawing. This is not a real ranch herd.
- Lists sample fiber. You cannot check out.
- Explains ranch support.
- Runs locally with Node 20.

This repo has no secrets: no API keys, no mail settings, and no real collar data.

## Quick start

You need Node 20 or newer. `npm run pages:dev` needs Node 22 or newer.

```bash
git clone https://github.com/steelhead99x/fibershare-oss.git
cd fibershare-oss
npm install
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
| --- | --- |
| `npm run dev` | Serves the local site with Vite at http://localhost:5173 |
| `npm run build` | Builds the site into `dist/` |
| `npm run preview` | Serves the built site |
| `npm run pages:dev` | Serves `dist/` with Wrangler 4 (needs Node 22 or newer), including `/api/health` |
| `npm run lint` | Checks the JavaScript files for syntax errors |
| `npm test` | Runs the tests for the sample JSON files and `/api/health` |

`npm run dev` serves the pages and the sample JSON. The `/api/health` function is included when you use `npm run pages:dev` after `npm run build`.

Sample goats and fiber are in `public/data/herd.json` and `public/data/shop.json`.

## How it is built

```
Browser
  └── Cloudflare Pages (project name fibershare-dev)
        ├── Pages (home, map, shop)
        ├── /data/*.json  (sample goats and fiber)
        └── Pages Functions
              └── /api/health  (says the site is up)
```

The project name `fibershare-dev` is a label for a copy of this demo. It is not the FiberShare app.

You can run the built files in `dist/` on your own server. You do not need an account to try the demo.

## Screenshots

Screenshots will be retaken after the UI refresh.

## Where things live

None of these sites is this repository:

- [bitprairie.com/fibershare](https://www.bitprairie.com/fibershare) is BitPrairie's FiberShare project page. It explains the program and links on to the hosted FiberShare app.
- [fibershare.dev](https://fibershare.dev) is part of the hosted FiberShare app. It currently needs sign-in.
- [fibershare.us](https://fibershare.us) leads to the FiberShare app.

Do not open issues here about the FiberShare app, orders, or private herd data.

More on this split is in [docs/DIRECTION.md](docs/DIRECTION.md). What is coming next is in [ROADMAP.md](ROADMAP.md).

## Help out

Ranchers, hardware makers, and developers are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

Chat is on [Discord](https://discord.gg/m3x8R3sF6N). You need a Discord account. You need a GitHub account to send a change.

## License

[MIT](LICENSE) © 2026 BitPrairie LLC, a California LLC · legal@bitprairie.com

You may use, share, and change the code.
