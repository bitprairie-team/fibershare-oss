import { SITES } from "./sites.js";

const MARK =
  '<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
  '<rect width="64" height="64" rx="16" fill="#6b4a2e"/>' +
  '<circle cx="32" cy="37" r="15" fill="#f6f3ec"/>' +
  '<path d="M21 30c1-9 7-15 11-15s10 6 11 15" fill="none" stroke="#b0893e" stroke-width="3.5" stroke-linecap="round"/>' +
  '<circle cx="26" cy="35" r="2.2" fill="#141416"/>' +
  '<circle cx="38" cy="35" r="2.2" fill="#141416"/>' +
  '</svg>';

export function nav(active) {
  const links = [
    ["/", "Home"],
    ["/map", "Herd map"],
    ["/shop", "Fiber shop"],
    ["/architecture", "Architecture"],
  ]
    .map(([href, label]) => {
      const cls = active === href ? "active" : "";
      return '<a href="#' + href + '" class="' + cls + '">' + label + "</a>";
    })
    .join("");
  return (
    '<a class="skip-link" href="#main">Skip to content</a>' +
    '<header class="site-header"><div class="wrap">' +
    '<a class="brand" href="#/">' +
    MARK +
    'Fiber<span>Share</span> OSS</a>' +
    '<nav class="nav" aria-label="Primary">' +
    links +
    '<button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle light or dark theme">Theme</button>' +
    "</nav></div></header>"
  );
}

export function footer() {
  const items = SITES.map(
    (s) => '<a href="' + s.href + '" rel="noopener">' + s.name + "</a>"
  ).join(" · ");
  return (
    '<footer class="site-footer"><div class="wrap">' +
    "<small>MIT © 2026 BitPrairie LLC · community MVP · sponsorship is support, not an investment</small><small>" +
    items +
    "</small></div></footer>"
  );
}

export function bindTheme(root) {
  const stored = localStorage.getItem("fs-theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
    document.documentElement.style.colorScheme = stored;
  }
  const btn = root.querySelector("[data-theme-toggle]");
  const syncLabel = () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (btn) btn.textContent = dark ? "Light" : "Dark";
  };
  syncLabel();
  btn?.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("fs-theme", next);
    syncLabel();
  });
}
