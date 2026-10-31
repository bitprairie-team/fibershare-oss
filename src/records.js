// Follow a fiber lot back to its fleeces, shearings, and animals, and apply
// each record's sharing setting for a given viewer.

export const VIEWERS = ["rancher", "buyers", "public"];

/** Build the chain for one lot from flat lists of records. */
export function traceLot(lotId, records) {
  const lot = (records.lots || []).find((item) => item.id === lotId);
  if (!lot) return null;
  const fleeces = (records.fleeces || []).filter((item) => lot.fleeceIds.includes(item.id));
  const steps = fleeces.map((fleece) => {
    const shearing = (records.shearings || []).find((item) => item.id === fleece.shearingId) || null;
    const animal = shearing
      ? (records.animals || []).find((item) => item.id === shearing.animalId) || null
      : null;
    return { fleece, shearing, animal };
  });
  return { lot, steps };
}

/**
 * What a viewer may see of a record. The rancher sees every field. Buyers see
 * records shared with buyers or the public. The public sees only public records.
 * Outside the rancher, only the fields listed in sharing.fields are shown.
 * Returns null when the viewer may not see the record at all.
 */
export function visibleRecord(record, viewer) {
  if (!record) return null;
  if (viewer === "rancher") {
    const { sharing, ...fields } = record;
    return { id: record.id, fields, hidden: [] };
  }
  const audience = record.sharing?.audience || "private";
  const allowed =
    (viewer === "buyers" && (audience === "buyers" || audience === "public")) ||
    (viewer === "public" && audience === "public");
  if (!allowed) return null;
  const shared = new Set(record.sharing?.fields || []);
  const fields = {};
  const hidden = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === "sharing" || key === "id") continue;
    if (shared.has(key)) fields[key] = value;
    else hidden.push(key);
  }
  return { id: record.id, fields, hidden };
}
