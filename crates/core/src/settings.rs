//! Which automated jobs run, and the alert limits. Saved in the browser.
//! Every job is on until the rancher turns it off.

use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::alerts::{AlertRules, ALERT_RULES};
use crate::time::minutes_text;

pub const JOB_IDS: [&str; 9] = [
    "battery", "quiet", "still", "paddock", "sos", "predator", "smoke", "trace", "pull",
];
pub const SETTINGS_JOBS: &str = "fs-jobs";
pub const SETTINGS_LIMITS: &str = "fs-alert-limits";

pub struct LimitRange {
    pub min: i64,
    pub max: i64,
}

pub fn limit_range(key: &str) -> Option<LimitRange> {
    match key {
        "lowBatteryPercent" => Some(LimitRange { min: 5, max: 90 }),
        "quietMinutes" | "stillMinutes" => Some(LimitRange { min: 15, max: 1440 }),
        _ => None,
    }
}

pub trait Store {
    fn get_item(&self, key: &str) -> Option<String>;
    fn set_item(&mut self, key: &str, value: &str);
}

#[derive(Default)]
pub struct MemoryStore {
    pub data: BTreeMap<String, String>,
    pub fail: bool,
}

impl Store for MemoryStore {
    fn get_item(&self, key: &str) -> Option<String> {
        if self.fail {
            return None;
        }
        self.data.get(key).cloned()
    }
    fn set_item(&mut self, key: &str, value: &str) {
        if self.fail {
            return;
        }
        self.data.insert(key.to_string(), value.to_string());
    }
}

fn read_json(storage: &impl Store, key: &str) -> Value {
    storage
        .get_item(key)
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| json!({}))
}

pub fn read_jobs(storage: &impl Store) -> BTreeMap<String, bool> {
    let saved = read_json(storage, SETTINGS_JOBS);
    JOB_IDS
        .iter()
        .map(|id| {
            (
                (*id).to_string(),
                saved.get(*id).and_then(Value::as_bool) != Some(false),
            )
        })
        .collect()
}

pub fn set_job(storage: &mut impl Store, id: &str, on: bool) -> BTreeMap<String, bool> {
    if !JOB_IDS.contains(&id) {
        return read_jobs(storage);
    }
    let mut jobs = read_jobs(storage);
    jobs.insert(id.to_string(), on);
    storage.set_item(
        SETTINGS_JOBS,
        &serde_json::to_string(&jobs).unwrap_or_else(|_| "{}".into()),
    );
    jobs
}

pub fn set_all_jobs(storage: &mut impl Store, on: bool) -> BTreeMap<String, bool> {
    let jobs: BTreeMap<String, bool> = JOB_IDS.iter().map(|id| ((*id).to_string(), on)).collect();
    storage.set_item(
        SETTINGS_JOBS,
        &serde_json::to_string(&jobs).unwrap_or_else(|_| "{}".into()),
    );
    jobs
}

fn clamp_limit(key: &str, value: &Value, rules: &AlertRules) -> i64 {
    let fallback = match key {
        "lowBatteryPercent" => rules.low_battery_percent as i64,
        "quietMinutes" => rules.quiet_minutes,
        "stillMinutes" => rules.still_minutes,
        _ => return 0,
    };
    let Some(range) = limit_range(key) else {
        return fallback;
    };
    let n = match value {
        Value::Number(n) => n.as_f64().map(|v| v.round() as i64),
        Value::String(s) => s.parse::<f64>().ok().map(|v| v.round() as i64),
        _ => None,
    };
    let Some(n) = n else { return fallback };
    n.clamp(range.min, range.max)
}

pub fn read_rules(storage: &impl Store) -> AlertRules {
    let saved = read_json(storage, SETTINGS_LIMITS);
    let mut rules = ALERT_RULES.clone();
    for key in ["lowBatteryPercent", "quietMinutes", "stillMinutes"] {
        if let Some(value) = saved.get(key) {
            let n = clamp_limit(key, value, &rules);
            match key {
                "lowBatteryPercent" => rules.low_battery_percent = n as f64,
                "quietMinutes" => rules.quiet_minutes = n,
                "stillMinutes" => rules.still_minutes = n,
                _ => {}
            }
        }
    }
    rules
}

pub fn set_limit(storage: &mut impl Store, key: &str, value: &Value) -> AlertRules {
    if limit_range(key).is_none() {
        return read_rules(storage);
    }
    let mut saved = read_json(storage, SETTINGS_LIMITS);
    let next = clamp_limit(key, value, &ALERT_RULES);
    let default = match key {
        "lowBatteryPercent" => ALERT_RULES.low_battery_percent as i64,
        "quietMinutes" => ALERT_RULES.quiet_minutes,
        "stillMinutes" => ALERT_RULES.still_minutes,
        _ => next,
    };
    if let Some(obj) = saved.as_object_mut() {
        if next == default {
            obj.remove(key);
        } else {
            obj.insert(key.to_string(), json!(next));
        }
        storage.set_item(SETTINGS_LIMITS, &saved.to_string());
    }
    read_rules(storage)
}

pub fn minutes_label(minutes: i64) -> String {
    minutes_text(minutes)
}
