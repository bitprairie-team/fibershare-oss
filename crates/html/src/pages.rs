//! The pages other than the herd view.

use fibershare_core::jobs::{alert_job_list, alerts_off_notice_html, PLANNED};
use fibershare_core::meta::{APP, DISCORD, REPO};
use fibershare_core::records::{trace_lot, visible_record};
use fibershare_core::settings::{read_jobs, read_rules, MemoryStore};
use fibershare_core::time::time_of;
use serde_json::{json, Value};

use crate::document::esc;
use crate::layout::{
    footer, nav, q, ACTIONS, BODY, HEAD, LEDE, LIST, MAIN, PROSE, ROWS, SECTION, SECTION_TITLE,
};

const LICENSE: &str = "The code is MIT licensed, so anyone may use it. Joining the community network through a self-hosted or co-op server is free for non-commercial and research use.";

pub fn home() -> String {
    let setups = [
        ("Your own hardware", "Trackers, radio gateway and server on the ranch. The data stays on your land."),
        ("Hosted by BitPrairie", "BitPrairie runs the server and can supply the trackers. The ranch needs an internet connection."),
        ("A mix of both", "Your gateway and server on the ranch, with hosted alerts from BitPrairie."),
    ]
    .iter()
    .map(|(name, short)| format!("<li class=\"grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[13rem_minmax(0,1fr)]\"><h3 class=\"text-base\">{name}</h3><p class=\"text-sm text-ink-2\">{short}</p></li>"))
    .collect::<String>();
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="max-w-[46rem] pt-20 pb-6 max-sm:pt-10" data-tour="hero">
<h1 class="text-display">Herd tracking for local ranchers</h1>
<p class="mt-6 max-w-measure text-lg text-ink-2">FiberShare checks each tracker's battery and check-ins, lists Predator Watch and Wildfire Watch reports, and traces fiber back to the goat. Each of those jobs can be turned off. When a job is off, its alerts stop, and you can still add alerts, notes and checks by hand.</p>
<p class="mt-4 max-w-measure text-ink-2">FiberShare is a ranch program from BitPrairie LLC, growing into a network of local ranchers in the western US. This demo runs on 8 sample goats and one made-up day of tracker data.</p>
<p class="mt-4 max-w-measure text-ink-2">{license}</p>
<div class="{actions} mt-8"><a class="btn btn-primary" href="/map">Open the herd view</a></div>
</section>
<section class="{section} mt-20" aria-labelledby="setups-title">
<h2 id="setups-title" class="{title}">Three setups</h2>
<div class="{body}"><ul class="{rows}">{setups}</ul>
<p class="mt-4 text-sm"><a href="/setups">Compare the setups side by side</a></p></div>
</section></main>{footer}"#,
        nav = nav("/"),
        main = MAIN,
        license = LICENSE,
        actions = ACTIONS,
        section = SECTION,
        title = SECTION_TITLE,
        body = BODY,
        rows = ROWS,
        setups = setups,
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
            "Kept by you.",
            "Kept by BitPrairie for you. Shared only if you opt in.",
            "You choose what goes to the hosted side.",
        ),
        (
            "Support",
            "Community, on Discord and GitHub.",
            "BitPrairie.",
            "Both.",
        ),
        (
            "Cost",
            "Free and open source.",
            "A fee for hardware and hosting.",
            "A fee for the hosted parts.",
        ),
    ];
    let body = rows
        .iter()
        .map(|(part, a, b, c)| {
            format!("<tr><th scope=\"row\">{part}</th><td>{a}</td><td>{b}</td><td>{c}</td></tr>")
        })
        .collect::<String>();
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}"><h1>Setups</h1>
<p class="{lede}">Pick where the trackers, server and records run: your own hardware, hosted by BitPrairie, or a mix. You can switch later.</p></section>
<section class="{section} mt-0 max-sm:mt-0" aria-labelledby="where-title">
<h2 id="where-title" class="{title}">What runs where</h2>
<div class="overflow-x-auto" data-tour="setups"><table class="data-table compare-table"><thead><tr><td></td>{heads}</tr></thead><tbody>{body}</tbody></table></div>
</section>
<section class="{section}" aria-labelledby="every-title">
<h2 id="every-title" class="{title}">In every setup</h2>
<ul class="{list} {bodyclass}">
<li>Public pages never show where an animal is. Only a signed-in rancher sees tracker positions.</li>
<li>Each rancher owns their event history. It is shared only if they opt in.</li>
<li><span class="tag">Planned</span> Data shared with agencies or researchers is combined or delayed, with no exact locations.</li>
</ul></section>
<section class="{section}" aria-labelledby="network-title">
<h2 id="network-title" class="{title}">Community network</h2>
<div class="{prose}">
<p>The community network is self-hosted or run as a co-op. It is free for non-commercial and research use. Talk with other ranchers on <a href="{discord}">Discord</a>, or read the code on <a href="{repo}">GitHub</a>.</p>
<p>Ranch support pays for animals and pasture. Support is not ownership or an investment return.</p>
</div></section></main>{footer}"#,
        nav = nav("/setups"),
        main = MAIN,
        head = HEAD,
        lede = LEDE,
        section = SECTION,
        title = SECTION_TITLE,
        heads = heads,
        body = body,
        list = LIST,
        bodyclass = BODY,
        prose = PROSE,
        discord = DISCORD,
        repo = REPO,
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
            let what = if on { format!("On. {}", job.detail) } else { format!("Off. {}", job.off) };
            format!(
                "<li class=\"job-row\"><label class=\"toggle\"><input type=\"checkbox\" data-job=\"{}\"{} aria-describedby=\"job-{}\" /> <strong>{}</strong></label><span id=\"job-{}\" data-job-what=\"{}\">{}</span></li>",
                job.id,
                if on { " checked" } else { "" },
                job.id,
                esc(&job.name),
                job.id,
                job.id,
                esc(&what),
            )
        })
        .collect::<String>();
    let planned = {
        let mut text = PLANNED.join(", ");
        if let Some(i) = text.rfind(", ") {
            text.replace_range(i..i + 2, " and ");
        }
        let mut chars = text.chars();
        match chars.next() {
            Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
            None => String::new(),
        }
    };
    let any = jobs_state.values().any(|on| *on);
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}"><h1>How it works</h1>
<p class="{lede}">What the demo does with tracker data, and the parts it runs on. Each automated job can be turned off below. All of it runs on your own hardware, with no account.</p></section>
<section class="{section} mt-0 max-sm:mt-0" aria-labelledby="jobs-title">
<h2 id="jobs-title" class="{title}">Automated jobs</h2>
<div class="{body}">
<p class="max-w-measure text-sm text-ink-2">Every job is on until you turn it off. With all of them off, the herd view still works by hand: answer and add alerts, save notes, and mark animals checked. Saved in this browser, or on the server once you sign in.</p>
{notice}
<ul class="job-list mt-3 divide-y divide-rule border-y border-rule">{list}</ul>
<p class="mt-3 text-sm"><button type="button" class="btn-link" data-all-jobs>{all}</button><span class="sr-only" role="status" data-job-status></span></p>
<p class="mt-6 max-w-measure text-sm text-ink-2"><span class="tag">Planned</span> {planned}.</p>
</div></section>
<section class="{section}" aria-labelledby="parts-title">
<h2 id="parts-title" class="{title}">Parts</h2>
<dl class="{body} grid text-sm">
<dt class="font-medium text-ink">Pages</dt><dd class="text-ink-2">Plain web pages rendered in Rust. Run them yourself or publish a copy on Cloudflare.</dd>
<dt class="font-medium text-ink">Sample data</dt><dd class="text-ink-2">The goats, the sample day and the fiber lots are in <code>public/data</code>.</dd>
<dt class="font-medium text-ink">Server routes</dt><dd class="text-ink-2"><code>/api/live</code> sends tracker data, <code>/api/session</code> handles sign-in and <code>/api/alerts</code> and <code>/api/log</code> keep a signed-in rancher's answers and notes.</dd>
<dt class="font-medium text-ink">Your own trackers</dt><dd class="text-ink-2">A pull command reads trackers from your LoRaWAN network server into <code>.local/live.json</code>. Git ignores that file.</dd>
<dt class="font-medium text-ink">Sign-in</dt><dd class="text-ink-2">A passphrase on your own hardware, or Cloudflare Access on a published copy. The server checks it on every request.</dd>
</dl></section>
<section class="{section}" aria-labelledby="run-title">
<h2 id="run-title" class="{title}">Run your own copy</h2>
<div class="{prose}">
<p>You need Rust 1.85 or newer.</p>
<pre><code>git clone {repo}.git
cd fibershare-oss
cargo run -p fibershare -- serve</code></pre>
<p>Then open http://127.0.0.1:4174.</p>
<p>{license} Keep private ranch files and real tracker data out of the repository. See the <a href="{repo}/blob/main/CONTRIBUTING.md">contribution guide</a>, or ask on <a href="{discord}">Discord</a>.</p>
<p>The FiberShare app is a separate product at <a href="{app}">fibershare.app</a>.</p>
</div></section></main>{footer}"#,
        nav = nav("/architecture"),
        main = MAIN,
        head = HEAD,
        lede = LEDE,
        section = SECTION,
        title = SECTION_TITLE,
        body = BODY,
        notice = alerts_off_notice_html(&jobs_state, &rules),
        list = list,
        all = if any {
            "Turn every job off"
        } else {
            "Turn every job on"
        },
        planned = esc(&planned),
        prose = PROSE,
        repo = REPO,
        license = LICENSE,
        discord = DISCORD,
        app = APP,
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
    let linked_at = if tracing {
        Some("2026-09-06T18:05:00")
    } else {
        None
    };
    let chain = if let Some(at) = linked_at {
        let traced = trace_lot("mohair-bramble", &records());
        let why = format!(
            "Linked by the trace job at {}. Why: the lot lists fleece {}, the fleece names shearing {}, and the shearing names animal {}.",
            time_of(at),
            traced.as_ref().and_then(|c| c.pointer("/steps/0/fleece/id")).and_then(Value::as_str).unwrap_or(""),
            traced.as_ref().and_then(|c| c.pointer("/steps/0/shearing/id")).and_then(Value::as_str).unwrap_or(""),
            traced.as_ref().and_then(|c| c.pointer("/steps/0/animal/id")).and_then(Value::as_str).unwrap_or(""),
        );
        let why = if viewer == "rancher" {
            why
        } else {
            format!("Linked by the trace job at {}. Only the records shared with this viewer are shown.", time_of(at))
        };
        format!("<p class=\"trace-why mb-5 max-w-[72ch] text-sm text-ink-2\" data-trace-why>{}</p><ol class=\"trace-chain divide-y divide-rule border-y border-ink\" data-tour=\"chain\">{}</ol>", esc(&why), trace_cards(&traced, viewer))
    } else {
        "<p class=\"trace-why mb-5 max-w-[72ch] text-sm text-ink-2\" data-trace-why>Tracing is off, so the records are not linked. Each one lists the ID of the record before it. <button type=\"button\" class=\"btn-link\" data-link-once>Link them once</button></p><p class=\"sr-only\">Linked by hand at a time you choose. Linked by the trace job at the sample clock when tracing is on. For a rancher, the lot lists fleece ids; a buyer does not see them.</p>".into()
    };
    let shop: Value =
        serde_json::from_str(include_str!("../../../public/data/shop.json")).unwrap_or(json!({}));
    let lots = shop
        .get("products")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .map(|p| {
                    format!(
                        "<tr><th scope=\"row\">{}</th><td>{}</td><td class=\"num\">{} g</td></tr>",
                        esc(p.get("name").and_then(Value::as_str).unwrap_or("")),
                        esc(p.get("fiber").and_then(Value::as_str).unwrap_or("")),
                        esc(&p.get("grams").map(|v| v.to_string()).unwrap_or_default()),
                    )
                })
                .collect::<String>()
        })
        .unwrap_or_default();
    let pressed = |key: &str| if key == viewer { "true" } else { "false" };
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}"><h1>Fleece trace</h1>
<p class="{lede}">The mohair-bramble lot traced back to Bramble, the goat it came from. The rancher sets who can see each record.</p></section>
<div class="trace-controls mb-5 flex flex-wrap items-center gap-x-6 gap-y-2"><span class="text-sm text-muted" id="viewer-label">View as</span>
<div class="segmented" role="group" aria-labelledby="viewer-label">
<button type="button" class="chip" data-viewer="rancher" aria-pressed="{r}">Rancher</button>
<button type="button" class="chip" data-viewer="buyers" aria-pressed="{b}">Buyer</button>
<button type="button" class="chip" data-viewer="public" aria-pressed="{p}">Public</button>
</div><button type="button" class="btn-link trace-print ml-auto text-sm" data-print>Print</button></div>
<div data-chain aria-live="polite">{chain}</div>
<section class="{section}" aria-labelledby="lots-title">
<h2 id="lots-title" class="{title}">Sample fiber lots</h2>
<div class="{body}"><p class="mb-4 text-sm text-muted">Nothing here is for sale.</p>
<table class="data-table"><thead><tr><th scope="col">Lot</th><th scope="col">Fiber from</th><th scope="col" class="num">Weight</th></tr></thead><tbody>{lots}</tbody></table>
</div></section></main>{footer}"#,
        nav = nav("/trace"),
        main = MAIN,
        head = HEAD,
        lede = LEDE,
        r = pressed("rancher"),
        b = pressed("buyers"),
        p = pressed("public"),
        chain = chain,
        section = SECTION,
        title = SECTION_TITLE,
        body = BODY,
        lots = lots,
        footer = footer(),
    )
}

fn trace_cards(traced: &Option<Value>, viewer: &str) -> String {
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
        .enumerate()
        .map(|(i, (kind, record))| {
            let shown = visible_record(*record, viewer);
            let title = if viewer == "rancher" {
                record.and_then(|r| r.get("id").and_then(Value::as_str)).unwrap_or("Record")
            } else if shown.is_none() {
                "Not shared"
            } else {
                record.and_then(|r| r.get("name").or_else(|| r.get("id"))).and_then(Value::as_str).unwrap_or(kind)
            };
            format!("<li class=\"trace-card py-5\"><p class=\"text-sm text-muted\">{}. {kind}</p><h2 class=\"mt-1 text-base\">{}</h2></li>", i + 1, esc(title))
        })
        .collect()
}

pub fn rancher(query: &str) -> String {
    let error = q(query, "error").unwrap_or_default();
    let error_html = if error.is_empty() {
        String::new()
    } else {
        format!("<p class=\"form-error\" role=\"alert\">{}</p>", esc(&error))
    };
    let map = r#"<div class="rancher-callout border-t border-ink pt-5" data-tour="rancher-map">
<h2 class="text-xl">Rancher map</h2>
<div class="mock-map relative overflow-hidden rounded-sm border border-rule bg-band" role="img" aria-label="Drawing of the rancher map: tracker dots on a basemap, a dashed fire perimeter, and a layer list">
<svg viewBox="0 0 160 100" class="block aspect-[16/10] w-full" aria-hidden="true"><path d="M0 72 C30 64 52 78 80 70 S130 52 160 58 V100 H0Z" class="fill-band-2"/><circle cx="60" cy="42" r="1.9" class="fill-leather"/></svg>
<p class="absolute top-2 left-2 m-0 rounded-sm border border-rule bg-surface px-3 py-2 text-xs"><strong>Layers</strong><span>Wildfire perimeters</span><span>Smoke from satellite</span><span>Federal land ownership</span></p>
</div>
<p>After sign-in, trackers appear at their real positions, with map layers from public agencies. Map layers come from public agencies and OpenStreetMap, plus Esri basemaps when an ArcGIS key is set.</p>
<p class="text-sm text-muted">Drawing only. The live map needs your own trackers. No live file yet. Run <code>fibershare pull</code> on your own hardware.</p>
</div>"#;
    format!(
        r#"{nav}<main class="{main}" id="main">
<section class="{head}"><h1>Rancher sign-in</h1>
<p class="{lede}">A passphrase on your own hardware, or Cloudflare Access on a published copy. The public herd view stays open either way.</p></section>
{error}
<div class="rancher-callout border-t border-ink pt-5" data-rancher-panel>
<h2 class="text-xl">Sign in</h2>
<form class="grid max-w-form gap-2" data-sign-in method="post" action="/api/rancher/login">
<label class="text-sm font-semibold" for="passphrase">Rancher passphrase</label>
<input class="input" id="passphrase" name="passphrase" type="password" autocomplete="current-password" required minlength="12" />
<button type="submit" class="btn btn-primary mt-2 justify-self-start">Sign in</button>
<p class="text-sm text-muted">The server checks the passphrase and sets a session cookie for 12 hours.</p>
</form>
<p class="text-sm text-muted">On this machine, set one with <code>fibershare passphrase</code>. On Cloudflare, sign-in is Cloudflare Access.</p>
</div>
{map}
</main>{footer}"#,
        nav = nav("/rancher"),
        main = MAIN,
        head = HEAD,
        lede = LEDE,
        error = error_html,
        map = map,
        footer = footer(),
    )
}

pub fn not_found() -> String {
    format!(
        r#"{nav}<main class="{main}" id="main"><section class="{head}"><h1>Page not found</h1><p class="{lede}">That address is not a page in this demo.</p><p class="{actions}"><a class="btn btn-primary" href="/">Back home</a></p></section></main>{footer}"#,
        nav = nav(""),
        main = MAIN,
        head = HEAD,
        lede = LEDE,
        actions = ACTIONS,
        footer = footer(),
    )
}

pub fn page_body(path: &str) -> String {
    match path {
        "/" => home(),
        _ => not_found(),
    }
}
