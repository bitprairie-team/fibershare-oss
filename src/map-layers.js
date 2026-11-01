// Map layers for the signed-in rancher view. Plain data, so it is easy to add,
// drop, or reorder a layer. Every URL here answered on the day it was added;
// `npm run layers:check` asks each one again.
//
// Fields:
//   id, group ("basemap" or "overlay"), name, type ("tile", "feature", "dynamic")
//   url          service or tile template. Never a key or token
//   needsKey     true when the layer only works with ARCGIS_API_KEY
//   attribution  shown on the map, as each provider asks
//   source       page about the data, for the layer panel
//   terms        short note on who owns it and how it may be used
//   style        for feature layers: line and fill colours
//   popup        for feature layers: { title, fields: [[field, label], ...] }

const ESRI_STATIC = "https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/";
const POWERED_BY_ESRI = "Powered by Esri";

export const LAYERS = [
  // Basemaps that work without a key.
  {
    id: "usgs-imagery",
    group: "basemap",
    name: "Imagery",
    type: "tile",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 16,
    needsKey: false,
    attribution: "USGS The National Map: orthoimagery",
    source: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer",
    terms: "US government data, public domain.",
  },
  {
    id: "usgs-topo",
    group: "basemap",
    name: "Topo",
    type: "tile",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 16,
    needsKey: false,
    attribution: "USGS The National Map",
    source: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer",
    terms: "US government data, public domain.",
  },
  {
    id: "osm-streets",
    group: "basemap",
    name: "Streets",
    type: "tile",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxNativeZoom: 19,
    needsKey: false,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    source: "https://operations.osmfoundation.org/policies/tiles/",
    terms: "ODbL data. Light use only under the tile usage policy; no bulk download.",
  },
  // Esri basemaps through the Basemap Styles static tiles service. Need a key.
  {
    id: "esri-imagery",
    group: "basemap",
    name: "Imagery (Esri)",
    type: "tile",
    url: ESRI_STATIC + "arcgis/imagery/static/tile/{z}/{y}/{x}",
    maxNativeZoom: 19,
    needsKey: true,
    attribution: POWERED_BY_ESRI + " | Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    source: "https://developers.arcgis.com/rest/static-basemap-tiles/",
    terms: "Needs an ArcGIS API key with basemap access. Esri terms apply. Keep the attribution. No caching or bulk download.",
  },
  {
    id: "esri-topo",
    group: "basemap",
    name: "Topo (Esri)",
    type: "tile",
    url: ESRI_STATIC + "arcgis/topographic/static/tile/{z}/{y}/{x}",
    maxNativeZoom: 19,
    needsKey: true,
    attribution: POWERED_BY_ESRI + " | Esri, TomTom, Garmin, FAO, NOAA, USGS, and the GIS User Community",
    source: "https://developers.arcgis.com/rest/static-basemap-tiles/",
    terms: "Needs an ArcGIS API key with basemap access. Esri terms apply.",
  },
  {
    id: "esri-streets",
    group: "basemap",
    name: "Streets (Esri)",
    type: "tile",
    url: ESRI_STATIC + "arcgis/streets/static/tile/{z}/{y}/{x}",
    maxNativeZoom: 19,
    needsKey: true,
    attribution: POWERED_BY_ESRI + " | Esri, TomTom, Garmin, FAO, NOAA, USGS, and the GIS User Community",
    source: "https://developers.arcgis.com/rest/static-basemap-tiles/",
    terms: "Needs an ArcGIS API key with basemap access. Esri terms apply.",
  },

  // Overlays. All work without a key.
  {
    id: "fire-perimeters",
    group: "overlay",
    name: "Wildfire perimeters (current)",
    type: "feature",
    url: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0",
    needsKey: false,
    attribution: "NIFC WFIGS",
    source: "https://data-nifc.opendata.arcgis.com/",
    terms: "US interagency fire data, public domain.",
    style: { color: "#c2410c", fillColor: "#f97316", fillOpacity: 0.25, weight: 2 },
    popup: { title: "poly_IncidentName", fields: [["attr_IncidentSize", "Acres"], ["attr_PercentContained", "Contained %"], ["poly_DateCurrent", "Updated"]] },
  },
  {
    id: "fire-incidents",
    group: "overlay",
    name: "Wildfire incidents (current)",
    type: "feature",
    url: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0",
    needsKey: false,
    attribution: "NIFC WFIGS",
    source: "https://data-nifc.opendata.arcgis.com/",
    terms: "US interagency fire data, public domain.",
    style: { color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.9, weight: 1, radius: 5 },
    popup: { title: "IncidentName", fields: [["IncidentSize", "Acres"], ["PercentContained", "Contained %"], ["FireDiscoveryDateTime", "Found"]] },
  },
  {
    id: "weather-alerts",
    group: "overlay",
    name: "Weather watches and warnings",
    type: "feature",
    url: "https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/FeatureServer/1",
    needsKey: false,
    attribution: "NOAA National Weather Service",
    source: "https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer",
    terms: "US government data, public domain.",
    style: { color: "#7c3aed", fillColor: "#a78bfa", fillOpacity: 0.2, weight: 1 },
    popup: { title: "prod_type", fields: [["onset", "Starts"], ["ends", "Ends"], ["url", "Details"]] },
  },
  {
    id: "fire-weather",
    group: "overlay",
    name: "Fire weather outlook (day 1)",
    type: "dynamic",
    url: "https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer",
    layers: [0],
    opacity: 0.5,
    needsKey: false,
    attribution: "NOAA Storm Prediction Center",
    source: "https://www.spc.noaa.gov/products/fire_wx/",
    terms: "US government data, public domain.",
  },
  {
    id: "smoke",
    group: "overlay",
    name: "Smoke from satellite",
    type: "feature",
    url: "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/NOAA_Satellite_Smoke_Detection_(v1)/FeatureServer/0",
    needsKey: false,
    attribution: "NOAA NESDIS Hazard Mapping System",
    source: "https://www.ospo.noaa.gov/products/land/hms.html",
    terms: "Produced by NOAA and not subject to copyright.",
    style: { color: "#57534e", fillColor: "#78716c", fillOpacity: 0.25, weight: 1 },
    popup: { title: "Density", fields: [["Satellite", "Satellite"], ["Start", "Start"], ["End_", "End"]] },
  },
  {
    id: "air-quality",
    group: "overlay",
    name: "Air quality, PM2.5 (latest hour)",
    type: "feature",
    url: "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/AirNowLatestContoursPM25/FeatureServer/0",
    needsKey: false,
    attribution: "US EPA AirNow",
    source: "https://www.airnow.gov/",
    terms: "US EPA data, public domain. Preliminary readings, not for regulatory use.",
    style: { color: "#0e7490", fillColor: "#22d3ee", fillOpacity: 0.15, weight: 1 },
    popup: { title: "gridcode", fields: [["Timestamp", "Time"]] },
  },
  {
    id: "land-ownership",
    group: "overlay",
    name: "Federal surface land ownership",
    type: "tile",
    url: "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/tile/{z}/{y}/{x}",
    opacity: 0.55,
    // The cache stops at level 14 (maxScale 36111). Leaflet scales it up past that.
    maxNativeZoom: 14,
    needsKey: false,
    attribution: "BLM Surface Management Agency",
    source: "https://gbp-blm-egis.hub.arcgis.com/",
    terms: "US government data, public domain. Not a legal land survey.",
  },
];

export const DEFAULT_BASEMAP = "usgs-imagery";
export const KEYED_DEFAULT_BASEMAP = "esri-imagery";

/** Layers usable with or without a key. Key-only layers drop out without one. */
export function availableLayers(hasKey) {
  return LAYERS.filter((layer) => hasKey || !layer.needsKey);
}

/** The tile URL to hand the map. Adds the key only for layers that need it. */
export function tileUrl(layer, apiKey) {
  if (!layer.needsKey) return layer.url;
  if (!apiKey) return null;
  return layer.url + (layer.url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(apiKey);
}

const ARCGIS_LAYER = /\/(FeatureServer|MapServer)\/\d+\/?$/i;
const ARCGIS_SERVICE = /\/MapServer\/?$/i;

/**
 * Check a layer URL a rancher pastes in, such as paddock boundaries or water
 * points. Accepts https only: an ArcGIS FeatureServer or MapServer layer
 * (…/FeatureServer/0), a MapServer service, or a GeoJSON file.
 * Returns { layer } or { error }.
 */
export function customLayer(input, name = "") {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    return { error: "That is not a web address." };
  }
  if (url.protocol !== "https:") return { error: "Use an https address." };
  if (url.username || url.password) return { error: "Leave the login out of the address." };
  for (const key of url.searchParams.keys()) {
    if (/token|key|secret|password/i.test(key)) return { error: "Leave keys and tokens out of the address." };
  }
  const path = url.pathname;
  let type = null;
  if (ARCGIS_LAYER.test(path)) type = "feature";
  else if (ARCGIS_SERVICE.test(path)) type = "dynamic";
  else if (/\.(geo)?json$/i.test(path) || url.searchParams.get("f") === "geojson") type = "geojson";
  if (!type) return { error: "Use an ArcGIS layer (ending in /FeatureServer/0 or /MapServer) or a GeoJSON file." };
  const clean = url.origin + path.replace(/\/$/, "") + (type === "geojson" ? url.search : "");
  return {
    layer: {
      id: "custom-" + hash(clean),
      group: "overlay",
      custom: true,
      name: String(name || "").trim().slice(0, 60) || "Your layer",
      type,
      url: clean,
      needsKey: false,
      attribution: url.hostname,
      style: { color: "#15803d", fillColor: "#22c55e", fillOpacity: 0.2, weight: 2, radius: 6 },
    },
  };
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
