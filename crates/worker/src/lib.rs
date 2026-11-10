//! Cloudflare Worker. Pages and `/api/alerts` and `/api/log` run here.
//! Access JWT checks use the team certs. Unsigned requests get 401.
//! Static files (CSS, fonts, WASM, Leaflet) come from the ASSETS binding.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;

use async_trait::async_trait;
use fibershare_core::api::{
    get_alerts, get_live, get_log, get_login, get_session, pages_health, post_alerts, post_log,
    post_push, PagesEnv, Reply,
};
use worker::*;

struct BoundKv {
    kv: kv::KvStore,
}

#[async_trait(?Send)]
impl fibershare_core::api::KvStore for BoundKv {
    async fn get(&self, key: &str) -> Option<String> {
        self.kv.get(key).text().await.ok().flatten()
    }
    async fn put(&self, key: &str, value: String) {
        if let Ok(builder) = self.kv.put(key, value) {
            let _ = builder.execute().await;
        }
    }
    async fn delete(&self, key: &str) {
        let _ = self.kv.delete(key).await;
    }
    async fn list_prefix(&self, prefix: &str) -> Vec<String> {
        let mut names = Vec::new();
        let mut cursor = None;
        loop {
            let mut list = self.kv.list().prefix(prefix.to_string()).limit(1000);
            if let Some(cursor) = cursor.clone() {
                list = list.cursor(cursor);
            }
            let Ok(page) = list.execute().await else {
                break;
            };
            names.extend(page.keys.into_iter().map(|key| key.name));
            if page.list_complete {
                break;
            }
            cursor = page.cursor;
            if cursor.is_none() {
                break;
            }
        }
        names.sort();
        names
    }
}

/// Set only by the local `wrangler dev` smoke test. A deployed copy leaves this empty
/// and the Worker fetches the team certs over HTTPS.
static SMOKE_CERTS: Mutex<Option<String>> = Mutex::new(None);

fn decode_certs(raw: String) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') {
        return trimmed.to_string();
    }
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or(raw)
}

fn pull_cert(url: String) -> Pin<Box<dyn Future<Output = Result<String, ()>> + 'static>> {
    if url.contains("/cdn-cgi/access/certs") {
        if let Some(body) = SMOKE_CERTS.lock().ok().and_then(|guard| guard.clone()) {
            return Box::pin(async move { Ok(body) });
        }
    }
    Box::pin(async move {
        let parsed = url.parse().map_err(|_| ())?;
        let mut response = Fetch::Url(parsed).send().await.map_err(|_| ())?;
        response.text().await.map_err(|_| ())
    })
}

fn headers_of(req: &Request) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for name in [
        "cookie",
        "cf-access-jwt-assertion",
        "origin",
        "x-fibershare-push-token",
        "content-type",
        "host",
    ] {
        if let Ok(Some(value)) = req.headers().get(name) {
            map.insert(name.to_string(), value);
        }
    }
    map
}

fn now_ms() -> u64 {
    js_sys::Date::now() as u64
}

fn now_iso() -> String {
    js_sys::Date::new_0()
        .to_iso_string()
        .as_string()
        .unwrap_or_default()
}

fn env_value(env: &Env, name: &str) -> Option<String> {
    env.var(name)
        .ok()
        .map(|var| var.to_string())
        .filter(|value| !value.is_empty())
}

async fn reply_of(reply: Reply) -> Result<Response> {
    let mut response = if reply.status == 302 {
        Response::empty()?
    } else if reply.body.is_null() {
        Response::empty()?
    } else {
        Response::from_json(&reply.body)?
    };
    response = response.with_status(reply.status);
    for (key, value) in &reply.headers {
        response.headers_mut().set(key, value)?;
    }
    Ok(response)
}

#[event(fetch)]
async fn fetch(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();
    let url = req.url()?;
    let path = url.path().to_string();
    let query = url.query().unwrap_or("").to_string();
    let method = req.method();
    let headers = headers_of(&req);
    let store = env.kv("FIBERSHARE_LIVE").ok().map(|kv| BoundKv { kv });
    let team = env_value(&env, "ACCESS_TEAM_DOMAIN");
    let aud = env_value(&env, "ACCESS_AUD");
    let push = env_value(&env, "PUSH_TOKEN");
    let arcgis = env_value(&env, "ARCGIS_API_KEY");
    let smoke_certs = env_value(&env, "ACCESS_CERTS").filter(|value| !value.is_empty());
    if let Ok(mut guard) = SMOKE_CERTS.lock() {
        *guard = smoke_certs.map(decode_certs);
    }
    let pages_env = PagesEnv {
        team: team.as_deref(),
        aud: aud.as_deref(),
        push_token: push.as_deref(),
        arcgis: arcgis.as_deref(),
        store: store
            .as_ref()
            .map(|s| s as &dyn fibershare_core::api::KvStore),
    };
    let page_url = url.to_string();
    let api = path.starts_with("/api/");
    if method == Method::Post && path == "/api/herd-view" {
        let body = req.text().await.unwrap_or_default();
        return Response::from_html(fibershare_html::herd_view_html(&body));
    }
    if api {
        let reply = match (method, path.as_str()) {
            (Method::Get, "/api/health") => pages_health(store.is_some()).await,
            (Method::Get, "/api/live") => get_live(&headers, &pages_env, now_ms(), pull_cert).await,
            (Method::Get, "/api/session") => {
                get_session(&headers, &pages_env, now_ms(), pull_cert).await
            }
            (Method::Get, "/api/rancher/login") => {
                get_login(&headers, &page_url, &pages_env, now_ms(), pull_cert).await
            }
            (Method::Get, "/api/alerts") => {
                get_alerts(&headers, &pages_env, now_ms(), pull_cert).await
            }
            (Method::Post, "/api/alerts") => {
                let body = req.text().await.unwrap_or_default();
                post_alerts(
                    &headers,
                    &page_url,
                    &body,
                    &pages_env,
                    &now_iso(),
                    now_ms(),
                    pull_cert,
                )
                .await
            }
            (Method::Get, "/api/log") => get_log(&headers, &pages_env, now_ms(), pull_cert).await,
            (Method::Post, "/api/log") => {
                let body = req.text().await.unwrap_or_default();
                post_log(
                    &headers,
                    &page_url,
                    &body,
                    &pages_env,
                    &now_iso(),
                    now_ms(),
                    pull_cert,
                )
                .await
            }
            (Method::Post, "/api/push") => {
                let body = req.text().await.unwrap_or_default();
                post_push(&headers, &body, &pages_env).await
            }
            (_, "/api/alerts" | "/api/log") => {
                let mut reply = Reply {
                    status: 405,
                    body: serde_json::json!({"error": "Use GET or POST."}),
                    headers: vec![("allow".into(), "GET, POST".into())],
                };
                reply.headers.push((
                    "content-type".into(),
                    "application/json; charset=utf-8".into(),
                ));
                reply
            }
            _ => Reply {
                status: 404,
                body: serde_json::json!({"error": "Not found."}),
                headers: vec![(
                    "content-type".into(),
                    "application/json; charset=utf-8".into(),
                )],
            },
        };
        return reply_of(reply).await;
    }
    if matches!(method, Method::Get | Method::Head)
        && matches!(
            path.as_str(),
            "/" | "/map" | "/trace" | "/shop" | "/setups" | "/architecture" | "/rancher"
        )
    {
        let html = fibershare_html::render(&path, &query);
        return Response::from_html(html);
    }
    if path == "/sitemap.xml" && matches!(method, Method::Get | Method::Head) {
        let mut response = Response::ok(fibershare_html::sitemap())?;
        response
            .headers_mut()
            .set("content-type", "application/xml")?;
        return Ok(response);
    }
    if let Ok(assets) = env.assets("ASSETS") {
        return assets.fetch_request(req).await;
    }
    Response::error("Not found.", 404)
}
