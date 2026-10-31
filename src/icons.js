// Inline SVG icons, drawn for this demo on a 24 by 24 grid with a 1.75 stroke.
// No icon font and nothing loaded from another site.

const PATHS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="3"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  tour: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  smoke: '<path d="M4 15c2-2 4-2 6 0s4 2 6 0 3-1.5 4-1"/><path d="M4 10c2-2 4-2 6 0s4 2 6 0 3-1.5 4-1"/><path d="M4 20c2-2 4-2 6 0s4 2 6 0"/>',
  paw: '<circle cx="7" cy="10" r="1.8"/><circle cx="11" cy="6.5" r="1.8"/><circle cx="16" cy="7.5" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/><path d="M8.5 17.5c0-3 2.5-5.5 4.5-5.5s4 2 4 4.5c0 2-1.5 3-3 3-1.2 0-1.8-.7-3-.7s-2.5 1-3.5-.3c-.3-.3-.5-.6-.5-1z"/>',
  battery: '<rect x="3" y="7.5" width="16" height="9" rx="2"/><path d="M21 11v2"/><path d="M6 10.5v3M9 10.5v3"/>',
  signal: '<path d="M5 19v-3M10 19v-7M15 19V9M20 19V5"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17"/>',
  herd: '<path d="M4 14c0-3 2.5-5.5 6-5.5h4c3 0 5.5 2 6 5l-1.5 1H17l-1 4h-2l-.5-3h-3l-.5 3H8l-1-4H5.5z"/><path d="M17 8.5l1.5-2.5 1.5 1"/>',
  fleece: '<path d="M7 18a4 4 0 0 1-.5-8 5 5 0 0 1 9.4-1.6A4 4 0 1 1 17 18z"/><path d="M9 14h6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  map: '<path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
  server: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 7.5h.01M8 16.5h.01"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5 3.75 3.75 0 0 1-.3 7.5z"/>',
  mix: '<circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/>',
  people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.5-3.5 2.7-5.5 5.5-5.5s5 2 5.5 5.5"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M15.5 13.6c2.6-.3 4.6 1.5 5 4.9"/>',
  code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  chat: '<path d="M4 5.5h16v10H9l-5 4z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  layers: '<path d="M12 3.5l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  wifiOff: '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-3-2M12 20h.01"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
};

/** An icon as inline SVG. Decorative unless a label is given. */
export function icon(name, { size = 20, label = "", cls = "" } = {}) {
  const body = PATHS[name];
  if (!body) return "";
  const a11y = label ? ' role="img" aria-label="' + label.replace(/"/g, "&quot;") + '"' : ' aria-hidden="true"';
  return (
    '<svg class="icon' + (cls ? " " + cls : "") + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false"' +
    a11y + ">" + body + "</svg>"
  );
}

export const ICON_NAMES = Object.keys(PATHS);
