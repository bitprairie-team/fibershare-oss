//! The five-step guided tour. Each step opens a route and points at one element.

use serde_json::{json, Value};

pub struct TourStep {
    pub id: &'static str,
    pub route: &'static str,
    pub target: &'static str,
    pub title: &'static str,
    pub body: &'static str,
    pub simulated: bool,
}

pub const TOUR_STEPS: &[TourStep] = &[
    TourStep {
        id: "herd",
        route: "/map?animal=bramble&moment=end",
        target: "grid",
        title: "The herd",
        body: "8 sample goats, each with a collar tracker. Select a pin to see that goat's battery and last check-in. Play steps through the sample day.",
        simulated: false,
    },
    TourStep {
        id: "predator",
        route: "/map?moment=predator",
        target: "grid",
        title: "Predator Watch",
        body: "At 16:40 Predator Watch reports a likely coyote at the edge of cell A1. The trackers then show the goats moving away. This report is simulated.",
        simulated: true,
    },
    TourStep {
        id: "alerts",
        route: "/map?moment=end",
        target: "alerts",
        title: "Open alerts",
        body: "Each alert says what raised it and when the rules ran. Confirm or dismiss it, or add one by hand. Alert settings turn each automated job on or off.",
        simulated: false,
    },
    TourStep {
        id: "trace",
        route: "/trace",
        target: "chain",
        title: "Fleece trace",
        body: "The mohair-bramble lot links back to its fleece, the shearing and Bramble. Switch the viewer to see what a buyer or the public can see.",
        simulated: false,
    },
    TourStep {
        id: "rancher-map",
        route: "/rancher",
        target: "rancher-map",
        title: "Rancher map",
        body: "A signed-in rancher sees real tracker positions with public map layers. The public sees only the grid. This drawing keeps the tour offline.",
        simulated: false,
    },
];

pub fn steps_json() -> String {
    let steps: Vec<Value> = TOUR_STEPS
        .iter()
        .map(|step| {
            json!({
                "id": step.id,
                "route": step.route,
                "target": step.target,
                "title": step.title,
                "body": step.body,
                "simulated": step.simulated,
            })
        })
        .collect();
    serde_json::to_string(&steps).unwrap_or_else(|_| "[]".into())
}
