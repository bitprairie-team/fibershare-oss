//! Notes, checks, and alerts a rancher adds by hand.

use std::collections::BTreeMap;

use rand::RngCore;
use serde_json::{json, Value};

use crate::alerts::ALERT_RULES;
use crate::time::time_of;

pub const LOG_TYPES: [&str; 3] = ["note", "alert", "checked"];
pub const LOG_LIMIT: usize = 2000;
pub const BROWSER_LIMIT: usize = 300;
pub const KV_LOG: &str = "ranch-log";
pub const KV_LOG_PREFIX: &str = "log:ranch:";
pub const LOCAL_LOG_AUTHOR: &str = "rancher";

pub fn log_key(scope: &str) -> &'static str {
    match scope {
        "public" => "fs-log-public",
        "rancher" => "fs-log-rancher",
        _ => "fs-log-demo",
    }
}

fn clean(value: &str, max: usize) -> String {
    let folded: String = value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    folded
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

fn animal_ok(id: &str) -> bool {
    let n = id.chars().count();
    (1..=60).contains(&n)
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn to_base36(mut n: u64) -> String {
    if n == 0 {
        return "0".into();
    }
    let digits = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = Vec::new();
    while n > 0 {
        out.push(digits[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_else(|_| "0".into())
}

pub fn new_log_id(now: &str) -> String {
    let ms = crate::time::parse_ms(now).unwrap_or(0).max(0) as u64;
    let mut bytes = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut bytes);
    let rand = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    format!("{}-{}", to_base36(ms), &rand[..12])
}

pub fn normalize_entry(
    input: &Value,
    now: &str,
    id: Option<&str>,
    author: Option<&str>,
) -> Result<Value, String> {
    let kind = input.get("type").and_then(Value::as_str).unwrap_or("");
    if !LOG_TYPES.contains(&kind) {
        return Err("Unknown entry.".into());
    }
    let text = clean(
        input.get("text").and_then(Value::as_str).unwrap_or(""),
        ALERT_RULES.note_max_length,
    );
    if kind != "checked" && text.is_empty() {
        return Err(if kind == "alert" {
            "Say what needs attention."
        } else {
            "Write a note first."
        }
        .into());
    }
    let animal_id = input
        .get("animalId")
        .and_then(Value::as_str)
        .filter(|id| animal_ok(id))
        .unwrap_or("");
    if kind != "alert" && animal_id.is_empty() {
        return Err("Pick an animal first.".into());
    }
    let id = match id {
        Some(value) if !value.is_empty() => value.to_string(),
        _ => new_log_id(now),
    };
    let mut entry = json!({
        "id": id,
        "type": kind,
        "text": text,
        "at": now,
    });
    if !animal_id.is_empty() {
        entry["animalId"] = json!(animal_id);
    }
    let author = clean(author.unwrap_or(""), 120);
    if !author.is_empty() {
        entry["author"] = json!(author);
    }
    Ok(entry)
}

pub fn is_log_entry(entry: &Value) -> bool {
    entry
        .get("type")
        .and_then(Value::as_str)
        .is_some_and(|t| LOG_TYPES.contains(&t))
        && entry.get("id").and_then(Value::as_str).is_some()
}

pub fn parse_log_list(text: &str) -> Vec<Value> {
    serde_json::from_str::<Vec<Value>>(text)
        .unwrap_or_default()
        .into_iter()
        .filter(is_log_entry)
        .collect()
}

pub fn parse_log_value(text: &str) -> Vec<Value> {
    if text.is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Array(list)) => list.into_iter().filter(is_log_entry).collect(),
        Ok(value) if is_log_entry(&value) => vec![value],
        _ => Vec::new(),
    }
}

pub fn log_entry_key(entry: &Value) -> String {
    format!(
        "{KV_LOG_PREFIX}{}:{}",
        entry.get("at").and_then(Value::as_str).unwrap_or(""),
        entry.get("id").and_then(Value::as_str).unwrap_or("")
    )
}

pub fn merge_log_entries(groups: &[Vec<Value>]) -> Vec<Value> {
    let mut by_id: BTreeMap<String, (usize, Value)> = BTreeMap::new();
    let mut seq = 0usize;
    for group in groups {
        for entry in group {
            if !is_log_entry(entry) {
                continue;
            }
            let id = entry
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            by_id.insert(id, (seq, entry.clone()));
            seq += 1;
        }
    }
    let mut list: Vec<(usize, Value)> = by_id.into_values().collect();
    list.sort_by(|a, b| {
        let at =
            a.1.get("at")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(b.1.get("at").and_then(Value::as_str).unwrap_or(""));
        at.then(a.0.cmp(&b.0))
    });
    if list.len() > LOG_LIMIT {
        list = list.split_off(list.len() - LOG_LIMIT);
    }
    list.into_iter().map(|(_, v)| v).collect()
}

pub fn add_log_entry(
    list: &[Value],
    body_text: &str,
    now: &str,
    author: &str,
    id: Option<&str>,
) -> (u16, Value, Option<Value>, Option<Vec<Value>>) {
    let input: Value = match serde_json::from_str(body_text) {
        Ok(v) => v,
        Err(_) => return (400, json!({"error": "Send the entry as JSON."}), None, None),
    };
    match normalize_entry(&input, now, id, Some(author)) {
        Ok(entry) => {
            let next = merge_log_entries(&[list.to_vec(), vec![entry.clone()]]);
            (
                200,
                json!({"ok": true, "entry": entry, "log": next}),
                Some(entry),
                Some(next),
            )
        }
        Err(error) => (400, json!({"error": error}), None, None),
    }
}

pub fn describe_log_entry(entry: &Value) -> String {
    let when = time_of(entry.get("at").and_then(Value::as_str).unwrap_or(""));
    let who = entry
        .get("author")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let kind = entry.get("type").and_then(Value::as_str).unwrap_or("");
    if kind == "checked" {
        let lead = if who.is_empty() {
            "Checked by hand".to_string()
        } else {
            format!("Checked by {who}")
        };
        let mut line = if when.is_empty() {
            lead
        } else {
            format!("{lead} at {when}")
        };
        if let Some(text) = entry
            .get("text")
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty())
        {
            line.push_str(": ");
            line.push_str(text);
        }
        return line;
    }
    let text = entry
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim_end_matches(['.', ',', ';', ':', ' ']);
    if !who.is_empty() {
        let mut line = if text.is_empty() {
            String::new()
        } else {
            format!("{text} by ")
        };
        line.push_str(&who);
        if !when.is_empty() {
            line.push_str(" at ");
            line.push_str(&when);
        }
        return line;
    }
    entry
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

pub fn entries_for(log: &[Value], animal_id: &str) -> Vec<Value> {
    let mut list: Vec<Value> = log
        .iter()
        .filter(|e| {
            e.get("animalId").and_then(Value::as_str) == Some(animal_id)
                && e.get("type").and_then(Value::as_str) != Some("alert")
        })
        .cloned()
        .collect();
    list.sort_by(|a, b| {
        b.get("at")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(a.get("at").and_then(Value::as_str).unwrap_or(""))
    });
    list
}

pub fn last_checked(log: &[Value], animal_id: &str) -> Option<String> {
    entries_for(log, animal_id)
        .into_iter()
        .find(|e| e.get("type").and_then(Value::as_str) == Some("checked"))
        .and_then(|e| e.get("at").and_then(Value::as_str).map(str::to_string))
}

pub fn author_from_claims(email: Option<&str>, sub: Option<&str>) -> String {
    let email = clean(email.unwrap_or(""), 120);
    if !email.is_empty() {
        return email;
    }
    let sub = clean(sub.unwrap_or(""), 120);
    if !sub.is_empty() {
        sub
    } else {
        LOCAL_LOG_AUTHOR.to_string()
    }
}

/// Browser log for sample and public views. The rancher scope is the server.
pub fn browser_add(
    list: &[Value],
    input: &Value,
    now: &str,
    id: Option<&str>,
) -> Result<Vec<Value>, String> {
    let entry = normalize_entry(input, now, id, None)?;
    let mut next = list.to_vec();
    next.push(entry);
    if next.len() > BROWSER_LIMIT {
        next = next.split_off(next.len() - BROWSER_LIMIT);
    }
    Ok(next)
}
