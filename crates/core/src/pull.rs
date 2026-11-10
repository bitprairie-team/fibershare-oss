//! HTTP walk that turns a ChirpStack v4 REST reply into a live file.
//! The screen copy never names that server.

use std::collections::BTreeMap;

use chrono::{DateTime, SecondsFormat};
use serde_json::{json, Value};

use crate::api::hidden_problems;
use crate::chirpstack::{
    assign_aliases, build_headers, decode_object, device_key, grid_position, parse_args,
    parse_mqtt_url, read_config, redact, signal_bucket, summarize, LOW_BATTERY, VERY_LOW_BATTERY,
};
use crate::live::{hide_tracker_details, LIVE_SOURCE};
use crate::time::parse_ms;

const PAGE: i64 = 100;
const MAX_CHECKINS: usize = 40;

pub struct HttpReply {
    pub status: u16,
    pub content_type: String,
    pub body: String,
}

#[derive(Debug)]
pub struct RawPull {
    pub application_count: usize,
    pub devices: Vec<Value>,
    pub link_metrics: BTreeMap<String, Value>,
    pub metric_errors: usize,
    pub now: String,
    pub hours: u32,
    pub uplinks: Vec<Value>,
}

fn secrets_of(config: &crate::chirpstack::PullConfig) -> Vec<String> {
    let mut secrets = vec![config.token.clone()];
    if let Some(id) = &config.access_id {
        secrets.push(id.clone());
    }
    if let Some(secret) = &config.access_secret {
        secrets.push(secret.clone());
    }
    secrets
}

fn build_url(base: &str, path: &str, query: &[(&str, String)]) -> String {
    let mut url = format!("{base}{path}");
    let mut first = true;
    for (key, value) in query {
        if value.is_empty() {
            continue;
        }
        url.push(if first { '?' } else { '&' });
        first = false;
        url.push_str(&urlencoding(key));
        url.push('=');
        url.push_str(&urlencoding(value));
    }
    url
}

fn urlencoding(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn api_get<F>(
    config: &crate::chirpstack::PullConfig,
    path: &str,
    query: &[(&str, String)],
    fetch: &mut F,
) -> Result<Value, String>
where
    F: FnMut(&str, &BTreeMap<String, String>) -> Result<HttpReply, String>,
{
    let base = config.base_url.as_deref().unwrap_or("");
    let url = build_url(base, path, query);
    let headers = build_headers(config);
    let reply = fetch(&url, &headers).map_err(|err| {
        format!(
            "Could not reach the ChirpStack REST API: {}",
            redact(&err, &secrets_of(config))
        )
    })?;
    if (300..400).contains(&reply.status) {
        return Err("The server sent a redirect, most likely to a sign-in page. If the host sits behind Cloudflare Access, set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET for a service token.".into());
    }
    if !reply.content_type.to_lowercase().contains("json") {
        let kind = reply
            .content_type
            .split(';')
            .next()
            .filter(|s| !s.is_empty())
            .unwrap_or("no content type");
        let shown = path.split('/').take(3).collect::<Vec<_>>().join("/");
        return Err(format!(
            "Expected JSON from {shown} but got {kind}. Check CHIRPSTACK_URL points at the REST API gateway, not the ChirpStack web UI."
        ));
    }
    let body: Value = serde_json::from_str(&reply.body)
        .map_err(|_| "The REST API sent JSON that did not parse.".to_string())?;
    if !(200..300).contains(&reply.status) {
        let code = body.get("code").and_then(Value::as_i64);
        let code_text = code
            .map(|n| format!(" (gRPC code {n})"))
            .unwrap_or_default();
        let hint = match code {
            Some(16) => " Check the API token.",
            Some(7) => " The token may not have access to this tenant or application.",
            _ => "",
        };
        let message = redact(
            body.get("message")
                .and_then(Value::as_str)
                .unwrap_or("no message"),
            &secrets_of(config),
        );
        let message = message.chars().take(200).collect::<String>();
        return Err(format!(
            "ChirpStack answered {}{code_text}: {message}.{hint}",
            reply.status
        ));
    }
    Ok(body)
}

fn list_all<F>(
    config: &crate::chirpstack::PullConfig,
    path: &str,
    query: &[(&str, String)],
    fetch: &mut F,
) -> Result<Vec<Value>, String>
where
    F: FnMut(&str, &BTreeMap<String, String>) -> Result<HttpReply, String>,
{
    let mut items = Vec::new();
    let mut offset = 0_i64;
    for _ in 0..1000 {
        let mut q = query.to_vec();
        q.push(("limit", PAGE.to_string()));
        q.push(("offset", offset.to_string()));
        let body = api_get(config, path, &q, fetch)?;
        let result = body
            .get("result")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let len = result.len() as i64;
        items.extend(result);
        offset += len;
        let total = body.get("totalCount").and_then(Value::as_i64);
        if len == 0 {
            break;
        }
        if let Some(total) = total {
            if items.len() as i64 >= total {
                break;
            }
        } else if len < PAGE {
            break;
        }
    }
    Ok(items)
}

pub fn pull_raw<F>(
    config: &crate::chirpstack::PullConfig,
    hours: u32,
    now: &str,
    fetch: &mut F,
) -> Result<RawPull, String>
where
    F: FnMut(&str, &BTreeMap<String, String>) -> Result<HttpReply, String>,
{
    let mut application_ids = config.application_ids.clone();
    if application_ids.is_empty() {
        let mut tenant_ids = config.tenant_ids.clone();
        if tenant_ids.is_empty() {
            tenant_ids = list_all(config, "/api/tenants", &[], fetch)?
                .into_iter()
                .filter_map(|t| t.get("id").and_then(Value::as_str).map(str::to_string))
                .collect();
        }
        for tenant in &tenant_ids {
            let apps = list_all(
                config,
                "/api/applications",
                &[("tenantId", tenant.clone())],
                fetch,
            )?;
            application_ids.extend(
                apps.into_iter()
                    .filter_map(|a| a.get("id").and_then(Value::as_str).map(str::to_string)),
            );
        }
    }
    let mut seen = Vec::new();
    let mut devices = Vec::new();
    for application in &application_ids {
        for device in list_all(
            config,
            "/api/devices",
            &[("applicationId", application.clone())],
            fetch,
        )? {
            let eui = device
                .get("devEui")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_lowercase();
            if eui.is_empty() || seen.iter().any(|s: &String| s == &eui) {
                continue;
            }
            seen.push(eui);
            devices.push(device);
        }
    }
    let end = iso_z(now);
    let start = iso_minus(now, hours);
    let mut link_metrics = BTreeMap::new();
    let mut metric_errors = 0;
    for device in &devices {
        let eui = device
            .get("devEui")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let path = format!("/api/devices/{}/link-metrics", urlencoding(&eui));
        match api_get(
            config,
            &path,
            &[
                ("start", start.clone()),
                ("end", end.clone()),
                ("aggregation", "HOUR".into()),
            ],
            fetch,
        ) {
            Ok(body) => {
                link_metrics.insert(eui, body);
            }
            Err(err) if err.starts_with("Could not reach") => return Err(err),
            Err(_) => metric_errors += 1,
        }
    }
    Ok(RawPull {
        application_count: application_ids.len(),
        devices,
        link_metrics,
        metric_errors,
        now: end,
        hours,
        uplinks: Vec::new(),
    })
}

fn iso_z(now: &str) -> String {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(now) {
        return parsed.to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    if let Some(ms) = parse_ms(now) {
        return iso_from_ms(ms);
    }
    now.to_string()
}

fn iso_minus(now: &str, hours: u32) -> String {
    let ms = parse_ms(now).unwrap_or(0) - i64::from(hours) * 3_600_000;
    iso_from_ms(ms)
}

fn iso_from_ms(ms: i64) -> String {
    DateTime::from_timestamp_millis(ms)
        .map(|t| t.to_rfc3339_opts(SecondsFormat::Millis, true))
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".into())
}

pub fn battery_of(device: &Value) -> (Option<i64>, bool) {
    let status = device.get("deviceStatus");
    let level = status
        .and_then(|s| s.get("batteryLevel"))
        .and_then(Value::as_f64);
    let battery = level
        .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 100.0)
        .map(|n| n.round() as i64);
    let external = status
        .and_then(|s| s.get("externalPowerSource"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    (battery, external)
}

fn dataset(metric: Option<&Value>) -> Vec<f64> {
    metric
        .and_then(|m| m.pointer("/datasets/0/data"))
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .map(|v| v.as_f64().unwrap_or(f64::NAN))
                .collect()
        })
        .unwrap_or_default()
}

pub fn uplink_series(metrics: Option<&Value>) -> Vec<(Option<String>, i64)> {
    let counts = dataset(metrics.and_then(|m| m.get("rxPackets")));
    let times = metrics
        .and_then(|m| m.pointer("/rxPackets/timestamps"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    counts
        .into_iter()
        .enumerate()
        .map(|(i, v)| {
            let count = if v.is_finite() && v > 0.0 {
                v.round() as i64
            } else {
                0
            };
            let time = times.get(i).and_then(Value::as_str).map(str::to_string);
            (time, count)
        })
        .collect()
}

fn valid_time(value: Option<&Value>) -> Option<String> {
    let text = value?.as_str().filter(|s| !s.is_empty())?;
    let ms = parse_ms(text)?;
    Some(iso_from_ms(ms))
}

fn hours_between(later: &str, earlier: &str) -> f64 {
    let a = parse_ms(later).unwrap_or(0);
    let b = parse_ms(earlier).unwrap_or(0);
    (a - b) as f64 / 3_600_000.0
}

fn clean_tags(tags: Option<&Value>) -> Value {
    let Some(object) = tags.and_then(Value::as_object) else {
        return json!({});
    };
    let mut out = serde_json::Map::new();
    for (key, value) in object {
        let text = match value {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        out.insert(key.clone(), Value::String(text));
    }
    Value::Object(out)
}

fn average(values: &[f64]) -> Option<f64> {
    let picked: Vec<f64> = values.iter().copied().filter(|v| v.is_finite()).collect();
    if picked.is_empty() {
        None
    } else {
        Some((picked.iter().sum::<f64>() / picked.len() as f64 * 10.0).round() / 10.0)
    }
}

pub fn to_live_data(
    raw: &RawPull,
    known: &BTreeMap<String, i64>,
) -> (Value, BTreeMap<String, i64>) {
    let now = iso_z(&raw.now);
    let hours = raw.hours;
    let mut by_eui: BTreeMap<String, Value> = BTreeMap::new();
    for device in &raw.devices {
        if let Some(eui) = device
            .get("devEui")
            .and_then(Value::as_str)
            .map(|s| s.to_lowercase())
        {
            by_eui.insert(eui, device.clone());
        }
    }
    let mut uplinks_by: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for up in &raw.uplinks {
        let Some(eui) = up
            .get("devEui")
            .and_then(Value::as_str)
            .map(|s| s.to_lowercase())
        else {
            continue;
        };
        if !by_eui.contains_key(&eui) {
            by_eui.insert(
                eui.clone(),
                json!({
                    "devEui": up.get("devEui"),
                    "name": up.get("deviceName"),
                    "tags": up.get("tags"),
                    "lastSeenAt": up.get("time"),
                }),
            );
        }
        uplinks_by.entry(eui).or_default().push(up.clone());
    }
    let devices: Vec<Value> = by_eui.values().cloned().collect();
    let euis: Vec<String> = devices
        .iter()
        .filter_map(|d| d.get("devEui").and_then(Value::as_str).map(str::to_string))
        .collect();
    let aliases = assign_aliases(&euis, known);
    let mut animals = Vec::new();
    let mut checkins = Vec::new();
    let mut notices = Vec::new();
    for device in &devices {
        let eui = device
            .get("devEui")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase();
        let dev_eui = device.get("devEui").and_then(Value::as_str).unwrap_or("");
        let n = aliases.get(&device_key(dev_eui)).copied().unwrap_or(0);
        let alias = format!("Tracker {n}");
        let id = format!("tracker-{n}");
        let (x, y) = grid_position(dev_eui);
        let (mut battery, external) = battery_of(device);
        let mut ups: Vec<Value> = uplinks_by
            .get(&eui)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|mut up| {
                let time = valid_time(up.get("time"))?;
                up["time"] = json!(time);
                Some(up)
            })
            .collect();
        ups.sort_by(|a, b| {
            a.get("time")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(b.get("time").and_then(Value::as_str).unwrap_or(""))
        });
        let mut last_seen = valid_time(device.get("lastSeenAt"));
        if let Some(last) = ups
            .last()
            .and_then(|u| u.get("time").and_then(Value::as_str))
        {
            if last_seen.as_deref().is_none_or(|seen| last > seen) {
                last_seen = Some(last.to_string());
            }
        }
        let mut sensors = serde_json::Map::new();
        let mut position: Option<Value> = None;
        for up in ups.iter().rev() {
            let decoded = decode_object(up.get("object").unwrap_or(&Value::Null));
            if position.is_none() {
                if let (Some(lat), Some(lon)) = (
                    decoded.get("latitude").and_then(Value::as_f64),
                    decoded.get("longitude").and_then(Value::as_f64),
                ) {
                    position = Some(json!({
                        "latitude": lat,
                        "longitude": lon,
                        "at": up.get("time"),
                    }));
                }
            }
            for key in ["temperature", "light", "motion"] {
                if !sensors.contains_key(key) {
                    if let Some(n) = decoded.get(key).and_then(Value::as_f64) {
                        if n.is_finite() {
                            sensors.insert(key.into(), json!(n));
                        }
                    }
                }
            }
            if !sensors.contains_key("sos") {
                if let Some(flag) = decoded.get("sos").and_then(Value::as_bool) {
                    sensors.insert("sos".into(), json!(flag));
                }
            }
            if battery.is_none() {
                if let Some(n) = decoded.get("battery").and_then(Value::as_f64) {
                    if n.is_finite() && (0.0..=100.0).contains(&n) {
                        battery = Some(n.round() as i64);
                    }
                }
            }
        }
        if !sensors.is_empty() {
            if let Some(time) = ups.last().and_then(|u| u.get("time").cloned()) {
                sensors.insert("at".into(), time);
            }
        }
        let metrics = raw
            .link_metrics
            .get(dev_eui)
            .or_else(|| raw.link_metrics.get(&eui));
        let series = uplink_series(metrics);
        let uplinks_24h = if series.is_empty() {
            ups.len() as i64
        } else {
            series.iter().map(|(_, c)| c).sum()
        };
        let quiet = last_seen.as_deref().map(|seen| hours_between(&now, seen));
        let status = if last_seen.is_none() {
            "never seen"
        } else if quiet.unwrap_or(0.0) > 2.0 {
            "stale"
        } else {
            "online"
        };
        let snrs: Vec<f64> = ups
            .iter()
            .filter_map(|u| u.get("snr").and_then(Value::as_f64))
            .collect();
        let rssis: Vec<f64> = ups
            .iter()
            .filter_map(|u| u.get("rssi").and_then(Value::as_f64))
            .collect();
        let up_snr = average(&snrs);
        let up_rssi = average(&rssis);
        let snr = average(
            &dataset(metrics.and_then(|m| m.get("gwSnr")))
                .into_iter()
                .filter(|v| *v != 0.0)
                .collect::<Vec<_>>(),
        )
        .or(up_snr);
        let strength = average(
            &dataset(metrics.and_then(|m| m.get("gwRssi")))
                .into_iter()
                .filter(|v| *v != 0.0)
                .collect::<Vec<_>>(),
        )
        .or(up_rssi);
        let mut signal = metrics.and_then(signal_bucket).map(str::to_string);
        if signal.is_none() && (up_snr.is_some() || up_rssi.is_some()) {
            let synthetic = json!({
                "gwSnr": {"datasets": [{"data": up_snr.map(|n| vec![json!(n)]).unwrap_or_default()}]},
                "gwRssi": {"datasets": [{"data": up_rssi.map(|n| vec![json!(n)]).unwrap_or_default()}]},
            });
            signal = signal_bucket(&synthetic).map(str::to_string);
        }
        let name = device
            .get("name")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or(&alias);
        animals.push(json!({
            "id": id,
            "alias": alias,
            "name": name,
            "tracker": alias,
            "x": x,
            "y": y,
            "battery": battery,
            "externalPower": external,
            "lastSeen": last_seen,
            "status": status,
            "silent": status != "online",
            "uplinks": series.iter().map(|(_, c)| c).collect::<Vec<_>>(),
            "uplinks24h": uplinks_24h,
            "signal": signal,
            "sensors": if sensors.is_empty() { Value::Null } else { Value::Object(sensors) },
            "details": {
                "deviceName": device.get("name").and_then(Value::as_str).filter(|s| !s.is_empty()),
                "devEui": dev_eui,
                "profile": device.get("deviceProfileName").and_then(Value::as_str).filter(|s| !s.is_empty()),
                "description": device.get("description").and_then(Value::as_str).filter(|s| !s.is_empty()),
                "tags": clean_tags(device.get("tags")),
                "snr": snr,
                "rssi": strength,
                "position": position,
            }
        }));
        for (time, count) in &series {
            let Some(time) = time.as_deref().and_then(|t| valid_time(Some(&json!(t)))) else {
                continue;
            };
            if *count == 0 {
                continue;
            }
            let word = if *count == 1 { "uplink" } else { "uplinks" };
            checkins.push(json!({
                "time": time,
                "type": "checkin",
                "animalId": id,
                "text": format!("{alias} sent {count} {word} this hour."),
            }));
        }
        if series.is_empty() {
            for up in &ups {
                checkins.push(json!({
                    "time": up.get("time"),
                    "type": "checkin",
                    "animalId": id,
                    "text": format!("{alias} sent an uplink."),
                }));
            }
            if ups.is_empty() {
                if let Some(seen) = &last_seen {
                    if hours_between(&now, seen) <= f64::from(hours) {
                        checkins.push(json!({
                            "time": seen,
                            "type": "checkin",
                            "animalId": id,
                            "text": format!("{alias} checked in."),
                        }));
                    }
                }
            }
        }
        for up in &ups {
            if decode_object(up.get("object").unwrap_or(&Value::Null))
                .get("sos")
                .and_then(Value::as_bool)
                == Some(true)
            {
                notices.push(json!({
                    "time": up.get("time"),
                    "type": "sos",
                    "severity": "alert",
                    "animalId": id,
                    "text": format!("{alias} sent an SOS."),
                }));
            }
        }
        if let Some(level) = battery {
            if (level as f64) < LOW_BATTERY {
                notices.push(json!({
                    "time": now,
                    "type": "battery",
                    "severity": if (level as f64) < VERY_LOW_BATTERY { "alert" } else { "watch" },
                    "animalId": id,
                    "battery": level,
                    "text": format!("{alias} battery is at {level}%."),
                }));
            }
        }
        if status == "stale" {
            let hours_quiet = quiet.unwrap_or(0.0).floor() as i64;
            notices.push(json!({
                "time": now,
                "type": "silent",
                "severity": "watch",
                "animalId": id,
                "text": format!("{alias} has not checked in for {hours_quiet} hours."),
            }));
        } else if status == "never seen" {
            notices.push(json!({
                "time": now,
                "type": "silent",
                "severity": "watch",
                "animalId": id,
                "text": format!("{alias} has never checked in."),
            }));
        }
    }
    animals.sort_by(|a, b| {
        let num = |v: &Value| {
            v.get("id")
                .and_then(Value::as_str)
                .and_then(|s| s.split('-').nth(1))
                .and_then(|n| n.parse::<i64>().ok())
                .unwrap_or(0)
        };
        num(a).cmp(&num(b))
    });
    checkins.sort_by(|a, b| {
        a.get("time")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(b.get("time").and_then(Value::as_str).unwrap_or(""))
    });
    if checkins.len() > MAX_CHECKINS {
        checkins = checkins.split_off(checkins.len() - MAX_CHECKINS);
    }
    let mut events = checkins;
    events.extend(notices);
    events.sort_by(|a, b| {
        a.get("time")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(b.get("time").and_then(Value::as_str).unwrap_or(""))
    });
    for (i, event) in events.iter_mut().enumerate() {
        event["id"] = json!(format!("live-{:03}", i + 1));
    }
    let data = json!({
        "source": LIVE_SOURCE,
        "hidden": false,
        "generatedAt": now,
        "pulledAt": now,
        "windowHours": hours,
        "note": "Full tracker details from your own ChirpStack server. Keep this file on your own hardware.",
        "sources": if raw.uplinks.is_empty() { json!(["rest"]) } else { json!(["rest", "mqtt"]) },
        "animals": animals,
        "events": events,
    });
    (data, aliases)
}

pub fn read_push_config(
    env: &BTreeMap<String, String>,
    read_file: &dyn Fn(&str) -> Result<String, ()>,
) -> (Option<(String, String)>, Vec<String>) {
    let mut errors = Vec::new();
    let raw = env
        .get("FIBERSHARE_PUSH_URL")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let mut url = None;
    if raw.is_empty() {
        errors.push("Set FIBERSHARE_PUSH_URL to your copy's /api/push address.".into());
    } else {
        match url::Url::parse(&raw) {
            Ok(parsed) => {
                let local = parsed.scheme() == "http"
                    && crate::chirpstack::plain_http_ok(parsed.host_str().unwrap_or(""), false);
                if parsed.scheme() != "https" && !local {
                    errors.push("FIBERSHARE_PUSH_URL must use https.".into());
                } else {
                    url = Some(parsed.to_string());
                }
            }
            Err(_) => errors.push("FIBERSHARE_PUSH_URL is not a valid URL.".into()),
        }
    }
    let mut token = env
        .get("FIBERSHARE_PUSH_TOKEN")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    if token.is_empty() {
        let file = crate::chirpstack::expand_home(
            env.get("FIBERSHARE_PUSH_TOKEN_FILE")
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .unwrap_or("~/.config/fibershare/push-token"),
        );
        token = read_file(&file).unwrap_or_default().trim().to_string();
    }
    if token.is_empty() {
        let where_file = if env.contains_key("FIBERSHARE_PUSH_TOKEN_FILE") {
            "FIBERSHARE_PUSH_TOKEN_FILE"
        } else {
            "~/.config/fibershare/push-token"
        };
        errors.push(format!(
            "No push token. Set FIBERSHARE_PUSH_TOKEN, or put it in {where_file}."
        ));
    }
    if errors.is_empty() {
        (Some((url.unwrap_or_default(), token)), errors)
    } else {
        (None, errors)
    }
}

fn load_aliases(text: &str) -> BTreeMap<String, i64> {
    serde_json::from_str::<BTreeMap<String, i64>>(text).unwrap_or_default()
}

/// One pull. Returns a process code and the lines that should be printed.
#[allow(clippy::too_many_arguments)]
pub fn run_pull<H, W, P, M>(
    argv: &[String],
    env: &BTreeMap<String, String>,
    read_file: &dyn Fn(&str) -> Result<String, ()>,
    file_mode: &dyn Fn(&str) -> Option<u32>,
    now: &str,
    mut http: H,
    mut write: W,
    mut push_http: P,
    mut mqtt: M,
) -> (i32, String)
where
    H: FnMut(&str, &BTreeMap<String, String>) -> Result<HttpReply, String>,
    W: FnMut(&str, &str, u32) -> Result<(), String>,
    P: FnMut(&str, &str, &str) -> Result<HttpReply, String>,
    M: FnMut(&[String], u32) -> Result<Vec<Value>, String>,
{
    let mut log = String::new();
    let options = match parse_args(argv, env) {
        Ok(options) => options,
        Err(err) => return (2, format!("chirpstack:pull: {err}\n")),
    };
    if options.help {
        return (0, HELP.into());
    }
    let read = read_config(env, read_file, file_mode);
    for warning in &read.warnings {
        log.push_str("chirpstack:pull: ");
        log.push_str(warning);
        log.push('\n');
    }
    let mut errors = read.errors.clone();
    let push = if options.push {
        let (push, push_errors) = read_push_config(env, read_file);
        errors.extend(push_errors);
        push
    } else {
        None
    };
    if !errors.is_empty() {
        for error in errors {
            log.push_str("chirpstack:pull: ");
            log.push_str(&error);
            log.push('\n');
        }
        return (1, log);
    }
    let config = read.config;
    let mut raw = match pull_raw(&config, options.hours, now, &mut http) {
        Ok(raw) => raw,
        Err(err) => {
            log.push_str("chirpstack:pull: ");
            log.push_str(&redact(&err, &secrets_of(&config)));
            log.push('\n');
            return (1, log);
        }
    };
    if env
        .get("CHIRPSTACK_MQTT_URL")
        .is_some_and(|s| !s.trim().is_empty())
    {
        match parse_mqtt_url(
            env.get("CHIRPSTACK_MQTT_URL")
                .map(|s| s.as_str())
                .unwrap_or(""),
            env,
        ) {
            Ok(_) => {
                log.push_str(&format!(
                    "chirpstack:pull: listening for uplinks for {} seconds\n",
                    options.mqtt_seconds
                ));
                match mqtt(&config.application_ids, options.mqtt_seconds) {
                    Ok(uplinks) => raw.uplinks = uplinks,
                    Err(err) => {
                        log.push_str("chirpstack:pull: MQTT skipped. ");
                        log.push_str(&redact(&err, &secrets_of(&config)));
                        log.push('\n');
                    }
                }
            }
            Err(err) => {
                log.push_str("chirpstack:pull: MQTT skipped. ");
                log.push_str(&err);
                log.push('\n');
            }
        }
    }
    let alias_file = alias_path(&options.out);
    let known = read_file(&alias_file)
        .ok()
        .map(|text| load_aliases(&text))
        .unwrap_or_default();
    let (full, aliases) = to_live_data(&raw, &known);
    let output = if options.hide {
        hide_tracker_details(&full)
    } else {
        full.clone()
    };
    let hidden = if options.hide {
        output.clone()
    } else {
        hide_tracker_details(&full)
    };
    if options.hide || push.is_some() {
        let problems = hidden_problems(&hidden, &full);
        if !problems.is_empty() {
            log.push_str(&format!(
                "chirpstack:pull: stopped. The hidden export still had {} kind(s) of private data: {}. Nothing was written or pushed.\n",
                problems.len(),
                problems.join(", ")
            ));
            return (1, log);
        }
    }
    let counts = summarize(&full);
    let mut parts = vec![
        format!("{} application(s)", raw.application_count),
        format!(
            "{} tracker(s)",
            counts.get("trackers").copied().unwrap_or(0)
        ),
        format!("{} online", counts.get("online").copied().unwrap_or(0)),
        format!("{} stale", counts.get("stale").copied().unwrap_or(0)),
        format!(
            "{} never seen",
            counts.get("neverSeen").copied().unwrap_or(0)
        ),
        format!(
            "{} low battery",
            counts.get("lowBattery").copied().unwrap_or(0)
        ),
        format!(
            "{} with no battery reading",
            counts.get("noBattery").copied().unwrap_or(0)
        ),
        format!(
            "{} uplinks in {}h",
            counts.get("uplinks").copied().unwrap_or(0),
            options.hours
        ),
    ];
    if !raw.uplinks.is_empty() {
        parts.push(format!("{} MQTT uplink(s)", raw.uplinks.len()));
        parts.push(format!(
            "{} with a position",
            counts.get("withPosition").copied().unwrap_or(0)
        ));
        parts.push(format!("{} SOS", counts.get("sos").copied().unwrap_or(0)));
    }
    if raw.metric_errors > 0 {
        parts.push(format!("{} link-metric read(s) failed", raw.metric_errors));
    }
    log.push_str("chirpstack:pull: ");
    log.push_str(&parts.join(", "));
    log.push_str(".\n");
    if options.dry_run {
        log.push_str("chirpstack:pull: dry run, nothing written.\n");
        return (0, log);
    }
    let alias_text = serde_json::to_string_pretty(&aliases).unwrap_or_else(|_| "{}".into());
    if let Err(err) = write(&alias_file, &format!("{alias_text}\n"), 0o600) {
        log.push_str("chirpstack:pull: ");
        log.push_str(&err);
        log.push('\n');
        return (1, log);
    }
    let mode = if options.hide { 0o644 } else { 0o600 };
    let body = serde_json::to_string_pretty(&output).unwrap_or_else(|_| "{}".into());
    if let Err(err) = write(&options.out, &format!("{body}\n"), mode) {
        log.push_str("chirpstack:pull: ");
        log.push_str(&err);
        log.push('\n');
        return (1, log);
    }
    log.push_str(&format!(
        "chirpstack:pull: wrote {}{}.\n",
        options.out,
        if options.hide {
            " with tracker details hidden"
        } else {
            " with full tracker details. Private: keep it on your own hardware"
        }
    ));
    if !options.out.contains(".local") {
        log.push_str(
            "chirpstack:pull: that file is outside .local/, so git does not ignore it. Do not commit it.\n",
        );
    }
    if let Some((url, token)) = push {
        let payload = json!({"hidden": hidden, "full": full}).to_string();
        match push_http(&url, &token, &payload) {
            Ok(reply) => {
                let body: Value = serde_json::from_str(&reply.body).unwrap_or(json!({}));
                let ok = (200..300).contains(&reply.status) && body.get("ok") == Some(&json!(true));
                if !ok {
                    let error = body
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .replace(&token, "[token]");
                    log.push_str(&format!(
                        "chirpstack:pull: push failed with HTTP {}{}.\n",
                        reply.status,
                        if error.is_empty() {
                            String::new()
                        } else {
                            format!(": {error}")
                        }
                    ));
                    return (1, log);
                }
                let trackers = body.get("trackers").and_then(Value::as_i64).unwrap_or(0);
                log.push_str(&format!(
                    "chirpstack:pull: pushed {trackers} tracker(s), hidden and full, to your Pages copy.\n"
                ));
            }
            Err(err) => {
                log.push_str("chirpstack:pull: push failed. ");
                log.push_str(&err.replace(&token, "[token]"));
                log.push('\n');
                return (1, log);
            }
        }
    }
    (0, log)
}

fn alias_path(out: &str) -> String {
    if let Some((dir, _)) = out.rsplit_once('/') {
        format!("{dir}/aliases.json")
    } else {
        "aliases.json".into()
    }
}

const HELP: &str = "Usage: fibershare pull [--hide | --no-hide] [--hours=24] [--mqtt-seconds=60] [--out=.local/live.json] [--watch=60] [--push] [--dry-run]\n";
