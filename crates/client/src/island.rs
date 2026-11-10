//! Herd Play, pin selection, and the phone sheet. Theme, the menu, and the
//! tour live in /chrome.js so this module stays off the home and trace pages.
//! The server renders each moment. This island only asks for the new HTML.

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{window, Event, HtmlElement, HtmlInputElement, XmlHttpRequest};

fn doc() -> web_sys::Document {
    window().unwrap().document().unwrap()
}

pub fn boot() {
    if doc().get_element_by_id("herd-dynamic").is_some() {
        bind_herd();
    }
}

fn storage_item(key: &str) -> String {
    window()
        .and_then(|w| w.local_storage().ok().flatten())
        .and_then(|store| store.get_item(key).ok().flatten())
        .unwrap_or_default()
}

fn redraw(step: usize, selected: &str, sheet: bool) {
    let log = storage_item("fs-log-demo");
    let jobs = storage_item("fs-jobs");
    let log = if log.is_empty() { "[]" } else { log.as_str() };
    let jobs = if jobs.is_empty() { "{}" } else { jobs.as_str() };
    let sheet_text = if sheet { "true" } else { "false" };
    let body = format!(
        r#"{{"step":{step},"animal":"{selected}","sheet":{sheet_text},"log":{log},"jobs":{jobs}}}"#
    );
    let xhr = XmlHttpRequest::new().unwrap();
    if xhr
        .open_with_async("POST", "/api/herd-view", false)
        .is_err()
    {
        return;
    }
    xhr.set_request_header("content-type", "application/json")
        .ok();
    if xhr.send_with_opt_str(Some(&body)).is_err() {
        return;
    }
    let Some(html) = xhr.response_text().ok().flatten() else {
        return;
    };
    if html.is_empty() {
        return;
    }
    let Some(holder) = doc().get_element_by_id("herd-dynamic") else {
        return;
    };
    holder.set_inner_html(&html);
    holder.set_attribute("data-step", &step.to_string()).ok();
    holder.set_attribute("data-selected", selected).ok();
    holder
        .set_attribute("data-sheet", if sheet { "1" } else { "0" })
        .ok();
    if sheet {
        focus_selector("[data-sheet-close]");
    }
}

fn focus_selector(selector: &str) {
    if let Some(node) = doc().query_selector(selector).ok().flatten() {
        if let Ok(el) = node.dyn_into::<HtmlElement>() {
            el.focus().ok();
        }
    }
}

fn bind_herd() {
    let holder = doc().get_element_by_id("herd-dynamic").unwrap();
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
            focus_selector(&format!("[data-id=\"{selected}\"]"));
            return;
        }
        if closest(&target, "[data-play]").is_some() {
            let next = if step >= 37 { 0 } else { step + 1 };
            redraw(next, &selected, sheet);
            return;
        }
        if closest(&target, "[data-mark-checked]").is_some() {
            remember_check(&selected);
            redraw(step, &selected, true);
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
        event.prevent_default();
        let step: usize = holder
            .get_attribute("data-step")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let selected = holder
            .get_attribute("data-selected")
            .unwrap_or_else(|| "bramble".into());
        redraw(step, &selected, false);
        focus_selector(&format!("[data-id=\"{selected}\"]"));
    });
    doc()
        .add_event_listener_with_callback("keydown", key.as_ref().unchecked_ref())
        .ok();
    key.forget();
}

fn remember_check(animal: &str) {
    let Some(store) = window().and_then(|w| w.local_storage().ok().flatten()) else {
        return;
    };
    let current = store
        .get_item("fs-log-demo")
        .ok()
        .flatten()
        .unwrap_or_else(|| "[]".into());
    let entry = format!(
        r#"{{"type":"checked","animalId":"{animal}","at":"2026-09-06T18:05:00Z","id":"check-{animal}"}}"#
    );
    let next = if current.trim() == "[]" || current.trim().is_empty() {
        format!("[{entry}]")
    } else if let Some(stripped) = current.trim().strip_suffix(']') {
        format!("{stripped},{entry}]")
    } else {
        format!("[{entry}]")
    };
    store.set_item("fs-log-demo", &next).ok();
}

fn closest(element: &HtmlElement, selector: &str) -> Option<web_sys::Element> {
    element.closest(selector).ok().flatten()
}

fn closest_attr(element: &HtmlElement, attr: &str) -> Option<String> {
    closest(element, &format!("[{attr}]")).and_then(|node| node.get_attribute(attr))
}
