import { icon } from "./icons.js";

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

export const NAV_LINKS = [
  ["/", "Home"],
  ["/map", "Herd view"],
  ["/trace", "Fleece trace"],
  ["/setups", "Setups"],
  ["/architecture", "How it works"],
  ["/rancher", "Rancher sign-in"],
];

export function nav(active) {
  const links = NAV_LINKS.map(([href, label]) => {
    const on = active === href;
    return '<a href="#' + href + '"' + (on ? ' class="active" aria-current="page"' : "") + ">" + label + "</a>";
  }).join("");
  return (
    '<a class="skip-link" href="#main">Skip to content</a>' +
    '<header class="site-header"><p class="demo-bar">This is a demo, not the FiberShare app.</p>' +
    '<div class="wrap header-row">' +
    '<a class="brand" href="#/">' + MARK + '<span class="brand-name">FiberShare</span></a>' +
    '<nav class="nav" id="primary-nav" aria-label="Primary">' + links + "</nav>" +
    '<div class="header-actions">' +
    '<button class="btn btn-tour" type="button" data-tour-start>Tour</button>' +
    '<button class="icon-btn" type="button" data-theme-toggle aria-label="Switch to dark theme">' + icon("moon", { cls: "i-moon" }) + icon("sun", { cls: "i-sun" }) + "</button>" +
    '<button class="icon-btn nav-toggle" type="button" data-nav-toggle aria-controls="primary-nav" aria-expanded="false" aria-label="Menu">' + icon("menu", { cls: "i-open" }) + icon("close", { cls: "i-close" }) + "</button>" +
    "</div></div></header>"
  );
}

export function footer() {
  return (
    '<footer class="site-footer"><div class="wrap footer-row">' +
    '<img class="footer-logo" src="/brand/bitprairie-tile.svg" alt="" width="28" height="28" />' +
    "<p>BitPrairie LLC</p>" +
    "</div></footer>"
  );
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function setTheme(next) {
  document.documentElement.setAttribute("data-theme", next);
  document.documentElement.style.colorScheme = next;
}

function closeMenu(root) {
  root.querySelector("#primary-nav")?.classList.remove("is-open");
  root.querySelector("[data-nav-toggle]")?.setAttribute("aria-expanded", "false");
}

let documentBound = false;

export function bindTheme(root) {
  const stored = localStorage.getItem("fs-theme");
  if (stored === "light" || stored === "dark") setTheme(stored);
  const btn = root.querySelector("[data-theme-toggle]");
  const sync = () => btn?.setAttribute("aria-label", currentTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
  sync();
  btn?.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("fs-theme", next);
    sync();
  });

  const toggle = root.querySelector("[data-nav-toggle]");
  const menu = root.querySelector("#primary-nav");
  toggle?.addEventListener("click", () => {
    const open = !menu?.classList.contains("is-open");
    menu?.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) menu?.querySelector("a")?.focus();
  });
  menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu(root)));

  // One set of document listeners for the life of the page, not one per render.
  if (documentBound) return;
  documentBound = true;
  document.addEventListener("click", (event) => {
    const app = document.getElementById("app");
    const m = app?.querySelector("#primary-nav");
    const t = app?.querySelector("[data-nav-toggle]");
    if (m?.classList.contains("is-open") && !m.contains(event.target) && !t?.contains(event.target)) closeMenu(app);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const app = document.getElementById("app");
    const m = app?.querySelector("#primary-nav");
    if (m?.classList.contains("is-open")) {
      closeMenu(app);
      app.querySelector("[data-nav-toggle]")?.focus();
    }
  });
}
