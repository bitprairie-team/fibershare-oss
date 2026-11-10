//! Theme, menu, tour, and the herd Play control.

use std::collections::BTreeMap;

use fibershare_core::log::browser_add;
use fibershare_core::settings::{read_jobs, set_all_jobs, MemoryStore, Store};
use fibershare_html::herd_dynamic;
use serde_json::Value;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{window, Event, HtmlElement, HtmlInputElement};

fn doc() -> web_sys::Document {
    window().unwrap().document().unwrap()
}

pub fn boot() {
    bind_theme();
    bind_nav();
    bind_tour();
    if doc().get_element_by_id("herd-data").is_some() {
        bind_herd();
    }
    bind_jobs();
    bind_trace();
    bind_sign_in();
}

fn bind_theme() {
    let document = doc();
    let Some(button) = document
        .query_selector("[data-theme-toggle]")
        .ok()
        .flatten()
    else {
        return;
    };
    let button: HtmlElement = button.dyn_into().unwrap();
    let closure = Closure::<dyn FnMut()>::new(move || {
        let root = doc().document_element().unwrap();
        let next = if root.get_attribute("data-theme").as_deref() == Some("dark") {
            "light"
        } else {
            "dark"
        };
        root.set_attribute("data-theme", next).ok();
        root.set_attribute("style", &format!("color-scheme: {next}"))
            .ok();
        if let Some(meta) = doc()
            .query_selector("meta[name=\"theme-color\"]")
            .ok()
            .flatten()
        {
            let color = if next == "dark" { "#161310" } else { "#f2ede4" };
            meta.set_attribute("content", color).ok();
        }
        if let Ok(Some(storage)) = window().unwrap().local_storage() {
            storage.set_item("fs-theme", next).ok();
        }
        let label = if next == "dark" {
            "Switch to light theme"
        } else {
            "Switch to dark theme"
        };
        doc()
            .query_selector("[data-theme-toggle]")
            .ok()
            .flatten()
            .map(|b| b.set_attribute("aria-label", label));
    });
    button.set_onclick(Some(closure.as_ref().unchecked_ref()));
    closure.forget();
}

fn bind_nav() {
    let document = doc();
    let Some(toggle) = document.query_selector("[data-nav-toggle]").ok().flatten() else {
        return;
    };
    let toggle: HtmlElement = toggle.dyn_into().unwrap();
    let closure = Closure::<dyn FnMut()>::new(|| {
        let Some(menu) = doc().get_element_by_id("primary-nav") else {
            return;
        };
        let open = !menu.class_list().contains("is-open");
        menu.class_list().toggle_with_force("is-open", open).ok();
        if let Some(button) = doc().query_selector("[data-nav-toggle]").ok().flatten() {
            button
                .set_attribute("aria-expanded", if open { "true" } else { "false" })
                .ok();
        }
    });
    toggle.set_onclick(Some(closure.as_ref().unchecked_ref()));
    closure.forget();
}

fn bind_tour() {
    let steps = tour_steps();
    if let Some(index) = tour_index() {
        show_tour(index, &steps);
    }
    let Some(button) = doc().query_selector("[data-tour-start]").ok().flatten() else {
        return;
    };
    let button: HtmlElement = button.dyn_into().unwrap();
    let closure = Closure::<dyn FnMut()>::new(|| {
        let steps = tour_steps();
        if steps.is_empty() {
            return;
        }
        if let Ok(Some(store)) = window().unwrap().session_storage() {
            store.set_item("fs-tour-step", "0").ok();
        }
        let _ = window().unwrap().location().set_href(&steps[0].route);
    });
    button.set_onclick(Some(closure.as_ref().unchecked_ref()));
    closure.forget();
}

struct Step {
    route: String,
    target: String,
    title: String,
    body: String,
    simulated: bool,
}

fn tour_steps() -> Vec<Step> {
    let Some(node) = doc().get_element_by_id("tour-steps") else {
        return Vec::new();
    };
    let Ok(value) =
        serde_json::from_str::<Vec<serde_json::Value>>(&node.text_content().unwrap_or_default())
    else {
        return Vec::new();
    };
    value
        .into_iter()
        .map(|step| Step {
            route: step
                .get("route")
                .and_then(|v| v.as_str())
                .unwrap_or("/")
                .into(),
            target: step
                .get("target")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            title: step
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            body: step
                .get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            simulated: step
                .get("simulated")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        })
        .collect()
}

fn tour_index() -> Option<usize> {
    let store = window().unwrap().session_storage().ok().flatten()?;
    let text = store.get_item("fs-tour-step").ok().flatten()?;
    text.parse().ok()
}

fn show_tour(index: usize, steps: &[Step]) {
    let Some(step) = steps.get(index) else {
        return;
    };
    let note = if step.simulated {
        "<p>Simulated report.</p>"
    } else {
        ""
    };
    let card = doc().create_element("aside").unwrap();
    card.set_class_name("tour-card");
    card.set_attribute("role", "dialog").ok();
    card.set_attribute("aria-modal", "true").ok();
    card.set_attribute("aria-labelledby", "tour-title").ok();
    card.set_inner_html(&format!(
        "<h2 id=\"tour-title\">{}</h2><p id=\"tour-body\">{}</p>{note}<p><button type=\"button\" data-tour-back>Back</button> <button type=\"button\" data-tour-next>Next</button> <button type=\"button\" data-tour-close>Close</button></p>",
        esc(&step.title),
        esc(&step.body)
    ));
    doc().body().unwrap().append_child(&card).ok();
    let total = steps.len();
    wire("[data-tour-close]", || end_tour());
    wire("[data-tour-back]", move || {
        if index > 0 {
            go_tour(index - 1);
        }
    });
    wire("[data-tour-next]", move || {
        if index + 1 < total {
            go_tour(index + 1);
        } else {
            end_tour();
        }
    });
    if let Some(next) = doc().query_selector("[data-tour-next]").ok().flatten() {
        let next: HtmlElement = next.dyn_into().unwrap();
        next.focus().ok();
    }
    let _ = step.target;
}

fn go_tour(index: usize) {
    if let Ok(Some(store)) = window().unwrap().session_storage() {
        store.set_item("fs-tour-step", &index.to_string()).ok();
    }
    if let Some(step) = tour_steps().get(index) {
        let _ = window().unwrap().location().set_href(&step.route);
    }
}

fn end_tour() {
    if let Ok(Some(store)) = window().unwrap().session_storage() {
        store.remove_item("fs-tour-step").ok();
    }
    if let Some(node) = doc().query_selector(".tour-card").ok().flatten() {
        node.remove();
    }
}

fn wire(selector: &str, action: impl Fn() + 'static) {
    let Some(button) = doc().query_selector(selector).ok().flatten() else {
        return;
    };
    let button: HtmlElement = button.dyn_into().unwrap();
    let closure = Closure::<dyn FnMut()>::new(action);
    button.set_onclick(Some(closure.as_ref().unchecked_ref()));
    closure.forget();
}

fn esc(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn redraw(step: usize, selected: &str, sheet: bool) {
    let holder = doc().get_element_by_id("herd-dynamic").unwrap();
    let jobs = jobs_from_storage();
    let log = log_from_storage();
    holder.set_inner_html(&herd_dynamic(step, selected, sheet, &log, &jobs));
    holder.set_attribute("data-step", &step.to_string()).ok();
    holder.set_attribute("data-selected", selected).ok();
    holder
        .set_attribute("data-sheet", if sheet { "1" } else { "0" })
        .ok();
    if sheet {
        if let Some(close) = doc().query_selector("[data-sheet-close]").ok().flatten() {
            let close: HtmlElement = close.dyn_into().unwrap();
            close.focus().ok();
        }
    }
}

fn jobs_from_storage() -> BTreeMap<String, bool> {
    let mut store = MemoryStore::default();
    if let Ok(Some(storage)) = window().unwrap().local_storage() {
        if let Ok(Some(text)) = storage.get_item("fs-jobs") {
            store.set_item("fs-jobs", &text);
        }
    }
    read_jobs(&store)
}

fn log_from_storage() -> Vec<Value> {
    if let Ok(Some(storage)) = window().unwrap().local_storage() {
        if let Ok(Some(text)) = storage.get_item("fs-log-demo") {
            return serde_json::from_str(&text).unwrap_or_default();
        }
    }
    Vec::new()
}

fn save_log(list: &[Value]) {
    if let Ok(Some(storage)) = window().unwrap().local_storage() {
        storage
            .set_item(
                "fs-log-demo",
                &serde_json::to_string(list).unwrap_or_else(|_| "[]".into()),
            )
            .ok();
    }
}

fn bind_herd() {
    let document = doc();
    let holder = document.get_element_by_id("herd-dynamic").unwrap();
    let holder: HtmlElement = holder.dyn_into().unwrap();
    let click = Closure::<dyn FnMut(_)>::new(move |event: Event| {
        let Some(target) = event
            .target()
            .and_then(|t| t.dyn_into::<HtmlElement>().ok())
        else {
            return;
        };
        let holder = doc().get_element_by_id("herd-dynamic").unwrap();
        let step: usize = holder
            .get_attribute("data-step")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let selected = holder
            .get_attribute("data-selected")
            .unwrap_or_else(|| "bramble".into());
        let sheet = holder.get_attribute("data-sheet").as_deref() == Some("1");
        if let Some(id) =
            closest_attr(&target, "data-id").or_else(|| closest_attr(&target, "data-row-animal"))
        {
            let _ = window().unwrap().history().unwrap().push_state_with_url(
                &JsValue::NULL,
                "",
                Some(&format!("/map?animal={id}&sheet=1&step={step}")),
            );
            redraw(step, &id, true);
            return;
        }
        if closest(&target, "[data-sheet-close]").is_some() {
            redraw(step, &selected, false);
            if let Some(pin) = doc()
                .query_selector(&format!("[data-id=\"{selected}\"]"))
                .ok()
                .flatten()
            {
                let pin: HtmlElement = pin.dyn_into().unwrap();
                pin.focus().ok();
            }
            return;
        }
        if closest(&target, "[data-play]").is_some() {
            let next = if step >= 37 { 0 } else { step + 1 };
            redraw(next, &selected, sheet);
            return;
        }
        if closest(&target, "[data-mark-checked]").is_some() {
            let mut log = log_from_storage();
            if let Ok(next) = browser_add(
                &log,
                &serde_json::json!({"type": "checked", "animalId": selected}),
                "2026-09-06T18:05:00",
                None,
            ) {
                log = next;
                save_log(&log);
                redraw(step, &selected, true);
            }
        }
    });
    holder
        .add_event_listener_with_callback("click", click.as_ref().unchecked_ref())
        .ok();
    click.forget();
    let input = Closure::<dyn FnMut(_)>::new(|event: Event| {
        let Some(target) = event
            .target()
            .and_then(|t| t.dyn_into::<HtmlInputElement>().ok())
        else {
            return;
        };
        if !target.has_attribute("data-scrub") {
            return;
        }
        let step = target.value().parse().unwrap_or(0);
        let holder = doc().get_element_by_id("herd-dynamic").unwrap();
        let selected = holder
            .get_attribute("data-selected")
            .unwrap_or_else(|| "bramble".into());
        let sheet = holder.get_attribute("data-sheet").as_deref() == Some("1");
        redraw(step, &selected, sheet);
    });
    holder
        .add_event_listener_with_callback("input", input.as_ref().unchecked_ref())
        .ok();
    input.forget();
    let key = Closure::<dyn FnMut(_)>::new(|event: web_sys::KeyboardEvent| {
        if event.key() != "Escape" {
            return;
        }
        let holder = doc().get_element_by_id("herd-dynamic").unwrap();
        if holder.get_attribute("data-sheet").as_deref() != Some("1") {
            return;
        }
        let step: usize = holder
            .get_attribute("data-step")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let selected = holder
            .get_attribute("data-selected")
            .unwrap_or_else(|| "bramble".into());
        redraw(step, &selected, false);
        if let Some(pin) = doc()
            .query_selector(&format!("[data-id=\"{selected}\"]"))
            .ok()
            .flatten()
        {
            let pin: HtmlElement = pin.dyn_into().unwrap();
            pin.focus().ok();
        }
    });
    doc()
        .add_event_listener_with_callback("keydown", key.as_ref().unchecked_ref())
        .ok();
    key.forget();
}

fn closest(element: &HtmlElement, selector: &str) -> Option<web_sys::Element> {
    element.closest(selector).ok().flatten()
}

fn closest_attr(element: &HtmlElement, attr: &str) -> Option<String> {
    closest(element, &format!("[{attr}]")).and_then(|node| node.get_attribute(attr))
}

fn bind_jobs() {
    let Some(root) = doc().query_selector("[data-all-jobs]").ok().flatten() else {
        return;
    };
    let root: HtmlElement = root.dyn_into().unwrap();
    let closure = Closure::<dyn FnMut()>::new(|| {
        let mut store = MemoryStore::default();
        if let Ok(Some(storage)) = window().unwrap().local_storage() {
            if let Ok(Some(text)) = storage.get_item("fs-jobs") {
                store.set_item("fs-jobs", &text);
            }
            let current = read_jobs(&store);
            let on = !current.values().any(|v| *v);
            let next = set_all_jobs(&mut store, on);
            if let Some(saved) = store.data.get("fs-jobs") {
                storage.set_item("fs-jobs", saved).ok();
            }
            for (id, value) in next {
                if let Some(box_el) = doc()
                    .query_selector(&format!("[data-job=\"{id}\"]"))
                    .ok()
                    .flatten()
                {
                    let input: HtmlInputElement = box_el.dyn_into().unwrap();
                    input.set_checked(value);
                }
            }
        }
    });
    root.set_onclick(Some(closure.as_ref().unchecked_ref()));
    closure.forget();
}

fn bind_trace() {
    let Some(print) = doc().query_selector("[data-print]").ok().flatten() else {
        return;
    };
    let print: HtmlElement = print.dyn_into().unwrap();
    let closure = Closure::<dyn FnMut()>::new(|| {
        window().unwrap().print().ok();
    });
    print.set_onclick(Some(closure.as_ref().unchecked_ref()));
    closure.forget();
}

fn bind_sign_in() {}
