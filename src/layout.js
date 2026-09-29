import { DISCORD, SITES } from "./sites.js";
import { esc, EXT } from "./util.js";

const MARK =
  '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
  '<rect width="32" height="32" rx="7" fill="#5c4030"/>' +
  '<path d="M15 12c-.6-4.1 3.1-7.1 6.5-5.6 1.8.8 1.2 3.1-.9 3.6 2.6-.2 4.4 1.6 3.3 3.8-.8 1.7-3.6 1.4-4.8-.4" fill="none" stroke="#c49a6c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M8 15c-2.9.9-4.3 4.5-2.3 6.8 1.4 1.6 4 .8 4.5-1.5.4-1.8-.4-4.1-2.2-5.3z" fill="#e8dfd2"/>' +
  '<path d="M10 14c1.4-5 7-7.4 11.6-5.1 3.6 1.7 6.5 5.6 5.6 8.8-.6 2.3-3 4.1-6.3 4.3-3.4.2-6.8-.4-8.8-2.3-1.8-1.7-2.4-4-2.1-5.7z" fill="#f4efe6"/>' +
  '<path d="M14 9.25c.7-2.7 3.4-3.5 4.7-1.8-1.2-.1-2.5.6-3.1 1.7z" fill="#f4efe6"/>' +
  '<path d="M16.25 7.5c1.1-1.9 3.3-1.5 3.4.5" fill="none" stroke="#f4efe6" stroke-width="1.4" stroke-linecap="round"/>' +
  '<circle cx="20.75" cy="15" r="1.3" fill="#1c1916"/>' +
  '<ellipse cx="25.6" cy="17.75" rx="1.25" ry=".9" fill="#d6cbb8"/>' +
  '<path d="M12 23c2.1 1.2 6.5 1.2 8.6 0" fill="none" stroke="#3f2a1f" stroke-width="1.2" stroke-linecap="round"/>' +
  '<circle cx="16.25" cy="26.6" r="2.7" fill="none" stroke="#6b8f5a" stroke-width="1.4"/>' +
  '<circle cx="16.25" cy="26.6" r="1.05" fill="#c49a6c"/>' +
  "</svg>";

export function nav(active) {
  const links = [
    ["/", "Home"],
    ["/map", "Herd map"],
    ["/shop", "Fiber shop"],
    ["/architecture", "Architecture"],
  ]
    .map(([href, label]) => {
      const on = active === href;
      const cls = on ? ' class="active"' : "";
      const cur = on ? ' aria-current="page"' : "";
      return '<a href="#' + href + '"' + cls + cur + ">" + label + "</a>";
    })
    .join("");
  return (
    '<a class="skip-link" href="#main">Skip to content</a>' +
    '<header class="site-header"><div class="wrap">' +
    '<a class="brand" href="#/">' +
    MARK +
    "FiberShare <span>OSS</span></a>" +
    '<button class="nav-toggle" type="button" data-nav-toggle aria-label="Toggle navigation menu" aria-expanded="false">' +
    '<span aria-hidden="true">☰</span> Menu</button>' +
    '<nav class="nav" id="primary-nav" aria-label="Primary">' +
    links +
    '<a href="' +
    DISCORD +
    '"' +
    EXT +
    ">Discord</a>" +
    '<button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle light or dark theme">Theme</button>' +
    "</nav></div></header>"
  );
}

export function footer() {
  const items = SITES.map(
    (s) => '<a href="' + esc(s.href) + '"' + EXT + ">" + esc(s.name) + "</a>"
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

  // Mobile nav toggle
  const navToggle = root.querySelector("[data-nav-toggle]");
  const nav = root.querySelector("#primary-nav");
  
  navToggle?.addEventListener("click", () => {
    const isOpen = nav?.classList.contains("is-open");
    if (isOpen) {
      nav?.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    } else {
      nav?.classList.add("is-open");
      navToggle.setAttribute("aria-expanded", "true");
    }
  });

  // Close mobile nav when clicking a link
  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav?.classList.remove("is-open");
      navToggle?.setAttribute("aria-expanded", "false");
    });
  });

  // Close mobile nav when clicking outside
  document.addEventListener("click", (e) => {
    if (!nav?.contains(e.target) && !navToggle?.contains(e.target)) {
      nav?.classList.remove("is-open");
      navToggle?.setAttribute("aria-expanded", "false");
    }
  });
}
