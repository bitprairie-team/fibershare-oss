// The guided tour for live demos. Plain data, so tests can check it.
// Each step opens a route, sets the herd view if needed, and points at an
// element marked with data-tour. Everything runs on the sample data.

export const TOUR_STEPS = [
  {
    id: "herd",
    route: "/map",
    target: "grid",
    herd: { moment: "end", select: "bramble" },
    title: "The herd",
    body: "8 sample goats, each with a LoRaWAN collar tracker. Select a pin to see that goat's battery and last check-in. Play steps through the sample day.",
  },
  {
    id: "predator",
    route: "/map",
    target: "grid",
    herd: { moment: "predator" },
    simulated: true,
    title: "Predator Watch",
    body: "At 16:40 Predator Watch reports a likely coyote at the edge of cell A1. The trackers then show the goats moving away. This report is simulated.",
  },
  {
    id: "alerts",
    route: "/map",
    target: "alerts",
    herd: { moment: "end" },
    title: "Open alerts",
    body: "Alerts from the trackers, Predator Watch and Wildfire Watch. Confirm or dismiss each one. Answers are kept after a reload.",
  },
  {
    id: "trace",
    route: "/trace",
    target: "chain",
    title: "Fleece trace",
    body: "The mohair-bramble lot links back to its fleece, the shearing and Bramble. Switch the viewer to see what a buyer or the public can see.",
  },
  {
    id: "rancher-map",
    route: "/rancher",
    target: "rancher-map",
    title: "Rancher map",
    body: "A signed-in rancher sees real tracker positions with public map layers. The public sees only the grid. This drawing keeps the tour offline.",
  },
];

export const TOUR_KEYS = { seen: "fs-tour-seen", step: "fs-tour-step" };
