/** Search titles and descriptions for each demo route. Kept unique and plain. */

export const PAGE_META = {
  "/": {
    title: 'FiberShare open-source demo: sample herd and fleece',
    description: 'Open-source FiberShare demo by BitPrairie LLC: sample goat herd, day Play alerts, paddock moves, and fleece trace. Sample data only; not the FiberShare app.',
  },
  "/map": {
    title: 'Herd view: sample goats, alerts, and day Play demo',
    description: 'Sample goat herd on the map with battery and still alerts, paddock moves, grazing notes, and a short tracker trail on day Play. Demo data only.',
  },
  "/trace": {
    title: 'Fleece trace demo: follow one sample lot end to end',
    description: 'Follow one sample fleece lot from the goat through mill steps to a buyer-facing page. Link by hand or with the trace job. Demo records only.',
  },
  "/setups": {
    title: 'Setups: device uplinks and rancher access for the demo',
    description: 'How this FiberShare open-source demo wires device uplinks, sample herd data, and optional rancher sign-in. For developers trying the demo locally.',
  },
  "/architecture": {
    title: 'How this FiberShare OSS demo works: pages and jobs',
    description: 'Map of the FiberShare open-source demo: Vite pages, optional alert and trace jobs, sample herd events, and draft fiber schemas. Not a product tour.',
  },
  "/rancher": {
    title: 'Rancher sign-in demo: a passphrase gate for the map',
    description: 'Optional passphrase gate that opens rancher tools on the sample herd map. Local demo only; it does not connect to a live ranch or real animals.',
  },
};

PAGE_META["/shop"] = PAGE_META["/trace"];

export const NOT_FOUND_META = {
  title: 'Page not found in this FiberShare open-source demo',
  description: 'That address is not a page in the FiberShare open-source demo. Open Home for the sample herd overview, or Herd view for the map and day Play.',
};

function setMeta(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/** Apply document title plus description and matching social tags. */
export function applyPageMeta(meta) {
  if (!meta) return;
  document.title = meta.title;
  setMeta('meta[name="description"]', "content", meta.description);
  setMeta('meta[property="og:title"]', "content", meta.title);
  setMeta('meta[property="og:description"]', "content", meta.description);
  setMeta('meta[name="twitter:title"]', "content", meta.title);
  setMeta('meta[name="twitter:description"]', "content", meta.description);
}

export function metaForPath(path) {
  return PAGE_META[path] || NOT_FOUND_META;
}
