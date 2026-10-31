// The draft record examples from docs/schemas/examples, bundled into the site
// so the trace page works offline. They follow the sample goat Bramble.
import animal from "../docs/schemas/examples/animal.example.json";
import shearing from "../docs/schemas/examples/shearing.example.json";
import fleece from "../docs/schemas/examples/fleece.example.json";
import lot from "../docs/schemas/examples/fiber-lot.example.json";

export const RECORDS = {
  animals: [animal],
  shearings: [shearing],
  fleeces: [fleece],
  lots: [lot],
};

/** Lot ids that can be traced, keyed by animal id. */
export function lotsForAnimal(animalId) {
  const shearingIds = RECORDS.shearings.filter((s) => s.animalId === animalId).map((s) => s.id);
  const fleeceIds = RECORDS.fleeces.filter((f) => shearingIds.includes(f.shearingId)).map((f) => f.id);
  return RECORDS.lots.filter((l) => l.fleeceIds.some((id) => fleeceIds.includes(id))).map((l) => l.id);
}
