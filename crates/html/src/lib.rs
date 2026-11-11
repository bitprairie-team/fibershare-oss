//! Server-rendered pages for the FiberShare demo. The axum server and the
//! static build both call this crate. A small WASM island updates the herd
//! view after the page has loaded.

mod docs;
mod document;
mod herd;
mod layout;
mod pages;

pub use docs::{
    is_known_page, llms_txt, markdown_doc, plain_file, robots_txt, sitemap, sitemap_at,
};
pub use document::{configured_origin, document, safe_origin};
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
    render_at(path, query, site, "")
}

/// Same pages as [`render_for`]. `origin` is the scheme and host of this
/// request, with no path. Canonical and `og:url` use that host plus the
/// route. An empty or unusable origin keeps the route path on its own.
pub fn render_at(path: &str, query: &str, site: Site, origin: &str) -> String {
    let path = if path == "/shop" { "/trace" } else { path };
    let meta = meta_for_path(path);
    let body = if path == "/docs" {
        docs::docs_index()
    } else if let Some(slug) = path.strip_prefix("/docs/") {
        docs::doc_page(slug).unwrap_or_else(pages::not_found)
    } else {
        match path {
            "/" => pages::home(),
            "/map" => herd_page(query),
            "/trace" => pages::trace(query),
            "/setups" => pages::setups(),
            "/architecture" => pages::architecture(),
            "/rancher" => pages::rancher(query, site.sign_in),
            _ => pages::not_found(),
        }
    };
    document(meta.title, meta.description, &body, path, origin)
}
