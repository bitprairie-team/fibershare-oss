//! Usual check-in gaps, and the quiet alert that uses them.

use fibershare_core::alerts::{tracker_alerts, ALERT_RULES};
use fibershare_core::herd::{sort_events, state_at};
use fibershare_core::pattern::{
    animal_pattern, pattern_from_counts, pattern_from_times, MIN_HABIT_GAPS, UNUSUAL_FACTOR,
    UNUSUAL_FLOOR_MINUTES,
};
use fibershare_core::time::parse_ms;
use serde_json::{json, Value};

fn herd() -> Value {
    serde_json::from_str(include_str!("../../../public/data/herd.json")).unwrap()
}

fn day() -> Value {
    serde_json::from_str(include_str!("../../../public/data/events.json")).unwrap()
}

fn start_ms() -> i64 {
    parse_ms("2026-09-06T06:00:00").unwrap()
}

#[test]
fn two_uplinks_an_hour_is_about_twenty_minutes() {
    let counts = vec![2, 2, 2, 2, 2, 2];
    let now = parse_ms("2026-09-06T12:00:00").unwrap();
    let pattern = pattern_from_counts(&counts, start_ms(), now, ALERT_RULES.quiet_minutes).unwrap();
    assert!(pattern.gaps >= MIN_HABIT_GAPS);
    assert_eq!(pattern.usual_minutes, 20);
    assert_eq!(pattern.unusual_after_minutes, UNUSUAL_FLOOR_MINUTES);
    assert!(pattern.unusual_after_minutes >= pattern.usual_minutes * UNUSUAL_FACTOR);
}

#[test]
fn a_long_outage_does_not_become_the_habit() {
    let mut counts = vec![2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2];
    let now = parse_ms("2026-09-06T18:00:00").unwrap();
    let pattern = pattern_from_counts(&counts, start_ms(), now, ALERT_RULES.quiet_minutes).unwrap();
    assert_eq!(pattern.usual_minutes, 20);
    counts[6] = 1;
    let with_one = pattern_from_counts(&counts, start_ms(), now, 120).unwrap();
    assert!(with_one.usual_minutes <= 40);
}

#[test]
fn too_few_gaps_is_not_a_pattern() {
    let counts = vec![2, 2];
    let now = parse_ms("2026-09-06T08:00:00").unwrap();
    assert!(pattern_from_counts(&counts, start_ms(), now, 120).is_none());
    let times = [
        parse_ms("2026-09-06T06:00:00").unwrap(),
        parse_ms("2026-09-06T06:20:00").unwrap(),
        parse_ms("2026-09-06T06:40:00").unwrap(),
    ];
    assert!(pattern_from_times(&times, times[2], 120).is_none());
}

#[test]
fn gaps_past_the_quiet_limit_are_left_out() {
    let times = [
        0,
        20 * 60_000,
        40 * 60_000,
        60 * 60_000,
        80 * 60_000,
        80 * 60_000 + 180 * 60_000,
        80 * 60_000 + 200 * 60_000,
    ];
    let pattern = pattern_from_times(&times, times[6], 120).unwrap();
    assert_eq!(pattern.usual_minutes, 20);
    assert!(pattern.gaps < 6);
}

#[test]
fn an_animal_without_a_start_has_no_pattern() {
    let animal = json!({"uplinks": [2, 2, 2, 2, 2, 2]});
    assert!(animal_pattern(&animal, None, "2026-09-06T12:00:00", 120).is_none());
}

#[test]
fn quiet_alert_fires_before_the_limit_when_the_gap_is_unusual() {
    let mut animal = json!({
        "id": "t1",
        "name": "Tracker 1",
        "battery": 80,
        "lastSeen": "2026-09-06T11:40:00",
        "usualMinutes": 20,
    });
    let early = tracker_alerts(
        std::slice::from_ref(&animal),
        "2026-09-06T12:30:00",
        &ALERT_RULES,
        None,
    );
    assert_eq!(early.len(), 1);
    assert_eq!(early[0]["kind"], "quiet");
    assert_eq!(early[0]["usualMinutes"], json!(20));
    let why = early[0]["why"].as_str().unwrap();
    assert!(why.contains("about every 20 min"));
    assert!(why.contains("longer than 45 min"));
    assert!(why.contains("has not been reached"));
    assert!(why.contains("50 min"));

    animal["lastSeen"] = json!("2026-09-06T12:00:00");
    assert!(tracker_alerts(
        std::slice::from_ref(&animal),
        "2026-09-06T12:30:00",
        &ALERT_RULES,
        None,
    )
    .is_empty());
}

#[test]
fn the_time_limit_still_fires_without_a_pattern() {
    let animal = json!({
        "id": "t1",
        "name": "Tracker 1",
        "battery": 80,
        "lastSeen": "2026-09-06T10:00:00",
    });
    let alerts = tracker_alerts(&[animal], "2026-09-06T12:01:00", &ALERT_RULES, None);
    assert_eq!(alerts.len(), 1);
    assert!(alerts[0].get("usualMinutes").is_none());
    assert!(alerts[0]["why"]
        .as_str()
        .unwrap()
        .ends_with("over the limit of 2 hours."));
}

#[test]
fn a_turned_off_quiet_job_stays_off() {
    let animal = json!({
        "id": "t1",
        "name": "Tracker 1",
        "lastSeen": "2026-09-06T10:00:00",
        "usualMinutes": 20,
    });
    let mut jobs = std::collections::BTreeMap::new();
    jobs.insert("quiet".into(), false);
    assert!(
        tracker_alerts(&[animal], "2026-09-06T12:30:00", &ALERT_RULES, Some(&jobs),).is_empty()
    );
}

#[test]
fn sample_quiet_alerts_stay_pippin_and_willow() {
    let herd = herd();
    let events = sort_events(day()["events"].as_array().unwrap());
    let goats = herd["goats"].as_array().unwrap();
    let start = herd["uplinksStart"].as_str();
    let mut quiet_ids = std::collections::BTreeSet::new();
    for count in 0..=events.len() {
        let now = if count == 0 {
            "2026-09-06T05:40:00"
        } else if count >= events.len() {
            "2026-09-06T18:05:00"
        } else {
            events[count - 1]["time"].as_str().unwrap()
        };
        let state = state_at(goats, &events, count, start, Some(now));
        for alert in tracker_alerts(&state.animals, now, &ALERT_RULES, None) {
            if alert["kind"] == "quiet" {
                quiet_ids.insert(alert["animalId"].as_str().unwrap().to_string());
                if alert["animalId"] == "willow" {
                    assert!(alert["why"]
                        .as_str()
                        .unwrap()
                        .contains("about every 20 min"));
                }
            }
        }
        let learned = state
            .animals
            .iter()
            .filter(|a| a.get("usualMinutes").and_then(Value::as_i64).is_some())
            .count();
        if count == events.len() {
            assert!(
                learned >= 7,
                "end of day should know most habits, got {learned}"
            );
        }
    }
    let names: Vec<_> = quiet_ids.iter().cloned().collect();
    assert_eq!(names, vec!["pippin".to_string(), "willow".to_string()]);
}
