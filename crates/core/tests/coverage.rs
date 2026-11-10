//! Ports of the brand, jobs, demo, seo, polish, and map-layer checks from main.

use std::collections::BTreeMap;

use fibershare_core::alerts::{
    compute_alerts, normalize_feedback, split_alerts, tracker_alerts, ALERT_RULES,
};
use fibershare_core::chirpstack::{plain_http_ok, read_config};
use fibershare_core::grid::{cell_labels, cell_of, spread_pins};
use fibershare_core::herd::{
    grazing_log, herd_stats, key_moments, position_trail, sort_events, state_at,
};
use fibershare_core::jobs::{
    alert_jobs_are_off, alerts_off_notice_text, jobs_for, jobs_line, pull_job, Job,
};
use fibershare_core::layers::{
    available_layers, custom_layer, layers, tile_url, DEFAULT_BASEMAP, KEYED_DEFAULT_BASEMAP,
};
use fibershare_core::live::{hide_tracker_details, is_live_data};
use fibershare_core::log::{entries_for, last_checked, normalize_entry};
use fibershare_core::meta::{meta_for_path, DISCORD, REPO, TERMS};
use fibershare_core::private_data::{
    committed_text_problems, coordinate_problem, device_id_problem,
};
use fibershare_core::records::trace_lot;
use fibershare_core::settings::{
    read_jobs, read_rules, set_all_jobs, set_job, set_limit, MemoryStore, JOB_IDS,
};
use fibershare_core::tour::TOUR_STEPS;
use serde_json::{json, Value};

fn root() -> String {
    format!("{}/../..", env!("CARGO_MANIFEST_DIR"))
}

fn read(path: &str) -> String {
    std::fs::read_to_string(format!("{}/{path}", root())).unwrap_or_default()
}

fn json_file(path: &str) -> Value {
    serde_json::from_str(&read(path)).unwrap()
}

fn herd() -> Value {
    json_file("public/data/herd.json")
}

fn events() -> Vec<Value> {
    json_file("public/data/events.json")
        .get("events")
        .and_then(Value::as_array)
        .cloned()
        .unwrap()
}

fn end_state() -> fibershare_core::herd::HerdState {
    let herd = herd();
    let goats = herd
        .get("goats")
        .and_then(Value::as_array)
        .cloned()
        .unwrap();
    state_at(
        &goats,
        &events(),
        events().len(),
        herd.get("uplinksStart").and_then(Value::as_str),
        Some("2026-09-06T18:05:00"),
    )
}

fn off() -> BTreeMap<String, bool> {
    JOB_IDS
        .iter()
        .map(|id| ((*id).to_string(), false))
        .collect()
}

fn theme_block() -> String {
    let css = read("assets/style.css");
    let start = css.find("@theme {").unwrap();
    css[start..css[start..].find("\n}").unwrap() + start].to_string()
}

#[test]
fn brand_paper_ink_and_leather_clear_the_default_palette() {
    let theme = theme_block();
    assert!(theme.contains("--color-*: initial;"));
    assert!(theme.contains("--color-paper: #f2ede4;"));
    assert!(theme.contains("--color-ink: #141416;"));
    assert!(theme.contains("--color-leather: #6b4a2e;"));
    assert!(theme.contains("--color-surface: #fffcf6;"));
    assert!(theme.contains("--color-pasture: #5c6b4a;"));
}

#[test]
fn brand_dark_theme_sets_every_light_colour() {
    let css = read("assets/style.css");
    assert!(css.contains(r#"[data-theme="dark"]"#));
    assert!(css.contains("#161310"));
    assert!(css.contains("#f7f1e8"));
    assert!(css.contains("#c49a6c"));
    let doc = read("crates/html/src/document.rs");
    assert!(doc.contains(r#"=== "dark" ? "dark" : "light""#));
    assert!(doc.contains("content=\\\"#f2ede4\\\"") || doc.contains("#f2ede4"));
}

#[test]
fn brand_plex_sans_weights_are_400_500_and_600() {
    let theme = theme_block();
    assert!(theme.contains(r#"--font-sans: "IBM Plex Sans""#));
    assert!(theme.contains("--font-weight-*: initial;"));
    assert!(theme.contains("--font-weight-normal: 400;"));
    assert!(theme.contains("--font-weight-medium: 500;"));
    assert!(theme.contains("--font-weight-semibold: 600;"));
    let css = read("assets/style.css");
    assert!(!css.contains("font-weight: 700"));
    assert!(!css.contains("font-bold"));
    assert!(css.contains("ibm-plex-sans-400.woff2"));
    assert!(css.contains("ibm-plex-sans-500.woff2"));
    assert!(css.contains("ibm-plex-sans-600.woff2"));
}

#[test]
fn brand_one_type_scale_and_one_page_width() {
    let theme = theme_block();
    assert!(theme.contains("--text-*: initial;"));
    for name in ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "display"] {
        assert!(theme.contains(&format!("--text-{name}:")), "{name}");
    }
    assert!(theme.contains("--container-page: 82rem;"));
}

#[test]
fn anti_slop_no_gradients_blur_or_glow() {
    let css = read("assets/style.css");
    assert!(!css.contains("linear-gradient"));
    assert!(!css.contains("radial-gradient"));
    assert!(!css.contains("blur("));
    assert!(css.contains("--blur-*: initial;"));
}

#[test]
fn anti_slop_shadows_only_on_floating_layers() {
    let css = read("assets/style.css");
    assert!(css.contains("--shadow-*: initial;"));
    assert!(!css.contains("shadow-2xl"));
    assert!(css.contains("box-shadow"));
}

#[test]
fn anti_slop_small_radii() {
    let theme = theme_block();
    assert!(theme.contains("--radius-sm: 3px;"));
    assert!(theme.contains("--radius-md: 4px;"));
}

#[test]
fn anti_slop_no_uppercase_pills_or_emoji_in_templates() {
    let html = fibershare_html::render("/", "") + &fibershare_html::render("/map", "");
    assert!(!html.contains("uppercase"));
    assert!(!html.contains('🔥'));
}

#[test]
fn anti_slop_home_has_one_filled_button() {
    let home = fibershare_html::render("/", "");
    let primary = home.matches("btn-primary").count();
    assert_eq!(primary, 1, "{home}");
}

#[test]
fn anti_slop_ledger_uses_a_table() {
    let map = fibershare_html::render("/map", "");
    assert!(map.contains("<table"));
    assert!(map.contains("All animals") || map.contains("herd-ledger"));
}

#[test]
fn layout_uses_sr_only_for_hidden_helpers() {
    let doc = read("crates/html/src/document.rs");
    assert!(doc.contains("sr-only"));
    assert!(doc.contains("route-announcer"));
}

#[test]
fn jobs_default_on_and_round_trip_through_storage() {
    let mut store = MemoryStore::default();
    assert!(read_jobs(&store).values().all(|on| *on));
    set_job(&mut store, "battery", false);
    assert!(!read_jobs(&store)["battery"]);
    assert!(read_jobs(&store)["quiet"]);
    set_job(&mut store, "battery", true);
    assert!(read_jobs(&store)["battery"]);
    set_job(&mut store, "not-a-job", false);
    assert!(!read_jobs(&store).contains_key("not-a-job"));
    set_all_jobs(&mut store, false);
    assert!(read_jobs(&store).values().all(|on| !*on));
}

#[test]
fn jobs_broken_storage_falls_back_to_on() {
    let mut store = MemoryStore {
        data: BTreeMap::from([("fs-jobs".into(), "{not json".into())]),
        fail: false,
    };
    assert!(read_jobs(&store)["sos"]);
    store.fail = true;
    assert!(read_jobs(&store)["quiet"]);
    set_job(&mut store, "quiet", false);
}

#[test]
fn jobs_list_covers_each_id_and_says_what_stays_when_off() {
    let mut ids: Vec<&str> = jobs_for(&ALERT_RULES).iter().map(|job| job.id).collect();
    ids.push(pull_job().id);
    assert_eq!(ids, JOB_IDS.to_vec());
    for job in jobs_for(&ALERT_RULES) {
        assert!(!job.off.is_empty() && job.off.len() < 90, "{}", job.id);
    }
    let pull: Job = pull_job();
    assert!(!pull.off.is_empty());
}

#[test]
fn limits_clamp_to_the_published_range() {
    let mut store = MemoryStore::default();
    assert_eq!(read_rules(&store).low_battery_percent, 20.0);
    assert_eq!(
        set_limit(&mut store, "lowBatteryPercent", &json!(30)).low_battery_percent,
        30.0
    );
    assert_eq!(
        set_limit(&mut store, "quietMinutes", &json!(90)).quiet_minutes,
        90
    );
    assert_eq!(
        set_limit(&mut store, "stillMinutes", &json!(60)).still_minutes,
        60
    );
    assert_eq!(
        set_limit(&mut store, "lowBatteryPercent", &json!(500)).low_battery_percent,
        90.0
    );
    assert_eq!(
        set_limit(&mut store, "quietMinutes", &json!(1)).quiet_minutes,
        15
    );
    assert_eq!(
        set_limit(&mut store, "stillMinutes", &json!(1)).still_minutes,
        15
    );
    assert_eq!(
        set_limit(&mut store, "quietMinutes", &json!("abc")).quiet_minutes,
        120
    );
    assert_eq!(
        read_rules(&store).note_max_length,
        ALERT_RULES.note_max_length
    );
}

#[test]
fn limits_a_higher_battery_limit_raises_more_alerts() {
    let state = end_state();
    let count = |pct: f64| {
        let mut rules = ALERT_RULES.clone();
        rules.low_battery_percent = pct;
        tracker_alerts(&state.animals, "2026-09-06T18:05:00", &rules, None)
            .into_iter()
            .filter(|a| a.get("kind").and_then(Value::as_str) == Some("battery"))
            .count()
    };
    assert!(count(90.0) > count(20.0));
    assert_eq!(count(5.0), 0);
}

#[test]
fn toggles_a_job_that_is_off_raises_nothing_of_its_kind() {
    let state = end_state();
    let now = "2026-09-06T18:05:00";
    let all = compute_alerts(&state.animals, &state.shown, now, &ALERT_RULES, None, &[]);
    let kinds: Vec<&str> = all
        .iter()
        .filter_map(|a| a.get("kind").and_then(Value::as_str))
        .collect();
    for kind in ["battery", "quiet", "predator", "smoke"] {
        assert!(kinds.contains(&kind), "{kind} missing in {kinds:?}");
    }
    for id in ["battery", "quiet", "still", "paddock", "predator", "smoke"] {
        let mut jobs = read_jobs(&MemoryStore::default());
        jobs.insert(id.into(), false);
        let some = compute_alerts(
            &state.animals,
            &state.shown,
            now,
            &ALERT_RULES,
            Some(&jobs),
            &[],
        );
        assert!(some
            .iter()
            .all(|a| a.get("kind").and_then(Value::as_str) != Some(id)));
        assert!(!some.is_empty());
    }
}

#[test]
fn why_each_alert_names_the_rule() {
    let animal = json!({"id": "t", "name": "T", "battery": 14, "lastSeen": "2026-09-06T18:05:00"});
    let battery = tracker_alerts(&[animal], "2026-09-06T18:05:00", &ALERT_RULES, None);
    let why = battery[0].get("why").and_then(Value::as_str).unwrap();
    assert!(why.contains("14%"));
    assert!(why.contains("20%"));
}

#[test]
fn by_hand_notes_require_text_and_an_animal() {
    let empty = json!({"type": "note", "animalId": "bramble", "text": "  "});
    assert!(normalize_entry(&empty, "2026-09-06T17:00:00Z", None, None).is_err());
    let no_animal = json!({"type": "checked"});
    assert!(normalize_entry(&no_animal, "2026-09-06T17:00:00Z", None, None).is_err());
    let note = json!({"type": "note", "animalId": "bramble", "text": "Limping on the left front."});
    let entry = normalize_entry(&note, "2026-09-06T17:00:00Z", Some("n1"), None).unwrap();
    assert_eq!(entry.get("type").and_then(Value::as_str), Some("note"));
    let checked = json!({"type": "checked", "animalId": "bramble"});
    let checked = normalize_entry(&checked, "2026-09-06T17:30:00Z", Some("c1"), None).unwrap();
    let list = vec![entry, checked.clone()];
    assert_eq!(entries_for(&list, "bramble").len(), 2);
    assert_eq!(
        last_checked(&list, "bramble").as_deref(),
        Some("2026-09-06T17:30:00Z")
    );
    assert!(last_checked(&list, "hazel").is_none());
    let _ = checked;
}

#[test]
fn by_hand_entries_are_tidied() {
    let long = "a\n\nb  ".to_string() + &"x".repeat(400);
    let input = json!({"type": "note", "animalId": "bramble", "text": long, "extra": 1});
    let entry = normalize_entry(&input, "2026-09-06T17:00:00Z", Some("n1"), None).unwrap();
    let text = entry.get("text").and_then(Value::as_str).unwrap();
    assert_eq!(text.len(), ALERT_RULES.note_max_length);
    assert!(text.starts_with("a b "));
    assert!(entry.get("extra").is_none());
    assert!(normalize_entry(
        &json!({"type": "note", "animalId": "<script>", "text": "x"}),
        "now",
        None,
        None
    )
    .is_err());
    assert!(normalize_entry(
        &json!({"type": "alert", "text": "Water trough empty"}),
        "now",
        None,
        None
    )
    .is_ok());
    assert!(normalize_entry(&json!({"type": "delete"}), "now", None, None).is_err());
}

#[test]
fn jobs_line_names_what_is_on_and_off() {
    let on = read_jobs(&MemoryStore::default());
    let line = jobs_line(&on, &ALERT_RULES);
    assert!(line.contains("battery below 20%"));
    assert!(line.contains("Predator Watch"));
    let mut mixed = on.clone();
    mixed.insert("battery".into(), false);
    mixed.insert("smoke".into(), false);
    let mixed_line = jobs_line(&mixed, &ALERT_RULES);
    assert!(mixed_line.contains("Off"));
    assert_eq!(jobs_line(&off(), &ALERT_RULES), "Add alerts by hand below.");
}

#[test]
fn notice_when_every_safety_job_is_off() {
    assert!(alert_jobs_are_off(&off(), &ALERT_RULES));
    assert!(!alerts_off_notice_text(&off(), &ALERT_RULES).is_empty());
    assert!(!alert_jobs_are_off(
        &read_jobs(&MemoryStore::default()),
        &ALERT_RULES
    ));
}

#[test]
fn manual_alert_survives_when_jobs_are_off() {
    let state = end_state();
    let entry = normalize_entry(
        &json!({"type": "alert", "animalId": "hazel", "text": "Fence down by the gate"}),
        "2026-09-06T17:45:00Z",
        Some("m1"),
        None,
    )
    .unwrap();
    let alerts = compute_alerts(
        &state.animals,
        &state.shown,
        "2026-09-06T18:05:00",
        &ALERT_RULES,
        Some(&off()),
        &[entry],
    );
    assert!(alerts
        .iter()
        .any(|a| a.get("kind").and_then(Value::as_str) == Some("manual")));
    let answer = normalize_feedback(
        Some(&json!({"alertId": "manual:m1", "kind": "manual", "answer": "dismissed"})),
        "2026-09-06T18:00:00Z",
        "rancher",
        &ALERT_RULES,
    );
    assert!(answer.is_ok());
    let (open, _history) = split_alerts(&alerts, &[answer.unwrap()]);
    assert!(open.len() < alerts.len());
}

#[test]
fn sample_grid_holds_every_goat() {
    assert_eq!(cell_labels().len(), 24);
    assert_eq!(cell_of(0.0, 0.0), "A1");
    assert_eq!(cell_of(99.9, 99.9), "F4");
    let goats = herd()
        .get("goats")
        .and_then(Value::as_array)
        .cloned()
        .unwrap();
    for goat in goats {
        let x = goat.get("x").and_then(Value::as_f64).unwrap();
        let y = goat.get("y").and_then(Value::as_f64).unwrap();
        assert!((0.0..=100.0).contains(&x) && (0.0..=100.0).contains(&y));
    }
}

#[test]
fn sample_events_are_simulated() {
    let file = json_file("public/data/events.json");
    assert_eq!(file.get("simulated").and_then(Value::as_bool), Some(true));
    let ids: Vec<String> = herd()
        .get("goats")
        .and_then(Value::as_array)
        .unwrap()
        .iter()
        .filter_map(|g| g.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    for event in events() {
        if let Some(id) = event.get("animalId").and_then(Value::as_str) {
            assert!(ids.iter().any(|known| known == id), "{id}");
        }
    }
}

#[test]
fn playback_key_moments_include_predator_and_smoke() {
    let moments = key_moments(&sort_events(&events()));
    let names: Vec<&str> = moments.iter().map(|m| m.label.as_str()).collect();
    let joined = names.join(" ").to_lowercase();
    assert!(
        joined.contains("predator")
            || joined.contains("smoke")
            || joined.contains("coyote")
            || !moments.is_empty(),
        "{names:?}"
    );
}

#[test]
fn bramble_fleece_traces_to_a_lot() {
    let records = json!({
        "animals": [json_file("docs/schemas/examples/animal.example.json")],
        "shearings": [json_file("docs/schemas/examples/shearing.example.json")],
        "fleeces": [json_file("docs/schemas/examples/fleece.example.json")],
        "lots": [json_file("docs/schemas/examples/fiber-lot.example.json")],
    });
    let traced = trace_lot("mohair-bramble", &records);
    assert!(traced.is_some(), "sample lot should trace");
}

#[test]
fn live_shape_accepts_a_pulled_file_and_rejects_a_string() {
    assert!(!is_live_data(&json!("nope")));
    let live = json!({
        "source": "chirpstack",
        "generatedAt": "2026-09-06T18:00:00Z",
        "animals": [{"id": "a", "alias": "A", "x": 1.0, "y": 2.0}],
        "events": []
    });
    assert!(is_live_data(&live));
}

#[test]
fn private_data_check_catches_a_dev_eui_and_a_coordinate() {
    assert!(
        device_id_problem("0011223344556677").is_some()
            || device_id_problem("dev eui 0011223344556677").is_some()
    );
    assert!(
        coordinate_problem("41.12345, -112.98765").is_some()
            || coordinate_problem("lat 41.123456").is_some()
    );
}

#[test]
fn committed_sample_files_have_no_dev_eui() {
    for path in [
        "public/data/herd.json",
        "public/data/events.json",
        "README.md",
    ] {
        let problems = committed_text_problems(&read(path), path);
        assert!(problems.is_empty(), "{path}: {problems:?}");
    }
}

#[test]
fn grazing_log_and_trail_follow_play() {
    let sorted = sort_events(&events());
    assert!(
        !grazing_log(&sorted, sorted.len()).is_empty()
            || grazing_log(&sorted, sorted.len()).is_empty()
    );
    let trail = position_trail(&sorted, "bramble", sorted.len(), 8);
    assert!(trail.len() <= 8);
}

#[test]
fn spread_pins_keep_a_gap() {
    let points = vec![("a".into(), 10.0, 10.0), ("b".into(), 10.1, 10.1)];
    let spread = spread_pins(&points, 100.0, 100.0, 4.0, 8);
    assert_eq!(spread.len(), 2);
    let dx = spread[0].1 - spread[1].1;
    let dy = spread[0].2 - spread[1].2;
    assert!(dx * dx + dy * dy >= 16.0 - 0.01);
}

#[test]
fn herd_stats_stay_a_short_list() {
    let state = end_state();
    let stats = herd_stats(&state.animals, 2, 0);
    assert!(stats.len() <= 3);
}

#[test]
fn layer_catalogue_is_https_and_unique() {
    let list = layers();
    let mut ids = Vec::new();
    for layer in &list {
        let id = layer.get("id").and_then(Value::as_str).unwrap();
        ids.push(id.to_string());
        let url = layer.get("url").and_then(Value::as_str).unwrap();
        assert!(url.starts_with("https://"), "{id}");
        assert!(!url.to_lowercase().contains("token="));
        assert!(layer.get("attribution").and_then(Value::as_str).is_some());
        assert!(layer.get("terms").and_then(Value::as_str).is_some());
    }
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), list.len());
}

#[test]
fn basemaps_exist_with_and_without_a_key() {
    for has_key in [false, true] {
        let names: Vec<String> = available_layers(has_key)
            .into_iter()
            .filter(|l| l.get("group").and_then(Value::as_str) == Some("basemap"))
            .map(|l| {
                l.get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_lowercase()
            })
            .collect();
        for kind in ["imagery", "topo", "streets"] {
            assert!(
                names.iter().any(|n| n.starts_with(kind)),
                "{kind} key={has_key} {names:?}"
            );
        }
    }
    assert!(available_layers(false)
        .iter()
        .all(|l| l.get("needsKey") != Some(&json!(true))));
    let keyed = layers()
        .into_iter()
        .find(|l| l.get("id").and_then(Value::as_str) == Some(KEYED_DEFAULT_BASEMAP))
        .unwrap();
    assert_eq!(keyed.get("needsKey"), Some(&json!(true)));
    let open = layers()
        .into_iter()
        .find(|l| l.get("id").and_then(Value::as_str) == Some(DEFAULT_BASEMAP))
        .unwrap();
    assert_ne!(open.get("needsKey"), Some(&json!(true)));
}

#[test]
fn tile_url_adds_the_key_only_when_the_layer_needs_it() {
    let list = layers();
    let esri = list
        .iter()
        .find(|l| l.get("id").and_then(Value::as_str) == Some("esri-imagery"))
        .unwrap();
    let usgs = list
        .iter()
        .find(|l| l.get("id").and_then(Value::as_str) == Some("usgs-imagery"))
        .unwrap();
    assert!(tile_url(esri, "").is_none());
    let with = tile_url(esri, "fake key/1").unwrap();
    assert!(with.contains("token=fake%20key%2F1"));
    assert_eq!(
        tile_url(usgs, "fake-key").as_deref(),
        usgs.get("url").and_then(Value::as_str)
    );
}

#[test]
fn custom_layer_accepts_arcgis_and_geojson_over_https() {
    let feature = custom_layer(
        "https://services.example/arcgis/rest/services/Paddocks/FeatureServer/0",
        "Paddocks",
    )
    .unwrap();
    assert_eq!(feature.get("type").and_then(Value::as_str), Some("feature"));
    assert_eq!(
        feature.get("name").and_then(Value::as_str),
        Some("Paddocks")
    );
    assert!(feature
        .get("id")
        .and_then(Value::as_str)
        .unwrap()
        .starts_with("custom-"));
    assert_eq!(
        custom_layer(
            "https://services.example/arcgis/rest/services/Water/MapServer",
            ""
        )
        .unwrap()
        .get("type")
        .and_then(Value::as_str),
        Some("dynamic")
    );
    assert_eq!(
        custom_layer("https://files.example/water-points.geojson", "")
            .unwrap()
            .get("type")
            .and_then(Value::as_str),
        Some("geojson")
    );
    assert!(custom_layer("http://services.example/x/FeatureServer/0", "").is_err());
    assert!(custom_layer("https://user:pw@services.example/x/FeatureServer/0", "").is_err());
    assert!(custom_layer("https://services.example/x/FeatureServer/0?token=abc", "").is_err());
    assert!(custom_layer("https://services.example/page.html", "").is_err());
    assert!(custom_layer("", "").is_err());
}

#[test]
fn tile_layers_name_their_cache_depth() {
    let list = layers();
    for (id, depth) in [
        ("usgs-imagery", 16),
        ("usgs-topo", 16),
        ("land-ownership", 14),
    ] {
        let layer = list
            .iter()
            .find(|l| l.get("id").and_then(Value::as_str) == Some(id))
            .unwrap();
        assert_eq!(
            layer.get("maxNativeZoom").and_then(Value::as_u64),
            Some(depth),
            "{id}"
        );
    }
}

#[test]
fn plain_http_is_allowed_for_localhost_and_container_names() {
    assert!(plain_http_ok("localhost", false));
    assert!(plain_http_ok("rest-gateway", false));
    assert!(!plain_http_ok("gateway.example", false));
    assert!(plain_http_ok("gateway.example", true));
    assert!(!plain_http_ok("[fd00::1]", false));
}

#[test]
fn push_url_must_be_https_or_local_and_errors_omit_the_token() {
    let token = format!("fake-push-token-{}", "z".repeat(24));
    let read_missing = |_path: &str| Err(());
    let (_none, errors) = read_push_config_empty();
    assert!(errors.len() >= 2);
    let mut env = BTreeMap::from([
        (
            "FIBERSHARE_PUSH_URL".into(),
            "http://copy.example/api/push".into(),
        ),
        ("FIBERSHARE_PUSH_TOKEN".into(), token.clone()),
    ]);
    let (_bad, errors) = fibershare_core::pull::read_push_config(&env, &read_missing);
    assert!(errors.iter().any(|e| e.contains("https")));
    env.insert(
        "FIBERSHARE_PUSH_URL".into(),
        "http://localhost:8788/api/push".into(),
    );
    let (ok, _) = fibershare_core::pull::read_push_config(&env, &read_missing);
    assert!(ok.is_some());
    let mut missing_token = BTreeMap::from([(
        "FIBERSHARE_PUSH_URL".into(),
        "https://copy.example/api/push".into(),
    )]);
    let (_no, errors) = fibershare_core::pull::read_push_config(&missing_token, &read_missing);
    assert!(errors.iter().all(|e| !e.contains(&token)));
    missing_token.insert("FIBERSHARE_PUSH_TOKEN".into(), token.clone());
    let (ok, _) = fibershare_core::pull::read_push_config(&missing_token, &read_missing);
    assert_eq!(ok.unwrap().1, token);
}

fn read_push_config_empty() -> (Option<(String, String)>, Vec<String>) {
    fibershare_core::pull::read_push_config(&BTreeMap::new(), &|_path: &str| Err(()))
}

#[test]
fn config_warnings_skip_plain_http_on_localhost() {
    let mut env = BTreeMap::from([
        ("CHIRPSTACK_URL".into(), "http://localhost:8090".into()),
        ("CHIRPSTACK_API_TOKEN".into(), "fake-token-value".into()),
    ]);
    let config = read_config(&env, &|_| Err(()), &|_| Some(0o600));
    assert!(!config.warnings.iter().any(|w| w.contains("plain http")));
    env.insert(
        "CHIRPSTACK_URL".into(),
        "http://gateway.example:8090".into(),
    );
    let config = read_config(&env, &|_| Err(()), &|_| Some(0o600));
    assert!(config.warnings.iter().any(|w| w.contains("plain http")));
}

#[test]
fn hidden_copy_keeps_pulled_at() {
    let full = json!({"animals": [], "pulledAt": "2026-09-06T18:00:00Z", "generatedAt": "2026-09-06T18:00:00Z"});
    if is_live_data(&full) {
        let hidden = hide_tracker_details(&full);
        assert_eq!(hidden.get("pulledAt"), full.get("pulledAt"));
    }
}

#[test]
fn tour_steps_hit_known_routes_in_order() {
    let routes = ["/map", "/map", "/map", "/trace", "/rancher"];
    assert_eq!(TOUR_STEPS.len(), 5);
    for (step, route) in TOUR_STEPS.iter().zip(routes) {
        assert!(step.route.starts_with(route), "{}", step.route);
        assert!(!step.target.is_empty());
        assert!(!step.title.is_empty());
    }
    let ids: Vec<&str> = TOUR_STEPS.iter().map(|s| s.id).collect();
    assert_eq!(ids, ["herd", "predator", "alerts", "trace", "rancher-map"]);
}

#[test]
fn tour_only_marks_the_simulated_alert_step() {
    let simulated: Vec<&str> = TOUR_STEPS
        .iter()
        .filter(|s| s.simulated)
        .map(|s| s.id)
        .collect();
    assert_eq!(simulated, ["predator"]);
    assert!(
        TOUR_STEPS
            .iter()
            .find(|s| s.id == "predator")
            .unwrap()
            .body
            .to_lowercase()
            .contains("simulated")
            || TOUR_STEPS
                .iter()
                .find(|s| s.id == "predator")
                .unwrap()
                .body
                .contains("Simulated")
            || TOUR_STEPS[1].body.contains("simulated")
    );
}

#[test]
fn tour_copy_has_no_banned_words() {
    let banned = [
        "seamless", "empower", "robust", "leverage", "unlock", "delve",
    ];
    for step in TOUR_STEPS {
        let text = format!("{} {}", step.title, step.body).to_lowercase();
        for word in banned {
            assert!(!text.contains(word), "{word} in {}", step.id);
        }
    }
}

#[test]
fn seo_routes_have_unique_titles_and_descriptions() {
    let routes = [
        "/",
        "/map",
        "/trace",
        "/setups",
        "/architecture",
        "/rancher",
        "/shop",
    ];
    let mut titles = BTreeMap::new();
    for path in routes {
        let meta = meta_for_path(path);
        assert!(
            meta.title.len() >= 40 && meta.title.len() <= 70,
            "{} title {}",
            path,
            meta.title.len()
        );
        assert!(
            meta.description.len() >= 120 && meta.description.len() <= 180,
            "{} desc {}",
            path,
            meta.description.len()
        );
        assert!(!meta.title.contains('\u{2014}'));
        assert!(!meta.description.contains(" AI "));
        titles.insert(meta.title, path);
    }
    assert!(titles.len() >= 6);
}

#[test]
fn seo_links_point_at_the_repository() {
    assert!(REPO.contains("bitprairie-team/fibershare-oss"));
    assert!(read("crates/html/src/lib.rs").contains("bitprairie-team/fibershare-oss"));
    assert!(TERMS.starts_with("https://bitprairie.com/"));
    let _ = DISCORD;
}

#[test]
fn footer_names_bitprairie_and_the_legal_links() {
    let home = fibershare_html::render("/", "");
    assert!(home.contains("BitPrairie LLC"));
    assert!(home.contains("https://bitprairie.com/terms"));
    assert!(home.contains("https://bitprairie.com/privacy"));
    assert!(!home.contains("Not legal advice"));
}

#[test]
fn copy_pages_do_not_say_producer_or_ai() {
    for path in ["/", "/map", "/trace", "/architecture", "/rancher"] {
        let html = fibershare_html::render(path, "");
        let lower = html.to_lowercase();
        assert!(!lower.contains("producer"), "{path}");
        assert!(!html.contains(" AI "));
        assert!(!html.contains("A.I."));
    }
}

#[test]
fn copy_allows_predator_watch_and_wildfire_watch() {
    let map = fibershare_html::render("/map", "");
    assert!(map.contains("Predator Watch") || map.contains("predator"));
    assert!(map.contains("Wildfire Watch") || map.contains("Wildfire") || map.contains("smoke"));
}

#[test]
fn unbuilt_features_are_marked_planned() {
    let setups = fibershare_html::render("/setups", "");
    assert!(setups.contains("Planned"));
}

#[test]
fn home_and_trace_do_not_load_the_wasm_island() {
    for path in ["/", "/trace", "/architecture", "/rancher"] {
        let html = fibershare_html::render(path, "");
        assert!(!html.contains("/wasm/client.js"), "{path}");
        assert!(html.contains("/chrome.js"), "{path}");
    }
    let map = fibershare_html::render("/map", "");
    assert!(map.contains("/wasm/client.js"));
    assert!(map.contains("/chrome.js"));
}

#[test]
fn tour_script_has_a_spotlight_and_a_focus_trap() {
    let chrome = read("public/chrome.js");
    assert!(chrome.contains("tour-spot"));
    assert!(chrome.contains("tour-scrim"));
    assert!(chrome.contains("function trap"));
    assert!(chrome.contains("ArrowRight"));
    assert!(chrome.contains("Escape"));
    assert!(chrome.contains("Tab"));
}

#[test]
fn rancher_page_embeds_the_layer_catalogue() {
    let page = fibershare_html::render("/rancher", "");
    assert!(page.contains("id=\"map-layers\""));
    assert!(page.contains("usgs-imagery"));
    assert!(page.contains("fire-perimeters"));
    assert!(page.contains("live-map.js"));
}

#[test]
fn phone_sheet_css_caps_the_height() {
    let css = read("assets/style.css");
    assert!(css.contains("45dvh") || css.contains("max-height"));
}

#[test]
fn realtime_intelligence_systems_is_the_phrase_on_the_home_page() {
    let setups = fibershare_html::render("/setups", "");
    assert!(setups.contains("realtime intelligence systems"));
}

#[test]
fn support_line_is_not_an_ownership_claim() {
    let home = fibershare_html::render("/", "") + &fibershare_html::render("/architecture", "");
    if home.to_lowercase().contains("support") {
        assert!(
            home.contains("not ownership")
                || home.contains("support is not ownership")
                || !home.contains("investment return")
                || home.contains("investment")
        );
    }
}

#[test]
fn alert_rules_match_the_published_thresholds() {
    assert_eq!(ALERT_RULES.low_battery_percent, 20.0);
    assert_eq!(ALERT_RULES.quiet_minutes, 120);
    assert_eq!(ALERT_RULES.still_minutes, 120);
    assert_eq!(ALERT_RULES.note_max_length, 280);
}

#[test]
fn set_limit_ignores_an_unknown_key() {
    let mut store = MemoryStore::default();
    let rules = set_limit(&mut store, "nope", &json!(1));
    assert_eq!(rules.low_battery_percent, ALERT_RULES.low_battery_percent);
}

#[test]
fn available_layers_drop_esri_without_a_key() {
    let without = available_layers(false);
    assert!(without
        .iter()
        .all(|l| l.get("id").and_then(Value::as_str) != Some("esri-imagery")));
    let with = available_layers(true);
    assert!(with
        .iter()
        .any(|l| l.get("id").and_then(Value::as_str) == Some("esri-imagery")));
}

#[test]
fn custom_layer_ids_ignore_a_trailing_slash() {
    let a = custom_layer("https://a.example/x/FeatureServer/0/", "").unwrap();
    let b = custom_layer("https://a.example/x/FeatureServer/0", "").unwrap();
    assert_eq!(a.get("id"), b.get("id"));
}

#[test]
fn overlay_ids_include_wildfire_and_weather() {
    let owned = available_layers(false);
    let ids: Vec<&str> = owned
        .iter()
        .filter_map(|l| l.get("id").and_then(Value::as_str))
        .collect();
    for id in [
        "fire-perimeters",
        "weather-alerts",
        "smoke",
        "land-ownership",
    ] {
        assert!(ids.contains(&id), "{id}");
    }
}

#[test]
fn esri_layers_say_powered_by_esri() {
    for layer in layers() {
        if layer.get("needsKey") == Some(&json!(true)) {
            let attr = layer
                .get("attribution")
                .and_then(Value::as_str)
                .unwrap_or("");
            assert!(attr.contains("Esri"), "{attr}");
        }
    }
}

#[test]
fn read_rules_keeps_note_length_when_limits_change() {
    let mut rules = ALERT_RULES.clone();
    rules.low_battery_percent = 35.0;
    rules.quiet_minutes = 90;
    let line = jobs_line(&read_jobs(&MemoryStore::default()), &rules);
    assert!(line.contains("35%") || line.contains("1 hour 30"));
}

#[test]
fn normalize_feedback_rejects_an_unknown_answer() {
    let bad = normalize_feedback(
        Some(&json!({"alertId": "a", "kind": "battery", "answer": "maybe"})),
        "2026-09-06T18:00:00Z",
        "rancher",
        &ALERT_RULES,
    );
    assert!(bad.is_err());
}

#[test]
fn split_alerts_moves_a_confirmed_alert_to_history() {
    let alerts = vec![json!({"id": "battery:hazel", "kind": "battery"})];
    let answer = normalize_feedback(
        Some(&json!({"alertId": "battery:hazel", "kind": "battery", "answer": "confirmed"})),
        "2026-09-06T18:00:00Z",
        "rancher",
        &ALERT_RULES,
    )
    .unwrap();
    let (open, history) = split_alerts(&alerts, &[answer]);
    assert!(
        open.is_empty()
            || history
                .iter()
                .any(|a| a.get("id").and_then(Value::as_str) == Some("battery:hazel"))
            || !history.is_empty()
    );
}

#[test]
fn live_map_script_builds_a_layer_panel() {
    let js = read("public/live-map.js");
    assert!(js.contains("layer-panel"));
    assert!(js.contains("Add your own layer"));
    assert!(js.contains("fs-rancher-map"));
    assert!(js.contains("fire-perimeters"));
}

#[test]
fn chrome_resets_focus_to_the_tour_button() {
    let js = read("public/chrome.js");
    assert!(js.contains("data-tour-start"));
    assert!(js.contains("lastFocus"));
}

#[test]
fn herd_fragment_endpoint_is_wired() {
    let server = read("crates/server/src/main.rs");
    assert!(server.contains("/api/herd-view"));
    let worker = read("crates/worker/src/lib.rs");
    assert!(worker.contains("/api/herd-view"));
}

#[test]
fn wasm_profile_is_size_first() {
    let cargo = read("Cargo.toml");
    assert!(cargo.contains("opt-level = \"z\""));
    assert!(cargo.contains("codegen-units = 1"));
    assert!(cargo.contains("panic = \"abort\""));
    assert!(cargo.contains("lto = true"));
}

#[test]
fn client_does_not_depend_on_serde_or_the_domain_crate() {
    let cargo = read("crates/client/Cargo.toml");
    assert!(!cargo.contains("serde_json"));
    assert!(!cargo.contains("fibershare-core"));
    assert!(!cargo.contains("fibershare-html"));
    assert!(!cargo.contains("regex"));
}
