//! Docs pages, the plain-text docs map, robots, and the sitemap.
//!
//! Markdown is compiled into the binary so the Worker can serve the same
//! files as the local server, without shipping the docs folder.

use pulldown_cmark::{html, Event, Options, Parser, Tag};

use crate::document::{esc, safe_origin};
use crate::layout::{footer, nav, HEAD, LEDE, MAIN, SECTION_TITLE};

pub struct Doc {
    pub slug: &'static str,
    pub summary: &'static str,
    pub markdown: &'static str,
}

pub const DOCS: &[Doc] = &[
    Doc {
        slug: "direction",
        summary: "How this repository relates to the FiberShare app.",
        markdown: include_str!("../../../docs/DIRECTION.md"),
    },
    Doc {
        slug: "hardware",
        summary: "Trackers, cameras, gateways, and satellite links.",
        markdown: include_str!("../../../docs/hardware.md"),
    },
    Doc {
        slug: "paddock-cameras",
        summary: "Live paddock video over Media over QUIC. Planned in this demo.",
        markdown: include_str!("../../../docs/paddock-cameras.md"),
    },
    Doc {
        slug: "chirpstack",
        summary: "Pull your own LoRaWAN collars from a ChirpStack v4 server.",
        markdown: include_str!("../../../docs/chirpstack.md"),
    },
    Doc {
        slug: "rancher-access",
        summary: "Local passphrase and Cloudflare Access for the rancher map.",
        markdown: include_str!("../../../docs/rancher-access.md"),
    },
    Doc {
        slug: "schemas",
        summary: "Draft JSON Schemas for animals, shearing, fleece, and fiber lots.",
        markdown: include_str!("../../../docs/schemas/README.md"),
    },
];

const PAGE_ROUTES: &[&str] = &[
    "/",
    "/map",
    "/trace",
    "/setups",
    "/architecture",
    "/rancher",
    "/docs",
    "/docs/direction",
    "/docs/hardware",
    "/docs/paddock-cameras",
    "/docs/chirpstack",
    "/docs/rancher-access",
    "/docs/schemas",
];

pub fn doc_by_slug(slug: &str) -> Option<&'static Doc> {
    DOCS.iter().find(|doc| doc.slug == slug)
}

/// HTML routes this crate can render as a real page, not a missing-page body.
pub fn is_known_page(path: &str) -> bool {
    let path = if path == "/shop" { "/trace" } else { path };
    PAGE_ROUTES.contains(&path)
}

/// Plain-text or XML files served with a specific content type.
pub fn plain_file(path: &str, origin: &str) -> Option<(&'static str, String)> {
    match path {
        "/llms.txt" => Some(("text/plain; charset=utf-8", llms_txt(origin))),
        "/robots.txt" => Some(("text/plain; charset=utf-8", robots_txt(origin))),
        "/sitemap.xml" => Some(("application/xml", sitemap_at(origin))),
        _ => markdown_doc(path).map(|body| ("text/markdown; charset=utf-8", body.to_string())),
    }
}

pub fn markdown_doc(path: &str) -> Option<&'static str> {
    let slug = path.strip_prefix("/docs/")?.strip_suffix(".md")?;
    doc_by_slug(slug).map(|doc| doc.markdown)
}

pub fn sitemap() -> String {
    sitemap_at("")
}

pub fn sitemap_at(origin: &str) -> String {
    let origin = safe_origin(origin);
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for route in PAGE_ROUTES {
        xml.push_str("  <url><loc>");
        xml.push_str(&esc_xml(&format!("{origin}{route}")));
        xml.push_str("</loc></url>\n");
    }
    xml.push_str("</urlset>\n");
    xml
}

pub fn robots_txt(origin: &str) -> String {
    let origin = safe_origin(origin);
    let sitemap = format!("{origin}/sitemap.xml");
    let map = format!("{origin}/llms.txt");
    format!("User-agent: *\nAllow: /\n\nSitemap: {sitemap}\n\n# Plain-text docs map\n# {map}\n")
}

pub fn llms_txt(origin: &str) -> String {
    let origin = safe_origin(origin);
    let url = |path: &str| format!("{origin}{path}");
    let mut out = String::from(
        "# FiberShare (open source)\n\n\
This is a browser demo of herd tracking and fiber trace, built by BitPrairie LLC. It has eight sample goats on a paddock drawing, one made-up day of tracker data, and a fleece lot you can trace back to the goat. It runs on sample data, works offline, and is not the FiberShare app.\n\n\
## Try the demo\n",
    );
    for (label, path, line) in [
        (
            "Herd view",
            "/map",
            "Eight sample goats on a paddock drawing, with alerts and a sample day.",
        ),
        (
            "Fleece trace",
            "/trace",
            "The mohair-bramble lot traced back to Bramble, the goat it came from.",
        ),
        (
            "Setups",
            "/setups",
            "Your own hardware, hosted by BitPrairie, or a mix of both.",
        ),
        (
            "How it works",
            "/architecture",
            "Each automated job is optional. Turn one off and its alerts stop.",
        ),
        (
            "Rancher sign-in",
            "/rancher",
            "Sign in to see real tracker positions. The public herd view stays open.",
        ),
    ] {
        out.push_str(&format!("- [{label}]({url}): {line}\n", url = url(path)));
    }
    out.push_str("\n## Docs\n");
    out.push_str(&format!(
        "- [Docs map]({}): this file, a plain-text map of the demo and its guides.\n",
        url("/llms.txt")
    ));
    out.push_str(&format!(
        "- [Docs index]({}): the same guides as HTML, with a Markdown copy of each page.\n",
        url("/docs")
    ));
    for doc in DOCS {
        out.push_str(&format!(
            "- [{}]({}): {}\n",
            doc_heading(doc),
            url(&format!("/docs/{}.md", doc.slug)),
            doc.summary
        ));
    }
    out.push_str(
        "\n## Source\n\
- Code: https://github.com/bitprairie-team/fibershare-oss\n\
- Discord: https://discord.gg/m3x8R3sF6N\n\
- FiberShare app (separate product): https://fibershare.app\n",
    );
    out
}

pub fn docs_index() -> String {
    let list = DOCS
        .iter()
        .map(|doc| {
            format!(
                "<li><a href=\"/docs/{slug}\">{label}</a> <span class=\"text-ink-2\">·</span> {summary} <a class=\"text-sm\" href=\"/docs/{slug}.md\">Markdown</a></li>",
                slug = doc.slug,
                label = esc(doc_heading(doc)),
                summary = esc(doc.summary),
            )
        })
        .collect::<String>();
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}">
<h1>Docs</h1>
<p class="{lede}">Guides for running this demo, wiring your own trackers, and reading the record format. Each page also has a Markdown copy. A plain-text map of the same guides is at <a href="/llms.txt">/llms.txt</a>.</p>
</section>
<section aria-labelledby="guides-title">
<h2 id="guides-title" class="{stitle}">Guides</h2>
<ul class="divide-y divide-rule border-b border-rule text-ink-2 [&>li]:py-3 [&>li:first-child]:pt-0">{list}</ul>
</section>
</main>{footer}"#,
        nav = nav("/docs"),
        main = MAIN,
        head = HEAD,
        lede = LEDE,
        stitle = SECTION_TITLE,
        list = list,
        footer = footer(),
    )
}

pub fn doc_page(slug: &str) -> Option<String> {
    let doc = doc_by_slug(slug)?;
    let article = render_markdown(doc.markdown);
    Some(format!(
        r#"{nav}<main class="{main}" id="main">
<article class="doc-page pt-12 pb-8 max-sm:pt-8 max-sm:pb-6">
<p class="mb-6 text-sm"><a href="/docs">All docs</a> · <a href="/docs/{slug}.md">Markdown</a></p>
<div class="doc-prose max-w-measure text-ink-2 [&>h1]:text-ink [&>h1]:mb-4 [&>h2]:text-ink [&>h2]:mt-10 [&>h2]:mb-3 [&>h3]:text-ink [&>h3]:mt-6 [&>h3]:mb-2 [&>*+p]:mt-4 [&>ul]:mt-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ol]:mt-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>li+li]:mt-1 [&>pre]:mt-4 [&>pre]:overflow-x-auto [&>pre]:rounded-md [&>pre]:bg-band [&>pre]:p-4 [&>code]:text-sm [&>table]:mt-4 [&>table]:w-full [&>img]:mt-4">{article}</div>
</article>
</main>{footer}"#,
        nav = nav(&format!("/docs/{slug}")),
        main = MAIN,
        slug = esc(slug),
        article = article,
        footer = footer(),
    ))
}

fn doc_heading(doc: &Doc) -> &str {
    doc.markdown
        .lines()
        .next()
        .and_then(|line| line.strip_prefix("# "))
        .unwrap_or(doc.summary)
}

fn render_markdown(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_FOOTNOTES);
    let rewritten = Parser::new_ext(markdown, options).map(|event| match event {
        Event::Start(Tag::Link {
            link_type,
            dest_url,
            title,
            id,
        }) => Event::Start(Tag::Link {
            link_type,
            dest_url: rewrite_href(&dest_url).into(),
            title,
            id,
        }),
        Event::Start(Tag::Image {
            link_type,
            dest_url,
            title,
            id,
        }) => Event::Start(Tag::Image {
            link_type,
            dest_url: rewrite_href(&dest_url).into(),
            title,
            id,
        }),
        other => other,
    });
    let mut events = Vec::new();
    let mut in_link = false;
    let mut in_code = 0u8;
    for event in rewritten {
        match event {
            Event::Start(Tag::Link { .. }) | Event::Start(Tag::Image { .. }) => {
                in_link = true;
                events.push(event);
            }
            Event::End(pulldown_cmark::TagEnd::Link)
            | Event::End(pulldown_cmark::TagEnd::Image) => {
                in_link = false;
                events.push(event);
            }
            Event::Start(Tag::CodeBlock(_)) => {
                in_code += 1;
                events.push(event);
            }
            Event::End(pulldown_cmark::TagEnd::CodeBlock) => {
                in_code = in_code.saturating_sub(1);
                events.push(event);
            }
            Event::Code(text) => events.push(Event::Code(text)),
            Event::Text(text) if !in_link && in_code == 0 => {
                events.extend(autolink_text(&text));
            }
            other => events.push(other),
        }
    }
    let mut html_out = String::new();
    html::push_html(&mut html_out, events.into_iter());
    html_out
}

fn autolink_text(text: &str) -> Vec<Event<'static>> {
    let mut events = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    let mut start = 0;
    while i < bytes.len() {
        let rest = &text[i..];
        let scheme = if rest.starts_with("https://") {
            "https://"
        } else if rest.starts_with("http://") {
            "http://"
        } else {
            ""
        };
        if scheme.is_empty() {
            i += text[i..]
                .chars()
                .next()
                .map(|ch| ch.len_utf8())
                .unwrap_or(1);
            continue;
        }
        if i > start {
            events.push(Event::Text(text[start..i].to_string().into()));
        }
        let after = i + scheme.len();
        let mut end = after;
        while end < bytes.len() {
            let ch = bytes[end];
            if ch.is_ascii_whitespace() || matches!(ch, b'<' | b'>' | b'"' | b'{' | b'}') {
                break;
            }
            end += 1;
        }
        while end > after {
            let last = bytes[end - 1];
            if matches!(last, b'.' | b',' | b';' | b':' | b')' | b']') {
                end -= 1;
            } else {
                break;
            }
        }
        let url = text[i..end].to_string();
        events.push(Event::Start(Tag::Link {
            link_type: pulldown_cmark::LinkType::Autolink,
            dest_url: url.clone().into(),
            title: "".into(),
            id: "".into(),
        }));
        events.push(Event::Text(url.into()));
        events.push(Event::End(pulldown_cmark::TagEnd::Link));
        i = end;
        start = end;
    }
    if start < text.len() {
        events.push(Event::Text(text[start..].to_string().into()));
    }
    if events.is_empty() {
        events.push(Event::Text(text.to_string().into()));
    }
    events
}

fn rewrite_href(href: &str) -> String {
    let href = href.trim();
    if href.is_empty()
        || href.starts_with('#')
        || href.starts_with("http://")
        || href.starts_with("https://")
        || href.starts_with("mailto:")
        || href.starts_with("//")
    {
        return href.to_string();
    }
    let (path, hash) = match href.split_once('#') {
        Some((path, hash)) => (path, Some(hash)),
        None => (href, None),
    };
    let name = path.rsplit('/').next().unwrap_or(path);
    let slug = match name {
        "hardware.md" => Some("hardware"),
        "paddock-cameras.md" => Some("paddock-cameras"),
        "chirpstack.md" => Some("chirpstack"),
        "rancher-access.md" => Some("rancher-access"),
        "DIRECTION.md" | "direction.md" => Some("direction"),
        "README.md" if path.contains("schemas") => Some("schemas"),
        _ => None,
    };
    let rewritten = if let Some(slug) = slug {
        format!("/docs/{slug}")
    } else if name.eq_ignore_ascii_case("README.md") {
        "https://github.com/bitprairie-team/fibershare-oss".to_string()
    } else {
        href.to_string()
    };
    if slug.is_some() {
        if let Some(hash) = hash {
            format!("{rewritten}#{hash}")
        } else {
            rewritten
        }
    } else {
        rewritten
    }
}

fn esc_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
