use fibershare_core::meta::{PRIVACY, TERMS};

use crate::document::esc;

pub const MAIN: &str = "mx-auto w-full max-w-page px-gutter pb-24";
pub const HEAD: &str = "pt-12 pb-8 max-sm:pt-8 max-sm:pb-6";
pub const LEDE: &str = "mt-4 max-w-measure text-lg text-ink-2";
pub const ACTIONS: &str = "mt-6 flex flex-wrap items-center gap-3";
pub const SECTION: &str = "mt-14 border-t border-ink pt-5 max-sm:mt-10 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-12";
pub const SECTION_TITLE: &str = "text-xl max-lg:mb-4";
pub const BODY: &str = "min-w-0 max-w-content";
pub const PROSE: &str = "max-w-measure text-ink-2 [&>*+*]:mt-4";
pub const LIST: &str =
    "divide-y divide-rule border-b border-rule text-ink-2 [&>li]:py-3 [&>li:first-child]:pt-0";

const NAV: &[(&str, &str)] = &[
    ("/map", "Herd"),
    ("/trace", "Trace"),
    ("/rancher", "Sign in"),
];

const SAMPLE_NOTE: &str = "Sample data. This is not the FiberShare app.";

const MARK: &str = r#"<img class="size-8 logo-mark logo-mark-light" src="/brand/logo-light.svg" alt="" width="32" height="32" /><img class="size-8 logo-mark logo-mark-dark" src="/brand/logo-dark.svg" alt="" width="32" height="32" />"#;

pub fn nav(active: &str) -> String {
    let links = NAV
        .iter()
        .map(|(href, label)| {
            let current = if *href == active {
                " aria-current=\"page\""
            } else {
                ""
            };
            format!(
                "<a class=\"nav-link\" href=\"{href}\"{current}>{}</a>",
                esc(label)
            )
        })
        .collect::<String>();
    format!(
        r##"<a class="skip-link absolute -top-16 left-4 z-[100] rounded-md bg-leather px-4 py-2 font-semibold text-on-leather no-underline focus:top-3" href="#main">Skip to content</a>
<header class="site-header sticky top-0 z-40 border-b border-rule bg-paper">
<div class="relative mx-auto flex h-16 max-w-page items-center gap-4 px-gutter max-sm:h-14">
<a class="mr-auto inline-flex flex-none items-center gap-2.5 text-lg font-semibold tracking-tight text-ink no-underline hover:text-ink" href="/">{mark}<span>FiberShare</span></a>
<nav class="flex items-center gap-1 max-nav:absolute max-nav:inset-x-0 max-nav:top-full max-nav:z-10 max-nav:hidden max-nav:max-h-[calc(100dvh-4.5rem)] max-nav:flex-col max-nav:items-stretch max-nav:gap-0 max-nav:overflow-y-auto max-nav:border-y max-nav:border-rule max-nav:bg-surface max-nav:px-gutter max-nav:pt-2 max-nav:pb-4 max-nav:[&.is-open]:flex" id="primary-nav" aria-label="Primary">{links}</nav>
<div class="relative z-20 flex flex-none items-center gap-1">
<button class="icon-btn" type="button" data-theme-toggle aria-label="Switch to dark theme"><svg class="i-moon size-5" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14.5 3.2a8.5 8.5 0 1 0 6.3 14.1A7 7 0 0 1 14.5 3.2z"/></svg><svg class="i-sun size-5" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg></button>
<button class="icon-btn nav-toggle nav:hidden" type="button" data-nav-toggle aria-controls="primary-nav" aria-expanded="false" aria-label="Menu"><svg class="i-open size-5" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-width="1.6" d="M4 7h16M4 12h16M4 17h16"/></svg><svg class="i-close size-5" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-width="1.6" d="M6 6l12 12M18 6L6 18"/></svg></button>
</div></div></header>"##,
        mark = MARK,
    )
}

pub fn footer() -> String {
    format!(
        r#"<footer class="site-footer mt-auto border-t border-rule text-sm text-ink-2">
<div class="mx-auto flex max-w-page items-start gap-3 px-gutter py-6">
<img class="size-8 flex-none" src="/brand/bitprairie-tile.svg" alt="BitPrairie" width="32" height="32" />
<div class="flex min-w-0 flex-col gap-2">
<p>{note}</p>
<nav class="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
<a class="text-ink-2 underline underline-offset-[0.15em] hover:text-ink" href="/docs">Docs</a>
<a class="text-ink-2 underline underline-offset-[0.15em] hover:text-ink" href="/setups">Setups</a>
<a class="text-ink-2 underline underline-offset-[0.15em] hover:text-ink" href="/architecture">How it works</a>
<a class="text-ink-2 underline underline-offset-[0.15em] hover:text-ink" href="{terms}">Terms</a>
<a class="text-ink-2 underline underline-offset-[0.15em] hover:text-ink" href="{privacy}">Privacy</a>
</nav>
<p>© 2026 BitPrairie LLC</p>
</div></div></footer>"#,
        note = SAMPLE_NOTE,
        terms = TERMS,
        privacy = PRIVACY,
    )
}

pub fn q(query: &str, key: &str) -> Option<String> {
    for pair in query.trim_start_matches('?').split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut bits = pair.splitn(2, '=');
        if bits.next() == Some(key) {
            return Some(percent_decode(bits.next().unwrap_or("")));
        }
    }
    None
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &raw[i + 1..i + 3];
                if let Ok(value) = u8::from_str_radix(hex, 16) {
                    out.push(value);
                    i += 3;
                } else {
                    out.push(b'%');
                    i += 1;
                }
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}
