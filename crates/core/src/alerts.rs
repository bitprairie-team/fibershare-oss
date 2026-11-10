//! Alert rules and rancher answers. The herd view and both servers use these.

use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

use crate::time::{minutes_text, parse_ms, time_of};

#[derive(Clone, Debug)]
pub struct Paddock {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

#[derive(Clone, Debug)]
pub struct AlertRules {
    pub low_battery_percent: f64,
    pub quiet_minutes: i64,
    pub still_minutes: i64,
    pub still_distance: f64,
    pub paddock: Paddock,
    pub note_max_length: usize,
}

pub const ALERT_RULES: AlertRules = AlertRules {
    low_battery_percent: 20.0,
    quiet_minutes: 120,
    still_minutes: 120,
    still_distance: 3.0,
    paddock: Paddock {
        min_x: 0.0,
        max_x: 100.0,
        min_y: 0.0,
        max_y: 100.0,
    },
    note_max_length: 280,
};

const KINDS: [&str; 8] = [
    "battery", "quiet", "still", "paddock", "sos", "predator", "smoke", "manual",
];
const ANSWERS: [&str; 3] = ["confirmed", "dismissed", "reopened"];

fn kind_order(kind: &str) -> i32 {
    match kind {
        "sos" => 0,
        "manual" => 1,
        "predator" => 2,
        "smoke" => 3,
        "paddock" => 4,
        "still" => 5,
        "quiet" => 6,
        "battery" => 7,
        _ => 9,
    }
}

fn job_on(jobs: Option<&BTreeMap<String, bool>>, id: &str) -> bool {
    match jobs {
        None => true,
        Some(map) => map.get(id).copied().unwrap_or(false),
    }
}

fn num(value: &Value) -> Option<f64> {
    value.as_f64().filter(|n| n.is_finite())
}

fn field_num(animal: &Value, key: &str) -> Option<f64> {
    animal.get(key).and_then(num)
}

fn field_str<'a>(animal: &'a Value, key: &str) -> Option<&'a str> {
    animal.get(key).and_then(Value::as_str)
}

fn name_of(animal: &Value) -> String {
    field_str(animal, "name")
        .or_else(|| field_str(animal, "alias"))
        .or_else(|| field_str(animal, "id"))
        .unwrap_or("animal")
        .to_string()
}

pub fn in_paddock(x: f64, y: f64, paddock: &Paddock) -> bool {
    x.is_finite()
        && y.is_finite()
        && x >= paddock.min_x
        && x <= paddock.max_x
        && y >= paddock.min_y
        && y <= paddock.max_y
}

fn duration(minutes: i64) -> String {
    if minutes < 60 {
        return format!("{minutes} min");
    }
    if minutes >= 48 * 60 {
        return format!("{} days", minutes / 1440);
    }
    minutes_text(minutes)
}

/// Alerts from tracker readings. A job that is off adds nothing.
pub fn tracker_alerts(
    animals: &[Value],
    now: &str,
    rules: &AlertRules,
    jobs: Option<&BTreeMap<String, bool>>,
) -> Vec<Value> {
    let mut out = Vec::new();
    let now_ms = parse_ms(now);
    for animal in animals {
        let id = field_str(animal, "id").unwrap_or("");
        let name = name_of(animal);
        if job_on(jobs, "battery") {
            if let Some(battery) = field_num(animal, "battery") {
                let external = animal
                    .get("externalPower")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                if battery < rules.low_battery_percent && !external {
                    let pct = battery.round() as i64;
                    out.push(json!({
                        "id": format!("battery:{id}"),
                        "kind": "battery",
                        "animalId": id,
                        "title": format!("{name}: battery at {pct}%"),
                        "detail": format!("Below {}%. Charge or swap the tracker soon.", rules.low_battery_percent as i64),
                        "why": format!("Battery {pct}%, below the {}% limit, not on outside power.", rules.low_battery_percent as i64),
                        "time": field_str(animal, "lastSeen").unwrap_or(now),
                    }));
                }
            }
        }
        let seen = field_str(animal, "lastSeen").and_then(parse_ms);
        if job_on(jobs, "quiet") {
            if let (Some(seen), Some(now_ms)) = (seen, now_ms) {
                let quiet = ((now_ms - seen) as f64 / 60000.0).round() as i64;
                if quiet > rules.quiet_minutes {
                    let last = field_str(animal, "lastSeen").unwrap_or("");
                    out.push(json!({
                        "id": format!("quiet:{id}:{last}"),
                        "kind": "quiet",
                        "animalId": id,
                        "title": format!("{name}: no check-in for {}", duration(quiet)),
                        "detail": format!("Last heard at {}. The tracker may be out of range, off, or out of battery.", time_of(last)),
                        "why": format!(
                            "Last check-in {}, {} before {}, over the limit of {}.",
                            time_of(last),
                            duration(quiet),
                            time_of(now),
                            duration(rules.quiet_minutes)
                        ),
                        "time": last,
                    }));
                }
            } else if field_str(animal, "status") == Some("never seen") {
                out.push(json!({
                    "id": format!("quiet:{id}:never"),
                    "kind": "quiet",
                    "animalId": id,
                    "title": format!("{name}: never checked in"),
                    "detail": "The server has no uplink from this tracker yet.",
                    "why": "No check-in from this tracker since it was added.",
                    "time": now,
                }));
            }
        }
        if job_on(jobs, "still") {
            let moved = field_str(animal, "lastMoved").and_then(parse_ms);
            let fix = field_str(animal, "lastFix").and_then(parse_ms).or(seen);
            if let (Some(fix), Some(now_ms), Some(moved)) = (fix, now_ms, moved) {
                let quiet_gap = ((now_ms - fix) as f64 / 60000.0).round() as i64;
                let still_for = ((now_ms - moved) as f64 / 60000.0).round() as i64;
                if quiet_gap <= rules.quiet_minutes && still_for > rules.still_minutes {
                    let last_moved = field_str(animal, "lastMoved").unwrap_or("");
                    out.push(json!({
                        "id": format!("still:{id}:{last_moved}"),
                        "kind": "still",
                        "animalId": id,
                        "title": format!("{name}: not moving for {}", duration(still_for)),
                        "detail": "The tracker keeps checking in near the same spot. Look in on the animal when you can.",
                        "why": format!(
                            "Last real move at {}, {} before {}, over the limit of {}. Still checking in.",
                            time_of(last_moved),
                            duration(still_for),
                            time_of(now),
                            duration(rules.still_minutes)
                        ),
                        "time": last_moved,
                    }));
                }
            }
        }
        if job_on(jobs, "paddock") {
            if let (Some(x), Some(y)) = (field_num(animal, "x"), field_num(animal, "y")) {
                if !in_paddock(x, y, &rules.paddock) {
                    let at = field_str(animal, "lastSeen").unwrap_or(now);
                    out.push(json!({
                        "id": format!("paddock:{id}:{}:{}", x.round() as i64, y.round() as i64),
                        "kind": "paddock",
                        "animalId": id,
                        "title": format!("{name}: outside the paddock"),
                        "detail": "Last position is outside the active paddock. Tracker positions can be off, so confirm the fence or the animal before acting.",
                        "why": format!(
                            "Position {},{} is outside the paddock ({}-{} x {}-{}).",
                            x.round() as i64,
                            y.round() as i64,
                            rules.paddock.min_x as i64,
                            rules.paddock.max_x as i64,
                            rules.paddock.min_y as i64,
                            rules.paddock.max_y as i64
                        ),
                        "time": at,
                    }));
                }
            }
        }
        if job_on(jobs, "sos") {
            let sensor_sos = animal
                .get("sensors")
                .and_then(|s| s.get("sos"))
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let sos = animal.get("sos").and_then(Value::as_bool).unwrap_or(false) || sensor_sos;
            if sos {
                let at = animal
                    .get("sensors")
                    .and_then(|s| s.get("at"))
                    .and_then(Value::as_str)
                    .or_else(|| field_str(animal, "lastSeen"))
                    .unwrap_or(now);
                out.push(json!({
                    "id": format!("sos:{id}:{at}"),
                    "kind": "sos",
                    "animalId": id,
                    "title": format!("{name}: SOS"),
                    "detail": "The tracker sent an SOS. Find the animal.",
                    "why": format!("The tracker sent its SOS flag at {}.", time_of(at)),
                    "time": at,
                }));
            }
        }
    }
    out
}

/// Predator Watch and Wildfire Watch alerts from the events shown so far.
pub fn event_alerts(events: &[Value], jobs: Option<&BTreeMap<String, bool>>) -> Vec<Value> {
    let mut out = Vec::new();
    for (i, event) in events.iter().enumerate() {
        let kind = field_str(event, "type").unwrap_or("");
        if kind != "predator" && kind != "smoke" {
            continue;
        }
        if !job_on(jobs, kind) {
            continue;
        }
        let clear_type = format!("{kind}-clear");
        let cell = field_str(event, "cell");
        let cleared = events.iter().skip(i + 1).any(|other| {
            field_str(other, "type") == Some(clear_type.as_str())
                && (cell.is_none() || field_str(other, "cell") == cell)
        });
        let text = field_str(event, "text").unwrap_or("");
        let title = if kind == "predator" {
            format!(
                "Predator Watch reported activity near {}",
                cell.unwrap_or("the herd")
            )
        } else {
            "Wildfire Watch reported smoke upwind".to_string()
        };
        let why_lead = if kind == "predator" {
            match cell {
                Some(cell) => format!("Predator Watch report for cell {cell}"),
                None => "Predator Watch report".to_string(),
            }
        } else {
            "Wildfire Watch report".to_string()
        };
        let when = field_str(event, "time").unwrap_or("");
        let why = if text.is_empty() {
            format!("{why_lead} at {}.", time_of(when))
        } else {
            let sentence = if text.ends_with('.') {
                text.to_string()
            } else {
                format!("{text}.")
            };
            format!("{why_lead} at {}: {sentence}", time_of(when))
        };
        out.push(json!({
            "id": format!("event:{}", field_str(event, "id").unwrap_or("")),
            "kind": kind,
            "eventId": field_str(event, "id").unwrap_or(""),
            "title": title,
            "detail": text,
            "why": why,
            "time": when,
            "cleared": cleared,
        }));
    }
    out
}

pub fn manual_alerts(log: &[Value], animals: &[Value]) -> Vec<Value> {
    let mut names = BTreeMap::new();
    for animal in animals {
        if let Some(id) = field_str(animal, "id") {
            names.insert(id.to_string(), name_of(animal));
        }
    }
    log.iter()
        .filter(|e| field_str(e, "type") == Some("alert"))
        .map(|e| {
            let id = field_str(e, "id").unwrap_or("");
            let text = field_str(e, "text").unwrap_or("");
            let animal_id = field_str(e, "animalId").unwrap_or("");
            let title = if !animal_id.is_empty() {
                if let Some(name) = names.get(animal_id) {
                    format!("{name}: {text}")
                } else {
                    text.to_string()
                }
            } else {
                text.to_string()
            };
            let mut item = json!({
                "id": format!("manual:{id}"),
                "kind": "manual",
                "title": title,
                "why": "Added by hand.",
                "time": field_str(e, "at").unwrap_or(""),
                "manual": true,
            });
            if !animal_id.is_empty() {
                item["animalId"] = json!(animal_id);
            }
            item
        })
        .collect()
}

pub fn compute_alerts(
    animals: &[Value],
    events: &[Value],
    now: &str,
    rules: &AlertRules,
    jobs: Option<&BTreeMap<String, bool>>,
    log: &[Value],
) -> Vec<Value> {
    let mut auto = event_alerts(events, jobs);
    auto.extend(tracker_alerts(animals, now, rules, jobs));
    for alert in &mut auto {
        alert["ranAt"] = json!(now);
    }
    let mut all = auto;
    all.extend(manual_alerts(log, animals));
    all.sort_by(|a, b| {
        let kind = kind_order(field_str(a, "kind").unwrap_or(""))
            .cmp(&kind_order(field_str(b, "kind").unwrap_or("")));
        kind.then_with(|| {
            field_str(b, "time")
                .unwrap_or("")
                .cmp(field_str(a, "time").unwrap_or(""))
        })
    });
    all
}

fn clean_text(value: &str, max: usize) -> String {
    let folded = value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>();
    let collapsed = folded.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(max).collect()
}

pub fn normalize_feedback(
    input: Option<&Value>,
    now: &str,
    source: &str,
    rules: &AlertRules,
) -> Result<Value, String> {
    let Some(input) = input.filter(|v| v.is_object()) else {
        return Err("Send an answer as JSON.".into());
    };
    let alert_id = input.get("alertId").and_then(Value::as_str).unwrap_or("");
    let id_ok = regex_alert_id(alert_id);
    if !id_ok {
        return Err("Unknown alert.".into());
    }
    let answer = input.get("answer").and_then(Value::as_str).unwrap_or("");
    if !ANSWERS.contains(&answer) {
        return Err("The answer must be confirmed, dismissed, or reopened.".into());
    }
    let kind = input.get("kind").and_then(Value::as_str).unwrap_or("");
    if !KINDS.contains(&kind) {
        return Err("Unknown alert kind.".into());
    }
    if let Some(note) = input.get("note").and_then(Value::as_str) {
        if note.len() > rules.note_max_length * 2 {
            return Err("The note is too long.".into());
        }
    }
    let rule = match kind {
        "battery" => json!({ "lowBatteryPercent": rules.low_battery_percent }),
        "quiet" => json!({ "quietMinutes": rules.quiet_minutes }),
        "still" => {
            json!({ "stillMinutes": rules.still_minutes, "stillDistance": rules.still_distance })
        }
        "paddock" => {
            json!({ "paddock": { "minX": rules.paddock.min_x, "maxX": rules.paddock.max_x, "minY": rules.paddock.min_y, "maxY": rules.paddock.max_y } })
        }
        _ => json!({}),
    };
    let mut entry = Map::new();
    entry.insert("type".into(), json!("alert-feedback"));
    entry.insert("alertId".into(), json!(alert_id));
    entry.insert("kind".into(), json!(kind));
    entry.insert("answer".into(), json!(answer));
    entry.insert(
        "note".into(),
        json!(clean_text(
            input.get("note").and_then(Value::as_str).unwrap_or(""),
            rules.note_max_length
        )),
    );
    entry.insert(
        "title".into(),
        json!(clean_text(
            input.get("title").and_then(Value::as_str).unwrap_or(""),
            140
        )),
    );
    entry.insert(
        "alertTime".into(),
        json!(clean_text(
            input.get("alertTime").and_then(Value::as_str).unwrap_or(""),
            40
        )),
    );
    entry.insert("at".into(), json!(now));
    entry.insert("source".into(), json!(source));
    entry.insert("rule".into(), rule);
    if let Some(animal_id) = input.get("animalId").and_then(Value::as_str) {
        if regex_animal(animal_id) {
            entry.insert("animalId".into(), json!(animal_id));
        }
    }
    Ok(Value::Object(entry))
}

fn regex_alert_id(id: &str) -> bool {
    let Some((kind, rest)) = id.split_once(':') else {
        return false;
    };
    if ![
        "battery", "quiet", "still", "paddock", "sos", "event", "manual",
    ]
    .contains(&kind)
    {
        return false;
    }
    let len = rest.chars().count();
    (1..=100).contains(&len)
        && rest
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '.' | '_' | '-'))
}

fn regex_animal(id: &str) -> bool {
    let len = id.chars().count();
    (1..=60).contains(&len)
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

pub fn latest_answers(feedback: &[Value]) -> BTreeMap<String, Value> {
    let mut out = BTreeMap::new();
    for item in feedback {
        let Some(id) = field_str(item, "alertId") else {
            continue;
        };
        let replace = out
            .get(id)
            .map(|prev| field_str(item, "at").unwrap_or("") >= field_str(prev, "at").unwrap_or(""))
            .unwrap_or(true);
        if replace {
            out.insert(id.to_string(), item.clone());
        }
    }
    out
}

pub fn split_alerts(alerts: &[Value], feedback: &[Value]) -> (Vec<Value>, Vec<Value>) {
    let latest = latest_answers(feedback);
    let open = alerts
        .iter()
        .filter(|a| {
            let id = field_str(a, "id").unwrap_or("");
            match latest.get(id) {
                None => true,
                Some(f) => field_str(f, "answer") == Some("reopened"),
            }
        })
        .cloned()
        .collect();
    let mut history: Vec<Value> = latest
        .values()
        .filter(|f| {
            matches!(
                field_str(f, "answer"),
                Some("confirmed") | Some("dismissed")
            )
        })
        .cloned()
        .collect();
    history.sort_by(|a, b| {
        field_str(b, "at")
            .unwrap_or("")
            .cmp(field_str(a, "at").unwrap_or(""))
    });
    (open, history)
}

pub const FEEDBACK_LIMIT: usize = 2000;
pub const KV_FEEDBACK: &str = "alert-feedback";

pub fn parse_feedback_list(text: &str) -> Vec<Value> {
    serde_json::from_str::<Vec<Value>>(text)
        .unwrap_or_default()
        .into_iter()
        .filter(|f| field_str(f, "type") == Some("alert-feedback"))
        .collect()
}

pub fn add_feedback(
    list: &[Value],
    body_text: &str,
    now: &str,
) -> (u16, Value, Option<Vec<Value>>) {
    let input: Value = match serde_json::from_str(body_text) {
        Ok(v) => v,
        Err(_) => return (400, json!({"error": "Send the answer as JSON."}), None),
    };
    match normalize_feedback(Some(&input), now, "rancher", &ALERT_RULES) {
        Ok(entry) => {
            let mut next = list.to_vec();
            next.push(entry.clone());
            if next.len() > FEEDBACK_LIMIT {
                next = next.split_off(next.len() - FEEDBACK_LIMIT);
            }
            (
                200,
                json!({"ok": true, "entry": entry, "feedback": next}),
                Some(next),
            )
        }
        Err(error) => (400, json!({"error": error}), None),
    }
}
