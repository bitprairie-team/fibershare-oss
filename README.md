# FiberShare (open source)

FiberShare lets you follow a goat herd and support a ranch.

This repo is a free demo of that idea. You get a sample herd map and a sample fiber shop. You can read the code, run your own copy, or help build it.

The live site at [fibershare.dev](https://fibershare.dev) is the ranch product hosted by BitPrairie. It is not this repo.

## What you can do here

- See sample goats on a pasture drawing. The pins do not track live collars.
- Browse sample fiber lots. You cannot check out.
- Read how ranch support works. Support pays for animals and pasture. It is not ownership or an investment return.
- Run a free copy on your computer.

There are no secrets in this repo. No API keys. No mail settings. No live collar tokens.

## Related sites

These sites are not this repository:

- **[fibershare.dev](https://fibershare.dev)**: the live ranch product, hosted by BitPrairie
- **[fibershare.us](https://fibershare.us)**: the paid shop for people in the US
- **[fibershare.app](https://fibershare.app)**: the phone app for the shop and orders
- **[bitprairie.com/fibershare](https://www.bitprairie.com/fibershare)**: the same live ranch product on the BitPrairie page

Do not open issues here about US billing, the phone app, or private herd data. Use those sites for that.

## Run it yourself

This is free. You need Node 20.

```bash
git clone https://github.com/steelhead99x/fibershare-oss.git
cd fibershare-oss
npm install
npm run dev
```

Then open http://localhost:5173.

Useful scripts:

- `npm run dev`: start the local site
- `npm run build`: build the site into `dist/`
- `npm run preview`: open the built site
- `npm run pages:dev`: preview with Wrangler 3 (Node 20)

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

You can run it on your own server with the built files in `dist/`. You do not need an account to try the demo.

A later version can store data in D1, Cloudflare's database, behind Pages Functions. This demo stays as files so you can run it alone.

## Help out

Joining is free. You need a GitHub account to send a change. Chat is free. You need a Discord account.

Join the chat: [Discord](https://discord.gg/m3x8R3sF6N).

See [CONTRIBUTING.md](CONTRIBUTING.md). Small pull requests are welcome. A pull request is the change you ask us to add.

Start with the herd map, fiber fields, easier pages, or the docs.

## License

[MIT](LICENSE) © 2026 BitPrairie LLC

You may use, share, and change the code.
