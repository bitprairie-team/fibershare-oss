# FiberShare (open source)

Community MVP for **ranch sponsorship**, a **collar / herd map**, and a **fiber shop**.

This repository is the public project behind [fibershare.dev](https://fibershare.dev). It is a small, MIT-licensed starting point so ranchers, fiber artists, and volunteers can run a local demo, read the architecture, and contribute.

## What this MVP includes

- A static community landing (Vite) with a prairie cream / leather palette, light and dark themes
- A sample **herd map** with three placeholder goats (not a live collar feed)
- A stub **fiber shop** catalog loaded from JSON (no checkout in this repo)
- A tiny Pages Function health stub, as a sketch of how an API layer can sit next to the site
- `wrangler.toml` aimed at a Cloudflare Pages project named `fibershare-dev`

There are **no operator secrets** in this repo: no API keys, no Mailjet, no ranch telemetry tokens.

## FiberShare on the public web

These are related, but they are not this repository:

- **[fibershare.dev](https://fibershare.dev)** — this open-source community MVP
- **[fibershare.us](https://fibershare.us)** — paid US FiberShare web product
- **[fibershare.app](https://fibershare.app)** — Expo shop / order app (built separately)
- **[bitprairie.com/fibershare](https://www.bitprairie.com/fibershare)** — the same latest FiberShare product at the ranch URL (not an old fork)

Please do not open issues here about US billing, Expo app releases, or private herd data. Those belong on their own sites.

## Run locally

Requires **Node 20**.

```bash
git clone https://github.com/steelhead99x/fibershare-oss.git
cd fibershare-oss
npm install
npm run dev
```

Vite serves the app at http://localhost:5173.

Useful scripts:

- `npm run dev` — local Vite server
- `npm run build` — production assets in `dist/`
- `npm run preview` — serve the production build
- `npm run pages:dev` — `wrangler@3 pages dev dist` (Node 20 compatible)

Sample data lives in `public/data/herd.json` and `public/data/shop.json`.

## Architecture sketch

```
Browser
  └── Cloudflare Pages (fibershare-dev)
        ├── Static site (landing, map, shop)
        ├── /data/*.json  (MVP catalog + herd placeholders)
        └── Pages Functions
              └── /api/health  (stub; future herd/shop APIs)
```

A later community build can swap the JSON files for D1 (or another store) behind Pages Functions. The OSS MVP stays static-first so anyone can run it without accounts.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Small, well-scoped pull requests are welcome: map UI, catalog fields, accessibility, and docs.

## License

[MIT](LICENSE) © 2026 BitPrairie LLC
