//! Search titles and descriptions for each demo route.

pub struct PageMeta {
    pub title: &'static str,
    pub description: &'static str,
}

pub fn meta_for_path(path: &str) -> PageMeta {
    match path {
        "/" => PageMeta {
            title: "Sample herd and fleece, FiberShare",
            description: "Open-source FiberShare demo by BitPrairie LLC: a sample goat herd, one sample day of alerts, paddock moves, and fleece trace. Sample data only; not the FiberShare app.",
        },
        "/map" => PageMeta {
            title: "Herd view, FiberShare",
            description: "Eight sample goats on a paddock drawing, with batteries, last check-ins, and open alerts.",
        },
        "/trace" | "/shop" => PageMeta {
            title: "Fleece trace, FiberShare",
            description: "The mohair-bramble lot traced back to Bramble, the goat it came from.",
        },
        "/setups" => PageMeta {
            title: "Setups, FiberShare",
            description: "Choose where the trackers, the server, and the records run.",
        },
        "/architecture" => PageMeta {
            title: "How it works, FiberShare",
            description: "Each automated job is optional. Turn one off and its alerts stop.",
        },
        "/rancher" => PageMeta {
            title: "Rancher sign-in, FiberShare",
            description: "Sign in to see real tracker positions. The public herd view stays open.",
        },
        _ => PageMeta {
            title: "Page not found, FiberShare",
            description: "That address is not in this demo.",
        },
    }
}

pub const REPO: &str = "https://github.com/bitprairie-team/fibershare-oss";
pub const DISCORD: &str = "https://discord.gg/m3x8R3sF6N";
pub const APP: &str = "https://fibershare.app";
pub const PRIVACY: &str = "https://bitprairie.com/privacy";
pub const TERMS: &str = "https://bitprairie.com/terms";
