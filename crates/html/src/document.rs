const THEME: &str = r##"<script>
      (function () {
        try {
          // Light by default. The dark theme is a choice, kept once made.
          var t = localStorage.getItem("fs-theme") === "dark" ? "dark" : "light";
          document.documentElement.setAttribute("data-theme", t);
          document.documentElement.style.colorScheme = t;
          var meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.setAttribute("content", t === "dark" ? "#161310" : "#f2ede4");
          window.fsIcons = function (theme) {
            var dark = theme === "dark", mark = dark ? "-dark" : "";
            var set = function (id, href) { var el = document.getElementById(id); if (el) el.setAttribute("href", href); };
            set("favicon-svg", "/favicon" + mark + ".svg");
            set("favicon-32", "/favicon-32" + mark + ".png");
            set("favicon-16", "/favicon-16" + mark + ".png");
            set("favicon-ico", "/favicon" + mark + ".ico");
          };
          window.fsIcons(t);
          var hash = location.hash || "";
          if (hash.charAt(0) === "#" && hash.charAt(1) === "/") {
            var rest = hash.slice(1);
            if (location.pathname + location.search !== rest) location.replace(rest);
          }
        } catch (e) {
          document.documentElement.setAttribute("data-theme", "light");
        }
      })();
    </script>"##;

/// Keep a request origin that can sit in a URL attribute. Anything else
/// falls back to a path, so a bad Host header cannot rewrite the tags.
pub fn safe_origin(origin: &str) -> String {
    let origin = origin.trim().trim_end_matches('/');
    let rest = origin
        .strip_prefix("https://")
        .or_else(|| origin.strip_prefix("http://"));
    let Some(rest) = rest else {
        return String::new();
    };
    if rest.is_empty()
        || !rest.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b':' | b'[' | b']')
        })
    {
        return String::new();
    }
    origin.to_string()
}

/// Public site origin for canonical and social tags, when one is configured.
///
/// Pass the `PUBLIC_ORIGIN` setting (scheme and host only). The value is run
/// through [`safe_origin`]. An empty or unusable value means the page should
/// keep path-only tags, not read a Host header.
pub fn configured_origin(value: Option<&str>) -> String {
    match value {
        Some(value) => safe_origin(value),
        None => String::new(),
    }
}

pub fn document(title: &str, description: &str, body: &str, path: &str, origin: &str) -> String {
    let wasm = if path == "/map" {
        r#"<script type="module">import init from "/wasm/client.js"; init();</script>"#
    } else {
        ""
    };
    let origin = safe_origin(origin);
    let page_url = if origin.is_empty() {
        path.to_string()
    } else {
        format!("{origin}{path}")
    };
    let image = if origin.is_empty() {
        "/brand/social-preview-1280x640.png".to_string()
    } else {
        format!("{origin}/brand/social-preview-1280x640.png")
    };
    format!(
        r##"<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content="{description}" />
    <meta name="theme-color" content="#f2ede4" />
    <link rel="canonical" href="{page_url}" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FiberShare" />
    <meta property="og:url" content="{page_url}" />
    <meta property="og:image" content="{image}" />
    <meta property="og:image:width" content="1280" />
    <meta property="og:image:height" content="640" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="{image}" />
    <link id="favicon-svg" rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link id="favicon-32" rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
    <link id="favicon-16" rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16" />
    <link id="favicon-ico" rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="/style.css" />
    {theme}
  </head>
  <body>
    <div id="app">{body}</div>
    <div id="route-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <script type="application/json" id="tour-steps">{tour}</script>
    <script src="/chrome.js" defer></script>
    {wasm}
  </body>
</html>
"##,
        title = esc_attr(title),
        description = esc_attr(description),
        page_url = esc_attr(&page_url),
        image = esc_attr(&image),
        theme = THEME,
        tour = fibershare_core::tour::steps_json(),
        wasm = wasm,
        body = body,
    )
}

pub fn esc(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub fn esc_attr(value: &str) -> String {
    esc(value).replace('"', "&quot;")
}
