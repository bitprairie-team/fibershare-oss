//! Server-rendered pages for the FiberShare demo. The axum server and the
//! static build both call this crate. A small WASM island updates the herd
//! view after the page has loaded.

mod document;
mod herd;
mod layout;
mod pages;

pub use document::document;
pub use herd::{herd_dynamic, herd_page, herd_view_html};
pub use pages::{page_body, SignIn};

use fibershare_core::meta::meta_for_path;

/// How this copy signs a rancher in. The page copy follows the copy that is running.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Site {
    pub sign_in: SignIn,
}

impl Default for Site {
    fn default() -> Self {
        Self {
            sign_in: SignIn::Passphrase,
        }
    }
}

/// Full HTML document for a route. `query` is the raw query string.
pub fn render(path: &str, query: &str) -> String {
    render_for(path, query, Site::default())
}

/// Same pages as [`render`], with the sign-in help for this copy.
pub fn render_for(path: &str, query: &str, site: Site) -> String {
    let path = if path == "/shop" { "/trace" } else { path };
    let meta = meta_for_path(path);
    let body = match path {
        "/" => pages::home(),
        "/map" => herd_page(query),
        "/trace" => pages::trace(query),
        "/setups" => pages::setups(),
        "/architecture" => pages::architecture(),
        "/rancher" => pages::rancher(query, site.sign_in),
        _ => pages::not_found(),
    };
    document(meta.title, meta.description, &body, path)
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
    // This demo has no stable public host yet, so the locations are paths.
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
    for route in routes {
        xml.push_str("  <url><loc>");
        xml.push_str(route);
        xml.push_str("</loc></url>\n");
    }
    xml.push_str("</urlset>\n");
    xml
}
