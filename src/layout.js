import { SITES } from "./sites.js";

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
    '<header class="site-header"><div class="wrap">' +
    '<a class="brand" href="#/">Fiber<span>Share</span> OSS</a>' +
    '<nav class="nav">' +
    links +
    '<button class="theme-toggle" type="button" data-theme-toggle>Theme</button>' +
    "</nav></div></header>"
  );
}

export function footer() {
  const items = SITES.map((s) => '<a href="' + s.href + '">' + s.name + "</a>").join(" · ");
  return (
    '<footer class="site-footer"><div class="wrap">' +
    "<small>MIT (c) 2026 BitPrairie LLC · community MVP</small><small>" +
    items +
    "</small></div></footer>"
  );
}

export function bindTheme(root) {
  const stored = localStorage.getItem("fs-theme");
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  root.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("fs-theme", next);
  });
}
