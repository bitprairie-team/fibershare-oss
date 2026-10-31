// The six jobs FiberShare does for a rancher, and how much of each this demo
// really does. Plain data, so a test can check the status of each one.
// status: "works" (the demo does it), "partly", or "planned".
export const LOOPS = [
  {
    id: "tracker",
    icon: "battery",
    title: "Catch a dying or silent tracker",
    status: "works",
    done: "Alerts for a battery below 20% and for a tracker with nothing heard for over 2 hours, from the tracker data. Confirm or dismiss each one.",
    planned: "Learning each tracker's normal check-in pattern, and tuning the rules from your answers.",
    href: "#/map",
    link: "See the alerts",
  },
  {
    id: "trouble",
    icon: "alert",
    title: "Find an animal in trouble",
    status: "partly",
    done: "Each animal's last check-in and place on the grid, and an alert you can confirm or dismiss when a tracker sends an SOS.",
    planned: "Spotting an animal that stops moving or leaves the herd.",
    href: "#/map",
    link: "Open the herd view",
  },
  {
    id: "predator",
    icon: "paw",
    title: "Warn neighbors about predator activity",
    status: "partly",
    done: "A simulated Predator Watch alert you can confirm or dismiss, with a note.",
    planned: "Sharing a confirmed alert with ranchers nearby.",
    href: "#/map",
    link: "Play the day",
  },
  {
    id: "fire",
    icon: "smoke",
    title: "Plan a move ahead of fire or smoke",
    status: "partly",
    done: "A simulated Wildfire Watch smoke alert, and public fire, smoke, and air quality layers on the rancher map.",
    planned: "Alerts from those layers when fire or smoke comes near your trackers.",
    href: "#/map",
    link: "Play the day",
  },
  {
    id: "fiber",
    icon: "fleece",
    title: "Link fiber quality to breeding and grazing",
    status: "partly",
    done: "Records that trace a fiber lot back to its fleece, the shearing, and the goat.",
    planned: "Comparing fiber test results with breeding and grazing records.",
    href: "#/trace",
    link: "Follow the fleece",
  },
  {
    id: "paddock",
    icon: "grid",
    title: "Plan the next paddock move",
    status: "planned",
    done: "",
    planned: "Grazing records for each paddock, and a suggested day to move the herd.",
    href: "",
    link: "",
  },
];

export const LOOP_STATUS = {
  works: ["badge-live", "In the demo"],
  partly: ["badge-sim", "Partly built"],
  planned: ["badge-planned", "Planned"],
};
