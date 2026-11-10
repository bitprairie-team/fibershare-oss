use fibershare_core::meta::{PRIVACY, TERMS};

use crate::document::{esc, esc_attr};

pub const MAIN: &str = "mx-auto w-full max-w-page px-gutter pb-24";
pub const HEAD: &str = "pt-12 pb-8 max-sm:pt-8 max-sm:pb-6";
pub const LEDE: &str = "mt-4 max-w-measure text-lg text-ink-2";
pub const ACTIONS: &str = "mt-6 flex flex-wrap items-center gap-3";
pub const SECTION: &str = "mt-14 border-t border-ink pt-5 max-sm:mt-10 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-12";
pub const SECTION_TITLE: &str = "text-xl max-lg:mb-4";
pub const BODY: &str = "min-w-0 max-w-content";
pub const PROSE: &str = "max-w-measure text-ink-2 [&>*+*]:mt-4";
pub const ROWS: &str = "divide-y divide-rule border-b border-rule [&>:first-child]:pt-0";
pub const LIST: &str =
    "divide-y divide-rule border-b border-rule text-ink-2 [&>li]:py-3 [&>li:first-child]:pt-0";

const NAV: &[(&str, &str)] = &[
    ("/", "Home"),
    ("/map", "Herd view"),
    ("/trace", "Fleece trace"),
    ("/setups", "Setups"),
    ("/architecture", "How it works"),
    ("/rancher", "Rancher sign-in"),
];

const MARK: &str = r##"<svg class="size-8" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="7" fill="#5c4030"/><path d="M15 12c-.6-4.1 3.1-7.1 6.5-5.6 1.8.8 1.2 3.1-.9 3.6 2.6-.2 4.4 1.6 3.3 3.8-.8 1.7-3.6 1.4-4.8-.4" fill="none" stroke="#c49a6c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 15c-2.9.9-4.3 4.5-2.3 6.8 1.4 1.6 4 .8 4.5-1.5.4-1.8-.4-4.1-2.2-5.3z" fill="#e8dfd2"/><path d="M10 14c1.4-5 7-7.4 11.6-5.1 3.6 1.7 6.5 5.6 5.6 8.8-.6 2.3-3 4.1-6.3 4.3-3.4.2-6.8-.4-8.8-2.3-1.8-1.7-2.4-4-2.1-5.7z" fill="#f4efe6"/><circle cx="20.75" cy="15" r="1.3" fill="#1c1916"/></svg>"##;

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
<p class="m-0 border-b border-rule bg-band px-4 py-1 text-center text-xs text-ink-2">This is a demo, not the FiberShare app.</p>
<div class="relative mx-auto flex h-16 max-w-page items-center gap-4 px-gutter max-sm:h-14">
<a class="mr-auto inline-flex flex-none items-center gap-2.5 text-lg font-semibold tracking-tight text-ink no-underline hover:text-ink" href="/">{mark}<span>FiberShare</span></a>
<nav class="flex items-center gap-1 max-nav:absolute max-nav:inset-x-0 max-nav:top-full max-nav:z-10 max-nav:hidden max-nav:max-h-[calc(100dvh-7rem)] max-nav:flex-col max-nav:items-stretch max-nav:gap-0 max-nav:overflow-y-auto max-nav:border-y max-nav:border-rule max-nav:bg-surface max-nav:px-gutter max-nav:pt-2 max-nav:pb-4 max-nav:[&.is-open]:flex" id="primary-nav" aria-label="Primary">{links}</nav>
<div class="relative z-20 flex flex-none items-center gap-1">
<button class="h-10 cursor-pointer px-2 text-sm font-medium text-ink-2 hover:text-ink" type="button" data-tour-start>Tour</button>
<button class="icon-btn" type="button" data-theme-toggle aria-label="Switch to dark theme"><svg class="i-moon size-5" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14.5 3.2a8.5 8.5 0 1 0 6.3 14.1A7 7 0 0 1 14.5 3.2z"/></svg><svg class="i-sun size-5" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg></button>
<button class="icon-btn nav-toggle nav:hidden" type="button" data-nav-toggle aria-controls="primary-nav" aria-expanded="false" aria-label="Menu"><svg class="i-open size-5" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-width="1.6" d="M4 7h16M4 12h16M4 17h16"/></svg><svg class="i-close size-5" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-width="1.6" d="M6 6l12 12M18 6L6 18"/></svg></button>
</div></div></header>"##,
        mark = MARK,
    )
}

pub fn footer() -> String {
    format!(
        r#"<footer class="site-footer mt-auto border-t border-rule text-sm text-ink-2">
<div class="mx-auto flex max-w-page items-center gap-3 px-gutter py-6">
<img class="size-7 flex-none rounded-md" src="/brand/bitprairie-tile.svg" alt="" width="28" height="28" />
<div class="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-2">
<p>© 2026 BitPrairie LLC</p>
<nav class="flex flex-wrap gap-4" aria-label="Legal">
<a class="text-ink-2 underline underline-offset-[0.15em] hover:text-ink" href="{terms}">Terms</a>
<a class="text-ink-2 underline underline-offset-[0.15em] hover:text-ink" href="{privacy}">Privacy</a>
</nav></div></div></footer>"#,
        terms = TERMS,
        privacy = PRIVACY,
    )
}

pub fn q(query: &str, key: &str) -> Option<String> {
    for pair in query.trim_start_matches('?').split('&') {
        let mut bits = pair.splitn(2, '=');
        if bits.next() == Some(key) {
            return bits.next().map(esc_attr);
        }
    }
    None
}
