//! Where each animal is, and what its tracker reported, at a point in the day.

use serde_json::{json, Value};

use crate::alerts::ALERT_RULES;
use crate::time::{local_iso, parse_ms};

fn num(value: &Value) -> Option<f64> {
    value.as_f64().filter(|n| n.is_finite())
}

fn str_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

pub fn sort_events(events: &[Value]) -> Vec<Value> {
    let mut sorted = events.to_vec();
    sorted.sort_by(|a, b| {
        str_field(a, "time")
            .unwrap_or("")
            .cmp(str_field(b, "time").unwrap_or(""))
            .then_with(|| {
                str_field(a, "id")
                    .unwrap_or("")
                    .cmp(str_field(b, "id").unwrap_or(""))
            })
    });
    sorted
}

/// The latest uplink at or before `now`, from hourly counts that start at `start_iso`.
pub fn heard_by(uplinks: Option<&Value>, start_iso: &str, now: &str) -> Option<String> {
    let start = parse_ms(start_iso)?;
    let end = parse_ms(now)?;
    let list = uplinks?.as_array()?;
    let mut best: Option<i64> = None;
    for (i, count) in list.iter().enumerate() {
        let n = count.as_f64().unwrap_or(0.0).floor().max(0.0) as i64;
        for k in 0..n {
            let t = start
                + i as i64 * 3_600_000
                + (((k + 1) * 3_600_000) as f64 / (n as f64 + 1.0)).round() as i64;
            if t <= end && best.is_none_or(|b| t > b) {
                best = Some(t);
            }
        }
    }
    best.and_then(|t| local_iso(start_iso, t - start))
}

pub struct HerdState {
    pub animals: Vec<Value>,
    pub alert_cells: Vec<String>,
    pub smoke: bool,
    pub shown: Vec<Value>,
}

/// State after the first `count` events.
pub fn state_at(
    animals: &[Value],
    events: &[Value],
    count: usize,
    uplinks_start: Option<&str>,
    now: Option<&str>,
) -> HerdState {
    let sorted = sort_events(events);
    let upto = sorted.iter().take(count).cloned().collect::<Vec<_>>();
    let mut by_id: Vec<(String, Value)> = Vec::new();
    for animal in animals {
        let id = str_field(animal, "id").unwrap_or("").to_string();
        let first = sorted.iter().find(|event| {
            str_field(event, "animalId") == Some(id.as_str())
                && event.get("x").and_then(num).is_some()
        });
        let mut state = animal.clone();
        if let Some(first) = first {
            state["x"] = json!(first.get("x").and_then(num).unwrap_or(0.0));
            state["y"] = json!(first.get("y").and_then(num).unwrap_or(0.0));
            if let Some(battery) = first.get("battery").and_then(num) {
                state["battery"] = json!(battery);
            }
            state["lastMoved"] = json!(str_field(first, "time"));
            state["lastFix"] = json!(str_field(first, "time"));
        } else {
            if animal.get("lastMoved").is_some() {
                state["lastMoved"] = animal.get("lastMoved").cloned().unwrap_or(Value::Null);
            }
            if animal.get("lastFix").is_some() {
                state["lastFix"] = animal.get("lastFix").cloned().unwrap_or(Value::Null);
            }
        }
        state["lastSeen"] = Value::Null;
        state["silent"] = json!(false);
        state["sos"] = json!(false);
        by_id.push((id, state));
    }
    let mut alerts: Vec<(String, Value)> = Vec::new();
    let mut smoke = false;
    for event in &upto {
        let animal_id = str_field(event, "animalId").unwrap_or("");
        if let Some((_, animal)) = by_id.iter_mut().find(|(id, _)| id == animal_id) {
            if let (Some(x), Some(y)) = (event.get("x").and_then(num), event.get("y").and_then(num))
            {
                let prev_x = animal.get("x").and_then(num).unwrap_or(x);
                let prev_y = animal.get("y").and_then(num).unwrap_or(y);
                animal["x"] = json!(x);
                animal["y"] = json!(y);
                animal["lastFix"] = json!(str_field(event, "time"));
                let dist = (x - prev_x).hypot(y - prev_y);
                let last_moved = str_field(animal, "lastMoved");
                if last_moved.is_none() || dist >= ALERT_RULES.still_distance {
                    animal["lastMoved"] = json!(str_field(event, "time"));
                }
            }
            if let Some(battery) = event.get("battery").and_then(num) {
                animal["battery"] = json!(battery);
            }
            match str_field(event, "type") {
                Some("checkin") => {
                    animal["lastSeen"] = json!(str_field(event, "time"));
                    animal["silent"] = json!(false);
                }
                Some("silent") => animal["silent"] = json!(true),
                Some("sos") => animal["sos"] = json!(true),
                _ => {}
            }
        }
        if str_field(event, "type") == Some("predator") {
            if let Some(cell) = str_field(event, "cell") {
                alerts.retain(|(c, _)| c != cell);
                alerts.push((cell.to_string(), event.clone()));
            }
        }
        if str_field(event, "type") == Some("predator-clear") {
            if let Some(cell) = str_field(event, "cell") {
                alerts.retain(|(c, _)| c != cell);
            }
        }
        if str_field(event, "type") == Some("smoke") {
            smoke = true;
        }
        if str_field(event, "type") == Some("smoke-clear") {
            smoke = false;
        }
    }
    if upto.len() >= sorted.len() {
        for animal in animals {
            let id = str_field(animal, "id").unwrap_or("");
            if let Some((_, state)) = by_id.iter_mut().find(|(i, _)| i == id) {
                if state.get("lastSeen").map(|v| v.is_null()).unwrap_or(true) {
                    if let Some(seen) = animal.get("lastSeen") {
                        if !seen.is_null() {
                            state["lastSeen"] = seen.clone();
                        }
                    }
                }
                if animal
                    .get("silent")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    state["silent"] = json!(true);
                }
            }
        }
    }
    if let (Some(start), Some(now)) = (uplinks_start, now) {
        for (_, state) in &mut by_id {
            let Some(seen) = str_field(state, "lastSeen") else {
                continue;
            };
            if let Some(heard) = heard_by(state.get("uplinks"), start, now) {
                if parse_ms(&heard).unwrap_or(0) > parse_ms(seen).unwrap_or(0) {
                    state["lastSeen"] = json!(heard);
                }
            }
        }
    }
    HerdState {
        animals: by_id.into_iter().map(|(_, v)| v).collect(),
        alert_cells: alerts.into_iter().map(|(c, _)| c).collect(),
        smoke,
        shown: upto,
    }
}

pub struct Moment {
    pub id: String,
    pub label: String,
    pub step: usize,
    pub time: String,
}

pub fn key_moments(events: &[Value]) -> Vec<Moment> {
    let sorted = sort_events(events);
    let mut out = Vec::new();
    let mut add = |id: &str, label: &str, start_type: &str, clear_type: &str| {
        let Some(start) = sorted
            .iter()
            .position(|e| str_field(e, "type") == Some(start_type))
        else {
            return;
        };
        let cell = str_field(&sorted[start], "cell");
        let clear = sorted.iter().enumerate().position(|(i, e)| {
            i > start
                && str_field(e, "type") == Some(clear_type)
                && (cell.is_none() || str_field(e, "cell") == cell)
        });
        let step = clear.unwrap_or(start + 1);
        out.push(Moment {
            id: id.to_string(),
            label: label.to_string(),
            step,
            time: str_field(&sorted[start], "time").unwrap_or("").to_string(),
        });
    };
    add("smoke", "Smoke", "smoke", "smoke-clear");
    add("predator", "Predator", "predator", "predator-clear");
    out.sort_by_key(|m| m.step);
    out
}

pub fn position_trail(events: &[Value], animal_id: &str, count: usize, limit: usize) -> Vec<Value> {
    if animal_id.is_empty() || limit < 1 {
        return Vec::new();
    }
    let sorted = sort_events(events);
    let mut points = Vec::new();
    for event in sorted.iter().take(count) {
        if str_field(event, "animalId") != Some(animal_id) {
            continue;
        }
        let (Some(x), Some(y)) = (event.get("x").and_then(num), event.get("y").and_then(num))
        else {
            continue;
        };
        points.push(json!({"time": str_field(event, "time").unwrap_or(""), "x": x, "y": y}));
    }
    let keep = limit.max(1);
    if points.len() > keep {
        points.split_off(points.len() - keep)
    } else {
        points
    }
}

pub fn grazing_log(events: &[Value], count: usize) -> Vec<Value> {
    sort_events(events)
        .into_iter()
        .take(count)
        .filter(|e| matches!(str_field(e, "type"), Some("move") | Some("graze")))
        .map(|e| {
            let mut item = json!({
                "id": str_field(&e, "id").unwrap_or(""),
                "type": str_field(&e, "type").unwrap_or(""),
                "time": str_field(&e, "time").unwrap_or(""),
                "text": str_field(&e, "text").unwrap_or(""),
            });
            if let Some(id) = str_field(&e, "animalId") {
                item["animalId"] = json!(id);
            }
            if let Some(cell) = str_field(&e, "cell") {
                item["cell"] = json!(cell);
            }
            item
        })
        .collect()
}

pub struct Stat {
    pub id: &'static str,
    pub value: String,
    pub label: String,
    pub warn: bool,
}

pub fn herd_stats(animals: &[Value], open_alerts: usize, now_ms: i64) -> Vec<Stat> {
    let seen: Vec<i64> = animals
        .iter()
        .filter_map(|a| str_field(a, "lastSeen").and_then(parse_ms))
        .collect();
    let reporting = seen
        .iter()
        .filter(|t| **t <= now_ms && now_ms - **t <= 3_600_000)
        .count();
    let latest = animals
        .iter()
        .filter_map(|a| str_field(a, "lastSeen"))
        .filter(|s| parse_ms(s).is_some_and(|t| t <= now_ms))
        .max()
        .unwrap_or("");
    vec![
        Stat {
            id: "reporting",
            value: format!("{reporting} of {}", animals.len()),
            label: "reporting in the last hour".into(),
            warn: reporting < animals.len(),
        },
        Stat {
            id: "open",
            value: open_alerts.to_string(),
            label: if open_alerts == 1 {
                "open alert"
            } else {
                "open alerts"
            }
            .into(),
            warn: open_alerts > 0,
        },
        Stat {
            id: "last",
            value: latest.to_string(),
            label: "last check-in".into(),
            warn: false,
        },
    ]
}
