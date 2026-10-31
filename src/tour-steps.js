// The guided tour for live demos. Plain data, so tests can check it.
// Each step opens a route, sets the herd view if needed, and points at an
// element marked with data-tour. Everything runs on the sample data.

export const TOUR_STEPS = [
  {
    id: "welcome",
    route: "/",
    target: "hero",
    title: "What FiberShare is",
    body: "FiberShare is a community of local ranchers. They share trackers, alerts, and know-how to keep animals safe. This demo runs on sample goats and works without an internet link.",
  },
  {
    id: "herd",
    route: "/map",
    target: "grid",
    herd: { moment: "end", select: "bramble" },
    title: "The herd",
    body: "Eight sample goats on a paddock grid. Each pin is one goat wearing a LoRaWAN collar tracker. Tap a pin to see that goat's battery and last check-in.",
  },
  {
    id: "smoke",
    route: "/map",
    target: "grid",
    herd: { moment: "smoke" },
    simulated: true,
    title: "A smoke alert",
    body: "At 12:30 on the sample day, Wildfire Watch reports smoke haze upwind. The rancher gets a calm heads-up, not an alarm. This alert is simulated.",
  },
  {
    id: "predator",
    route: "/map",
    target: "grid",
    herd: { moment: "predator" },
    simulated: true,
    title: "A predator alert",
    body: "At 16:40, Predator Watch reports a likely coyote at the edge of cell A1. Minutes later the trackers show the goats moving away from it. This alert is simulated.",
  },
  {
    id: "alerts",
    route: "/map",
    target: "alerts",
    herd: { moment: "end" },
    title: "Alerts to answer",
    body: "Low battery and quiet-tracker alerts come from the tracker data. Confirm an alert if it is real, or dismiss it, with a note if you like. Answered alerts move to the history list.",
  },
  {
    id: "animal",
    route: "/map",
    target: "detail",
    herd: { moment: "end", select: "bramble", openSheet: true },
    title: "One goat up close",
    body: "Bramble's card shows her breed, fiber, tracker battery, and check-ins by hour. The link at the bottom follows her fleece to a fiber lot.",
  },
  {
    id: "trace",
    route: "/trace",
    target: "chain",
    title: "From fleece to fiber lot",
    body: "A fiber lot links back to the fleece, the shearing, and the goat. The rancher decides what a buyer or the public can see. Switch the viewer to try it.",
  },
  {
    id: "rancher-map",
    route: "/rancher",
    target: "rancher-map",
    title: "The rancher map",
    body: "A signed-in rancher sees real tracker positions on a map with public agency layers. The public only ever gets the hidden grid. This drawing stands in for the map, so the tour stays offline.",
  },
  {
    id: "setups",
    route: "/setups",
    target: "setups",
    title: "Three ways to run it",
    body: "Run it on your own hardware, have BitPrairie host it, or mix the two. The community network comes first and is free for non-commercial and research use.",
  },
];

export const TOUR_KEYS = { seen: "fs-tour-seen", step: "fs-tour-step" };
