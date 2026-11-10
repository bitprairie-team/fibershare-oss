//! Herd view: paddock, the sample day, alerts, ledger, and the phone sheet.
//! The first paint works with no JavaScript. The WASM island redraws it.
//!
//! Page copy lives in the constants below.

use std::collections::BTreeMap;

use fibershare_core::alerts::{compute_alerts, split_alerts, ALERT_RULES};
use fibershare_core::grid::{cell_labels, cell_of, spread_pins};
use fibershare_core::herd::{grazing_log, key_moments, position_trail, sort_events, state_at};
use fibershare_core::jobs::{alerts_off_notice_html, jobs_line};
use fibershare_core::log::{describe_log_entry, entries_for, last_checked};
use fibershare_core::settings::{read_jobs, MemoryStore, Store, SETTINGS_JOBS};
use fibershare_core::time::{ago, date_time, day_time, parse_ms, time_of};
use serde_json::{json, Value};

use crate::document::{esc, esc_attr};
use crate::layout::{footer, nav, q, BODY, HEAD, LEDE, MAIN, SECTION, SECTION_TITLE};

const SAMPLE_NOW: &str = "2026-09-06T18:05:00";
const TRAIL_LIMIT: usize = 5;
const HERD_LEDE: &str = "Eight sample goats on a paddock drawing, not a map. Check batteries, last check-ins, and open alerts.";
const RUN_DAY: &str = "Run the sample day";
const SAMPLE_NOTE: &str =
    "Sample day. Predator Watch and Wildfire Watch reports here are simulated.";
const TOUR_LABEL: &str = "Tour this page";

fn herd_json() -> Value {
    serde_json::from_str(include_str!("../../../public/data/herd.json")).unwrap_or(json!({}))
}
fn events_json() -> Value {
    serde_json::from_str(include_str!("../../../public/data/events.json")).unwrap_or(json!({}))
}

fn animals_of(herd: &Value) -> Vec<Value> {
    herd.get("goats")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}
fn events_of() -> Vec<Value> {
    let day = events_json();
    sort_events(
        day.get("events")
            .and_then(Value::as_array)
            .unwrap_or(&Vec::new()),
    )
}

struct View {
    step: usize,
    selected: String,
    sheet: bool,
    events: Vec<Value>,
    animals: Vec<Value>,
    jobs: BTreeMap<String, bool>,
    log: Vec<Value>,
}

fn view_from(query: &str) -> View {
    let herd = herd_json();
    let events = events_of();
    let animals = animals_of(&herd);
    let mut step = q(query, "step")
        .and_then(|s| s.parse().ok())
        .unwrap_or(events.len())
        .min(events.len());
    if q(query, "moment").as_deref() == Some("end") {
        step = events.len();
    } else if let Some(moment) = q(query, "moment") {
        if let Some(found) = key_moments(&events)
            .into_iter()
            .find(|item| item.id == moment)
        {
            step = found.step.min(events.len());
        }
    }
    let selected = q(query, "animal")
        .filter(|id| {
            animals
                .iter()
                .any(|a| a.get("id").and_then(Value::as_str) == Some(id))
        })
        .unwrap_or_else(|| "bramble".into());
    View {
        step,
        selected,
        sheet: q(query, "sheet").as_deref() == Some("1"),
        events,
        animals,
        jobs: read_jobs(&fibershare_core::settings::MemoryStore::default()),
        log: Vec::new(),
    }
}

fn clock(view: &View) -> String {
    if view.step >= view.events.len() {
        return SAMPLE_NOW.to_string();
    }
    view.events
        .get(view.step.saturating_sub(1))
        .and_then(|e| e.get("time").and_then(Value::as_str))
        .unwrap_or(SAMPLE_NOW)
        .to_string()
}

fn initials(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|w| w.chars().next())
        .take(2)
        .collect::<String>()
        .to_uppercase()
}

fn kind_label(kind: &str) -> &'static str {
    match kind {
        "battery" => "Battery",
        "quiet" => "Quiet tracker",
        "still" => "Not moving",
        "paddock" => "Out of paddock",
        "sos" => "SOS",
        "predator" => "Predator Watch",
        "smoke" => "Wildfire Watch",
        "manual" => "Added by hand",
        _ => "Alert",
    }
}

pub fn herd_page(query: &str) -> String {
    let view = view_from(query);
    let data = serde_json::to_string(&json!({
        "animals": view.animals,
        "events": view.events,
        "uplinksStart": herd_json().get("uplinksStart"),
        "now": SAMPLE_NOW,
        "ranch": herd_json().get("ranch").and_then(Value::as_str).unwrap_or("Sample herd"),
    }))
    .unwrap_or_else(|_| "{}".into());
    format!(
        r#"{nav}<main class="herd-page {main}" id="main">
<section class="{head} flex flex-wrap items-end justify-between gap-x-10 gap-y-4"><div class="min-w-0 flex-[1_1_32rem]">
<h1>{ranch}</h1>
<p class="{lede}">{lede_text}</p>
<p class="mt-4"><button type="button" class="btn-link" data-tour-start>{tour}</button></p>
</div></section>
<div id="herd-dynamic" data-step="{step}" data-selected="{selected}" data-sheet="{sheet}">{dynamic}</div>
</main>{footer}
<script type="application/json" id="herd-data">{data}</script>"#,
        nav = nav("/map"),
        main = MAIN,
        head = HEAD,
        ranch = esc(herd_json()
            .get("ranch")
            .and_then(Value::as_str)
            .unwrap_or("Sample herd")),
        lede = LEDE,
        lede_text = HERD_LEDE,
        tour = TOUR_LABEL,
        step = view.step,
        selected = esc_attr(&view.selected),
        sheet = if view.sheet { "1" } else { "0" },
        dynamic = herd_dynamic_view(&view),
        footer = footer(),
        data = data.replace('<', "\\u003c"),
    )
}

/// HTML for the part of the herd view the browser island swaps in.
/// `body` is JSON: step, animal, sheet, log, jobs.
pub fn herd_view_html(body: &str) -> String {
    let value: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let step = value.get("step").and_then(Value::as_u64).unwrap_or(0) as usize;
    let animal = value
        .get("animal")
        .and_then(Value::as_str)
        .unwrap_or("bramble");
    let sheet = value.get("sheet").and_then(Value::as_bool).unwrap_or(false);
    let log = value
        .get("log")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut store = MemoryStore::default();
    if let Some(jobs) = value.get("jobs").filter(|v| v.is_object()) {
        store.set_item(SETTINGS_JOBS, &jobs.to_string());
    }
    let jobs = read_jobs(&store);
    herd_dynamic(step, animal, sheet, &log, &jobs)
}

pub fn herd_dynamic(
    step: usize,
    selected: &str,
    sheet: bool,
    log: &[Value],
    jobs: &BTreeMap<String, bool>,
) -> String {
    let mut view = view_from("");
    view.step = step.min(view.events.len());
    if view
        .animals
        .iter()
        .any(|a| a.get("id").and_then(Value::as_str) == Some(selected))
    {
        view.selected = selected.to_string();
    }
    view.sheet = sheet;
    view.log = log.to_vec();
    view.jobs = jobs.clone();
    herd_dynamic_view(&view)
}

fn herd_dynamic_view(view: &View) -> String {
    let now = clock(view);
    let now_ms = parse_ms(&now).unwrap_or(0);
    let state = state_at(
        &view.animals,
        &view.events,
        view.step,
        herd_json().get("uplinksStart").and_then(Value::as_str),
        Some(&now),
    );
    let all = compute_alerts(
        &state.animals,
        &state.shown,
        &now,
        &ALERT_RULES,
        Some(&view.jobs),
        &view.log,
    );
    let (open, history) = split_alerts(&all, &[]);
    let cells = cell_labels()
        .into_iter()
        .map(|label| {
            let alert = if view.jobs.get("predator").copied().unwrap_or(true)
                && state.alert_cells.iter().any(|c| c == &label)
            {
                " is-alert"
            } else {
                ""
            };
            format!("<div class=\"cell{alert}\" data-cell=\"{label}\"><span>{label}</span></div>")
        })
        .collect::<String>();
    let points: Vec<(String, f64, f64)> = state
        .animals
        .iter()
        .filter_map(|a| {
            Some((
                a.get("id")?.as_str()?.to_string(),
                a.get("x").and_then(Value::as_f64)?,
                a.get("y").and_then(Value::as_f64)?,
            ))
        })
        .collect();
    let drawn = spread_pins(&points, 800.0, 520.0, 34.0, 12);
    let pins = state
        .animals
        .iter()
        .map(|animal| {
            let id = animal.get("id").and_then(Value::as_str).unwrap_or("");
            let name = animal.get("name").and_then(Value::as_str).unwrap_or(id);
            let at = drawn.iter().find(|p| p.0 == id).map(|p| (p.1, p.2)).unwrap_or((
                animal.get("x").and_then(Value::as_f64).unwrap_or(50.0),
                animal.get("y").and_then(Value::as_f64).unwrap_or(50.0),
            ));
            let mine: Vec<&Value> = open.iter().filter(|a| a.get("animalId").and_then(Value::as_str) == Some(id)).collect();
            let mut class = String::from("goat");
            if id == view.selected {
                class.push_str(" is-active");
            }
            if mine.iter().any(|a| a.get("kind").and_then(Value::as_str) == Some("battery")) {
                class.push_str(" is-low");
            }
            if animal.get("silent").and_then(Value::as_bool).unwrap_or(false) || mine.iter().any(|a| a.get("kind").and_then(Value::as_str) == Some("quiet")) {
                class.push_str(" is-silent");
            }
            if mine.iter().any(|a| a.get("kind").and_then(Value::as_str) == Some("still")) {
                class.push_str(" is-still");
            }
            if mine.iter().any(|a| a.get("kind").and_then(Value::as_str) == Some("paddock")) {
                class.push_str(" is-outside");
            }
            if !mine.is_empty() {
                class.push_str(" has-alert");
            }
            let tab = if id == view.selected { "0" } else { "-1" };
            let open_names = mine.iter().filter_map(|a| a.get("kind").and_then(Value::as_str).map(kind_label)).collect::<Vec<_>>().join(", ");
            let label = if open_names.is_empty() {
                format!("{name}, cell {}", cell_of(at.0, at.1))
            } else {
                format!("{name}, cell {}, open alert: {}", cell_of(at.0, at.1), open_names.to_lowercase())
            };
            format!(
                "<button type=\"button\" class=\"{class}\" data-id=\"{id}\" style=\"left:{:.2}%;top:{:.2}%\" aria-pressed=\"{}\" tabindex=\"{tab}\" title=\"{}\"><span class=\"goat-short\" aria-hidden=\"true\">{}</span><span class=\"goat-full\" aria-hidden=\"true\">{}</span><span class=\"sr-only\" data-pin-label>{}</span></button>",
                at.0,
                at.1,
                id == view.selected,
                esc_attr(name),
                esc(&initials(name)),
                esc(name),
                esc(&label),
            )
        })
        .collect::<String>();
    let trail = trail_svg(view, &drawn);
    let haze_hidden = if view.jobs.get("smoke").copied().unwrap_or(true) && state.smoke {
        ""
    } else {
        " hidden"
    };
    let clock = time_of(&now);
    let grazing = grazing_html(view);
    let detail = detail_html(view, &state.animals, &open, &now, now_ms);
    let alerts = alerts_html(view, &open, &history);
    let ledger = ledger_html(view, &state.animals, &open, now_ms);
    let feed = feed_html(&state.shown, &view.animals);
    format!(
        r#"<div class="herd-layout">
<div class="herd-main" data-tour="grid">
<div class="paddock-wrap"><div class="paddock-banner" data-banner hidden></div>
<div class="paddock" id="paddock" role="group" aria-label="Paddock grid, 6 by 4 cells. Arrow keys move between animals, Enter shows one.">
<div class="paddock-cells" aria-hidden="true">{cells}</div>
<div class="paddock-haze" data-haze{haze}></div>
{trail}
<div data-pins>{pins}</div>
</div></div>
<div class="playback">
<button type="button" class="btn btn-ghost btn-small" data-play>{run}</button>
<label class="sr-only" for="scrub">Time of day</label>
<input id="scrub" type="range" min="0" max="{max}" value="{step}" data-scrub aria-valuetext="{clock}, event {step} of {max}" />
<output class="clock" for="scrub" data-clock>{clock}</output>
</div>
<p class="muted sample-note">{sample}</p>
{grazing}
</div>
{detail}
</div>
{alerts}
{ledger}
<section class="{section}" aria-labelledby="feed-title">
<h2 class="{title}" id="feed-title">Event log</h2>
<div class="{body}">
<details class="disclosure feed-section" data-tour="feed"><summary>Show all events ({count})</summary>
<ol class="feed" data-feed>{feed}</ol></details></div></section>"#,
        cells = cells,
        haze = haze_hidden,
        trail = trail,
        pins = pins,
        max = view.events.len(),
        step = view.step,
        clock = esc(&clock),
        run = RUN_DAY,
        sample = SAMPLE_NOTE,
        grazing = grazing,
        detail = detail,
        alerts = alerts,
        ledger = ledger,
        section = SECTION,
        title = SECTION_TITLE,
        body = BODY,
        count = view.events.len(),
        feed = feed,
    )
}

fn trail_svg(view: &View, drawn: &[(String, f64, f64)]) -> String {
    let mut points = position_trail(&view.events, &view.selected, view.step, TRAIL_LIMIT);
    if let Some(last) = points.last_mut() {
        if let Some(pin) = drawn.iter().find(|p| p.0 == view.selected) {
            last["x"] = json!(pin.1);
            last["y"] = json!(pin.2);
        }
    }
    if points.len() < 2 {
        return r#"<svg class="trail-layer" data-trail aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>"#.into();
    }
    let path = points
        .iter()
        .enumerate()
        .map(|(i, pt)| {
            let cmd = if i == 0 { "M" } else { "L" };
            format!(
                "{cmd}{:.2} {:.2}",
                pt["x"].as_f64().unwrap_or(0.0),
                pt["y"].as_f64().unwrap_or(0.0)
            )
        })
        .collect::<String>();
    let dots = points
        .iter()
        .enumerate()
        .map(|(i, pt)| {
            let opacity = 0.35 + (0.65 * (i + 1) as f64) / points.len() as f64;
            let at = format!("{:.2} {:.2}", pt["x"].as_f64().unwrap_or(0.0), pt["y"].as_f64().unwrap_or(0.0));
            format!("<path class=\"trail-dot\" d=\"M{at} L{at}\" vector-effect=\"non-scaling-stroke\" style=\"opacity:{opacity:.2}\" />")
        })
        .collect::<String>();
    format!(
        r#"<svg class="trail-layer" data-trail aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><path class="trail-line" d="{path}" fill="none" vector-effect="non-scaling-stroke" />{dots}</svg>"#
    )
}

fn grazing_html(view: &View) -> String {
    let entries = grazing_log(&view.events, view.step);
    let items: String = if entries.is_empty() {
        "<li class=\"feed-empty\">No paddock moves yet at this time of day.</li>".into()
    } else {
        entries
            .iter()
            .rev()
            .map(|entry| {
                let label = match entry.get("type").and_then(Value::as_str) {
                    Some("move") => "Paddock move",
                    Some("graze") => "Grazing",
                    other => other.unwrap_or(""),
                };
                let cell = entry.get("cell").and_then(Value::as_str).map(|c| format!(" · {c}")).unwrap_or_default();
                let when = entry.get("time").and_then(Value::as_str).unwrap_or("");
                format!(
                    "<li class=\"grazing-item\"><div class=\"feed-row\"><time datetime=\"{when}\">{}</time><span class=\"feed-text\"><span class=\"feed-type\">{}{}</span><span class=\"feed-body\">{}</span></span></div></li>",
                    esc(&time_of(when)),
                    esc(label),
                    esc(&cell),
                    esc(entry.get("text").and_then(Value::as_str).unwrap_or(""))
                )
            })
            .collect()
    };
    format!(
        r#"<section class="grazing-log" data-grazing-log aria-labelledby="grazing-title">
<h2 class="grazing-title" id="grazing-title">Paddock moves</h2>
<p class="muted grazing-note">Paddock moves for this sample day.</p>
<ol class="grazing-list" data-grazing-list tabindex="0" aria-labelledby="grazing-title">{items}</ol>
</section>"#
    )
}

fn detail_html(view: &View, animals: &[Value], open: &[Value], now: &str, now_ms: i64) -> String {
    let animal = animals
        .iter()
        .find(|a| a.get("id").and_then(Value::as_str) == Some(view.selected.as_str()));
    let (name, body, meta) = if let Some(animal) = animal {
        let name = animal.get("name").and_then(Value::as_str).unwrap_or("");
        let battery = animal.get("battery").and_then(Value::as_f64);
        let battery_text = battery
            .map(|n| format!("{}%", n.round() as i64))
            .unwrap_or_else(|| "not reported".into());
        let seen = animal.get("lastSeen").and_then(Value::as_str).unwrap_or("");
        let meta = format!(
            "Battery {battery_text} · {}",
            if seen.is_empty() {
                "not seen yet".into()
            } else {
                format!("seen {}", ago(Some(seen), now, "not yet"))
            }
        );
        let checked = last_checked(&view.log, &view.selected);
        let notes = entries_for(&view.log, &view.selected)
            .into_iter()
            .take(5)
            .map(|e| {
                format!(
                    "<li><time datetime=\"{}\">{}</time> {}</li>",
                    esc_attr(e.get("at").and_then(Value::as_str).unwrap_or("")),
                    esc(&date_time(
                        e.get("at").and_then(Value::as_str).unwrap_or("")
                    )),
                    esc(&describe_log_entry(&e))
                )
            })
            .collect::<String>();
        let mine = open
            .iter()
            .filter(|a| a.get("animalId").and_then(Value::as_str) == Some(view.selected.as_str()))
            .collect::<Vec<_>>();
        let alerts = if mine.is_empty() {
            "<span class=\"muted\">none open</span>".into()
        } else {
            mine.iter()
                .filter_map(|a| a.get("kind").and_then(Value::as_str).map(kind_label))
                .collect::<Vec<_>>()
                .join(", ")
        };
        let facts = format!(
            "<dl class=\"facts\"><dt>Breed</dt><dd>{}</dd><dt>Battery</dt><dd>{}</dd><dt>Last check-in</dt><dd>{}</dd><dt>Checked by hand</dt><dd>{}</dd><dt>Grid cell</dt><dd>{}</dd><dt>Alerts</dt><dd>{}</dd></dl>",
            esc(animal.get("breed").and_then(Value::as_str).unwrap_or("")),
            esc(&battery_text),
            if seen.is_empty() { "<span class=\"muted\">not yet</span>".into() } else { esc(&day_time(seen, now_ms)) },
            checked.as_deref().map(|t| esc(&date_time(t))).unwrap_or_else(|| "<span class=\"muted\">not yet</span>".into()),
            esc(&cell_of(animal.get("x").and_then(Value::as_f64).unwrap_or(0.0), animal.get("y").and_then(Value::as_f64).unwrap_or(0.0))),
            alerts,
        );
        let log = format!(
            r#"<form class="note-form" data-note-form><label class="note-label" for="note-text">Note on {name}</label>
<input id="note-text" class="alert-note" type="text" maxlength="280" autocomplete="off" placeholder="What you saw" data-note-text />
<div class="note-actions"><button type="submit" class="btn btn-ghost btn-small">Save note</button>
<button type="button" class="btn btn-ghost btn-small" data-mark-checked>Mark checked</button></div></form>
<ol class="note-list">{notes}</ol>"#,
            name = esc(name),
            notes = notes,
        );
        (
            name.to_string(),
            format!("<div data-detail-facts><div class=\"detail-top\"><span class=\"avatar\" aria-hidden=\"true\">{}</span><div><h2>{}</h2></div></div>{facts}<p class=\"detail-link\"><a href=\"/trace\">Trace {}'s fleece</a></p></div><div class=\"detail-log\" data-detail-log>{log}</div>", esc(&initials(name)), esc(name), esc(name)),
            meta,
        )
    } else {
        (
            "Pick an animal".into(),
            "<p class=\"muted\">Pick an animal on the grid or in the list.</p>".into(),
            String::new(),
        )
    };
    let open_class = if view.sheet { " is-open" } else { "" };
    format!(
        r#"<aside class="detail{open}" data-detail data-tour="detail" aria-label="Animal details">
<div class="sheet-handle">
<button type="button" data-sheet aria-expanded="{expanded}" aria-controls="animal-detail"><span class="avatar" data-sheet-avatar>{initials}</span><span class="sheet-title"><strong data-sheet-name>{name}</strong><small data-sheet-meta>{meta}</small></span></button>
<button type="button" class="sheet-close" data-sheet-close>Close</button></div>
<div class="detail-body" id="animal-detail" data-detail-body aria-live="polite">{body}</div></aside>"#,
        open = open_class,
        expanded = view.sheet,
        initials = esc(&initials(&name)),
        name = esc(&name),
        meta = esc(&meta),
        body = body,
    )
}

fn alerts_html(view: &View, open: &[Value], history: &[Value]) -> String {
    let rows = [
        (
            "battery",
            "Battery alerts",
            Some("lowBatteryPercent"),
            "Below",
            "%",
        ),
        (
            "quiet",
            "Quiet-tracker alerts",
            Some("quietMinutes"),
            "After",
            "minutes with no check-in",
        ),
        (
            "still",
            "Not-moving alerts",
            Some("stillMinutes"),
            "After",
            "minutes near the same spot",
        ),
        ("paddock", "Out-of-paddock alerts", None, "", ""),
        ("sos", "SOS alerts", None, "", ""),
        ("predator", "Predator Watch reports", None, "", ""),
        ("smoke", "Wildfire Watch reports", None, "", ""),
    ];
    let settings = rows
        .iter()
        .map(|(id, label, limit, before, after)| {
            let on = view.jobs.get(*id).copied().unwrap_or(true);
            let limit_html = if let Some(key) = limit {
                let value = match *key {
                    "lowBatteryPercent" => ALERT_RULES.low_battery_percent as i64,
                    "quietMinutes" => ALERT_RULES.quiet_minutes,
                    _ => ALERT_RULES.still_minutes,
                };
                format!("<label class=\"limit\">{before} <input type=\"number\" inputmode=\"numeric\" data-limit=\"{key}\" value=\"{value}\" /> {after}</label>")
            } else {
                String::new()
            };
            format!(
                "<li class=\"setting-row\"><label class=\"toggle\"><input type=\"checkbox\" data-job=\"{id}\"{} /> {label}</label><span class=\"job-state\" data-job-state=\"{id}\">{}</span>{limit_html}</li>",
                if on { " checked" } else { "" },
                if on { "On" } else { "Off" }
            )
        })
        .collect::<String>();
    let items = open
        .iter()
        .map(|alert| {
            let id = alert.get("id").and_then(Value::as_str).unwrap_or("");
            let kind = alert.get("kind").and_then(Value::as_str).unwrap_or("");
            let title_id = format!("title-{}", id.replace(|c: char| !c.is_ascii_alphanumeric(), "-"));
            let why = if alert.get("manual").and_then(Value::as_bool).unwrap_or(false) {
                String::new()
            } else {
                format!("<p class=\"alert-why\">{}</p>", esc(alert.get("why").and_then(Value::as_str).unwrap_or("")))
            };
            let when = if alert.get("manual").and_then(Value::as_bool).unwrap_or(false) {
                esc(&date_time(alert.get("time").and_then(Value::as_str).unwrap_or("")))
            } else {
                format!("rules checked <time datetime=\"{}\">{}</time>", esc_attr(alert.get("ranAt").and_then(Value::as_str).unwrap_or("")), esc(&time_of(alert.get("ranAt").and_then(Value::as_str).unwrap_or(""))))
            };
            let limit = match kind {
                "battery" => " · <button type=\"button\" class=\"btn-link\" data-change-limit=\"lowBatteryPercent\">Change limit</button>",
                "quiet" => " · <button type=\"button\" class=\"btn-link\" data-change-limit=\"quietMinutes\">Change limit</button>",
                "still" => " · <button type=\"button\" class=\"btn-link\" data-change-limit=\"stillMinutes\">Change limit</button>",
                _ => "",
            };
            format!(
                "<li class=\"alert-item kind-{kind}\" data-alert=\"{id}\"><div class=\"alert-body\"><p class=\"alert-title\" id=\"{title_id}\"><strong>{}</strong></p>{why}<p class=\"row-meta\">{when}{limit}</p><div class=\"alert-answer\"><button type=\"button\" class=\"btn btn-ghost btn-small\" data-answer=\"confirmed\" aria-describedby=\"{title_id}\">Confirm</button><button type=\"button\" class=\"btn btn-ghost btn-small\" data-answer=\"dismissed\" aria-describedby=\"{title_id}\">Dismiss</button></div></div></li>",
                esc(alert.get("title").and_then(Value::as_str).unwrap_or(""))
            )
        })
        .collect::<String>();
    let options = view
        .animals
        .iter()
        .filter_map(|a| {
            let id = a.get("id")?.as_str()?;
            let name = a.get("name").and_then(Value::as_str).unwrap_or(id);
            Some(format!("<option value=\"{id}\">{}</option>", esc(name)))
        })
        .collect::<String>();
    format!(
        r##"<section class="{section}" data-tour="alerts" aria-labelledby="alerts-title">
<h2 class="{title}" id="alerts-title">Open alerts ({count})</h2>
<div class="{body}">
<p class="jobs-line"><span data-jobs-line>{line}</span> <a href="#alert-settings">Change settings</a></p>
{notice}
<p class="sr-only" data-alert-status role="status"></p>
<div data-alerts>
<ol class="alert-list" data-alert-open>{items}</ol>
<details class="disclosure settings" data-settings id="alert-settings"><summary>Alert settings</summary>
<ul class="settings-list">{settings}</ul>
<form class="add-alert" data-add-alert>
<p class="add-alert-title" id="add-alert-title">Add an alert by hand</p>
<div class="alert-answer">
<label class="sr-only" for="add-alert-animal">Animal</label>
<select id="add-alert-animal" data-add-animal><option value="">No animal</option>{options}</select>
<label class="sr-only" for="add-alert-text">What needs attention</label>
<input id="add-alert-text" class="alert-note" type="text" maxlength="280" data-add-text />
<button type="submit" class="btn btn-ghost btn-small" aria-describedby="add-alert-title">Add alert</button>
</div></form>
</details>
<details class="disclosure" data-history-box><summary>Answered alerts ({history})</summary>
<ol class="alert-list alert-history" data-alert-history></ol></details>
</div></div></section>"##,
        section = SECTION,
        title = SECTION_TITLE,
        body = BODY,
        count = open.len(),
        line = esc(&jobs_line(&view.jobs, &ALERT_RULES)),
        notice = alerts_off_notice_html(&view.jobs, &ALERT_RULES),
        settings = settings,
        items = items,
        options = options,
        history = history.len(),
    )
}

fn ledger_html(view: &View, animals: &[Value], open: &[Value], now_ms: i64) -> String {
    let rows = animals
        .iter()
        .map(|animal| {
            let id = animal.get("id").and_then(Value::as_str).unwrap_or("");
            let name = animal.get("name").and_then(Value::as_str).unwrap_or(id);
            let pct = animal.get("battery").and_then(Value::as_f64).map(|n| n.round() as i64);
            let low = pct.is_some_and(|n| (n as f64) < ALERT_RULES.low_battery_percent);
            let seen = animal.get("lastSeen").and_then(Value::as_str).unwrap_or("");
            let checked = last_checked(&view.log, id);
            let alerts = open
                .iter()
                .filter(|a| a.get("animalId").and_then(Value::as_str) == Some(id))
                .filter_map(|a| a.get("kind").and_then(Value::as_str).map(kind_label))
                .collect::<Vec<_>>()
                .join(", ");
            let current = if id == view.selected { " aria-current=\"true\"" } else { "" };
            format!(
                "<tr{current}><th scope=\"row\"><button type=\"button\" class=\"btn-link\" data-row-animal=\"{id}\">{}</button></th><td class=\"max-sm:hidden\">{}</td><td class=\"num{}\">{}</td><td class=\"num\">{}</td><td class=\"max-sm:hidden\">{}</td><td>{}</td></tr>",
                esc(name),
                esc(&cell_of(animal.get("x").and_then(Value::as_f64).unwrap_or(0.0), animal.get("y").and_then(Value::as_f64).unwrap_or(0.0))),
                if low { " is-warn" } else { "" },
                pct.map(|n| format!("{n}%")).unwrap_or_else(|| "<span class=\"muted\">none</span>".into()),
                if seen.is_empty() { "<span class=\"muted\">not yet</span>".into() } else { esc(&day_time(seen, now_ms)) },
                checked.as_deref().map(|t| esc(&date_time(t))).unwrap_or_else(|| "<span class=\"muted\">not yet</span>".into()),
                if alerts.is_empty() { "<span class=\"muted\">none</span>".into() } else { esc(&alerts) },
            )
        })
        .collect::<String>();
    format!(
        r#"<section class="{section}" aria-labelledby="ledger-title">
<h2 class="{title}" id="ledger-title">All animals</h2>
<div class="{body} overflow-x-auto" data-tour="ledger"><table class="data-table herd-ledger">
<caption class="sr-only">Every animal, with battery and last check-in at the time shown</caption>
<thead><tr><th scope="col">Animal</th><th scope="col" class="max-sm:hidden">Cell</th><th scope="col" class="num">Battery</th><th scope="col" class="num">Last check-in</th><th scope="col" class="max-sm:hidden">Checked by hand</th><th scope="col">Open alerts</th></tr></thead>
<tbody data-ledger>{rows}</tbody></table></div></section>"#,
        section = SECTION,
        title = SECTION_TITLE,
        body = BODY,
        rows = rows,
    )
}

fn feed_html(shown: &[Value], animals: &[Value]) -> String {
    if shown.is_empty() {
        return "<li class=\"feed-empty\">No events yet at this time of day.</li>".into();
    }
    shown
        .iter()
        .rev()
        .map(|event| {
            let when = event.get("time").and_then(Value::as_str).unwrap_or("");
            let kind = event.get("type").and_then(Value::as_str).unwrap_or("");
            let who = event.get("animalId").and_then(Value::as_str).and_then(|id| animals.iter().find(|a| a.get("id").and_then(Value::as_str) == Some(id)).and_then(|a| a.get("name").and_then(Value::as_str)));
            let who = who.map(|n| format!(" · {}", esc(n))).unwrap_or_default();
            format!(
                "<li class=\"feed-item\"><div class=\"feed-row\"><time datetime=\"{when}\">{}</time><span class=\"feed-text\"><span class=\"feed-type\">{kind}{who}</span><span class=\"feed-body\">{}</span></span></div></li>",
                esc(&time_of(when)),
                esc(event.get("text").and_then(Value::as_str).unwrap_or(""))
            )
        })
        .collect()
}
