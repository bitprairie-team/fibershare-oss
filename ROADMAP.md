# Roadmap

This list covers the open demo and its open docs. It is not a plan for the FiberShare app or for BitPrairie's hosted services.

## Here now

- Home, herd map, sample fiber list, and a page about how the demo is built
- Sample goats and sample fiber in `public/data/`
- Light and dark theme, and a menu for small screens
- `/api/health` when the Pages Function is running
- Tests for the sample JSON files and `/api/health` (`npm test`), and a lint step (`npm run lint`)
- A Discord chat link for people working on the demo

## Planned: checks and docs

- Planned: run lint, tests, and the build automatically on every pull request (CI)
- Planned: a guide for publishing your own copy of this demo
- Planned: an optional store for this demo's own sample herd and fiber list, with no payment setup and no real tracker data

## Planned: demo pages

All of these use fake data only.

- Planned: a "rancher's day" walkthrough, with clearly fake events on a virtual paddock grid
- Planned: a sample network of fictional ranches and hardware nodes
- Planned: a page comparing the three setups: your own hardware, hosted by BitPrairie, or a mix of both

## Planned: open interfaces (draft)

These are proposals. They will be posted as drafts for comment before anything is final.

- Draft: the FiberShare record format (animal, shearing, fleece, fiber lot) as JSON Schemas in `docs/schemas/`, with fake examples only
- Draft: event and alert schemas
- Draft: a LoRa uplink payload format
- Draft: an alert-routing plugin interface
- Draft: a bring-your-own-model hook

## Not in this repository

- Hosted service config for the FiberShare app
- Payment setup
- Real tracker data
- BitPrairie's own trained models and datasets. The open public models it builds on keep their own licenses.

Predator Watch and Wildfire Watch keep their own status on their pages: [Predator Watch](https://bitprairie.com/predator-watch/) and [Wildfire Watch](https://bitprairie.com/wildfire-watch/).

See [docs/DIRECTION.md](docs/DIRECTION.md).
