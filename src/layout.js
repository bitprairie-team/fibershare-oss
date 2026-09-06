import { DISCORD, SITES } from "./sites.js";

const MARK =
  '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
  '<rect width="32" height="32" rx="7" fill="#5c4030"/>' +
  '<path d="M11 13.5c.8-5.8 3.6-8.5 5-8.5s4.2 2.7 5 8.5" fill="none" stroke="#c49a6c" stroke-width="2.2" stroke-linecap="round"/>' +
  '<circle cx="16" cy="19" r="8" fill="#f4efe6"/>' +
  '<circle cx="13" cy="18" r="1.35" fill="#1c1916"/>' +
  '<circle cx="19" cy="18" r="1.35" fill="#1c1916"/>' +
  '<path d="M14.2 21.2c.9 1.4 2.7 1.4 3.6 0" fill="none" stroke="#5c4030" stroke-width="1.3" stroke-linecap="round"/>' +
  '<circle cx="16" cy="26.2" r="3.6" fill="none" stroke="#6b8f5a" stroke-width="1.8"/>' +
  '<circle cx="16" cy="26.2" r="1.25" fill="#c49a6c"/>' +
  "</svg>";

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
    "FiberShare <span>OSS</span></a>" +
    '<nav class="nav" aria-label="Primary">' +
    links +
    '<a href="' +
    DISCORD +
    '" rel="noopener">Discord</a>' +
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
