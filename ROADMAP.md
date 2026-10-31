# Roadmap

This list covers the open demo and its open docs. It is not a plan for the FiberShare app or for BitPrairie's hosted services.

## Here now

- Home, herd map, sample fiber list, and a page about how the demo is built
- Sample goats and sample fiber in `public/data/`
- Light and dark theme, and a menu for small screens
- `/api/health` when the Pages Function is running
- Tests for the sample JSON files and `/api/health` (`npm test`), and a lint step (`npm run lint`)
- A Discord chat link for people working on the demo
- CI that runs lint, tests, and the build on every pull request
- A draft of the FiberShare record format (animal, shearing, fleece, fiber lot) as JSON Schemas in `docs/schemas/`, with fake examples only. It is posted for comment and is not final.

## Planned: checks and docs

- A guide for publishing your own copy of this demo
- An optional store for this demo's own sample herd and fiber list, with no payment setup and no real tracker data

## Planned: demo pages

All of these use fake data only.

- A "rancher's day" walkthrough, with clearly fake events on a virtual paddock grid
- A sample network of fictional ranches and hardware nodes
- A page comparing the three setups: your own hardware, hosted by BitPrairie, or a mix of both

## Planned: open interfaces (draft)

These are proposals. They will be posted as drafts for comment before anything is final.

- Event and alert schemas
- A LoRa uplink payload format
- An alert-routing plugin interface
- A bring-your-own-model hook

## Not in this repository

- Hosted service config for the FiberShare app
- Payment setup
- Real tracker data
- BitPrairie's own trained models and datasets. The open public models it builds on keep their own licenses.

Predator Watch and Wildfire Watch keep their own status on their pages: [Predator Watch](https://bitprairie.com/predator-watch/) and [Wildfire Watch](https://bitprairie.com/wildfire-watch/).

See [docs/DIRECTION.md](docs/DIRECTION.md).
