# Contributing to FiberShare

Thank you for helping with the open-source demo.

Read the [Code of Conduct](CODE_OF_CONDUCT.md) before you take part. Read [docs/DIRECTION.md](docs/DIRECTION.md) before you add a feature. This repo is the demo. It is not the FiberShare app.

## Ways to help

### Ranchers

You do not need to write code.

- Tell us what a useful alert looks like on your place, and what is just noise.
- Tell us what gear holds up in your weather and what does not.
- Read the docs and the demo pages. Say where they are unclear.
- Join the [Discord](https://discord.gg/m3x8R3sF6N) and share what you need.

Please keep your ranch name, location, and animal data out of public posts.

### Hardware makers

- Share enclosure designs, such as 3D-printed ASA cases, and what you learned printing them.
- Share notes on solar panels, batteries, mounts, and LoRa radios that worked in the field.
- Comment on the draft LoRa uplink payload format once it is posted.

Do not post device IDs, gateway sites, or where cameras or microphones are placed.

### Developers

- Improve the demo pages, the herd map, and the sample data.
- Keep CI passing. It runs lint, tests, and the build on every pull request, on Node 20 and 22.
- Help build the planned fake-data demo pages. See [ROADMAP.md](ROADMAP.md).
- Comment on the draft schemas and interfaces once they are posted.

## Ground rules

- Keep this repository public-safe. Do not add API keys, tokens, mail settings, hosted service config, payment setup, or real tracker data.
- Do not add internal hostnames or internal URLs.
- Do not import code from the FiberShare app or from private ranch repos.
- Sample goats, fiber, ranches, and hardware nodes are fiction. Do not replace them with real ones.
- Do not add coordinates or a specific place for an animal, a collar, or a photo. Strip location data from any image you add.
- Do not add device IDs, gateway sites, or camera and microphone placement.
- Do not add ranch names, subscriber contacts, or vendor setup.
- Do not add prices.
- Do not add personal names, a mailing address, or a PO box.

## Setup

You need Node 20 and a GitHub account.

1. On GitHub, click Fork, then clone your fork.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open http://localhost:5173.

`npm run build` writes the site to `dist/`. `npm run preview` serves that build. `npm run pages:dev` serves `dist/` with Wrangler 4, which needs Node 22 or newer, and answers `/api/health`.

Sample goats and fiber are in `public/data/herd.json` and `public/data/shop.json`.

## Tests

Tests live in the `test/` folder and use Node's built-in test runner. Before you open a pull request, run:

```bash
npm run lint
npm test
npm run build
```

Then start `npm run dev` and check Home, Herd map, Fiber shop, and Build.

## Pull requests

1. Branch from `main`.
2. Make a small change.
3. Run the checks above.
4. Open a pull request against `main`.
5. Say what you changed and how you checked it.

A pull request is the change you ask us to add.

## Good first contributions

- Herd map keyboard focus, legends, or more sample animals
- Fiber fields in `public/data/shop.json`, with no prices
- Pages that are easier to read and use, including in the dark theme
- Docs for how the demo is built, and how to publish a copy

## Code style

Use plain JavaScript and CSS. Keep files small. No framework is required.

Make pages feel like a ranch notebook and a fiber list. Keep them plain and useful. Use numbered lists and tables.

The site uses IBM Plex Sans. It is self-hosted. Its license text is in `public/licenses/`.

Colors: paper `#f4efe6`, ink `#1c1916`, leather `#5c4030`, pasture `#4f5d41`, muted `#6e675c`. Use gold rarely, for rules and the active state.
