// Theme, menu, print, job switches, and the guided tour. Loaded on every
// page. The herd WASM island is only on the herd view.
(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return [...(root || document).querySelectorAll(sel)]; }

  var theme = qs("[data-theme-toggle]");
  if (theme) theme.addEventListener("click", function () {
    var root = document.documentElement;
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    root.style.colorScheme = next;
    var meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#161310" : "#f2ede4");
    try { localStorage.setItem("fs-theme", next); } catch (e) {}
    if (window.fsIcons) window.fsIcons(next);
    theme.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
  });

  var navToggle = qs("[data-nav-toggle]");
  if (navToggle) navToggle.addEventListener("click", function () {
    var menu = document.getElementById("primary-nav");
    if (!menu) return;
    var open = !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  var print = qs("[data-print]");
  if (print) print.addEventListener("click", function () { window.print(); });

  var jobs = qs("[data-all-jobs]");
  if (jobs) jobs.addEventListener("click", function () {
    var boxes = qsa("[data-job]");
    var anyOff = boxes.some(function (box) { return !box.checked; });
    var saved = {};
    boxes.forEach(function (box) {
      box.checked = anyOff;
      saved[box.getAttribute("data-job")] = anyOff;
    });
    try { localStorage.setItem("fs-jobs", JSON.stringify(saved)); } catch (e) {}
  });

  var stepsNode = document.getElementById("tour-steps");
  var steps = [];
  try { steps = JSON.parse(stepsNode ? stepsNode.textContent : "[]"); } catch (e) { steps = []; }
  var index = -1;
  var lastFocus = null;
  var els = null;

  function esc(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function pathOf(route) { return String(route || "/").split("?")[0]; }
  function here() { return location.pathname || "/"; }

  function build() {
    var scrim = document.createElement("div");
    scrim.className = "tour-scrim";
    var spot = document.createElement("div");
    spot.className = "tour-spot";
    spot.setAttribute("aria-hidden", "true");
    var card = document.createElement("div");
    card.className = "tour-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "tour-title");
    card.setAttribute("aria-describedby", "tour-body");
    card.setAttribute("tabindex", "-1");
    document.body.append(scrim, spot, card);
    card.addEventListener("keydown", trap);
    scrim.addEventListener("click", function () {
      var next = qs("[data-tour-next]", card);
      if (next) next.focus();
    });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    els = { scrim: scrim, spot: spot, card: card };
  }
  function teardown() {
    document.documentElement.style.removeProperty("--tour-reserve");
    document.documentElement.classList.remove("tour-sheet");
    if (!els) return;
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place);
    els.scrim.remove();
    els.spot.remove();
    els.card.remove();
    els = null;
  }
  function trap(event) {
    if (event.key === "Escape") { event.preventDefault(); endTour(); return; }
    if (event.key === "ArrowRight") { event.preventDefault(); next(); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); back(); return; }
    if (event.key !== "Tab" || !els) return;
    var items = qsa("button", els.card);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function overlaps(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }
  function place() {
    if (!els || index < 0) return;
    var step = steps[index];
    var el = step ? qs('[data-tour="' + step.target + '"]') : null;
    var card = els.card;
    var margin = 16;
    var gap = 16;
    var cw = card.offsetWidth;
    var ch = card.offsetHeight;
    var spot = null;
    if (!el) {
      els.spot.style.cssText = "top:50%;left:50%;width:0;height:0";
    } else {
      var r = el.getBoundingClientRect();
      var pad = 8;
      var top = Math.max(4, r.top - pad);
      var left = Math.max(4, r.left - pad);
      var bottom = Math.min(innerHeight - 4, r.bottom + pad);
      var right = Math.min(innerWidth - 4, r.right + pad);
      els.spot.style.top = top + "px";
      els.spot.style.left = left + "px";
      els.spot.style.width = Math.max(0, right - left) + "px";
      els.spot.style.height = Math.max(0, bottom - top) + "px";
      spot = { top: top, left: left, right: right, bottom: bottom };
    }
    var sheet = qs("[data-detail].is-open");
    var sheetBox = null;
    if (sheet) {
      var sr = sheet.getBoundingClientRect();
      if (sr.height > 48 && sr.bottom > 0 && sr.top < innerHeight) sheetBox = sr;
    }
    var candidates = [];
    if (spot) {
      candidates.push({ top: spot.bottom + gap, left: Math.min(Math.max(margin, spot.left), innerWidth - cw - margin) });
      candidates.push({ top: spot.top - ch - gap, left: Math.min(Math.max(margin, spot.left), innerWidth - cw - margin) });
      candidates.push({ top: Math.min(Math.max(margin, spot.top), innerHeight - ch - margin), left: spot.right + gap });
      candidates.push({ top: Math.min(Math.max(margin, spot.top), innerHeight - ch - margin), left: spot.left - cw - gap });
    }
    candidates.push({ top: margin, left: margin });
    candidates.push({ top: innerHeight - ch - margin, left: margin });
    var chosen = null;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c.top < margin || c.left < margin || c.top + ch > innerHeight - margin || c.left + cw > innerWidth - margin) continue;
      var box = { top: c.top, left: c.left, right: c.left + cw, bottom: c.top + ch };
      if (spot && overlaps(box, spot)) continue;
      if (sheetBox && overlaps(box, sheetBox)) continue;
      chosen = c;
      break;
    }
    if (!chosen && el && spot) {
      var dockTop = Math.max(margin, innerHeight - ch - margin);
      var overlap = spot.bottom - (dockTop - gap);
      if (overlap > 0) window.scrollBy(0, overlap + margin);
      chosen = { top: dockTop, left: margin };
    }
    if (!chosen) chosen = { top: margin, left: margin };
    card.style.top = chosen.top + "px";
    card.style.left = chosen.left + "px";
    card.style.bottom = "auto";
    card.style.right = "auto";
    document.documentElement.style.setProperty("--tour-reserve", (ch + margin) + "px");
  }
  function draw() {
    var step = steps[index];
    if (!step || !els) return;
    var last = index === steps.length - 1;
    els.card.innerHTML =
      '<h2 id="tour-title">' + esc(step.title) + "</h2>" +
      '<p id="tour-body">' + esc(step.body) + "</p>" +
      '<div class="tour-actions">' +
      '<button type="button" class="btn btn-ghost btn-small" data-tour-back>Back</button>' +
      '<button type="button" class="btn btn-primary btn-small" data-tour-next>' + (last ? "Finish" : "Next") + "</button>" +
      '<button type="button" class="btn btn-ghost btn-small" data-tour-close title="Esc closes">Close</button>' +
      "</div>";
    qs("[data-tour-close]", els.card).addEventListener("click", endTour);
    qs("[data-tour-back]", els.card).addEventListener("click", back);
    qs("[data-tour-next]", els.card).addEventListener("click", next);
    var button = qs("[data-tour-next]", els.card);
    if (button) button.focus();
  }
  function show() {
    var step = steps[index];
    if (!step) return;
    if (here() !== pathOf(step.route)) {
      try { sessionStorage.setItem("fs-tour-step", String(index)); } catch (e) {}
      location.assign(step.route);
      return;
    }
    if (!els) build();
    draw();
    var el = qs('[data-tour="' + step.target + '"]');
    if (el) el.scrollIntoView({ block: "nearest" });
    place();
  }
  function go(i) {
    index = Math.max(0, Math.min(steps.length - 1, i));
    try { sessionStorage.setItem("fs-tour-step", String(index)); } catch (e) {}
    show();
  }
  function next() { if (index >= steps.length - 1) endTour(); else go(index + 1); }
  function back() { if (index > 0) go(index - 1); }
  function start(at) {
    lastFocus = document.activeElement;
    go(at || 0);
  }
  function endTour() {
    index = -1;
    try { sessionStorage.removeItem("fs-tour-step"); } catch (e) {}
    teardown();
    var backTo = lastFocus && document.body.contains(lastFocus) ? lastFocus : qs("[data-tour-start]");
    if (backTo && backTo.focus) backTo.focus();
  }
  qsa("[data-tour-start]").forEach(function (btn) {
    btn.addEventListener("click", function () { start(0); });
  });
  try {
    var saved = sessionStorage.getItem("fs-tour-step");
    if (saved !== null && steps.length) {
      index = Number(saved) || 0;
      if (steps[index] && here() === pathOf(steps[index].route)) show();
    }
  } catch (e) {}
})();
