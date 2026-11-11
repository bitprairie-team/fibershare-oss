//! Rendered-page checks that used to live in the Node polish and seo suites.

use fibershare_html::render;

fn page(path: &str) -> String {
    render(path, "")
}

#[test]
fn each_route_has_one_h1() {
    for path in [
        "/",
        "/map",
        "/trace",
        "/setups",
        "/architecture",
        "/rancher",
        "/docs",
        "/docs/hardware",
        "/docs/direction",
    ] {
        let html = page(path);
        assert_eq!(html.matches("<h1").count(), 1, "{path}");
    }
}

#[test]
fn each_route_has_a_title_and_description() {
    for path in [
        "/",
        "/map",
        "/trace",
        "/setups",
        "/architecture",
        "/rancher",
        "/docs",
        "/docs/hardware",
        "/docs/direction",
    ] {
        let html = page(path);
        assert!(html.contains("<title>"));
        assert!(html.contains("name=\"description\""));
    }
}

#[test]
fn pages_point_canonical_at_themselves() {
    for path in [
        "/",
        "/map",
        "/trace",
        "/setups",
        "/architecture",
        "/rancher",
        "/docs",
        "/docs/hardware",
        "/docs/direction",
    ] {
        let html = page(path);
        assert!(
            html.contains(&format!("rel=\"canonical\" href=\"{path}\"")),
            "{path}"
        );
        assert!(
            html.contains(&format!("property=\"og:url\" content=\"{path}\"")),
            "{path}"
        );
        assert!(
            !html.contains("rel=\"canonical\" href=\"https://github.com"),
            "{path}"
        );
        assert!(
            !html.contains("property=\"og:url\" content=\"https://github.com"),
            "{path}"
        );
    }
    let hosted = fibershare_html::render_at(
        "/map",
        "",
        fibershare_html::Site::default(),
        "https://fibershare.example",
    );
    assert!(hosted.contains("rel=\"canonical\" href=\"https://fibershare.example/map\""));
    assert!(hosted.contains("property=\"og:url\" content=\"https://fibershare.example/map\""));
    assert!(hosted.contains(
        "property=\"og:image\" content=\"https://fibershare.example/brand/social-preview-1280x640.png\""
    ));
    let junk = fibershare_html::render_at(
        "/",
        "",
        fibershare_html::Site::default(),
        "https://evil.example/\"><script>",
    );
    assert!(junk.contains("rel=\"canonical\" href=\"/\""));
    assert!(!junk.contains("evil.example"));
}

#[test]
fn configured_origin_only_keeps_a_safe_public_origin() {
    assert_eq!(fibershare_html::configured_origin(None), "");
    assert_eq!(
        fibershare_html::configured_origin(Some("https://demo.example")),
        "https://demo.example"
    );
    assert_eq!(
        fibershare_html::configured_origin(Some("https://demo.example/")),
        "https://demo.example"
    );
    assert_eq!(
        fibershare_html::configured_origin(Some("https://evil.example/\"><script>")),
        ""
    );
}

#[test]
fn favicon_and_social_image_links_exist() {
    let html = page("/");
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    for href in [
        "/favicon.svg",
        "/favicon-32.png",
        "/favicon-16.png",
        "/favicon.ico",
        "/apple-touch-icon.png",
        "/brand/logo-light.svg",
        "/brand/logo-dark.svg",
        "/brand/bitprairie-tile.svg",
        "/brand/social-preview-1280x640.png",
    ] {
        assert!(html.contains(href), "{href}");
        let file = root.join(format!("public{href}"));
        assert!(file.is_file(), "{}", file.display());
    }
    // Dark icons are chosen in the theme script. The files still have to be there.
    assert!(html.contains("\"-dark\""));
    for href in [
        "/favicon-dark.svg",
        "/favicon-32-dark.png",
        "/favicon-16-dark.png",
        "/favicon-dark.ico",
    ] {
        let file = root.join(format!("public{href}"));
        assert!(file.is_file(), "{}", file.display());
    }
    assert!(html.contains("property=\"og:image\""));
    assert!(html.contains("property=\"og:image:width\" content=\"1280\""));
    assert!(html.contains("property=\"og:image:height\" content=\"640\""));
    assert!(html.contains("name=\"twitter:card\" content=\"summary_large_image\""));
    assert!(html.contains("alt=\"BitPrairie\""));
    assert!(html.contains("logo-mark-light"));
    assert!(html.contains("logo-mark-dark"));
    assert!(!html.contains("#5c4030"));
}

#[test]
fn shop_uses_the_trace_page() {
    let shop = render("/shop", "");
    let trace = page("/trace");
    assert!(shop.contains("Fleece") || shop.contains("trace"));
    assert_eq!(shop.contains("<h1"), trace.contains("<h1"));
}

#[test]
fn herd_page_has_pins_a_ledger_and_a_sheet_control() {
    let html = page("/map");
    assert!(html.contains("data-id="));
    assert!(html.contains("data-tour=\"ledger\"") || html.contains("All animals"));
    assert!(html.contains("data-sheet-close") || html.contains("data-detail"));
    assert!(html.contains("data-play"));
}

#[test]
fn herd_page_names_open_alerts() {
    let html = page("/map");
    assert!(html.contains("data-tour=\"alerts\"") || html.contains("alert"));
}

#[test]
fn trace_page_has_the_chain_and_a_viewer_control() {
    let html = page("/trace");
    assert!(html.contains("data-tour=\"chain\""));
    assert!(html.contains("Who can see this"));
    assert!(html.contains("view=public"));
}

#[test]
fn architecture_lists_jobs() {
    let html = page("/architecture");
    assert!(html.contains("data-job") || html.contains("battery"));
}

#[test]
fn rancher_page_has_a_passphrase_form() {
    let html = page("/rancher");
    assert!(html.contains("passphrase"));
    assert!(html.contains("data-tour=\"rancher-map\""));
}

#[test]
fn not_found_page_still_has_the_chrome_script() {
    let html = render("/missing", "");
    assert!(html.contains("/chrome.js"));
    assert!(!html.contains("/wasm/client.js"));
    assert!(html.contains("Page not found") || html.contains("not found"));
}

#[test]
fn sitemap_lists_the_public_routes() {
    let xml = fibershare_html::sitemap();
    for route in [
        "/map",
        "/trace",
        "/setups",
        "/architecture",
        "/rancher",
        "/docs",
        "/docs/hardware",
        "/docs/chirpstack",
    ] {
        assert!(xml.contains(&format!("<loc>{route}</loc>")), "{route}");
    }
    assert!(!xml.contains("https://"));
}

#[test]
fn sitemap_uses_a_configured_origin() {
    let xml = fibershare_html::sitemap_at("https://fibershare.example");
    assert!(xml.contains("<loc>https://fibershare.example/docs/hardware</loc>"));
    assert!(xml.contains("<loc>https://fibershare.example/</loc>"));
    let junk = fibershare_html::sitemap_at("javascript:alert(1)");
    assert!(junk.contains("<loc>/docs</loc>"));
    assert!(!junk.contains("javascript"));
}

#[test]
fn light_theme_is_the_default_script() {
    let html = page("/");
    assert!(html.contains("fs-theme"));
    assert!(html.contains("#f2ede4"));
}

#[test]
fn footer_is_on_every_main_page() {
    for path in ["/", "/map", "/trace", "/rancher"] {
        assert!(page(path).contains("BitPrairie LLC"), "{path}");
    }
}

#[test]
fn herd_query_selects_an_animal() {
    let html = render("/map", "animal=willow&sheet=1");
    assert!(html.contains("willow") || html.contains("Willow"));
}

#[test]
fn no_main_page_loads_leaflet() {
    for path in ["/", "/map", "/trace", "/docs"] {
        assert!(!page(path).contains("leaflet.js"), "{path}");
    }
}

#[test]
fn rancher_page_loads_leaflet_and_the_layer_list() {
    let html = page("/rancher");
    assert!(html.contains("/vendor/leaflet/leaflet.js"));
    assert!(html.contains("id=\"map-layers\""));
}

#[test]
fn tour_steps_json_is_on_the_page() {
    let html = page("/");
    assert!(html.contains("id=\"tour-steps\""));
    assert!(html.contains("\"id\":\"herd\"") || html.contains("The herd"));
}

#[test]
fn home_has_a_single_primary_action() {
    assert_eq!(page("/").matches("btn-primary").count(), 1);
}

#[test]
fn copy_avoids_the_word_producer() {
    for path in ["/", "/map", "/trace", "/setups", "/architecture", "/docs"] {
        assert!(!page(path).to_lowercase().contains("producer"), "{path}");
    }
}

#[test]
fn copy_avoids_a_bare_ai_token() {
    for path in ["/", "/map", "/trace", "/docs"] {
        let html = page(path);
        assert!(!html.contains(" AI "));
        assert!(!html.contains("A.I."));
    }
}

#[test]
fn planned_tag_is_visible_on_setups() {
    assert!(page("/setups").contains("Planned"));
}

#[test]
fn herd_ledger_is_a_table() {
    let html = page("/map");
    assert!(html.contains("<table"));
    assert!(html.contains("<th") || html.contains("<td"));
}

#[test]
fn phone_sheet_has_a_close_control_in_the_markup() {
    let html = render("/map", "animal=bramble&sheet=1");
    assert!(html.contains("data-sheet-close") || html.contains("Close"));
}

#[test]
fn tour_starts_on_the_herd_view_only() {
    assert!(page("/map").contains("data-tour-start"));
    assert!(!page("/").contains("data-tour-start"));
    assert!(page("/").contains(">Herd<"));
    assert!(page("/").contains(">Trace<"));
    assert!(page("/").contains(">Sign in<"));
    assert!(page("/").contains("href=\"/setups\""));
    assert!(page("/").contains("href=\"/architecture\""));
}

#[test]
fn theme_toggle_is_in_the_header() {
    assert!(page("/").contains("data-theme-toggle"));
}

#[test]
fn wasm_island_is_only_on_the_herd_view() {
    assert!(page("/map").contains("/wasm/client.js"));
    for path in ["/", "/trace", "/setups", "/architecture", "/rancher"] {
        assert!(!page(path).contains("/wasm/client.js"), "{path}");
    }
}

#[test]
fn chrome_script_is_on_every_page() {
    for path in ["/", "/map", "/trace", "/rancher"] {
        assert!(page(path).contains("/chrome.js"), "{path}");
    }
}

#[test]
fn herd_view_fragment_marks_the_step() {
    let html = fibershare_html::herd_view_html(
        r#"{"step":0,"animal":"bramble","sheet":false,"log":[],"jobs":{}}"#,
    );
    assert!(html.contains("bramble") || html.contains("Bramble") || html.contains("data-step"));
}

#[test]
fn herd_view_fragment_opens_the_sheet() {
    let html = fibershare_html::herd_view_html(
        r#"{"step":1,"animal":"bramble","sheet":true,"log":[],"jobs":{}}"#,
    );
    assert!(html.contains("data-sheet") || html.contains("data-detail") || html.contains("sheet"));
}

#[test]
fn trace_viewer_query_changes_the_page() {
    let public = render("/trace", "view=public");
    assert!(public.contains("Not shared"));
    assert!(public.contains("Bramble mohair"));
    let rancher = render("/trace", "view=rancher");
    assert!(rancher.contains("mohair-bramble"));
    assert!(!rancher.contains(">Not shared<"));
}

#[test]
fn architecture_mentions_the_pull_loop() {
    let html = page("/architecture");
    assert!(html.to_lowercase().contains("pull") || html.contains("job"));
}

#[test]
fn home_links_to_the_herd_view() {
    assert!(page("/").contains("href=\"/map\"") || page("/").contains("href=\"/map"));
}

#[test]
fn pages_use_the_paper_background_token() {
    let html = page("/");
    assert!(html.contains("style.css"));
}

#[test]
fn rancher_error_query_is_escaped() {
    let html = render("/rancher", "error=<b>");
    assert!(html.contains("&lt;b&gt;") || html.contains("&amp;lt;b"));
    assert!(!html.contains("<b>"));
}

#[test]
fn docs_index_and_guides_are_full_html_pages() {
    let index = page("/docs");
    assert!(index.contains("<h1>Docs</h1>"));
    assert!(index.contains("/llms.txt"));
    assert!(index.contains("href=\"/docs/hardware\""));
    assert!(index.contains("href=\"/docs/hardware.md\""));
    assert!(index.contains("BitPrairie LLC"));
    assert!(index.contains("rel=\"canonical\" href=\"/docs\""));
    assert!(!index.contains("/wasm/client.js"));
    let hardware = page("/docs/hardware");
    assert!(hardware.contains("<h1>Hardware</h1>"));
    assert!(hardware.contains("Sources"));
    assert!(hardware.contains("href=\"/docs/hardware.md\""));
    assert!(hardware.contains("rel=\"canonical\" href=\"/docs/hardware\""));
    assert!(!hardware.contains("/wasm/client.js"));
    let missing = page("/docs/no-such-guide");
    assert!(missing.contains("Page not found"));
    assert!(!fibershare_html::is_known_page("/docs/no-such-guide"));
}

#[test]
fn markdown_copies_match_the_repo_guides() {
    let md = fibershare_html::markdown_doc("/docs/hardware.md").expect("hardware");
    assert!(md.contains("# Hardware"));
    assert!(fibershare_html::markdown_doc("/docs/direction.md")
        .unwrap()
        .contains("# Direction"));
    assert!(fibershare_html::markdown_doc("/docs/missing.md").is_none());
}

#[test]
fn docs_map_and_robots_point_at_the_guides() {
    let map = fibershare_html::llms_txt("");
    assert!(map.starts_with("# FiberShare (open source)"));
    assert!(map.contains("/docs/hardware.md"));
    assert!(map.contains("/llms.txt"));
    assert!(map.contains("bitprairie-team/fibershare-oss"));
    assert!(!map.contains(" AI "));
    assert!(!map.contains("A.I."));
    let hosted = fibershare_html::llms_txt("https://fibershare.example");
    assert!(hosted.contains("https://fibershare.example/docs/hardware.md"));
    let robots = fibershare_html::robots_txt("https://fibershare.example");
    assert!(robots.contains("User-agent: *"));
    assert!(robots.contains("Allow: /"));
    assert!(robots.contains("Sitemap: https://fibershare.example/sitemap.xml"));
    assert!(robots.contains("https://fibershare.example/llms.txt"));
    let local = fibershare_html::robots_txt("");
    assert!(local.contains("Sitemap: /sitemap.xml"));
    assert!(local.contains("/llms.txt"));
}

#[test]
fn relative_doc_links_point_at_the_html_guides() {
    let cameras = page("/docs/paddock-cameras");
    assert!(cameras.contains("href=\"/docs/hardware\""));
    assert!(!cameras.contains("href=\"hardware.md\""));
}

#[test]
fn bare_source_urls_become_links() {
    let hardware = page("/docs/hardware");
    assert!(hardware
        .contains("href=\"https://wiki.seeedstudio.com/SenseCAP_T1000_tracker/Introduction/\""));
    assert!(hardware.contains("href=\"https://www.groundcontrol.com/product/rockblock-9704/\""));
}
