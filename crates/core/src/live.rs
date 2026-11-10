//! Shape of a live tracker file, and what the public is allowed to see.

use serde_json::{json, Value};

pub const LIVE_SOURCE: &str = "chirpstack";

pub fn is_live_data(data: &Value) -> bool {
    if !data.is_object() {
        return false;
    }
    if data.get("source").and_then(Value::as_str) != Some(LIVE_SOURCE) {
        return false;
    }
    if !data.get("generatedAt").and_then(Value::as_str).is_some() {
        return false;
    }
    let Some(animals) = data.get("animals").and_then(Value::as_array) else {
        return false;
    };
    if !data.get("events").and_then(Value::as_array).is_some() {
        return false;
    }
    animals.iter().all(|animal| {
        animal.get("id").and_then(Value::as_str).is_some()
            && animal.get("alias").and_then(Value::as_str).is_some()
            && animal
                .get("x")
                .and_then(Value::as_f64)
                .is_some_and(f64::is_finite)
            && animal
                .get("y")
                .and_then(Value::as_f64)
                .is_some_and(f64::is_finite)
    })
}

fn finite(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64).filter(|n| n.is_finite())
}

fn keep_sensors(sensors: Option<&Value>) -> Option<Value> {
    let sensors = sensors?;
    let mut out = serde_json::Map::new();
    for key in ["temperature", "light", "motion", "sos", "at"] {
        let Some(value) = sensors.get(key) else {
            continue;
        };
        if value.as_f64().is_some_and(f64::is_finite)
            || value.is_boolean()
            || (key == "at" && value.is_string())
        {
            out.insert(key.to_string(), value.clone());
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(Value::Object(out))
    }
}

pub fn hide_tracker_details(data: &Value) -> Value {
    let animals = data
        .get("animals")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let hidden_animals: Vec<Value> = animals
        .iter()
        .map(|animal| {
            let alias = animal.get("alias").and_then(Value::as_str).unwrap_or("");
            let status = animal.get("status").and_then(Value::as_str).unwrap_or("");
            let status = if ["online", "stale", "never seen"].contains(&status) { status } else { "unknown" };
            let signal = animal.get("signal").and_then(Value::as_str).filter(|s| ["good", "fair", "weak"].contains(s));
            let uplinks = animal
                .get("uplinks")
                .and_then(Value::as_array)
                .map(|list| list.iter().map(|n| json!(finite(Some(n)).unwrap_or(0.0))).collect::<Vec<_>>())
                .unwrap_or_default();
            json!({
                "id": animal.get("id").and_then(Value::as_str).unwrap_or(""),
                "alias": alias,
                "name": alias,
                "tracker": alias,
                "x": finite(animal.get("x")).unwrap_or(50.0),
                "y": finite(animal.get("y")).unwrap_or(50.0),
                "battery": finite(animal.get("battery")),
                "externalPower": animal.get("externalPower").and_then(Value::as_bool).unwrap_or(false),
                "lastSeen": animal.get("lastSeen").and_then(Value::as_str),
                "status": status,
                "silent": animal.get("silent").and_then(Value::as_bool).unwrap_or(false),
                "uplinks": uplinks,
                "uplinks24h": finite(animal.get("uplinks24h")).unwrap_or(0.0),
                "signal": signal,
                "sensors": keep_sensors(animal.get("sensors")),
            })
        })
        .collect();
    let ids: Vec<String> = hidden_animals
        .iter()
        .filter_map(|a| a.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    let events = data
        .get("events")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|event| {
            let mut item = json!({
                "id": event.get("id").and_then(Value::as_str).unwrap_or(""),
                "time": event.get("time").and_then(Value::as_str).unwrap_or(""),
                "type": event.get("type").and_then(Value::as_str).unwrap_or(""),
                "text": event.get("text").and_then(Value::as_str).unwrap_or(""),
            });
            if let Some(severity) = event
                .get("severity")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
            {
                item["severity"] = json!(severity);
            }
            if let Some(animal_id) = event.get("animalId").and_then(Value::as_str) {
                if ids.iter().any(|id| id == animal_id) {
                    item["animalId"] = json!(animal_id);
                }
            }
            if let Some(battery) = finite(event.get("battery")) {
                item["battery"] = json!(battery);
            }
            item
        })
        .collect::<Vec<_>>();
    let sources = data
        .get("sources")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(Value::as_str)
                .filter(|s| *s == "rest" || *s == "mqtt")
                .map(|s| json!(s))
                .collect::<Vec<_>>()
        })
        .filter(|list| !list.is_empty())
        .unwrap_or_else(|| vec![json!("rest")]);
    json!({
        "source": LIVE_SOURCE,
        "hidden": true,
        "generatedAt": data.get("generatedAt").and_then(Value::as_str).unwrap_or(""),
        "pulledAt": data.get("pulledAt").and_then(Value::as_str).unwrap_or_else(|| data.get("generatedAt").and_then(Value::as_str).unwrap_or("")),
        "windowHours": finite(data.get("windowHours")).unwrap_or(24.0),
        "note": "Tracker details were hidden: aliases in place of names, no device IDs, tags, or positions, and grid cells from a hash.",
        "sources": sources,
        "animals": hidden_animals,
        "events": events,
    })
}

pub fn leak_problems(hidden: &Value, full: &Value) -> Vec<String> {
    let text = hidden.to_string().to_lowercase();
    let mut problems = Vec::new();
    let mut push = |kind: &str| {
        if !problems.iter().any(|p: &String| p == kind) {
            problems.push(kind.to_string());
        }
    };
    for animal in full
        .get("animals")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let details = animal.get("details").cloned().unwrap_or(json!({}));
        let mut strings = vec![
            (
                "device name",
                details
                    .get("deviceName")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ),
            (
                "DevEUI",
                details
                    .get("devEui")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ),
            (
                "profile name",
                details
                    .get("profile")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ),
            (
                "description",
                details
                    .get("description")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ),
        ];
        if let Some(tags) = details.get("tags").and_then(Value::as_object) {
            for (k, v) in tags {
                strings.push(("tag", Some(k.clone())));
                strings.push(("tag", v.as_str().map(str::to_string)));
            }
        }
        for (kind, value) in strings {
            let Some(value) = value else { continue };
            let v = value.trim().to_lowercase();
            if v.len() < 4 || regex_tracker(&v) {
                continue;
            }
            let encoded = serde_json::to_string(&v).unwrap_or_default();
            let needle = encoded.trim_matches('"');
            if text.contains(needle) {
                push(kind);
            }
        }
        if let Some(position) = details.get("position") {
            for key in ["latitude", "longitude"] {
                if let Some(n) = position.get(key).and_then(Value::as_f64) {
                    let digits = n.to_string().split('.').nth(1).unwrap_or("").to_string();
                    if digits.len() >= 3 && text.contains(&n.to_string()) {
                        push("position");
                    }
                }
            }
        }
    }
    if [
        "\"details\"",
        "\"deveui\"",
        "\"latitude\"",
        "\"longitude\"",
        "\"tags\"",
    ]
    .iter()
    .any(|needle| text.contains(needle))
    {
        push("detail field");
    }
    problems
}

fn regex_tracker(value: &str) -> bool {
    let rest = value.strip_prefix("tracker ").unwrap_or("");
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) && value.starts_with("tracker ")
}

pub fn live_body(
    live: Option<&Value>,
    rancher: bool,
    arcgis_api_key: Option<&str>,
    unreadable: bool,
) -> Value {
    let Some(live) = live.filter(|v| is_live_data(v)) else {
        let mut body = json!({"view": if rancher { "rancher" } else { "public" }, "live": null});
        if rancher && (unreadable || live.is_some()) {
            body["problem"] = json!("unreadable");
        }
        return body;
    };
    if !rancher {
        let shown = if live.get("hidden") == Some(&json!(false)) {
            hide_tracker_details(live)
        } else {
            live.clone()
        };
        return json!({"view": "public", "live": shown});
    }
    let mut body = json!({"view": "rancher", "live": live});
    if let Some(key) = arcgis_api_key.map(str::trim).filter(|k| !k.is_empty()) {
        body["arcgisApiKey"] = json!(key);
    }
    body
}

/// Place trackers that have a position on a small local map, metres east and
/// north of the middle of the group. Returns the span in metres.
pub fn local_map(animals: &mut [Value]) -> Option<i64> {
    let indexes: Vec<usize> = animals
        .iter()
        .enumerate()
        .filter(|(_, a)| {
            a.pointer("/details/position/latitude")
                .and_then(Value::as_f64)
                .is_some_and(f64::is_finite)
        })
        .map(|(i, _)| i)
        .collect();
    if indexes.is_empty() {
        return None;
    }
    let lat0 = indexes
        .iter()
        .map(|i| {
            animals[*i]
                .pointer("/details/position/latitude")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
        })
        .sum::<f64>()
        / indexes.len() as f64;
    let lon0 = indexes
        .iter()
        .map(|i| {
            animals[*i]
                .pointer("/details/position/longitude")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
        })
        .sum::<f64>()
        / indexes.len() as f64;
    let points: Vec<(f64, f64)> = indexes
        .iter()
        .map(|i| {
            let lat = animals[*i]
                .pointer("/details/position/latitude")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            let lon = animals[*i]
                .pointer("/details/position/longitude")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            let e = (lon - lon0) * (lat0 * std::f64::consts::PI / 180.0).cos() * 111_320.0;
            let n = (lat - lat0) * 110_540.0;
            (e, n)
        })
        .collect();
    let half = points
        .iter()
        .map(|(e, n)| e.abs().max((n * 1.5).abs()))
        .fold(25.0_f64, f64::max);
    for (point, index) in points.iter().zip(indexes.iter()) {
        let x = (50.0 + (point.0 / half) * 42.0).mul_add(10.0, 0.0).round() / 10.0;
        let y = (50.0 - (point.1 / half) * 42.0).mul_add(10.0, 0.0).round() / 10.0;
        animals[*index]["x"] = json!(((50.0 + (point.0 / half) * 42.0) * 10.0).round() / 10.0);
        animals[*index]["y"] = json!(((50.0 - (point.1 / half) * 42.0) * 10.0).round() / 10.0);
        animals[*index]["onMap"] = json!(true);
        let _ = (x, y);
    }
    Some((half * 2.0).round() as i64)
}
