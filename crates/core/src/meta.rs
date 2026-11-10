//! Search titles and descriptions for each demo route.

pub struct PageMeta {
    pub title: &'static str,
    pub description: &'static str,
}

pub fn meta_for_path(path: &str) -> PageMeta {
    match path {
        "/" => PageMeta {
            title: "FiberShare open-source demo: sample herd and fleece",
            description: "Open-source FiberShare demo by BitPrairie LLC: sample goat herd, day Play alerts, paddock moves, and fleece trace. Sample data only; not the FiberShare app.",
        },
        "/map" => PageMeta {
            title: "Herd view: sample goats, alerts, and day Play demo",
            description: "Sample goat herd on the map with battery and still alerts, paddock moves, grazing notes, and a short tracker trail on day Play. Demo data only.",
        },
        "/trace" | "/shop" => PageMeta {
            title: "Fleece trace demo: follow one sample lot end to end",
            description: "Follow one sample fleece lot from the goat through mill steps to a buyer-facing page. Link by hand or with the trace job. Demo records only.",
        },
        "/setups" => PageMeta {
            title: "Setups: device uplinks and rancher access for the demo",
            description: "How this FiberShare open-source demo wires device uplinks, sample herd data, and optional rancher sign-in. For developers trying the demo locally.",
        },
        "/architecture" => PageMeta {
            title: "How this FiberShare OSS demo works: pages and jobs",
            description: "Map of the FiberShare open-source demo: Rust pages, optional alert and trace jobs, sample herd events, and draft fiber schemas. Not a product tour.",
        },
        "/rancher" => PageMeta {
            title: "Rancher sign-in demo: a passphrase gate for the map",
            description: "Optional passphrase gate that opens rancher tools on the sample herd map. Local demo only; it does not connect to a live ranch or real animals.",
        },
        _ => PageMeta {
            title: "Page not found in this FiberShare open-source demo",
            description: "That address is not a page in the FiberShare open-source demo. Open Home for the sample herd overview, or Herd view for the map and day Play.",
        },
    }
}

pub const REPO: &str = "https://github.com/bitprairie-team/fibershare-oss";
pub const DISCORD: &str = "https://discord.gg/m3x8R3sF6N";
pub const APP: &str = "https://fibershare.app";
pub const PRIVACY: &str = "https://bitprairie.com/privacy";
pub const TERMS: &str = "https://bitprairie.com/terms";
