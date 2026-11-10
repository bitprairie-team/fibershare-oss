//! Sample-day alert story, copied from the JavaScript tests.

use std::collections::BTreeMap;

use fibershare_core::alerts::{
    compute_alerts, event_alerts, in_paddock, tracker_alerts, ALERT_RULES,
};
use fibershare_core::herd::{heard_by, sort_events, state_at};
use serde_json::{json, Value};

fn herd() -> Value {
    serde_json::from_str(include_str!("../../../public/data/herd.json")).unwrap()
}
fn day() -> Value {
    serde_json::from_str(include_str!("../../../public/data/events.json")).unwrap()
}

fn sample_at(count: usize) -> Vec<Value> {
    let herd = herd();
    let day = day();
    let events = sort_events(day.get("events").unwrap().as_array().unwrap());
    let shown = events.iter().take(count).cloned().collect::<Vec<_>>();
    let end = "2026-09-06T18:05:00";
    let now = if count >= events.len() {
        end
    } else {
        shown
            .last()
            .and_then(|e| e.get("time").and_then(Value::as_str))
            .unwrap_or(end)
    };
    let state = state_at(
        herd.get("goats").unwrap().as_array().unwrap(),
        &events,
        count,
        herd.get("uplinksStart").and_then(Value::as_str),
        Some(now),
    );
    compute_alerts(&state.animals, &state.shown, now, &ALERT_RULES, None, &[])
}

fn ids(animals: Value, now: &str) -> Vec<String> {
    tracker_alerts(animals.as_array().unwrap(), now, &ALERT_RULES, None)
        .into_iter()
        .filter_map(|a| a.get("id").and_then(Value::as_str).map(str::to_string))
        .collect()
}

#[test]
fn alert_thresholds() {
    assert_eq!(ALERT_RULES.low_battery_percent, 20.0);
    assert_eq!(ALERT_RULES.quiet_minutes, 120);
    assert_eq!(ALERT_RULES.still_minutes, 120);
    assert_eq!(ALERT_RULES.still_distance, 3.0);
    assert!(in_paddock(50.0, 50.0, &ALERT_RULES.paddock));
    assert!(!in_paddock(108.0, 66.0, &ALERT_RULES.paddock));
}

#[test]
fn battery_rule() {
    let now = "2026-09-06T12:00:00";
    let base = json!({"lastSeen": "2026-09-06T11:50:00"});
    let mut low = base.clone();
    low["id"] = json!("a");
    low["name"] = json!("A");
    low["battery"] = json!(19);
    assert_eq!(ids(json!([low]), now), vec!["battery:a"]);
    let mut edge = base.clone();
    edge["id"] = json!("a");
    edge["name"] = json!("A");
    edge["battery"] = json!(20);
    assert!(ids(json!([edge]), now).is_empty());
}

#[test]
fn quiet_rule() {
    let animal =
        |last: &str| json!([{"id": "t1", "name": "Tracker 1", "battery": 80, "lastSeen": last}]);
    assert!(tracker_alerts(
        animal("2026-09-06T10:00:00").as_array().unwrap(),
        "2026-09-06T12:00:00",
        &ALERT_RULES,
        None
    )
    .is_empty());
    let quiet = &tracker_alerts(
        animal("2026-09-06T10:00:00").as_array().unwrap(),
        "2026-09-06T12:01:00",
        &ALERT_RULES,
        None,
    )[0];
    assert_eq!(quiet["id"], "quiet:t1:2026-09-06T10:00:00");
    assert!(quiet["title"]
        .as_str()
        .unwrap()
        .contains("no check-in for 2 hours 1 min"));
    let long = &tracker_alerts(
        animal("2026-09-01T10:00:00").as_array().unwrap(),
        "2026-09-06T12:00:00",
        &ALERT_RULES,
        None,
    )[0];
    assert!(long["title"]
        .as_str()
        .unwrap()
        .ends_with("no check-in for 5 days"));
    let never = json!([{"id": "t1", "name": "Tracker 1", "battery": 80, "lastSeen": null, "status": "never seen"}]);
    assert_eq!(
        tracker_alerts(
            never.as_array().unwrap(),
            "2026-09-06T12:00:00",
            &ALERT_RULES,
            None
        )[0]["id"],
        "quiet:t1:never"
    );
    let z = json!([{"id": "t1", "name": "Tracker 1", "battery": 80, "lastSeen": "2026-09-06T10:00:00Z"}]);
    assert_eq!(
        tracker_alerts(
            z.as_array().unwrap(),
            "2026-09-06T12:30:00Z",
            &ALERT_RULES,
            None
        )
        .len(),
        1
    );
}

#[test]
fn sample_day_story() {
    let events = sort_events(day().get("events").unwrap().as_array().unwrap());
    assert_eq!(events.len(), 37);
    let after = |id: &str| events.iter().position(|e| e["id"] == id).unwrap() + 1;
    assert!(sample_at(after("e09")).is_empty());
    let at920: Vec<String> = sample_at(after("e10"))
        .iter()
        .map(|a| {
            format!(
                "{}:{}",
                a["kind"].as_str().unwrap(),
                a["animalId"].as_str().unwrap_or("")
            )
        })
        .collect();
    assert_eq!(at920, vec!["quiet:pippin"]);
    assert!(sample_at(after("e11")).is_empty());
    let still = after("e30");
    assert!(sample_at(still)
        .iter()
        .any(|a| a["kind"] == "still" && a["animalId"] == "thistle"));
    let out = after("e32");
    assert!(sample_at(out)
        .iter()
        .any(|a| a["kind"] == "paddock" && a["animalId"] == "sage"));
    let end: Vec<String> = sample_at(events.len())
        .iter()
        .map(|a| {
            format!(
                "{}:{}",
                a["kind"].as_str().unwrap(),
                a["animalId"].as_str().unwrap_or("")
            )
        })
        .collect();
    assert_eq!(
        end,
        vec!["predator:", "smoke:", "quiet:willow", "battery:hazel"]
    );
    let quiet = sample_at(events.len())
        .into_iter()
        .find(|a| a["kind"] == "quiet")
        .unwrap();
    assert!(quiet["title"]
        .as_str()
        .unwrap()
        .starts_with("Willow: no check-in for 3 hours 25 min"));
}

#[test]
fn heard_by_spreads_hours() {
    let start = "2026-09-06T06:00:00";
    assert_eq!(
        heard_by(Some(&json!([2, 0])), start, "2026-09-06T06:30:00").as_deref(),
        Some("2026-09-06T06:20:00")
    );
    assert_eq!(
        heard_by(Some(&json!([2, 0])), start, "2026-09-06T09:00:00").as_deref(),
        Some("2026-09-06T06:40:00")
    );
    assert_eq!(
        heard_by(Some(&json!([0, 0])), start, "2026-09-06T09:00:00"),
        None
    );
}

#[test]
fn jobs_line_matches() {
    use fibershare_core::jobs::{alert_jobs_are_off, alerts_off_notice_text, jobs_line};
    use fibershare_core::settings::{read_jobs, MemoryStore};
    let on = read_jobs(&MemoryStore::default());
    assert_eq!(
        jobs_line(&on, &ALERT_RULES),
        "Automatic alerts on: battery below 20%, no check-in for 2 hours, not moving for 2 hours, outside the paddock, SOS, Predator Watch, Wildfire Watch."
    );
    let mut off = BTreeMap::new();
    for id in [
        "battery", "quiet", "still", "paddock", "sos", "predator", "smoke", "trace", "pull",
    ] {
        off.insert(id.to_string(), false);
    }
    let exact = "Automatic alerts are off. FiberShare will not flag low batteries, quiet trackers, animals that stop moving or leave the paddock, SOS, Predator Watch reports or Wildfire Watch reports until you turn them back on. Fiber lot tracing and live file checks are paused too. FiberShare is an aid, not a guarantee. In an emergency, call 911.";
    assert!(alert_jobs_are_off(&off, &ALERT_RULES));
    assert_eq!(alerts_off_notice_text(&off, &ALERT_RULES), exact);
}

#[test]
fn times_read_the_same() {
    use fibershare_core::time::{ago, date_time, day_time, parse_ms, time_of};
    assert_eq!(time_of("2026-09-06T16:40:00"), "16:40");
    assert_eq!(time_of("2026-09-06T05:05:00"), "05:05");
    assert_eq!(date_time("2026-09-06T16:40:00"), "Sep 6, 16:40");
    let now = parse_ms("2026-09-06T18:05:00").unwrap();
    assert_eq!(day_time("2026-09-06T17:55:00", now), "17:55");
    assert_eq!(day_time("2026-07-12T10:00:00", now), "Jul 12, 10:00");
    assert_eq!(
        ago(
            Some("2026-09-06T17:55:00"),
            "2026-09-06T18:05:00",
            "not yet"
        ),
        "10 min ago"
    );
    assert_eq!(
        ago(
            Some("2026-09-06T15:05:00"),
            "2026-09-06T18:05:00",
            "not yet"
        ),
        "3 hours ago"
    );
    assert_eq!(
        ago(
            Some("2026-09-01T18:05:00"),
            "2026-09-06T18:05:00",
            "not yet"
        ),
        "5 days ago"
    );
}

#[test]
fn event_alerts_keep_cleared() {
    let events = vec![
        json!({"id": "p1", "type": "predator", "cell": "A1", "time": "2026-09-06T16:40:00", "text": "coyote"}),
        json!({"id": "p2", "type": "predator-clear", "cell": "A1", "time": "2026-09-06T17:25:00"}),
        json!({"id": "s1", "type": "smoke", "time": "2026-09-06T12:30:00", "text": "haze"}),
    ];
    let out = event_alerts(&events, None);
    assert_eq!(out[0]["id"], "event:p1");
    assert_eq!(out[0]["cleared"], true);
    assert_eq!(out[1]["kind"], "smoke");
    assert_eq!(out[0]["title"], "Predator Watch reported activity near A1");
}
