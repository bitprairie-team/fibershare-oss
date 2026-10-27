# Contributing to FiberShare

Thank you for helping with the open-source demo.

Read the [Code of Conduct](CODE_OF_CONDUCT.md) before you take part. Read [docs/DIRECTION.md](docs/DIRECTION.md) before you add a feature. This repo is the demo. It is not the FiberShare app.

## Ground rules

- Keep this repository public-safe. Do not add API keys, tokens, mail settings, hosted service config, payment setup, or real tracker data.
- Do not import code from the FiberShare app or from private ranch repos.
- Sample goats and fiber are fiction. Do not replace them with a real ranch herd.
- Do not add coordinates or a specific place for an animal or a collar.
- Do not add prices.
- Do not add personal names, a mailing address, or a PO box.

## Setup

You need Node 20 and a GitHub account.

1. On GitHub, click Fork, then clone your fork.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open http://localhost:5173.

`npm run build` writes the site to `dist/`. `npm run preview` serves that build. `npm run pages:dev` serves `dist/` with Wrangler 3, on Node 20, and answers `/api/health`.

Sample goats and fiber are in `public/data/herd.json` and `public/data/shop.json`.

## Tests

This repository has no lint script, no typecheck script, and no automated test suite. Automated tests are Planned. See [ROADMAP.md](ROADMAP.md).

Before you open a pull request, run:

```bash
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
- Easier pages, including the dark theme
- Docs for how the demo is built, and how to publish a copy

## Code style

Use plain JavaScript and CSS. Keep files small. No framework is required.

Make pages feel like a ranch notebook and a fiber list. Keep them plain and useful. Use numbered lists and tables.

Headings use Source Serif 4. Text uses IBM Plex Sans. Both are self-hosted. Their license text is in `public/licenses/`.

Colors: paper `#f4efe6`, ink `#1c1916`, leather `#5c4030`, pasture `#4f5d41`, muted `#6e675c`. Use gold rarely, for rules and the active state.
