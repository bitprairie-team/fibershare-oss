// Signed-in rancher map. Leaflet and this file load only on the rancher page.
// Positions come from /api/live after the server has checked the session.
(function () {
  var root = document.querySelector("[data-live-map]");
  if (!root || !window.L) return;
  var catalogue = [];
  var node = document.getElementById("map-layers");
  try { catalogue = JSON.parse(node ? node.textContent : "[]"); } catch (e) { catalogue = []; }
  var STATE_KEY = "fs-rancher-map";
  var CUSTOM_KEY = "fs-rancher-layers";
  var FALLBACK = "osm-streets";

  function readStore(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (e) { return fallback; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function customLayer(input, name) {
    var url;
    try { url = new URL(String(input || "").trim()); } catch (e) { return { error: "That is not a web address." }; }
    if (url.protocol !== "https:") return { error: "Use an https address." };
    if (url.username || url.password) return { error: "Leave the login out of the address." };
    var keys = [...url.searchParams.keys()];
    for (var i = 0; i < keys.length; i++) {
      if (/token|key|secret|password/i.test(keys[i])) return { error: "Leave keys and tokens out of the address." };
    }
    var path = url.pathname;
    var type = null;
    if (/\/(FeatureServer|MapServer)\/\d+\/?$/i.test(path)) type = "feature";
    else if (/\/MapServer\/?$/i.test(path)) type = "dynamic";
    else if (/\.(geo)?json$/i.test(path) || url.searchParams.get("f") === "geojson") type = "geojson";
    if (!type) return { error: "Use an ArcGIS layer (ending in /FeatureServer/0 or /MapServer) or a GeoJSON file." };
    var clean = url.origin + path.replace(/\/$/, "") + (type === "geojson" && url.search ? url.search : "");
    var h = 2166136261;
    for (var c = 0; c < clean.length; c++) h = Math.imul(h ^ clean.charCodeAt(c), 16777619);
    return {
      layer: {
        id: "custom-" + (h >>> 0).toString(36),
        group: "overlay",
        custom: true,
        name: String(name || "").trim().slice(0, 60) || "Your layer",
        type: type,
        url: clean,
        needsKey: false,
        attribution: url.hostname
      }
    };
  }
  function tileUrl(layer, apiKey) {
    if (!layer.needsKey) return layer.url;
    if (!apiKey) return null;
    return layer.url + (layer.url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(apiKey);
  }

  fetch("/api/session", { credentials: "same-origin" })
    .then(function (response) { return response.json(); })
    .then(function (session) {
      if (!session || !session.signedIn) return;
      return fetch("/api/live", { credentials: "same-origin" }).then(function (response) { return response.json(); });
    })
    .then(function (body) {
      if (!body || !body.live || !Array.isArray(body.live.animals)) return;
      var points = body.live.animals.filter(function (animal) {
        return animal.details && animal.details.position &&
          Number.isFinite(animal.details.position.latitude) &&
          Number.isFinite(animal.details.position.longitude);
      });
      if (!points.length) return;
      var apiKey = body.arcgisApiKey || "";
      var hasKey = Boolean(apiKey);
      var layers = catalogue.filter(function (layer) { return hasKey || !layer.needsKey; });
      root.hidden = false;
      var drawing = root.parentElement && root.parentElement.querySelector("svg");
      if (drawing) drawing.hidden = true;
      var saved = readStore(STATE_KEY, {});
      var custom = (readStore(CUSTOM_KEY, []) || []).map(function (item) {
        var made = customLayer(item.url, item.name);
        return made.layer;
      }).filter(Boolean);
      var state = {
        basemap: layers.some(function (l) { return l.id === saved.basemap && l.group === "basemap"; })
          ? saved.basemap
          : (hasKey ? "esri-imagery" : "usgs-imagery"),
        overlays: Array.isArray(saved.overlays) ? saved.overlays : ["fire-perimeters", "weather-alerts"]
      };
      root.innerHTML = '<div class="rancher-map-canvas" data-canvas></div>';
      var canvas = root.querySelector("[data-canvas]");
      var first = points[0].details.position;
      var map = L.map(canvas, { scrollWheelZoom: false }).setView([first.latitude, first.longitude], 13);
      var live = {};
      function byId(id) {
        return layers.concat(custom).filter(function (l) { return l.id === id; })[0];
      }
      function showError(id, on) {
        var flag = root.querySelector('[data-layer-error="' + id + '"]');
        if (flag) flag.hidden = !on;
      }
      function make(layer) {
        var url = tileUrl(layer, apiKey);
        if (layer.type === "tile") {
          if (!url) return null;
          return L.tileLayer(url, {
            maxNativeZoom: layer.maxNativeZoom || 19,
            maxZoom: 19,
            opacity: layer.opacity || 1,
            attribution: layer.attribution || ""
          });
        }
        if (layer.type === "dynamic") {
          var tile = layer.url.replace(/\/$/, "") + "/tile/{z}/{y}/{x}";
          return L.tileLayer(tile, { maxZoom: 19, opacity: layer.opacity || 0.6, attribution: layer.attribution || "" });
        }
        var group = L.layerGroup();
        var query = layer.url + (layer.url.indexOf("?") >= 0 ? "&" : "?") + "f=geojson";
        if (layer.type === "feature") query = layer.url.replace(/\/$/, "") + "/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&resultRecordCount=200";
        fetch(query).then(function (response) { return response.json(); }).then(function (geo) {
          L.geoJSON(geo, {
            style: layer.style || { color: "#6b4a2e", weight: 2 },
            pointToLayer: function (feat, latlng) {
              return L.circleMarker(latlng, { radius: 5, color: "#6b4a2e", fillColor: "#f2ede4", fillOpacity: 1 });
            }
          }).addTo(group);
          showError(layer.id, false);
        }).catch(function () { showError(layer.id, true); });
        return group;
      }
      function enable(id) {
        if (live[id]) return;
        var layer = byId(id);
        if (!layer) return;
        var made = make(layer);
        if (!made) return;
        if (made.on) {
          made.on("tileerror", function () {
            showError(id, true);
            if (id === state.basemap && id !== FALLBACK) {
              disable(id);
              state.basemap = FALLBACK;
              enable(FALLBACK);
              if (live[FALLBACK] && live[FALLBACK].bringToBack) live[FALLBACK].bringToBack();
              drawPanel();
            }
          });
        }
        made.addTo(map);
        live[id] = made;
      }
      function disable(id) {
        if (live[id]) map.removeLayer(live[id]);
        delete live[id];
        showError(id, false);
      }
      var Panel = L.Control.extend({
        options: { position: "topright" },
        onAdd: function () {
          var div = L.DomUtil.create("div", "leaflet-control layer-panel-wrap");
          L.DomEvent.disableClickPropagation(div);
          L.DomEvent.disableScrollPropagation(div);
          return div;
        }
      });
      var panel = new Panel();
      panel.addTo(map);
      function drawPanel() {
        var holder = panel.getContainer();
        var basemaps = layers.filter(function (l) { return l.group === "basemap"; });
        var overlays = layers.filter(function (l) { return l.group !== "basemap"; });
        function radio(l) {
          return '<label class="layer-row"><input type="radio" name="basemap" value="' + esc(l.id) + '"' +
            (state.basemap === l.id ? " checked" : "") + " /> " + esc(l.name) + "</label>";
        }
        function box(l) {
          var on = state.overlays.indexOf(l.id) >= 0;
          return '<div class="layer-row"><label><input type="checkbox" value="' + esc(l.id) + '"' + (on ? " checked" : "") + " /> " + esc(l.name) + "</label>" +
            (l.source ? ' <a class="layer-src" href="' + esc(l.source) + '">source</a>' : "") +
            (l.custom ? ' <button type="button" data-remove="' + esc(l.id) + '">remove</button>' : "") +
            '<span class="layer-error" data-layer-error="' + esc(l.id) + '" hidden> did not load</span></div>';
        }
        holder.innerHTML = '<details class="layer-panel" open><summary>Layers</summary>' +
          '<fieldset><legend>Basemap</legend>' + basemaps.map(radio).join("") + "</fieldset>" +
          '<fieldset><legend>Overlays</legend>' + overlays.map(box).join("") + custom.map(box).join("") + "</fieldset>" +
          '<form data-add-layer><label for="layer-url">Add your own layer</label>' +
          '<input id="layer-url" name="url" type="url" placeholder="https://…/FeatureServer/0" required />' +
          '<input name="name" type="text" maxlength="60" placeholder="Name" />' +
          '<button type="submit">Add</button><p data-add-error hidden></p></form></details>';
        holder.querySelectorAll('input[name="basemap"]').forEach(function (input) {
          input.addEventListener("change", function () {
            disable(state.basemap);
            state.basemap = input.value;
            enable(state.basemap);
            if (live[state.basemap] && live[state.basemap].bringToBack) live[state.basemap].bringToBack();
            writeStore(STATE_KEY, state);
          });
        });
        holder.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
          input.addEventListener("change", function () {
            if (input.checked) {
              enable(input.value);
              if (state.overlays.indexOf(input.value) < 0) state.overlays.push(input.value);
            } else {
              disable(input.value);
              state.overlays = state.overlays.filter(function (id) { return id !== input.value; });
            }
            writeStore(STATE_KEY, state);
          });
        });
        holder.querySelectorAll("[data-remove]").forEach(function (button) {
          button.addEventListener("click", function () {
            var id = button.getAttribute("data-remove");
            disable(id);
            custom = custom.filter(function (l) { return l.id !== id; });
            state.overlays = state.overlays.filter(function (item) { return item !== id; });
            writeStore(CUSTOM_KEY, custom.map(function (l) { return { url: l.url, name: l.name }; }));
            drawPanel();
          });
        });
        var form = holder.querySelector("[data-add-layer]");
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          var made = customLayer(form.url.value, form.name.value);
          var error = holder.querySelector("[data-add-error]");
          if (made.error) { error.hidden = false; error.textContent = made.error; return; }
          error.hidden = true;
          custom.push(made.layer);
          state.overlays.push(made.layer.id);
          writeStore(CUSTOM_KEY, custom.map(function (l) { return { url: l.url, name: l.name }; }));
          enable(made.layer.id);
          drawPanel();
        });
      }
      drawPanel();
      enable(state.basemap);
      state.overlays.forEach(enable);
      points.forEach(function (animal) {
        var position = animal.details.position;
        L.circleMarker([position.latitude, position.longitude], {
          radius: 7, color: "#6b4a2e", weight: 2, fillColor: "#f2ede4", fillOpacity: 1
        }).addTo(map).bindTooltip(animal.alias || animal.name || "Tracker");
      });
    })
    .catch(function () {});
})();
