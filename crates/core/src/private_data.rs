//! Checks for private data in sample files and draft schemas.

use regex::Regex;
use serde_json::Value;

pub const FORBIDDEN_KEYS: [&str; 3] = ["price", "usd", "currency"];
const PRIVATE_KEY_WORDS: [&str; 7] = [
    "latitude",
    "longitude",
    "deveui",
    "rssi",
    "gateway",
    "geolocation",
    "coordinate",
];
const PRIVATE_KEY_PARTS: [&str; 7] = ["lat", "lng", "lon", "eui", "gps", "coords", "geo"];

pub fn key_parts(key: &str) -> Vec<String> {
    let mut spaced = String::new();
    let chars: Vec<char> = key.chars().collect();
    for (i, ch) in chars.iter().enumerate() {
        if i > 0 {
            let prev = chars[i - 1];
            let boundary = ((prev.is_ascii_lowercase() || prev.is_ascii_digit())
                && ch.is_ascii_uppercase())
                || (prev.is_ascii_uppercase()
                    && ch.is_ascii_uppercase()
                    && chars.get(i + 1).is_some_and(|n| n.is_ascii_lowercase()));
            if boundary {
                spaced.push(' ');
            }
        }
        spaced.push(*ch);
    }
    spaced
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .map(|part| part.to_lowercase())
        .collect()
}

pub fn is_private_key(key: &str) -> bool {
    let parts = key_parts(key);
    let joined = parts.join("");
    if PRIVATE_KEY_WORDS.iter().any(|word| joined.contains(word)) {
        return true;
    }
    if parts
        .iter()
        .any(|part| PRIVATE_KEY_PARTS.contains(&part.as_str()))
    {
        return true;
    }
    let secret = Regex::new(r"^(api_?key|apikey|secret|secret_?key|access_?key|access_?token|auth_?token|private_?key)$").unwrap();
    secret.is_match(&parts.join("_")) || secret.is_match(&joined)
}

pub fn device_id_problem(text: &str) -> Option<&'static str> {
    let hex = Regex::new(r"(?i)\b[0-9a-f]{16}\b").unwrap();
    let pairs = Regex::new(r"(?i)\b(?:[0-9a-f]{2}[:-]){7}[0-9a-f]{2}\b").unwrap();
    if hex.is_match(text) || pairs.is_match(text) {
        Some("DevEUI-like hex string")
    } else {
        None
    }
}

pub fn coordinate_problem(text: &str) -> Option<&'static str> {
    let pair = Regex::new(r"-?\b\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b").unwrap();
    let dms = Regex::new(r"\b\d{1,3}\s*°\s*\d{1,2}\s*['′]").unwrap();
    let geo = Regex::new(r"(?i)\bgeo:\s*-?\d").unwrap();
    if pair.is_match(text) {
        Some("coordinate pair")
    } else if dms.is_match(text) {
        Some("degrees and minutes")
    } else if geo.is_match(text) {
        Some("geo: link")
    } else {
        None
    }
}

pub fn precise_number_problem(value: f64) -> Option<&'static str> {
    if !value.is_finite() || value.fract() == 0.0 || value.abs() > 180.0 {
        return None;
    }
    let text = value.to_string();
    let decimals = text
        .split('.')
        .nth(1)
        .unwrap_or("")
        .split('e')
        .next()
        .unwrap_or("")
        .len();
    if decimals >= 4 {
        Some("precise decimal number, may be a coordinate")
    } else {
        None
    }
}

fn looks_like_token(text: &str) -> bool {
    let token = Regex::new(r"[A-Za-z0-9+/_-]{32,}={0,2}").unwrap();
    let hits: Vec<String> = token
        .find_iter(text)
        .map(|hit| hit.as_str().to_string())
        .collect();
    hits.iter().any(|hit| {
        let body = hit.trim_end_matches('=');
        body.chars().any(|c| c.is_ascii_digit())
            && body.chars().any(|c| c.is_ascii_uppercase())
            && body.chars().any(|c| c.is_ascii_lowercase())
    })
}

pub fn private_value_problem(text: &str) -> Option<String> {
    let email = Regex::new(r"(?i)[A-Z0-9._%+-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}").unwrap();
    if email.is_match(text) {
        return Some("email-like string".into());
    }
    if let Some(problem) = coordinate_problem(text).or_else(|| device_id_problem(text)) {
        return Some(problem.into());
    }
    let patterns = [
        ("sk_/pk_ style key", r"\b(sk|pk|rk)_[A-Za-z0-9_]{8,}"),
        (
            "api_key style value",
            r#"(?i)\b(api[_-]?key|apikey|secret[_-]?key|access[_-]?key|access[_-]?token|auth[_-]?token|bearer)\b\s*[:=]?\s*["']?[A-Za-z0-9._+\-/]{8,}"#,
        ),
        ("long hex token", r"(?i)\b[0-9a-f]{32,}\b"),
    ];
    for (name, pattern) in patterns {
        if Regex::new(pattern).unwrap().is_match(text) {
            return Some(name.into());
        }
    }
    if looks_like_token(text) {
        return Some("long base64 token".into());
    }
    None
}

pub fn forbidden_keys(value: &Value, path: &str, found: &mut Vec<String>) {
    match value {
        Value::Array(list) => {
            for (index, item) in list.iter().enumerate() {
                forbidden_keys(item, &format!("{path}[{index}]"), found);
            }
        }
        Value::Object(map) => {
            for (key, child) in map {
                if FORBIDDEN_KEYS.contains(&key.to_lowercase().as_str()) {
                    found.push(format!("{path}.{key}"));
                }
                forbidden_keys(child, &format!("{path}.{key}"), found);
            }
        }
        _ => {}
    }
}

pub fn private_data_problems(value: &Value, path: &str, found: &mut Vec<String>) {
    match value {
        Value::Array(list) => {
            for (index, item) in list.iter().enumerate() {
                private_data_problems(item, &format!("{path}[{index}]"), found);
            }
        }
        Value::Object(map) => {
            for (key, child) in map {
                if is_private_key(key) {
                    found.push(format!("{path}.{key}: private key name"));
                }
                if let Some(problem) = private_value_problem(key) {
                    found.push(format!("{path}.{key}: {problem} in key"));
                }
                private_data_problems(child, &format!("{path}.{key}"), found);
            }
        }
        Value::String(text) => {
            if let Some(problem) = private_value_problem(text) {
                found.push(format!("{path}: {problem}"));
            }
        }
        Value::Number(number) => {
            if let Some(n) = number.as_f64() {
                if let Some(problem) = precise_number_problem(n) {
                    found.push(format!("{path}: {problem}"));
                }
            }
        }
        _ => {}
    }
}

pub fn committed_text_problems(text: &str, path: &str) -> Vec<String> {
    text.lines()
        .enumerate()
        .filter_map(|(index, line)| {
            device_id_problem(line)
                .or_else(|| coordinate_problem(line))
                .map(|problem| format!("{}:{}: {}", path, index + 1, problem))
        })
        .collect()
}

pub fn private_source_problems(source: &str, path: &str) -> Vec<String> {
    let mut found = Vec::new();
    let key_pattern =
        Regex::new(r#"(?:["'`]([A-Za-z_$][\w$-]*)["'`]|([A-Za-z_$][\w$]*))\s*:"#).unwrap();
    for caps in key_pattern.captures_iter(source) {
        let key = caps
            .get(1)
            .or_else(|| caps.get(2))
            .map(|m| m.as_str())
            .unwrap_or("");
        if is_private_key(key) {
            found.push(format!("{path}: private key name \"{key}\""));
        }
    }
    let member = Regex::new(r"\.([A-Za-z_$][\w$]*)\s*=").unwrap();
    for caps in member.captures_iter(source) {
        let end = caps.get(0).map(|m| m.end()).unwrap_or(0);
        if source.as_bytes().get(end) == Some(&b'=') {
            continue;
        }
        let key = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        if is_private_key(key) {
            found.push(format!("{path}: private key name \"{key}\""));
        }
    }
    found
}
