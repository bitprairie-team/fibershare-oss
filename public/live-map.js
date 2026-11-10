// Signed-in rancher map. Leaflet is loaded only on the rancher page.
// Positions come from /api/live after the server has checked the session.
(function () {
  var root = document.querySelector("[data-live-map]");
  if (!root || !window.L) return;
  fetch("/api/session", { credentials: "same-origin" })
    .then(function (response) { return response.json(); })
    .then(function (session) {
      if (!session || !session.signedIn) return;
      return fetch("/api/live", { credentials: "same-origin" }).then(function (response) {
        return response.json();
      });
    })
    .then(function (body) {
      if (!body || !body.live || !Array.isArray(body.live.animals)) return;
      var points = body.live.animals.filter(function (animal) {
        return animal.details && animal.details.position &&
          Number.isFinite(animal.details.position.latitude) &&
          Number.isFinite(animal.details.position.longitude);
      });
      if (!points.length) return;
      root.hidden = false;
      var drawing = root.parentElement && root.parentElement.querySelector("svg");
      if (drawing) drawing.hidden = true;
      var first = points[0].details.position;
      var map = L.map(root, { scrollWheelZoom: false }).setView([first.latitude, first.longitude], 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
      }).addTo(map);
      points.forEach(function (animal) {
        var position = animal.details.position;
        L.circleMarker([position.latitude, position.longitude], {
          radius: 7,
          color: "#6b4a2e",
          weight: 2,
          fillColor: "#f2ede4",
          fillOpacity: 1
        }).addTo(map).bindTooltip(animal.alias || animal.name || "Tracker");
      });
    })
    .catch(function () {});
})();
