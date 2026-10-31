# FiberShare record format (draft)

This is a draft for comment. It is not final. Field names and rules may change.

These are JSON Schemas (draft 2020-12) for four records a small fiber ranch keeps. They are open, and you can use them on your own system.

This is a demo, not the FiberShare app. The app keeps its own records.

## The four records

| Record | File | What it is |
| --- | --- | --- |
| Animal | `animal.schema.json` | One fiber animal: species, breed, barn name or ear tag, birth year, and color. |
| Shearing | `shearing.schema.json` | One shearing of one animal, on one date. |
| Fleece | `fleece.schema.json` | The fleece from one shearing: weight in grams, color, and micron if it was measured. |
| Fiber lot | `fiber-lot.schema.json` | A batch of fiber made from one or more fleeces. |

## How they link

1. A shearing names its animal with `animalId`, and has a `date`.
2. A fleece names its shearing with `shearingId`.
3. A fiber lot lists its fleeces in `fleeceIds`. One lot can hold one fleece or many.

So you can follow a lot of fiber back to the fleeces, the shearings, and the animals it came from.

## Ranchers choose what is shared

Every record has a `sharing` field. The rancher sets it.

- `audience` is who may see the record: `private`, `buyers`, or `public`.
- `fields` lists the fields that audience may see. Fields not listed stay private.

Leave `sharing.audience` as `private` and nothing in that record is shared.

## What is not in these records

There are no fields for location or coordinates, prices, payment, personal names, emails, phone numbers, or device IDs. Do not add them. The tests in `test/record-schemas.test.js` fail if any of these show up.

## Examples

`examples/` has one fake example of each record. They follow Bramble, a sample Angora goat from `public/data/herd.json`, through one shearing and one fleece to the `mohair-bramble` lot in the sample fiber list. Bramble is not a real goat.

## Comments

Open an issue or a pull request, or say what you think on Discord. Ranchers, tell us which fields you would use and which ones are missing.
