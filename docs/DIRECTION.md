# Direction

How this open-source repository fits into FiberShare and BitPrairie's wider work, what belongs here, and what comes next.

## Who this is for

FiberShare is for ranchers, local communities, and local government programs in the western US, and for anyone who wants to run the same kind of system on their own land.

FiberShare has run since about 2020. The project is a network of local ranchers with gear on the ranch: collar trackers, paddock cameras and live video, and predator and wildfire detection.

Planned: early warning from the network to local communities and local government programs, sent only with each rancher's consent.

## Two networks

- **The community network** is non-commercial, self-hosted or run as a co-op. It comes first and is the main focus of this repository.
- **The commercial network** is BitPrairie's hosted services and gear. It is kept small and mainly covers the cost of hardware and hosting.

You can also run the code on your own ranch and share with no one. Any of these can use one of three setups: your own hardware, hosted by BitPrairie, or a mix. The [README](../README.md) has the tables.

## What the loops do

The automation is what sets FiberShare apart. Intelligence and realtime systems read tracker, sensor and camera data and turn it into alerts and suggestions. The rancher decides every time, and each answer is stored so the next suggestion fits that ranch better. Each loop does one job:

- **Find an animal in trouble.** In use in the FiberShare app: alerts, and the rancher's confirm or dismiss. Built: the movement and distress feed to Predator Watch. Planned: learning from the rancher's answers.
- **Catch a dying or silent tracker.** In use in the FiberShare app: low-battery and quiet-tracker alerts. Also in this demo with sample data. Planned: learning each device's normal pattern.
- **Plan the next paddock move.** Planned.
- **Plan a move ahead of fire or smoke.** Being built: the sensor feed to Wildfire Watch. Planned: move plans.
- **Warn neighbors about predator activity.** Planned, for ranches that opt in, with delayed events on a coarse grid.
- **Link fiber quality to breeding and grazing.** Records are in use. Planned: suggestions.

The README has the full table: what each loop reads, what it suggests and how it improves.

## Community and commercial

### Community (open)

- This demo
- Open schemas and interfaces (see below)
- Self-hosting docs
- Free to use for non-commercial and research work

### Commercial (BitPrairie)

- The hosted FiberShare app at [fibershare.app](https://fibershare.app)
- BitPrairie's own trained models
- Hosted alerting and relay
- Ready-to-go hardware kits
- Support

Only BitPrairie's own trained models and datasets stay private, and they are not published in this repository. The open public models BitPrairie builds on keep their own licenses.

> **License:** The license stays MIT. Whether some parts should ever use a different license is an open question. Nothing is decided.

## One FiberShare app

BitPrairie LLC has one FiberShare app, at [fibershare.app](https://fibershare.app). It covers ranch support, a live collar map, and a fiber shop. Records for animals, shearing, fleece, and fiber lots are in use there.

[bitprairie.com/fibershare](https://www.bitprairie.com/fibershare) is BitPrairie's FiberShare project page. It explains the program and links on to the hosted app. It is not a copy of the app, and it is not this repository.

The app needs sign-in. [fibershare.dev](https://fibershare.dev) leads to the bitprairie.com FiberShare page, and [fibershare.us](https://fibershare.us) leads to the app. Neither is this repository. This demo is a separate copy you run on your own hardware.

The Wrangler file in this repo uses the Pages project name `fibershare-dev`. That is a label for publishing a copy of this demo. It is not the hosted FiberShare app, and it is not a second ranch site.

## Related projects

These are described here only so the pieces make sense together. Details live on their own pages.

- [Predator Watch](https://bitprairie.com/predator-watch/) gives earlier warning about predators near livestock, so the rancher hears sooner and decides what to do. Phase 3, training models on BitPrairie's own regional data, is in progress. The feed of livestock movement and distress events from LoRa collars to Predator Watch is built and tested. [Subscribe for updates](https://bitprairie.com/predator-watch/#subscribe).
- [Wildfire Watch](https://bitprairie.com/wildfire-watch/) looks for early signs of wildfire. The feed of ranch sensor readings from FiberShare to Wildfire Watch is still being built. Planned: a relay to local and government alerting systems, with the rancher's consent.
- moqFeeder is a related project for paddock video over Media over QUIC.

Predator Watch and Wildfire Watch share the same sensors and run on the same LoRa radios and solar power on the ranch. The detection side uses intelligence systems trained by BitPrairie.

Planned: a photo upload page for people on the mailing list.

## Your data

- Public pages never show where an animal is.
- In this demo, tracker positions are hidden on the server unless the rancher signs in. Only the signed-in rancher sees their own trackers on a real map.
- In the FiberShare app, positions are turned into a private virtual grid when they arrive, and the GPS coordinates are not stored.
- Training data stays on BitPrairie's own hardware, for training and testing only. No one else sees it.
- Each rancher's event history is theirs. It is shared only if they opt in.
- Planned: anything shared with agencies or researchers will be aggregated or delayed, with no exact locations.

## What this repository is

An open-source demo for people who want to read the code, run a sample copy, or help improve it.

It includes:

- A home page that explains ranch support
- A herd view of sample goats on a virtual paddock grid
- A sample fiber list with no checkout
- A page about how the demo is built
- A Pages Function at `/api/health` that reports the demo is up

The sample goats are not a real ranch herd. The grid is a drawing, not GPS.

This demo only explains ranch support. Support pays for animals and pasture. It is not ownership or an investment return.

## What stays open

- The demo pages, styles, and sample files in `public/data/`
- The `/api/health` function
- Docs for running the demo, publishing a copy, and sending a change
- Fictional sample goats, fiber, ranches, and hardware nodes
- Draft open interfaces (see below)

## Open interfaces

None is final. Each one starts as a draft for comment.

- The FiberShare record format (animal, shearing, fleece, fiber lot) as JSON Schemas in [`docs/schemas/`](schemas/README.md). Posted as a draft.
- Planned: event and alert schemas
- Planned: a LoRa uplink payload format
- Planned: an alert-routing plugin interface, so alerts can go to the tools a community already uses
- Planned: a bring-your-own-model hook, so a self-hosted system can use its own intelligence systems

## What stays private

Do not add these to this repository:

- Hosted service config for the FiberShare app
- Payment setup
- Real tracker data
- BitPrairie's own trained models and datasets
- Device IDs, gateway sites, or camera and microphone placement
- Ranch names, subscriber contacts, or vendor setup

Do not add keys, tokens, internal hostnames, or internal URLs. Do not add coordinates or a specific place for an animal, a collar, or a photo. Do not add prices.

## Next steps

1. Keep the public pages and docs describing this repository as the demo, and the FiberShare app as the one product.
2. Planned: add a short guide for publishing your own copy of this demo. If a store for demo data is added later, it stays limited to sample or contributor-owned fictional herds.
3. Planned: add demo pages that show the larger idea with fake data only. See [ROADMAP.md](../ROADMAP.md).
4. Planned: post the other open interfaces above as drafts and ask for comment. The record format draft is already in `docs/schemas/`.

Tests, a lint step and CI on every pull request are already in place (`npm test`, `npm run lint`), so a change can be checked without the private app.
