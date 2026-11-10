//! The jobs the demo runs on tracker data. Each can be turned off.

use std::collections::BTreeMap;

use crate::alerts::AlertRules;
use crate::settings::{read_jobs, JOB_IDS};
use crate::time::minutes_text;

pub const PULL_SECONDS: i64 = 120;

#[derive(Clone, Debug)]
pub struct Job {
    pub id: &'static str,
    pub name: String,
    pub detail: String,
    pub off: &'static str,
    pub kind: &'static str,
    pub plain: &'static str,
    pub phrase_group: Option<&'static str>,
    pub plural: bool,
}

pub fn jobs_for(rules: &AlertRules) -> Vec<Job> {
    vec![
        Job {
            id: "battery",
            name: format!(
                "Flags tracker batteries below {}%",
                rules.low_battery_percent as i64
            ),
            detail: "Trackers on outside power are skipped.".into(),
            off: "No battery alerts. Each animal still shows its battery.",
            kind: "safety",
            plain: "low batteries",
            phrase_group: None,
            plural: false,
        },
        Job {
            id: "quiet",
            name: "Flags trackers that stop reporting".into(),
            detail: format!(
                "An alert after {} with no check-in.",
                minutes_text(rules.quiet_minutes)
            ),
            off: "No quiet-tracker alerts. Each animal still shows its last check-in.",
            kind: "safety",
            plain: "quiet trackers",
            phrase_group: None,
            plural: false,
        },
        Job {
            id: "still",
            name: "Flags animals that stop moving".into(),
            detail: format!(
                "An alert after {} checking in near the same spot.",
                minutes_text(rules.still_minutes)
            ),
            off: "No not-moving alerts. Each animal still shows its last check-in.",
            kind: "safety",
            plain: "animals that stop moving",
            phrase_group: Some("moving"),
            plural: false,
        },
        Job {
            id: "paddock",
            name: "Flags animals outside the paddock".into(),
            detail: "An alert when a position falls outside the active paddock bounds.".into(),
            off: "No out-of-paddock alerts. Positions still show on the grid.",
            kind: "safety",
            plain: "leave the paddock",
            phrase_group: Some("moving"),
            plural: false,
        },
        Job {
            id: "sos",
            name: "Raises an alert when a tracker sends an SOS".into(),
            detail: "The alert names the animal.".into(),
            off: "No SOS alerts. An SOS still shows in the event list.",
            kind: "safety",
            plain: "SOS",
            phrase_group: None,
            plural: false,
        },
        Job {
            id: "predator",
            name: "Lists Predator Watch reports near the herd".into(),
            detail: "The sample day has one made-up report.".into(),
            off: "Reports stay in the event list, with no alert or grid marker.",
            kind: "safety",
            plain: "Predator Watch reports",
            phrase_group: None,
            plural: false,
        },
        Job {
            id: "smoke",
            name: "Lists Wildfire Watch smoke reports upwind".into(),
            detail: "The rancher map also shows public fire, smoke and air quality layers.".into(),
            off: "Reports stay in the event list, with no alert or haze.",
            kind: "safety",
            plain: "Wildfire Watch reports",
            phrase_group: None,
            plural: false,
        },
        Job {
            id: "trace",
            name: "Traces a fiber lot back to the goat".into(),
            detail: "Through the fleece and shearing records.".into(),
            off: "The trace page lists each record as entered, to follow by hand.",
            kind: "other",
            plain: "Fiber lot tracing",
            phrase_group: None,
            plural: false,
        },
    ]
}

pub fn pull_job() -> Job {
    Job {
        id: "pull",
        name: format!(
            "Checks for a new live file every {} minutes",
            PULL_SECONDS / 60
        ),
        detail: "Live data only. The pull script on your hardware runs only when you start it."
            .into(),
        off: "The herd view keeps the data it opened with. Use Check now to load a newer file.",
        kind: "other",
        plain: "live file checks",
        phrase_group: None,
        plural: true,
    }
}

pub const PLANNED: [&str; 4] = [
    "grazing records for each paddock",
    "learning each tracker's normal check-in pattern",
    "tuning the alert rules from rancher answers",
    "sharing a confirmed predator report with nearby ranchers",
];

pub fn alert_job_list(rules: &AlertRules) -> Vec<Job> {
    let mut jobs = jobs_for(rules);
    jobs.push(pull_job());
    jobs
}

fn join_or(items: &[String]) -> String {
    match items.len() {
        0 => String::new(),
        1 => items[0].clone(),
        2 => format!("{} or {}", items[0], items[1]),
        n => format!("{} or {}", items[..n - 1].join(", "), items[n - 1]),
    }
}

fn notice_clauses(jobs: &[Job]) -> Vec<String> {
    let mut clauses: Vec<(String, Vec<String>)> = Vec::new();
    for job in jobs {
        let group = job.phrase_group.unwrap_or("");
        if !group.is_empty() {
            if let Some(prev) = clauses.last_mut() {
                if prev.0 == group {
                    prev.1.push(job.plain.to_string());
                    continue;
                }
            }
        }
        clauses.push((group.to_string(), vec![job.plain.to_string()]));
    }
    clauses
        .into_iter()
        .map(|(_, parts)| parts.join(" or "))
        .collect()
}

fn paused_sentence(jobs: &[Job]) -> String {
    if jobs.is_empty() {
        return String::new();
    }
    let texts = notice_clauses(jobs);
    let list = match texts.len() {
        0 => String::new(),
        1 => texts[0].clone(),
        2 => format!("{} and {}", texts[0], texts[1]),
        n => format!("{} and {}", texts[..n - 1].join(", "), texts[n - 1]),
    };
    let mut sentence = list;
    if let Some(first) = sentence.chars().next() {
        sentence.replace_range(..first.len_utf8(), &first.to_uppercase().to_string());
    }
    let plural = jobs.len() > 1 || jobs[0].plural;
    format!(
        "{sentence} {}",
        if plural {
            "are paused too."
        } else {
            "is paused too."
        }
    )
}

pub fn alerts_off_notice_text(state: &BTreeMap<String, bool>, rules: &AlertRules) -> String {
    let defs = alert_job_list(rules);
    let safety: Vec<Job> = defs
        .iter()
        .filter(|j| j.kind == "safety")
        .cloned()
        .collect();
    let other: Vec<Job> = defs
        .iter()
        .filter(|j| j.kind == "other" && state.get(j.id) == Some(&false))
        .cloned()
        .collect();
    let mut sentences = vec![format!(
        "Automatic alerts are off. FiberShare will not flag {} until you turn them back on.",
        join_or(&notice_clauses(&safety))
    )];
    if !other.is_empty() {
        sentences.push(paused_sentence(&other));
    }
    sentences.push("FiberShare is an aid, not a guarantee. In an emergency, call 911.".into());
    sentences.join(" ")
}

pub fn alert_jobs_are_off(jobs: &BTreeMap<String, bool>, rules: &AlertRules) -> bool {
    alert_job_list(rules)
        .iter()
        .filter(|j| j.kind == "safety")
        .all(|j| jobs.get(j.id) == Some(&false))
}

pub fn alerts_off_notice_html(jobs: &BTreeMap<String, bool>, rules: &AlertRules) -> String {
    let off = alert_jobs_are_off(jobs, rules);
    format!(
        "<p class=\"notice notice-warn alerts-off\" data-alerts-off role=\"status\"{}>{}</p>",
        if off { "" } else { " hidden" },
        if off {
            alerts_off_notice_text(jobs, rules)
        } else {
            String::new()
        }
    )
}

pub struct NoticeEl {
    pub hidden: bool,
    pub text: String,
}

pub fn paint_alerts_off_notice(
    el: Option<&mut NoticeEl>,
    jobs: &BTreeMap<String, bool>,
    rules: &AlertRules,
) {
    let Some(el) = el else { return };
    let off = alert_jobs_are_off(jobs, rules);
    el.hidden = !off;
    el.text = if off {
        alerts_off_notice_text(jobs, rules)
    } else {
        String::new()
    };
}

fn label(id: &str, rules: &AlertRules) -> String {
    match id {
        "battery" => format!("battery below {}%", rules.low_battery_percent as i64),
        "quiet" => format!("no check-in for {}", minutes_text(rules.quiet_minutes)),
        "still" => format!("not moving for {}", minutes_text(rules.still_minutes)),
        "paddock" => "outside the paddock".into(),
        "sos" => "SOS".into(),
        "predator" => "Predator Watch".into(),
        "smoke" => "Wildfire Watch".into(),
        _ => id.into(),
    }
}

fn off_label(id: &str) -> String {
    match id {
        "battery" => "battery".into(),
        "quiet" => "quiet tracker".into(),
        "still" => "not moving".into(),
        "paddock" => "out of paddock".into(),
        "sos" => "SOS".into(),
        "predator" => "Predator Watch".into(),
        "smoke" => "Wildfire Watch".into(),
        other => other.to_string(),
    }
}

pub fn jobs_line(jobs: &BTreeMap<String, bool>, rules: &AlertRules) -> String {
    let ids = [
        "battery", "quiet", "still", "paddock", "sos", "predator", "smoke",
    ];
    if alert_jobs_are_off(jobs, rules) {
        return "Add alerts by hand below.".into();
    }
    let on: Vec<String> = ids
        .iter()
        .filter(|id| jobs.get(**id).copied().unwrap_or(true))
        .map(|id| label(id, rules))
        .collect();
    let off: Vec<String> = ids
        .iter()
        .filter(|id| !jobs.get(**id).copied().unwrap_or(true))
        .map(|id| off_label(id))
        .collect();
    let mut line = format!("Automatic alerts on: {}.", on.join(", "));
    if !off.is_empty() {
        line.push_str(&format!(" Off: {}.", off.join(", ")));
    }
    line
}

pub fn all_off() -> BTreeMap<String, bool> {
    JOB_IDS
        .iter()
        .map(|id| ((*id).to_string(), false))
        .collect()
}

pub fn default_on(storage: &impl crate::settings::Store) -> BTreeMap<String, bool> {
    read_jobs(storage)
}
