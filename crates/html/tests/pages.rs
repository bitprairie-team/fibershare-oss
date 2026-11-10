use fibershare_html::render;

#[test]
fn home_keeps_the_job_lede_and_one_primary_action() {
    let html = render("/", "");
    assert!(html.contains("checks each tracker's battery and check-ins"));
    assert!(html.contains("Each of those jobs can be turned off. When a job is off, its alerts stop, and you can still add alerts, notes and checks by hand."));
    assert_eq!(html.matches("btn-primary").count(), 1);
    assert!(html.contains("Open the herd view"));
    assert!(html.contains("© 2026 BitPrairie LLC"));
    assert!(html.contains("This is a demo, not the FiberShare app."));
    assert!(html.contains("The code is MIT licensed, so anyone may use it."));
    assert!(!html.to_lowercase().contains("producer"));
    assert!(html.contains("localStorage.getItem(\"fs-theme\") === \"dark\" ? \"dark\" : \"light\""));
    assert!(html.contains("<meta name=\"theme-color\" content=\"#f2ede4\""));
    assert!(!html.contains("prefers-color-scheme"));
}

#[test]
fn herd_view_renders_pins_alerts_ledger_and_sheet() {
    let html = render("/map", "animal=bramble&sheet=1");
    assert!(html.contains("data-pins"));
    assert!(html.contains("class=\"goat"));
    assert!(html.contains("data-trail"));
    assert!(html.contains("stroke-linecap") || html.contains("trail-dot"));
    assert!(html.contains(">Close<"));
    assert!(html.contains("data-sheet-close"));
    assert!(html.contains("All animals"));
    assert!(html.contains("grazing-title"));
    assert!(html.contains("Paddock moves"));
    assert!(html.contains("data-add-alert"));
    assert!(html.contains("data-note-form"));
    assert!(html.contains("data-mark-checked"));
    assert!(html.contains("Checked by hand") || html.contains("data-mark-checked"));
    assert!(html.contains("class=\"alert-why\"") || html.contains("alert-why"));
    assert!(html.contains("rules checked "));
    assert!(html.contains("data-job=\"predator\""));
    assert!(html.contains("data-job=\"smoke\""));
    assert!(html.contains("aria-valuetext"));
    assert!(
        html.contains("max-h-[45dvh]")
            || html.contains("detail is-open")
            || html.contains("is-open")
    );
}

#[test]
fn architecture_jobs_and_notice_stay_hidden_while_jobs_are_on() {
    let html = render("/architecture", "");
    for id in [
        "battery", "quiet", "still", "paddock", "sos", "predator", "smoke", "trace", "pull",
    ] {
        assert!(html.contains(&format!("data-job=\"{id}\" checked")), "{id}");
    }
    assert!(html.contains("Turn every job off"));
    assert!(html.contains("data-alerts-off"));
    assert!(html.contains("still works by hand"));
    assert!(html.contains("Planned"));
}

#[test]
fn trace_names_the_link_and_setups_mark_planned() {
    let html = render("/trace", "");
    assert!(html.contains("Linked by the trace job at "));
    assert!(html.contains("?view=") || html.contains("data-viewer"));
    assert!(html.contains("data-print"));
    let setups = render("/setups", "");
    assert!(setups.contains("Planned"));
    assert!(setups.contains("Support is not ownership or an investment return."));
    assert!(setups.contains("realtime intelligence systems"));
}

#[test]
fn theme_tokens_stay_in_the_stylesheet() {
    let css = include_str!("../../../assets/style.css");
    assert!(css.contains("#f2ede4") || css.contains("#F2EDE4"));
    assert!(css.contains("#141416"));
    assert!(css.contains("#6b4a2e") || css.contains("#6B4A2E"));
    assert!(css.contains("IBM Plex Sans"));
    assert!(css.contains("@media (max-width: 860px)"));
    assert!(css.contains("max-h-[45dvh]"));
    assert!(css.contains(".paddock [data-pins]"));
}
