use fibershare_html::{render, render_for, SignIn, Site};

#[test]
fn home_is_one_title_one_paragraph_and_one_button() {
    let html = render("/", "");
    assert!(html.contains("Sample herd, one day's trackers"));
    assert!(html.contains("This demo follows eight sample goats through one made-up day."));
    assert!(html.contains("Every automated job can be turned off."));
    assert_eq!(html.matches("btn-primary").count(), 1);
    assert!(html.contains("Open the herd view"));
    assert!(html.contains("© 2026 BitPrairie LLC"));
    assert!(html.contains("Sample data. This is not the FiberShare app."));
    assert!(!html.contains("This is a demo, not the FiberShare app."));
    assert!(!html.contains("Three setups"));
    assert!(!html.contains("growing into a network"));
    assert!(!html.contains("MIT licensed"));
    assert!(!html.to_lowercase().contains("producer"));
    assert!(html.contains("localStorage.getItem(\"fs-theme\") === \"dark\" ? \"dark\" : \"light\""));
    assert!(html.contains("<meta name=\"theme-color\" content=\"#f2ede4\""));
    assert!(!html.contains("prefers-color-scheme"));
    assert!(html.contains("rel=\"canonical\" href=\"/\""));
    assert!(html.contains("property=\"og:url\" content=\"/\""));
    assert!(!html.contains("rel=\"canonical\" href=\"https://github.com"));
    assert!(!html.contains("property=\"og:url\" content=\"https://github.com"));
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
    assert!(html.contains("Run the sample day"));
    assert!(!html.contains(">Play<"));
    assert!(!html.contains("stat-row"));
    assert!(html.contains("data-add-alert"));
    assert!(html.contains("data-note-form"));
    assert!(html.contains("data-mark-checked"));
    assert!(html.contains("Checked by hand") || html.contains("data-mark-checked"));
    assert!(html.contains("class=\"alert-why\"") || html.contains("alert-why"));
    assert!(html.contains("rules checked "));
    assert!(html.contains("data-job=\"predator\""));
    assert!(html.contains("data-job=\"smoke\""));
    assert!(html.contains("aria-valuetext"));
    assert!(html.contains("Open alerts ("));
    assert!(html.contains("data-tour-start"));
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
    assert!(html.contains("You can still add alerts, notes, and checks by hand."));
    assert!(html.contains("Low battery (below 20%)"));
    assert!(!html.contains("20%On"));
    assert!(!html.contains(">On.<"));
    assert!(html.contains("Planned"));
    assert!(html.contains("usual check-in pattern"));
    assert!(!html.contains("All of it runs on your own hardware"));
    assert!(!html.contains("id=\"parts-title\""));
}

#[test]
fn trace_names_the_link_and_setups_mark_planned() {
    let html = render("/trace", "");
    assert!(html.contains("Linked at "));
    assert!(html.contains("from this lot to Bramble"));
    assert!(html.contains("Bramble mohair"));
    assert!(html.contains("Who can see this"));
    assert!(!html.contains("View as"));
    assert!(!html.contains("class=\"chip\""));
    assert!(!html.contains("Nothing here is for sale"));
    assert!(!html.contains("Pasture-blend"));
    assert!(html.contains("data-tour=\"chain\""));
    let setups = render("/setups", "");
    assert!(setups.contains("Planned"));
    assert!(setups.contains("Support is not ownership or an investment return."));
    assert!(setups.contains("realtime intelligence systems"));
    assert!(!setups.contains(">Cost<"));
    assert!(!setups.contains("A fee for"));
    assert!(!setups.contains("non-commercial and research use"));
}

#[test]
fn rancher_error_is_decoded() {
    let html = render("/rancher", "error=That%20passphrase%20did%20not%20match.");
    assert!(html.contains("That passphrase did not match."));
    assert!(!html.contains("%20"));
    assert!(html.contains("Set a passphrase with"));
    assert!(!html.contains("Cloudflare Access"));
}

#[test]
fn rancher_error_query_is_escaped() {
    let html = render("/rancher", "error=%3Cb%3E");
    assert!(html.contains("&lt;b&gt;"));
    assert!(!html.contains("<b>"));
}

#[test]
fn rancher_help_follows_the_copy_that_is_running() {
    let access = render_for(
        "/rancher",
        "",
        Site {
            sign_in: SignIn::Access,
        },
    );
    assert!(access.contains("Sign-in on this copy is Cloudflare Access."));
    assert!(!access.contains("fibershare passphrase"));
    let quiet = render_for(
        "/rancher",
        "",
        Site {
            sign_in: SignIn::None,
        },
    );
    assert!(!quiet.contains("Cloudflare"));
    assert!(!quiet.contains("fibershare passphrase"));
}

#[test]
fn not_found_has_the_designed_body() {
    let html = render("/no-such-page", "");
    assert!(html.contains("<h1>Page not found</h1>"));
    assert!(html.contains("That address is not in this demo."));
    assert!(html.contains("Back home"));
    assert!(html.contains("<title>Page not found, FiberShare</title>"));
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
    assert!(!css.contains("--radius-full"));
    assert!(!css.contains(".stat-row"));
}
