const THEME: &str = r##"<script>
      (function () {
        try {
          // Light by default. The dark theme is a choice, kept once made.
          var t = localStorage.getItem("fs-theme") === "dark" ? "dark" : "light";
          document.documentElement.setAttribute("data-theme", t);
          document.documentElement.style.colorScheme = t;
          var meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.setAttribute("content", t === "dark" ? "#161310" : "#f2ede4");
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

pub fn document(title: &str, description: &str, body: &str, path: &str) -> String {
    let wasm = if path == "/map" {
        r#"<script type="module">import init from "/wasm/client.js"; init();</script>"#
    } else {
        ""
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
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FiberShare" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
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
