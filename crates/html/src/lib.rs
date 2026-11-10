//! Server-rendered pages for the FiberShare demo. The axum server and the
//! static build both call this crate. A small WASM island updates the herd
//! view after the page has loaded.

mod document;
mod herd;
mod layout;
mod pages;

pub use document::document;
pub use herd::{herd_dynamic, herd_page};
pub use pages::page_body;

use fibershare_core::meta::meta_for_path;

/// Full HTML document for a route. `query` is the raw query string.
pub fn render(path: &str, query: &str) -> String {
    let path = if path == "/shop" { "/trace" } else { path };
    let meta = meta_for_path(path);
    let body = match path {
        "/" => pages::home(),
        "/map" => herd_page(query),
        "/trace" => pages::trace(query),
        "/setups" => pages::setups(),
        "/architecture" => pages::architecture(),
        "/rancher" => pages::rancher(query),
        _ => pages::not_found(),
    };
    document(meta.title, meta.description, &body, path == "/")
}

pub fn sitemap() -> String {
    let routes = [
        "/",
        "/map",
        "/trace",
        "/setups",
        "/architecture",
        "/rancher",
    ];
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
    for route in routes {
        xml.push_str("  <url><loc>https://github.com/bitprairie-team/fibershare-oss");
        if route != "/" {
            xml.push_str(route);
        }
        xml.push_str("</loc><lastmod>2026-11-01</lastmod></url>\n");
    }
    xml.push_str("</urlset>\n");
    xml
}
