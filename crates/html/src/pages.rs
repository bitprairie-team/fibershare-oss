//! The pages other than the herd view.
//! Each page's sentences live in `copy` so they can be read in one place.

use fibershare_core::jobs::{alert_job_list, alerts_off_notice_html, PLANNED};
use fibershare_core::meta::{DISCORD, REPO};
use fibershare_core::records::{trace_lot, visible_record};
use fibershare_core::settings::{read_jobs, read_rules, MemoryStore};
use fibershare_core::time::time_of;
use serde_json::{json, Value};

use crate::document::esc;
use crate::layout::{
    footer, nav, q, ACTIONS, BODY, HEAD, LEDE, LIST, MAIN, PROSE, SECTION, SECTION_TITLE,
};

/// How this copy checks a rancher. The Worker sets Access only when it is configured.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SignIn {
    Passphrase,
    Access,
    None,
}

mod copy {
    pub const HOME_TITLE: &str = "Sample herd, one day's trackers";
    pub const HOME_LEDE: &str = "This demo follows eight sample goats through one made-up day. It flags low batteries and missed check-ins, lists Predator Watch and Wildfire Watch reports, and traces a fleece lot back to the goat. Every automated job can be turned off. You can still add alerts, notes, and checks by hand.";
    pub const HOME_ACTION: &str = "Open the herd view";
    pub const HOME_DOCS: &str = "Read the docs";

    pub const SETUPS_TITLE: &str = "Setups";
    pub const SETUPS_LEDE: &str =
        "Choose where the trackers, the server, and the records run. You can change this later.";
    pub const SETUPS_WHERE: &str = "What runs where";
    pub const NETWORK_TITLE: &str = "Community network";
    pub const NETWORK_LEAD: &str = "Ranchers can share a server they host themselves, or a co-op server. Talk with other ranchers on";
    pub const SUPPORT: &str = "Ranch support pays for animals and pasture. Support is not ownership or an investment return.";
    pub const RESEARCH: &str =
        "Data shared with agencies or researchers is combined or delayed, with no exact locations.";

    pub const WORK_TITLE: &str = "How it works";
    pub const WORK_LEDE: &str = "Each automated job is optional. Turn one off and its alerts stop. You can still add alerts, notes, and checks by hand.";
    pub const WORK_SAVED: &str =
        "The choice is saved in this browser, or on the server once you sign in.";
    pub const WORK_JOBS: &str = "Automated jobs";
    pub const WORK_README: &str = "To run a copy, see the README.";

    pub const TRACE_TITLE: &str = "Fleece trace";
    pub const TRACE_LEDE: &str = "This lot goes back to Bramble.";
    pub const TRACE_WHO: &str = "Who can see this";
    pub const TRACE_OFF: &str = "Tracing is off, so these records are not linked.";
    pub const TRACE_LINK: &str = "Link them once";

    pub const SIGN_TITLE: &str = "Rancher sign-in";
    pub const SIGN_LEDE: &str =
        "Sign in to see real tracker positions. The public herd view stays open without it.";
    pub const SIGN_LABEL: &str = "Passphrase";
    pub const SIGN_BUTTON: &str = "Sign in";
    pub const SIGN_LOCAL: &str = "Set a passphrase with";
    pub const SIGN_ACCESS: &str = "Sign-in on this copy is Cloudflare Access.";
    pub const MAP_TITLE: &str = "Rancher map";
    pub const MAP_CAPTION: &str = "After sign-in, trackers show at their real positions. Layers come from public agencies and OpenStreetMap. Esri basemaps appear only if an ArcGIS key is set.";
    pub const MAP_DRAWING: &str =
        "This drawing is not the live map. The live map needs your own trackers. Run";

    pub const MISSING_TITLE: &str = "Page not found";
    pub const MISSING_LEDE: &str = "That address is not in this demo.";
    pub const MISSING_ACTION: &str = "Back home";
}

pub fn home() -> String {
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}" data-tour="hero">
<h1>{title}</h1>
<p class="{lede}">{lede_text}</p>
<p class="{actions}"><a class="btn btn-primary" href="/map">{action}</a><a class="btn btn-ghost" href="/docs">{docs}</a></p>
</section></main>{footer}"#,
        nav = nav("/"),
        main = MAIN,
        head = HEAD,
        title = copy::HOME_TITLE,
        lede = LEDE,
        lede_text = copy::HOME_LEDE,
        actions = ACTIONS,
        action = copy::HOME_ACTION,
        docs = copy::HOME_DOCS,
        footer = footer(),
    )
}

pub fn setups() -> String {
    let heads = ["Your own hardware", "Hosted by BitPrairie", "A mix of both"]
        .iter()
        .map(|s| format!("<th scope=\"col\">{s}</th>"))
        .collect::<String>();
    let rows = [
        (
            "Trackers and radios",
            "You build or buy them.",
            "Kits from BitPrairie.",
            "Your own, or a kit.",
        ),
        (
            "Network server",
            "On your hardware.",
            "Run by BitPrairie.",
            "On your hardware.",
        ),
        (
            "Herd view and records",
            "This code, run by you.",
            "The FiberShare app.",
            "Either, or both.",
        ),
        (
            "Predator and smoke alerts",
            "Your own rules, or none.",
            "Predator Watch and Wildfire Watch, from BitPrairie's realtime intelligence systems.",
            "Hosted, on top of your radios.",
        ),
        (
            "Event history",
            "Kept by you. Public pages never show where an animal is. Only a signed-in rancher sees tracker positions.",
            "Kept by BitPrairie for you. Each rancher owns their event history. It is shared only if they opt in.",
            "You choose what goes to the hosted side. Public pages never show where an animal is.",
        ),
        (
            "Support",
            "Community, on Discord and GitHub.",
            "BitPrairie.",
            "Both.",
        ),
    ];
    let body = rows
        .iter()
        .map(|(part, a, b, c)| {
            format!(
                "<tr><th scope=\"row\">{part}</th><td data-setup=\"Your own hardware\">{a}</td><td data-setup=\"Hosted by BitPrairie\">{b}</td><td data-setup=\"A mix of both\">{c}</td></tr>"
            )
        })
        .collect::<String>();
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}"><h1>{title}</h1>
<p class="{lede}">{lede_text}</p></section>
<section class="{section} mt-0 max-sm:mt-0" aria-labelledby="where-title">
<h2 id="where-title" class="{stitle}">{where_title}</h2>
<div class="overflow-x-auto" data-tour="setups"><table class="data-table compare-table"><thead><tr><td></td>{heads}</tr></thead><tbody>{body}</tbody></table></div>
</section>
<section class="{section}" aria-labelledby="network-title">
<h2 id="network-title" class="{stitle}">{network_title}</h2>
<div class="{prose}">
<p>{network_lead} <a href="{discord}">Discord</a>, or read the code on <a href="{repo}">GitHub</a>.</p>
<p><span class="tag">Planned</span> {research}</p>
<p>{support}</p>
</div></section></main>{footer}"#,
        nav = nav("/setups"),
        main = MAIN,
        head = HEAD,
        title = copy::SETUPS_TITLE,
        lede = LEDE,
        lede_text = copy::SETUPS_LEDE,
        section = SECTION,
        stitle = SECTION_TITLE,
        where_title = copy::SETUPS_WHERE,
        heads = heads,
        body = body,
        network_title = copy::NETWORK_TITLE,
        prose = PROSE,
        network_lead = copy::NETWORK_LEAD,
        discord = DISCORD,
        repo = REPO,
        research = copy::RESEARCH,
        support = copy::SUPPORT,
        footer = footer(),
    )
}

pub fn architecture() -> String {
    let store = MemoryStore::default();
    let jobs_state = read_jobs(&store);
    let rules = read_rules(&store);
    let jobs = alert_job_list(&rules);
    let list = jobs
        .iter()
        .map(|job| {
            let on = jobs_state.get(job.id).copied().unwrap_or(true);
            let what = if on {
                job.detail.clone()
            } else {
                job.off.to_string()
            };
            format!(
                "<li class=\"job-row\"><label class=\"toggle\"><input type=\"checkbox\" data-job=\"{id}\"{checked} aria-describedby=\"job-{id}\" /><span class=\"job-name\">{name}</span></label><p class=\"job-what\" id=\"job-{id}\" data-job-what=\"{id}\">{what}</p></li>",
                id = job.id,
                checked = if on { " checked" } else { "" },
                name = esc(&job.name),
                what = esc(&what),
            )
        })
        .collect::<String>();
    let planned = PLANNED
        .iter()
        .map(|item| format!("<li><span class=\"tag\">Planned</span> {item}.</li>"))
        .collect::<String>();
    let any = jobs_state.values().any(|on| *on);
    let readme_url = format!("{}/blob/main/README.md", REPO);
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}"><h1>{title}</h1>
<p class="{lede}">{lede_text}</p></section>
<section class="{section} mt-0 max-sm:mt-0" aria-labelledby="jobs-title">
<h2 id="jobs-title" class="{stitle}">{jobs_title}</h2>
<div class="{body}">
<p class="max-w-measure text-sm text-ink-2">{saved}</p>
{notice}
<ul class="job-list">{list}</ul>
<p class="mt-3 text-sm"><button type="button" class="btn-link" data-all-jobs>{all}</button><span class="sr-only" role="status" data-job-status></span></p>
<ul class="{listclass} mt-6">{planned}</ul>
<p class="mt-6 text-sm"><a href="{repo}">{readme}</a></p>
</div></section></main>{footer}"#,
        nav = nav("/architecture"),
        main = MAIN,
        head = HEAD,
        title = copy::WORK_TITLE,
        lede = LEDE,
        lede_text = copy::WORK_LEDE,
        section = SECTION,
        stitle = SECTION_TITLE,
        jobs_title = copy::WORK_JOBS,
        body = BODY,
        saved = copy::WORK_SAVED,
        notice = alerts_off_notice_html(&jobs_state, &rules),
        list = list,
        all = if any {
            "Turn every job off"
        } else {
            "Turn every job on"
        },
        listclass = LIST,
        planned = planned,
        readme = copy::WORK_README,
        repo = readme_url,
        footer = footer(),
    )
}

fn records() -> Value {
    json!({
        "animals": [serde_json::from_str::<Value>(include_str!("../../../docs/schemas/examples/animal.example.json")).unwrap_or(json!({}))],
        "shearings": [serde_json::from_str::<Value>(include_str!("../../../docs/schemas/examples/shearing.example.json")).unwrap_or(json!({}))],
        "fleeces": [serde_json::from_str::<Value>(include_str!("../../../docs/schemas/examples/fleece.example.json")).unwrap_or(json!({}))],
        "lots": [serde_json::from_str::<Value>(include_str!("../../../docs/schemas/examples/fiber-lot.example.json")).unwrap_or(json!({}))],
    })
}

pub fn trace(query: &str) -> String {
    let viewer = match q(query, "view").as_deref() {
        Some("buyers") | Some("buyer") => "buyers",
        Some("public") => "public",
        _ => "rancher",
    };
    let jobs = read_jobs(&MemoryStore::default());
    let tracing = jobs.get("trace").copied().unwrap_or(true);
    let chain = if tracing {
        let traced = trace_lot("mohair-bramble", &records());
        let why = format!(
            "Linked at {} by the trace job, from this lot to Bramble.",
            time_of("2026-09-06T18:05:00")
        );
        format!(
            "<p class=\"trace-why\" data-trace-why>{}</p><ol class=\"trace-chain\" data-tour=\"chain\">{}</ol>",
            esc(&why),
            trace_steps(&traced, viewer)
        )
    } else {
        let traced = trace_lot("mohair-bramble", &records());
        format!(
            "<p class=\"trace-why\" data-trace-why>{} <button type=\"button\" class=\"btn-link\" data-link-once>{}</button></p><ol class=\"trace-chain\" data-tour=\"chain\">{}</ol>",
            copy::TRACE_OFF,
            copy::TRACE_LINK,
            trace_steps(&traced, viewer)
        )
    };
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}"><h1>{title}</h1>
<p class="{lede}">{lede_text}</p></section>
<p class="trace-viewer" id="viewer-label">{who} <a href="/trace?view=rancher"{r}>Rancher</a> <a href="/trace?view=buyers"{b}>Buyer</a> <a href="/trace?view=public"{p}>Public</a></p>
<div data-chain aria-live="polite">{chain}</div>
</main>{footer}"#,
        nav = nav("/trace"),
        main = MAIN,
        head = HEAD,
        title = copy::TRACE_TITLE,
        lede = LEDE,
        lede_text = copy::TRACE_LEDE,
        who = copy::TRACE_WHO,
        r = if viewer == "rancher" {
            " aria-current=\"page\""
        } else {
            ""
        },
        b = if viewer == "buyers" {
            " aria-current=\"page\""
        } else {
            ""
        },
        p = if viewer == "public" {
            " aria-current=\"page\""
        } else {
            ""
        },
        chain = chain,
        footer = footer(),
    )
}

fn long_date(iso: &str) -> String {
    let months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let mut parts = iso.split('-');
    let year = parts.next().unwrap_or("");
    let month: usize = parts.next().unwrap_or("0").parse().unwrap_or(0);
    let day = parts.next().unwrap_or("").trim_start_matches('0');
    if !(1..=12).contains(&month) || day.is_empty() {
        return iso.to_string();
    }
    format!("{day} {} {year}", months[month - 1])
}

fn step_name(kind: &str, record: &Value) -> String {
    match record.get("id").and_then(Value::as_str) {
        Some("mohair-bramble") => "Bramble mohair".into(),
        Some("bramble-2026-03-14-fleece") => "Shorn 14 March 2026".into(),
        Some("bramble-2026-03-14") => long_date(
            record
                .get("date")
                .and_then(Value::as_str)
                .unwrap_or("2026-03-14"),
        ),
        _ if kind == "Animal" => record
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Bramble")
            .to_string(),
        _ => record
            .get("name")
            .or_else(|| record.get("id"))
            .and_then(Value::as_str)
            .unwrap_or(kind)
            .to_string(),
    }
}

fn trace_steps(traced: &Option<Value>, viewer: &str) -> String {
    let Some(traced) = traced else {
        return String::new();
    };
    let steps = [
        ("Fiber lot", traced.get("lot")),
        ("Fleece", traced.pointer("/steps/0/fleece")),
        ("Shearing", traced.pointer("/steps/0/shearing")),
        ("Animal", traced.pointer("/steps/0/animal")),
    ];
    steps
        .iter()
        .map(|(kind, record)| {
            let Some(record) = *record else {
                return format!("<li class=\"trace-step\"><h2>{kind}</h2><p>Not shared</p></li>");
            };
            if visible_record(Some(record), viewer).is_none() {
                return format!("<li class=\"trace-step\"><h2>{kind}</h2><p>Not shared</p></li>");
            }
            let name = step_name(kind, record);
            let id = record.get("id").and_then(Value::as_str).unwrap_or("");
            let id_html = if viewer == "rancher" && !id.is_empty() {
                format!("<p class=\"trace-id\">{}</p>", esc(id))
            } else {
                String::new()
            };
            format!(
                "<li class=\"trace-step\"><h2>{}</h2><p>{}</p>{id}</li>",
                esc(&name),
                esc(kind),
                id = id_html,
            )
        })
        .collect()
}

pub fn rancher(query: &str, sign_in: SignIn) -> String {
    let error = q(query, "error").unwrap_or_default();
    let error_html = if error.is_empty() {
        String::new()
    } else {
        format!("<p class=\"form-error\" role=\"alert\">{}</p>", esc(&error))
    };
    let help = match sign_in {
        SignIn::Passphrase => format!(
            "<p class=\"text-sm text-muted\">{} <code>fibershare passphrase</code>.</p>",
            copy::SIGN_LOCAL
        ),
        SignIn::Access => format!("<p class=\"text-sm text-muted\">{}</p>", copy::SIGN_ACCESS),
        SignIn::None => String::new(),
    };
    let layers = serde_json::to_string(&fibershare_core::layers::layers())
        .unwrap_or_else(|_| "[]".into())
        .replace('<', "\\u003c");
    format!(
        r##"{nav}<main class="{main}" id="main">
<section class="{head}"><h1>{title}</h1>
<p class="{lede}">{lede_text}</p></section>
{error}
<form class="grid max-w-form gap-2" data-sign-in method="post" action="/api/rancher/login">
<label class="text-sm font-semibold" for="passphrase">{label}</label>
<input class="input" id="passphrase" name="passphrase" type="password" autocomplete="current-password" required minlength="12" />
<button type="submit" class="btn btn-primary mt-2 justify-self-start">{button}</button>
</form>
{help}
<div class="rancher-callout" data-tour="rancher-map">
<h2>{map_title}</h2>
<div class="mock-map" role="img" aria-label="Drawing of the rancher map. Tracker dots sit on pasture, a dashed line marks a fire perimeter, and the layer names are listed.">
<svg viewBox="0 0 640 400" aria-hidden="true"><rect width="640" height="400" fill="#e7dfd2"/><path d="M0 230 C90 200 150 270 240 236 C330 202 390 280 480 240 C540 216 590 250 640 228 V400 H0Z" fill="#d7cbb8"/><path d="M0 300 C110 274 210 334 320 302 C430 270 520 332 640 292 V400 H0Z" fill="#c9baa4"/><path d="M70 120 C150 78 210 150 290 112 C370 74 430 156 520 118" fill="none" stroke="#6B4A2E" stroke-width="3" stroke-dasharray="8 6"/><circle cx="150" cy="196" r="8" fill="#6B4A2E"/><circle cx="268" cy="214" r="8" fill="#6B4A2E"/><circle cx="392" cy="188" r="8" fill="#6B4A2E"/><circle cx="498" cy="230" r="8" fill="#6B4A2E"/></svg>
<div class="mock-legend"><p>Layers</p><ul><li>Wildfire perimeters</li><li>Smoke from satellite</li><li>Federal land ownership</li></ul></div>
</div>
<p>{caption}</p>
<p class="text-sm text-muted">{drawing} <code>fibershare pull</code> on your own hardware.</p>
<div id="live-map" class="live-map" data-live-map hidden></div>
<script type="application/json" id="map-layers">{layers}</script>
</div>
<link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
<script src="/vendor/leaflet/leaflet.js"></script>
<script src="/live-map.js"></script>
</main>{footer}"##,
        nav = nav("/rancher"),
        main = MAIN,
        head = HEAD,
        title = copy::SIGN_TITLE,
        lede = LEDE,
        lede_text = copy::SIGN_LEDE,
        error = error_html,
        label = copy::SIGN_LABEL,
        button = copy::SIGN_BUTTON,
        help = help,
        map_title = copy::MAP_TITLE,
        caption = copy::MAP_CAPTION,
        drawing = copy::MAP_DRAWING,
        layers = layers,
        footer = footer(),
    )
}

pub fn not_found() -> String {
    format!(
        r#"{nav}<main class="{main}" id="main"><section class="{head}"><h1>{title}</h1><p class="{lede}">{lede_text}</p><p class="{actions}"><a class="btn btn-primary" href="/">{action}</a></p></section></main>{footer}"#,
        nav = nav(""),
        main = MAIN,
        head = HEAD,
        title = copy::MISSING_TITLE,
        lede = LEDE,
        lede_text = copy::MISSING_LEDE,
        actions = ACTIONS,
        action = copy::MISSING_ACTION,
        footer = footer(),
    )
}

pub fn page_body(path: &str) -> String {
    match path {
        "/" => home(),
        _ => not_found(),
    }
}
