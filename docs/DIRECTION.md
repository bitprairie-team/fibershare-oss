# Direction

How this open-source repository relates to FiberShare, what belongs here, and what to do next.

## One FiberShare app

BitPrairie LLC has one FiberShare app. People use it at [fibershare.app](https://fibershare.app).

[bitprairie.com/fibershare](https://www.bitprairie.com/fibershare) only deep-links to that app. The BitPrairie site does not host a copy of FiberShare.

[fibershare.dev](https://fibershare.dev) and [fibershare.us](https://fibershare.us) are not this repository, and they are not extra products. [fibershare.us](https://fibershare.us) leads to the FiberShare app. This demo is a separate copy you run yourself.

The Wrangler file in this repo uses the Pages project name `fibershare-dev`. That is a label for publishing a copy of this demo. It is not the hosted FiberShare app, and it is not a second ranch site.

## What this repository is

This repository is an open-source demo for people who want to read the code, run a sample copy, or help improve the demo.

It includes:

- A home page that explains ranch support
- A herd map of sample goats on a pasture drawing
- A sample fiber list with no checkout
- A page about how the demo is built
- A Pages Function at `/api/health` that reports the demo is up

The sample goats are not a real ranch herd. The pins are positions on a drawing.

Ranch support, on this demo, is an explanation only. Support pays for animals and pasture. It is not ownership or an investment return.

## What stays open

- The demo pages, styles, and sample files in `public/data/`
- The `/api/health` function
- Docs for running the demo and sending a change
- Fictional sample goats and fiber

## What stays private

Do not add these to this repository:

- Hosted service config for the FiberShare app
- Payment setup
- Real tracker data

Do not add keys, tokens, internal hostnames, or internal URLs. Do not add coordinates or a specific place for an animal or a collar. Do not add prices.

## Next steps

1. Keep the public pages and docs describing this repository as the demo, and the FiberShare app as the one product.
2. Planned: add automated checks for the sample JSON files and for `/api/health`, so a change can be tested without the private app.
3. Planned: add a short guide for publishing your own copy of this demo. If a store for demo data is added later, it stays limited to sample or contributor-owned fictional herds. Hosted service config, payment setup, and real tracker data stay private.
