//! Pull trackers from a rancher's own network server.
//! The screen copy never names that server. This module is the technical side.

use std::collections::BTreeMap;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::grid::{GRID_COLS, GRID_ROWS};

pub const DEFAULT_URL: &str = "http://localhost:8090";
pub const DEFAULT_TOKEN_FILE: &str = "~/.config/fibershare/chirpstack-token";
pub const LOW_BATTERY: f64 = 25.0;
pub const VERY_LOW_BATTERY: f64 = 15.0;
pub const STALE_HOURS: f64 = 2.0;

const HASH_PREFIX: &str = "fibershare-grid-v1:";

pub fn device_key(dev_eui: &str) -> String {
    let digest = Sha256::digest(format!("{HASH_PREFIX}{}", dev_eui.to_lowercase()).as_bytes());
    hex_encode(&digest)[..12].to_string()
}

pub fn grid_position(dev_eui: &str) -> (f64, f64) {
    let digest = Sha256::digest(format!("{HASH_PREFIX}pos:{}", dev_eui.to_lowercase()).as_bytes());
    let col = digest[0] as usize % GRID_COLS;
    let row = digest[1] as usize % GRID_ROWS;
    let jx = 0.2 + (digest[2] as f64 / 255.0) * 0.6;
    let jy = 0.2 + (digest[3] as f64 / 255.0) * 0.6;
    let x = (((col as f64 + jx) / GRID_COLS as f64) * 1000.0).round() / 10.0;
    let y = (((row as f64 + jy) / GRID_ROWS as f64) * 1000.0).round() / 10.0;
    (x, y)
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn assign_aliases(dev_euis: &[String], known: &BTreeMap<String, i64>) -> BTreeMap<String, i64> {
    let mut numbers = known.clone();
    let mut used: Vec<i64> = numbers.values().copied().collect();
    let mut keys: Vec<String> = dev_euis.iter().map(|eui| device_key(eui)).collect();
    keys.sort();
    keys.dedup();
    let mut next = 1_i64;
    for key in keys {
        if numbers.contains_key(&key) {
            continue;
        }
        while used.contains(&next) {
            next += 1;
        }
        numbers.insert(key, next);
        used.push(next);
    }
    numbers
}

pub fn plain_http_ok(hostname: &str, allow: bool) -> bool {
    if ["localhost", "127.0.0.1", "[::1]", "::1"].contains(&hostname) || allow {
        return true;
    }
    !hostname.contains('.') && !hostname.contains(':') && !hostname.starts_with('[')
}

pub struct PullConfig {
    pub base_url: Option<String>,
    pub token: String,
    pub token_source: Option<String>,
    pub access_id: Option<String>,
    pub access_secret: Option<String>,
    pub tenant_ids: Vec<String>,
    pub application_ids: Vec<String>,
}

pub struct ConfigRead {
    pub config: PullConfig,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

pub fn read_config(
    env: &BTreeMap<String, String>,
    read_file: &dyn Fn(&str) -> Result<String, ()>,
    file_mode: &dyn Fn(&str) -> Option<u32>,
) -> ConfigRead {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();
    let raw_url = env
        .get("CHIRPSTACK_URL")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_URL.into());
    let mut base_url = None;
    match url::Url::parse(&raw_url) {
        Ok(url) if url.scheme() == "http" || url.scheme() == "https" => {
            let path = url.path().trim_end_matches('/');
            base_url = Some(format!("{}{path}", url.origin().ascii_serialization()));
            let allow = matches!(
                env.get("CHIRPSTACK_ALLOW_HTTP")
                    .map(|s| s.trim().to_lowercase())
                    .as_deref(),
                Some("1" | "true" | "yes" | "on")
            );
            if url.scheme() == "http" && !plain_http_ok(url.host_str().unwrap_or(""), allow) {
                warnings.push("CHIRPSTACK_URL uses plain http to another host. The token crosses the network unencrypted. Use https, run the pull on the same hardware or compose network as the network server, or set CHIRPSTACK_ALLOW_HTTP=1 if the link is private.".into());
            }
        }
        _ => errors.push("CHIRPSTACK_URL is not a valid http or https URL.".into()),
    }
    let mut token = env
        .get("CHIRPSTACK_API_TOKEN")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let mut token_source = if token.is_empty() {
        None
    } else {
        Some("env".into())
    };
    if token.is_empty() {
        let file = expand_home(
            env.get("CHIRPSTACK_API_TOKEN_FILE")
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .unwrap_or(DEFAULT_TOKEN_FILE),
        );
        match read_file(&file) {
            Ok(text) => {
                token = text.trim().to_string();
                token_source = Some("file".into());
                if let Some(mode) = file_mode(&file) {
                    if mode & 0o077 != 0 {
                        warnings.push(
                            "The token file can be read by other users. Run: chmod 600 on it."
                                .into(),
                        );
                    }
                }
            }
            Err(_) => token.clear(),
        }
        if token.is_empty() {
            let where_file = if env.contains_key("CHIRPSTACK_API_TOKEN_FILE") {
                "CHIRPSTACK_API_TOKEN_FILE"
            } else {
                DEFAULT_TOKEN_FILE
            };
            errors.push(format!(
                "No API token. Set CHIRPSTACK_API_TOKEN, or put the token in {where_file}."
            ));
        }
    }
    let access_id = env
        .get("CF_ACCESS_CLIENT_ID")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let access_secret = env
        .get("CF_ACCESS_CLIENT_SECRET")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if access_id.is_some() != access_secret.is_some() {
        errors.push("Set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, or neither.".into());
    }
    ConfigRead {
        config: PullConfig {
            base_url,
            token,
            token_source,
            access_id,
            access_secret,
            tenant_ids: split_list(
                env.get("CHIRPSTACK_TENANT_ID")
                    .map(String::as_str)
                    .unwrap_or(""),
            ),
            application_ids: split_list(
                env.get("CHIRPSTACK_APPLICATION_ID")
                    .map(String::as_str)
                    .unwrap_or(""),
            ),
        },
        warnings,
        errors,
    }
}

fn split_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn expand_home(path: &str) -> String {
    if path == "~" {
        return std::env::var("HOME").unwrap_or_else(|_| "/".into());
    }
    if let Some(rest) = path.strip_prefix("~/") {
        return format!(
            "{}/{rest}",
            std::env::var("HOME").unwrap_or_else(|_| "/".into())
        );
    }
    path.to_string()
}

pub fn build_headers(config: &PullConfig) -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();
    headers.insert("Accept".into(), "application/json".into());
    headers.insert(
        "Grpc-Metadata-Authorization".into(),
        format!("Bearer {}", config.token),
    );
    if let (Some(id), Some(secret)) = (&config.access_id, &config.access_secret) {
        headers.insert("CF-Access-Client-Id".into(), id.clone());
        headers.insert("CF-Access-Client-Secret".into(), secret.clone());
    }
    headers
}

pub fn redact(text: &str, secrets: &[String]) -> String {
    let mut out = text.to_string();
    for secret in secrets {
        if !secret.is_empty() {
            out = out.replace(secret, "[hidden]");
        }
    }
    out
}

pub fn parse_args(argv: &[String], env: &BTreeMap<String, String>) -> Result<PullOptions, String> {
    let hide_env = env
        .get("FIBERSHARE_HIDE_TRACKERS")
        .map(|s| s.trim().to_lowercase())
        .unwrap_or_else(|| "1".into());
    let mut options = PullOptions {
        hide: !["0", "false", "no", "off"].contains(&hide_env.as_str()),
        hours: 24,
        mqtt_seconds: 60,
        out: ".local/live.json".into(),
        watch: 0,
        push: false,
        dry_run: false,
        help: false,
    };
    for arg in argv {
        let (flag, value) = arg
            .split_once('=')
            .map(|(f, v)| (f, Some(v)))
            .unwrap_or((arg.as_str(), None));
        match flag {
            "--hide" => options.hide = true,
            "--no-hide" => options.hide = false,
            "--dry-run" => options.dry_run = true,
            "--push" => options.push = true,
            "--hours" => {
                options.hours = value
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(24)
                    .clamp(1, 168)
            }
            "--mqtt-seconds" => {
                options.mqtt_seconds = value
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60)
                    .clamp(5, 3600)
            }
            "--out" => {
                if let Some(value) = value {
                    options.out = value.to_string();
                }
            }
            "--watch" => options.watch = value.and_then(|v| v.parse().ok()).unwrap_or(60).max(30),
            "--help" | "-h" => options.help = true,
            _ => return Err(format!("Unknown option {flag}. Try --help.")),
        }
    }
    Ok(options)
}

#[derive(Clone, Debug)]
pub struct PullOptions {
    pub hide: bool,
    pub hours: u32,
    pub mqtt_seconds: u32,
    pub out: String,
    pub watch: u32,
    pub push: bool,
    pub dry_run: bool,
    pub help: bool,
}

/// MQTT 3.1.1 connect packet, clean session, optional user and password.
pub fn connect_packet(client_id: &str, username: &str, password: &str, keepalive: u16) -> Vec<u8> {
    let mut flags = 0x02u8;
    if !username.is_empty() {
        flags |= 0x80;
    }
    if !password.is_empty() {
        flags |= 0x40;
    }
    let mut body = Vec::new();
    push_str(&mut body, "MQTT");
    body.push(4);
    body.push(flags);
    body.extend_from_slice(&keepalive.to_be_bytes());
    push_str(&mut body, client_id);
    if !username.is_empty() {
        push_str(&mut body, username);
    }
    if !password.is_empty() {
        push_str(&mut body, password);
    }
    packet(1, 0, &body)
}

pub fn subscribe_packet(packet_id: u16, topics: &[String]) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(&packet_id.to_be_bytes());
    for topic in topics {
        push_str(&mut body, topic);
        body.push(0);
    }
    packet(8, 0x02, &body)
}

pub fn uplink_topics(application_ids: &[String]) -> Vec<String> {
    if application_ids.is_empty() {
        vec!["application/+/device/+/event/up".into()]
    } else {
        application_ids
            .iter()
            .map(|id| format!("application/{id}/device/+/event/up"))
            .collect()
    }
}

fn push_str(body: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    body.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
    body.extend_from_slice(bytes);
}

fn packet(kind: u8, flags: u8, body: &[u8]) -> Vec<u8> {
    let mut out = vec![(kind << 4) | flags];
    out.extend(remaining_length(body.len()));
    out.extend_from_slice(body);
    out
}

fn remaining_length(mut length: usize) -> Vec<u8> {
    let mut bytes = Vec::new();
    loop {
        let mut byte = (length % 128) as u8;
        length /= 128;
        if length > 0 {
            byte |= 0x80;
        }
        bytes.push(byte);
        if length == 0 {
            break;
        }
    }
    bytes
}

pub struct MqttPacket {
    pub kind: u8,
    pub flags: u8,
    pub body: Vec<u8>,
}

pub fn read_packets(buffer: &[u8]) -> (Vec<MqttPacket>, Vec<u8>) {
    let mut packets = Vec::new();
    let mut offset = 0;
    while offset + 2 <= buffer.len() {
        let mut multiplier = 1usize;
        let mut length = 0usize;
        let mut i = offset + 1;
        let byte;
        loop {
            if i >= buffer.len() {
                return (packets, buffer[offset..].to_vec());
            }
            let b = buffer[i];
            length += (b & 0x7f) as usize * multiplier;
            multiplier *= 128;
            i += 1;
            if b & 0x80 == 0 {
                byte = b;
                let _ = byte;
                break;
            }
        }
        if i + length > buffer.len() {
            break;
        }
        packets.push(MqttPacket {
            kind: buffer[offset] >> 4,
            flags: buffer[offset] & 0x0f,
            body: buffer[i..i + length].to_vec(),
        });
        offset = i + length;
    }
    (packets, buffer[offset..].to_vec())
}

pub fn parse_publish(flags: u8, body: &[u8]) -> Option<(String, Vec<u8>)> {
    if body.len() < 2 {
        return None;
    }
    let topic_len = u16::from_be_bytes([body[0], body[1]]) as usize;
    if body.len() < 2 + topic_len {
        return None;
    }
    let topic = String::from_utf8_lossy(&body[2..2 + topic_len]).to_string();
    let qos = (flags >> 1) & 0x03;
    let start = 2 + topic_len + if qos > 0 { 2 } else { 0 };
    Some((topic, body.get(start..).unwrap_or_default().to_vec()))
}

pub fn parse_uplink_event(topic: &str, payload: &[u8]) -> Option<Value> {
    let rest = topic.strip_prefix("application/")?;
    let mut parts = rest.split('/');
    let _app = parts.next()?;
    if parts.next() != Some("device") {
        return None;
    }
    let dev = parts.next()?;
    if parts.next() != Some("event") || parts.next() != Some("up") {
        return None;
    }
    let event: Value = serde_json::from_slice(payload).ok()?;
    if !event.is_object() {
        return None;
    }
    let info = event.get("deviceInfo").cloned().unwrap_or(json!({}));
    let rx = event
        .get("rxInfo")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let rssi = rx
        .iter()
        .filter_map(|r| r.get("rssi").and_then(Value::as_f64))
        .fold(None, |best: Option<f64>, n| {
            Some(best.map(|b| b.max(n)).unwrap_or(n))
        });
    let snr = rx
        .iter()
        .filter_map(|r| r.get("snr").and_then(Value::as_f64))
        .fold(None, |best: Option<f64>, n| {
            Some(best.map(|b| b.max(n)).unwrap_or(n))
        });
    Some(json!({
        "devEui": info.get("devEui").and_then(Value::as_str).unwrap_or(dev),
        "time": event.get("time").and_then(Value::as_str).unwrap_or(""),
        "deviceName": info.get("deviceName").and_then(Value::as_str),
        "tags": info.get("tags").cloned().unwrap_or(json!({})),
        "object": event.get("object").filter(|v| v.is_object()),
        "rssi": rssi,
        "snr": snr,
    }))
}

pub fn decode_object(object: &Value) -> Value {
    let mut found = serde_json::Map::new();
    visit(object, 0, &mut found);
    let mut result = serde_json::Map::new();
    let lat = num_of(found.get("latitude"));
    let lon = num_of(found.get("longitude"));
    if let (Some(lat), Some(lon)) = (lat, lon) {
        if lat.abs() <= 90.0 && lon.abs() <= 180.0 && !(lat == 0.0 && lon == 0.0) {
            result.insert("latitude".into(), json!(lat));
            result.insert("longitude".into(), json!(lon));
        }
    }
    for (key, scale) in [("temperature", 10.0), ("light", 1.0), ("battery", 1.0)] {
        if let Some(v) = num_of(found.get(key)) {
            result.insert(key.into(), json!((v * scale).round() / scale));
        }
    }
    if let Some(value) = found.get("motion") {
        if let Some(v) = num_of(Some(value)) {
            result.insert("motion".into(), json!(v.round() as i64));
        } else if let Some(flag) = value.as_bool() {
            result.insert("motion".into(), json!(if flag { 1 } else { 0 }));
        }
    }
    if let Some(value) = found.get("sos") {
        let sos = value.as_bool().unwrap_or(false)
            || value.as_i64() == Some(1)
            || value
                .as_str()
                .is_some_and(|s| s == "1" || s.eq_ignore_ascii_case("true"));
        result.insert("sos".into(), json!(sos));
    }
    Value::Object(result)
}

fn num_of(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Number(n) => n.as_f64().filter(|n| n.is_finite()),
        Value::String(s) if !s.trim().is_empty() => s.parse().ok(),
        _ => None,
    }
}

fn sensor_name(label: &str) -> Option<&'static str> {
    let key = label
        .chars()
        .collect::<Vec<_>>()
        .windows(1)
        .map(|c| c[0])
        .collect::<String>();
    let spaced = split_camel(label).to_lowercase();
    let compact = spaced.split_whitespace().collect::<String>();
    let table = [
        ("latitude", r"^(lat|latitude)$"),
        ("longitude", r"^(lon|lng|long|longitude)$"),
        ("temperature", r"temp"),
        ("light", r"^(light|lux|illuminance|light ?intensity)$"),
        ("battery", r"^(battery|battery ?level|battery ?percent)$"),
        ("motion", r"motion"),
        ("sos", r"^(sos|sos ?event|sos ?status)$"),
    ];
    for (name, pattern) in table {
        let re = regex::Regex::new(pattern).ok()?;
        if re.is_match(spaced.trim()) || re.is_match(&compact) {
            return Some(name);
        }
    }
    let _ = key;
    None
}

fn split_camel(label: &str) -> String {
    let chars: Vec<char> = label.chars().collect();
    let mut out = String::new();
    for (i, ch) in chars.iter().enumerate() {
        if i > 0 && chars[i - 1].is_ascii_lowercase() && ch.is_ascii_uppercase() {
            out.push(' ');
        }
        if *ch == '_' || *ch == '-' {
            out.push(' ');
        } else {
            out.push(*ch);
        }
    }
    out
}

fn visit(value: &Value, depth: usize, out: &mut serde_json::Map<String, Value>) {
    if depth > 6 || value.is_null() {
        return;
    }
    if let Some(list) = value.as_array() {
        for item in list {
            visit(item, depth + 1, out);
        }
        return;
    }
    let Some(object) = value.as_object() else {
        return;
    };
    if object.contains_key("type") && object.contains_key("measurementValue") {
        if let Some(name) = object
            .get("type")
            .and_then(Value::as_str)
            .and_then(sensor_name)
        {
            if !out.contains_key(name) {
                if let Some(reading) = object.get("measurementValue") {
                    out.insert(name.to_string(), reading.clone());
                }
            }
        }
        return;
    }
    for (key, child) in object {
        if let Some(name) = sensor_name(key) {
            if (child.is_number() || child.is_boolean() || child.is_string())
                && !out.contains_key(name)
            {
                out.insert(name.to_string(), child.clone());
                continue;
            }
        }
        visit(child, depth + 1, out);
    }
}

pub fn signal_bucket(metrics: &Value) -> Option<&'static str> {
    let counts = dataset(metrics.get("rxPackets"));
    let average = |values: Vec<f64>| -> Option<f64> {
        let picked: Vec<f64> = values
            .iter()
            .enumerate()
            .filter(|(i, v)| {
                v.is_finite()
                    && (counts.get(*i).copied().unwrap_or(0.0) > 0.0 || counts.is_empty())
                    && **v != 0.0
            })
            .map(|(_, v)| *v)
            .collect();
        if picked.is_empty() {
            None
        } else {
            Some(picked.iter().sum::<f64>() / picked.len() as f64)
        }
    };
    if let Some(snr) = average(dataset(metrics.get("gwSnr"))) {
        return Some(if snr >= 0.0 {
            "good"
        } else if snr >= -7.0 {
            "fair"
        } else {
            "weak"
        });
    }
    if let Some(strength) = average(dataset(metrics.get("gwRssi"))) {
        return Some(if strength >= -100.0 {
            "good"
        } else if strength >= -115.0 {
            "fair"
        } else {
            "weak"
        });
    }
    None
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

pub fn summarize(data: &Value) -> BTreeMap<String, i64> {
    let animals = data
        .get("animals")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let events = data
        .get("events")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let count = |pred: &dyn Fn(&Value) -> bool| animals.iter().filter(|a| pred(a)).count() as i64;
    let mut out = BTreeMap::new();
    out.insert("trackers".into(), animals.len() as i64);
    out.insert(
        "withPosition".into(),
        count(&|a| a.pointer("/details/position").is_some()),
    );
    out.insert(
        "sos".into(),
        events
            .iter()
            .filter(|e| e.get("type").and_then(Value::as_str) == Some("sos"))
            .count() as i64,
    );
    out.insert(
        "online".into(),
        count(&|a| a.get("status").and_then(Value::as_str) == Some("online")),
    );
    out.insert(
        "stale".into(),
        count(&|a| a.get("status").and_then(Value::as_str) == Some("stale")),
    );
    out.insert(
        "neverSeen".into(),
        count(&|a| a.get("status").and_then(Value::as_str) == Some("never seen")),
    );
    out.insert(
        "lowBattery".into(),
        count(&|a| {
            a.get("battery")
                .and_then(Value::as_f64)
                .is_some_and(|n| n < LOW_BATTERY)
        }),
    );
    out.insert(
        "noBattery".into(),
        count(&|a| a.get("battery").is_none() || a.get("battery").is_some_and(Value::is_null)),
    );
    out.insert(
        "uplinks".into(),
        animals
            .iter()
            .map(|a| a.get("uplinks24h").and_then(Value::as_f64).unwrap_or(0.0) as i64)
            .sum(),
    );
    out.insert("events".into(), events.len() as i64);
    out
}

#[derive(Clone, Debug)]
pub struct MqttSettings {
    pub secure: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

pub fn parse_mqtt_url(value: &str, env: &BTreeMap<String, String>) -> Result<MqttSettings, String> {
    let url = url::Url::parse(value)
        .map_err(|_| "CHIRPSTACK_MQTT_URL must start with mqtt:// or mqtts://".to_string())?;
    if url.scheme() != "mqtt" && url.scheme() != "mqtts" {
        return Err("CHIRPSTACK_MQTT_URL must start with mqtt:// or mqtts://".into());
    }
    let secure = url.scheme() == "mqtts";
    let username = urlencoding_decode(url.username());
    let password = url.password().map(urlencoding_decode).unwrap_or_default();
    Ok(MqttSettings {
        secure,
        host: url.host_str().unwrap_or("").to_string(),
        port: url.port().unwrap_or(if secure { 8883 } else { 1883 }),
        username: if username.is_empty() {
            env.get("CHIRPSTACK_MQTT_USERNAME")
                .cloned()
                .unwrap_or_default()
        } else {
            username
        },
        password: if password.is_empty() {
            env.get("CHIRPSTACK_MQTT_PASSWORD")
                .cloned()
                .unwrap_or_default()
        } else {
            password
        },
    })
}

fn urlencoding_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(n) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("00"),
                16,
            ) {
                out.push(n);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(not(target_arch = "wasm32"))]
pub fn collect_uplinks(
    settings: &MqttSettings,
    topics: &[String],
    seconds: f64,
) -> Result<Vec<Value>, String> {
    use std::net::TcpStream;
    use std::time::Duration;

    let stream = TcpStream::connect((settings.host.as_str(), settings.port))
        .map_err(|err| format!("MQTT connection failed: {err}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(100)))
        .ok();
    if settings.secure {
        collect_tls(stream, settings, topics, seconds)
    } else {
        collect_on(stream, settings, topics, seconds)
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_on<S: std::io::Read + std::io::Write>(
    mut socket: S,
    settings: &MqttSettings,
    topics: &[String],
    seconds: f64,
) -> Result<Vec<Value>, String> {
    use std::time::Instant;
    let client = format!("fibershare-pull-{:08x}", rand::random::<u32>());
    socket
        .write_all(&connect_packet(
            &client,
            &settings.username,
            &settings.password,
            30,
        ))
        .map_err(|err| err.to_string())?;
    let deadline = Instant::now() + std::time::Duration::from_secs_f64(seconds.max(0.05));
    let mut buffer = Vec::new();
    let mut events = Vec::new();
    let mut subscribed = false;
    let mut chunk = [0u8; 4096];
    while Instant::now() < deadline {
        match socket.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => buffer.extend_from_slice(&chunk[..n]),
            Err(err)
                if err.kind() == std::io::ErrorKind::WouldBlock
                    || err.kind() == std::io::ErrorKind::TimedOut =>
            {
                if !subscribed && !buffer.is_empty() {
                    // keep waiting
                }
                continue;
            }
            Err(err) => return Err(err.to_string()),
        }
        let (packets, rest) = read_packets(&buffer);
        buffer = rest;
        for packet in packets {
            if packet.kind == 2 {
                if packet.body.get(1).copied().unwrap_or(1) != 0 {
                    return Err("The broker refused the MQTT login.".into());
                }
                socket
                    .write_all(&subscribe_packet(1, topics))
                    .map_err(|err| err.to_string())?;
                subscribed = true;
            } else if packet.kind == 3 {
                if let Some((topic, payload)) = parse_publish(packet.flags, &packet.body) {
                    if let Some(event) = parse_uplink_event(&topic, &payload) {
                        events.push(event);
                    }
                }
            }
        }
    }
    let _ = socket.write_all(&packet(14, 0, &[]));
    Ok(events)
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_tls(
    socket: std::net::TcpStream,
    settings: &MqttSettings,
    topics: &[String],
    seconds: f64,
) -> Result<Vec<Value>, String> {
    let connector = native_tls::TlsConnector::new().map_err(|err| err.to_string())?;
    let stream = connector
        .connect(&settings.host, socket)
        .map_err(|err| err.to_string())?;
    collect_on(stream, settings, topics, seconds)
}
