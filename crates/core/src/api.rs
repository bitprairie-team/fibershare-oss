//! HTTP-agnostic handlers for /api/alerts, /api/log, /api/live, /api/session,
//! /api/push, and /api/health. The axum server and the worker both call these.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use async_trait::async_trait;
use serde_json::{json, Value};

use crate::access::{access_token, team_host, verify_access_jwt};
use crate::alerts::{add_feedback, parse_feedback_list, KV_FEEDBACK};
use crate::auth::{
    check_session, clear_cookie, hash_passphrase, make_session, parse_cookies, read_record,
    session_cookie, verify_passphrase, write_record, Limiter, COOKIE_NAME,
};
use crate::live::{is_live_data, live_body};
use crate::log::{
    add_log_entry, author_from_claims, log_entry_key, merge_log_entries, parse_log_list,
    parse_log_value, KV_LOG, KV_LOG_PREFIX, LOCAL_LOG_AUTHOR, LOG_LIMIT,
};
use crate::private_data::{committed_text_problems, private_data_problems};

pub const KV_HIDDEN: &str = "live-hidden";
pub const KV_FULL: &str = "live-full";

#[derive(Clone, Debug)]
pub struct Reply {
    pub status: u16,
    pub body: Value,
    pub headers: Vec<(String, String)>,
}

fn json_reply(status: u16, body: Value) -> Reply {
    Reply {
        status,
        body,
        headers: vec![
            (
                "content-type".into(),
                "application/json; charset=utf-8".into(),
            ),
            ("cache-control".into(), "no-store, private".into()),
            ("vary".into(), "Cookie, Cf-Access-Jwt-Assertion".into()),
            ("x-content-type-options".into(), "nosniff".into()),
        ],
    }
}

#[async_trait(?Send)]
pub trait KvStore: Send + Sync {
    async fn get(&self, key: &str) -> Option<String>;
    async fn put(&self, key: &str, value: String);
    async fn delete(&self, key: &str);
    async fn list_prefix(&self, prefix: &str) -> Vec<String>;
}

pub struct MemoryKv {
    data: Mutex<HashMap<String, String>>,
}

impl MemoryKv {
    pub fn new() -> Self {
        Self {
            data: Mutex::new(HashMap::new()),
        }
    }
    pub fn len(&self) -> usize {
        self.data.lock().map(|g| g.len()).unwrap_or(0)
    }
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl Default for MemoryKv {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait(?Send)]
impl KvStore for MemoryKv {
    async fn get(&self, key: &str) -> Option<String> {
        self.data.lock().ok().and_then(|g| g.get(key).cloned())
    }
    async fn put(&self, key: &str, value: String) {
        if let Ok(mut guard) = self.data.lock() {
            guard.insert(key.to_string(), value);
        }
    }
    async fn delete(&self, key: &str) {
        if let Ok(mut guard) = self.data.lock() {
            guard.remove(key);
        }
    }
    async fn list_prefix(&self, prefix: &str) -> Vec<String> {
        let mut names = self
            .data
            .lock()
            .map(|g| {
                g.keys()
                    .filter(|k| k.starts_with(prefix))
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        names.sort();
        names
    }
}

pub async fn read_log<S: KvStore + ?Sized>(store: &S) -> Vec<Value> {
    let keys = store.list_prefix(KV_LOG_PREFIX).await;
    let mut groups = vec![parse_log_value(
        &store.get(KV_LOG).await.unwrap_or_default(),
    )];
    for key in keys {
        groups.push(parse_log_value(&store.get(&key).await.unwrap_or_default()));
    }
    merge_log_entries(&groups)
}

pub async fn write_log_entry<S: KvStore + ?Sized>(store: &S, entry: &Value) {
    store.put(&log_entry_key(entry), entry.to_string()).await;
    let mut keys = store.list_prefix(KV_LOG_PREFIX).await;
    keys.sort();
    if keys.len() > LOG_LIMIT {
        let extra = keys.len() - LOG_LIMIT;
        for key in keys.into_iter().take(extra) {
            store.delete(&key).await;
        }
    }
}

fn header<'a>(headers: &'a HashMap<String, String>, name: &str) -> Option<&'a str> {
    headers.get(&name.to_lowercase()).map(String::as_str)
}

fn same_site(headers: &HashMap<String, String>, url: &str) -> bool {
    let Some(origin) = header(headers, "origin") else {
        return true;
    };
    let Ok(origin) = url::Url::parse(origin) else {
        return false;
    };
    let Ok(page) = url::Url::parse(url) else {
        return false;
    };
    origin.host_str() == page.host_str()
}

pub struct PagesEnv<'a> {
    pub team: Option<&'a str>,
    pub aud: Option<&'a str>,
    pub push_token: Option<&'a str>,
    pub arcgis: Option<&'a str>,
    pub store: Option<&'a dyn KvStore>,
}

pub async fn pages_health(store: bool) -> Reply {
    json_reply(
        200,
        json!({"ok": true, "project": "fibershare-oss", "mode": "pages", "store": store}),
    )
}

fn access_configured(env: &PagesEnv) -> bool {
    env.team.and_then(team_host).is_some() && env.aud.is_some_and(|a| !a.is_empty())
}

pub async fn get_log<F, Fut>(
    headers: &HashMap<String, String>,
    env: &PagesEnv<'_>,
    now_ms: u64,
    fetch: F,
) -> Reply
where
    F: Fn(String) -> Fut + Copy,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    let Some(author_gate) = log_gate(headers, env, now_ms, fetch).await else {
        return json_reply(401, json!({"error": "Sign in to see and save notes."}));
    };
    if author_gate == "no-store" {
        return json_reply(503, json!({"error": "No store is set up on this copy."}));
    }
    let Some(store) = env.store else {
        return json_reply(503, json!({"error": "No store is set up on this copy."}));
    };
    json_reply(200, json!({"log": read_log(store).await}))
}

pub async fn post_log<F, Fut>(
    headers: &HashMap<String, String>,
    url: &str,
    body: &str,
    env: &PagesEnv<'_>,
    now_iso: &str,
    now_ms: u64,
    fetch: F,
) -> Reply
where
    F: Fn(String) -> Fut + Copy,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    if !same_site(headers, url) {
        return json_reply(403, json!({"error": "Save notes from this site."}));
    }
    let Some(author) = log_gate(headers, env, now_ms, fetch).await else {
        return json_reply(401, json!({"error": "Sign in to see and save notes."}));
    };
    if author == "no-store" {
        return json_reply(503, json!({"error": "No store is set up on this copy."}));
    }
    let Some(store) = env.store else {
        return json_reply(503, json!({"error": "No store is set up on this copy."}));
    };
    if body.len() > 4096 {
        return json_reply(413, json!({"error": "That entry is too long."}));
    }
    let (status, mut reply, entry, _) = add_log_entry(&[], body, now_iso, &author, None);
    if let Some(entry) = entry {
        write_log_entry(store, &entry).await;
        let log = read_log(store).await;
        reply["log"] = json!(log);
        reply["entry"] = json!(entry);
        return json_reply(200, reply);
    }
    json_reply(status, reply)
}

async fn log_gate<F, Fut>(
    headers: &HashMap<String, String>,
    env: &PagesEnv<'_>,
    now_ms: u64,
    fetch: F,
) -> Option<String>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    if !access_configured(env) {
        return None;
    }
    let claims = verify_access_jwt(
        access_token(headers).as_deref(),
        env.team.unwrap_or(""),
        env.aud.unwrap_or(""),
        now_ms,
        fetch,
    )
    .await
    .ok()?;
    if env.store.is_none() {
        return Some("no-store".into());
    }
    Some(author_from_claims(
        claims.get("email").and_then(Value::as_str),
        claims.get("sub").and_then(Value::as_str),
    ))
}

pub async fn get_alerts<F, Fut>(
    headers: &HashMap<String, String>,
    env: &PagesEnv<'_>,
    now_ms: u64,
    fetch: F,
) -> Reply
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    if let Some(blocked) = alert_gate(headers, env, now_ms, fetch, "see and answer alerts").await {
        return blocked;
    }
    let text = env
        .store
        .unwrap()
        .get(KV_FEEDBACK)
        .await
        .unwrap_or_default();
    json_reply(200, json!({"feedback": parse_feedback_list(&text)}))
}

pub async fn post_alerts<F, Fut>(
    headers: &HashMap<String, String>,
    url: &str,
    body: &str,
    env: &PagesEnv<'_>,
    now_iso: &str,
    now_ms: u64,
    fetch: F,
) -> Reply
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    if !same_site(headers, url) {
        return json_reply(403, json!({"error": "Answer alerts from this site."}));
    }
    if let Some(blocked) = alert_gate(headers, env, now_ms, fetch, "see and answer alerts").await {
        return blocked;
    }
    if body.len() > 4096 {
        return json_reply(413, json!({"error": "That answer is too long."}));
    }
    let store = env.store.unwrap();
    let current = parse_feedback_list(&store.get(KV_FEEDBACK).await.unwrap_or_default());
    let (status, body, list) = add_feedback(&current, body, now_iso);
    if let Some(list) = list {
        store
            .put(
                KV_FEEDBACK,
                serde_json::to_string(&list).unwrap_or_else(|_| "[]".into()),
            )
            .await;
    }
    json_reply(status, body)
}

async fn alert_gate<F, Fut>(
    headers: &HashMap<String, String>,
    env: &PagesEnv<'_>,
    now_ms: u64,
    fetch: F,
    what: &str,
) -> Option<Reply>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    if !access_configured(env) {
        return Some(json_reply(
            401,
            json!({"error": format!("Sign in to {what}.")}),
        ));
    }
    let ok = verify_access_jwt(
        access_token(headers).as_deref(),
        env.team.unwrap_or(""),
        env.aud.unwrap_or(""),
        now_ms,
        fetch,
    )
    .await
    .is_ok();
    if !ok {
        return Some(json_reply(
            401,
            json!({"error": format!("Sign in to {what}.")}),
        ));
    }
    if env.store.is_none() {
        return Some(json_reply(
            503,
            json!({"error": "No store is set up on this copy."}),
        ));
    }
    None
}

pub fn hidden_problems(hidden: &Value, full: &Value) -> Vec<String> {
    let mut found = Vec::new();
    private_data_problems(hidden, "live", &mut found);
    let mut problems: Vec<String> = found
        .into_iter()
        .map(|p| {
            let rest = p.split_once(": ").map(|(_, r)| r.to_string()).unwrap_or(p);
            rest
        })
        .collect();
    problems.extend(
        committed_text_problems(
            &serde_json::to_string_pretty(hidden).unwrap_or_default(),
            "live",
        )
        .into_iter()
        .map(|p| p.split(": ").last().unwrap_or("").to_string()),
    );
    problems.extend(crate::live::leak_problems(hidden, full));
    problems.sort();
    problems.dedup();
    problems
}

pub async fn post_push(headers: &HashMap<String, String>, body: &str, env: &PagesEnv<'_>) -> Reply {
    let Some(store) = env.store else {
        return json_reply(503, json!({"error": "Push is not set up on this copy."}));
    };
    let expected = env.push_token.unwrap_or("");
    if expected.len() < 24 {
        return json_reply(503, json!({"error": "Push is not set up on this copy."}));
    }
    let given = header(headers, "x-fibershare-push-token").unwrap_or("");
    if !same_secret(given, expected) {
        return json_reply(401, json!({"error": "Push token did not match."}));
    }
    if body.len() > 5 * 1024 * 1024 {
        return json_reply(413, json!({"error": "Too large."}));
    }
    let parsed: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return json_reply(400, json!({"error": "Send JSON with hidden and full."})),
    };
    let hidden = parsed.get("hidden").cloned().unwrap_or(Value::Null);
    let full = parsed.get("full").cloned().unwrap_or(Value::Null);
    if !is_live_data(&hidden) || !is_live_data(&full) {
        return json_reply(400, json!({"error": "Both files must be live files."}));
    }
    if hidden.get("hidden") != Some(&json!(true)) || full.get("hidden") != Some(&json!(false)) {
        return json_reply(
            400,
            json!({"error": "hidden must be hidden and full must be full."}),
        );
    }
    let problems = hidden_problems(&hidden, &full);
    if !problems.is_empty() {
        return json_reply(
            422,
            json!({"error": "The hidden file still had private data.", "kinds": problems}),
        );
    }
    store.put(KV_HIDDEN, hidden.to_string()).await;
    store.put(KV_FULL, full.to_string()).await;
    let trackers = full
        .get("animals")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    json_reply(200, json!({"ok": true, "trackers": trackers}))
}

fn same_secret(a: &str, b: &str) -> bool {
    use sha2::{Digest, Sha256};
    let x = Sha256::digest(a.as_bytes());
    let y = Sha256::digest(b.as_bytes());
    x.iter()
        .zip(y.iter())
        .fold(0u8, |acc, (p, q)| acc | (p ^ q))
        == 0
}

pub struct LocalPaths {
    pub live: PathBuf,
    pub rancher: PathBuf,
    pub alerts: PathBuf,
    pub log: PathBuf,
}

pub struct LocalState {
    pub limiter: Mutex<Limiter>,
    pub log_lock: Mutex<()>,
    pub alert_lock: Mutex<()>,
}

impl LocalState {
    pub fn new() -> Self {
        Self {
            limiter: Mutex::new(Limiter::new()),
            log_lock: Mutex::new(()),
            alert_lock: Mutex::new(()),
        }
    }
}

impl Default for LocalState {
    fn default() -> Self {
        Self::new()
    }
}

pub async fn get_live<F, Fut>(
    headers: &HashMap<String, String>,
    env: &PagesEnv<'_>,
    now_ms: u64,
    fetch: F,
) -> Reply
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    let rancher = if access_configured(env) {
        verify_access_jwt(
            access_token(headers).as_deref(),
            env.team.unwrap_or(""),
            env.aud.unwrap_or(""),
            now_ms,
            fetch,
        )
        .await
        .is_ok()
    } else {
        false
    };
    let mut live = None;
    if let Some(store) = env.store {
        if rancher {
            if let Some(text) = store.get(KV_FULL).await {
                live = serde_json::from_str(&text).ok();
            }
        }
        if live.as_ref().is_none_or(|value| !is_live_data(value)) {
            if let Some(text) = store.get(KV_HIDDEN).await {
                live = serde_json::from_str(&text).ok();
            }
        }
    }
    json_reply(
        200,
        live_body(
            live.as_ref(),
            rancher,
            if rancher { env.arcgis } else { None },
            false,
        ),
    )
}

pub async fn get_session<F, Fut>(
    headers: &HashMap<String, String>,
    env: &PagesEnv<'_>,
    now_ms: u64,
    fetch: F,
) -> Reply
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    if !access_configured(env) {
        return json_reply(200, json!({"mode": "none", "signedIn": false}));
    }
    let signed_in = verify_access_jwt(
        access_token(headers).as_deref(),
        env.team.unwrap_or(""),
        env.aud.unwrap_or(""),
        now_ms,
        fetch,
    )
    .await
    .is_ok();
    json_reply(
        200,
        json!({"mode": "access", "signedIn": signed_in, "loginUrl": "/api/rancher/login"}),
    )
}

pub async fn get_login<F, Fut>(
    headers: &HashMap<String, String>,
    url: &str,
    env: &PagesEnv<'_>,
    now_ms: u64,
    fetch: F,
) -> Reply
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    let ok = access_configured(env)
        && verify_access_jwt(
            access_token(headers).as_deref(),
            env.team.unwrap_or(""),
            env.aud.unwrap_or(""),
            now_ms,
            fetch,
        )
        .await
        .is_ok();
    let to = if ok { "/map" } else { "/rancher?error=access" };
    let origin = url::Url::parse(url).ok();
    let location = origin
        .as_ref()
        .and_then(|base| base.join(to).ok())
        .map(|u| u.to_string())
        .unwrap_or_else(|| to.to_string());
    let mut reply = json_reply(302, Value::Null);
    reply.headers.push(("location".into(), location));
    reply
}

pub fn local_health() -> Reply {
    json_reply(
        200,
        json!({"ok": true, "project": "fibershare-oss", "mode": "local"}),
    )
}

fn signed_in(
    headers: &HashMap<String, String>,
    rancher_file: &std::path::Path,
    now_ms: u64,
) -> bool {
    let Some(record) = read_record(rancher_file) else {
        return false;
    };
    let cookie = header(headers, "cookie").unwrap_or("");
    let value = parse_cookies(cookie)
        .get(COOKIE_NAME)
        .cloned()
        .unwrap_or_default();
    check_session(&value, &record.session_secret, now_ms)
}

#[allow(clippy::too_many_arguments)]
pub fn local_api(
    method: &str,
    path: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
    paths: &LocalPaths,
    state: &LocalState,
    now_ms: u64,
    now_iso: &str,
    secure: bool,
    arcgis: Option<&str>,
) -> Reply {
    if path == "/api/health" {
        return local_health();
    }
    if path == "/api/session" {
        return session_route(method, headers, body, paths, state, now_ms, secure);
    }
    if path == "/api/live" {
        if method != "GET" && method != "HEAD" {
            return json_reply(405, json!({"error": "Use GET."}));
        }
        let (live, unreadable) = match std::fs::read_to_string(&paths.live) {
            Ok(text) => (serde_json::from_str(&text).ok(), false),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => (None, false),
            Err(_) => (None, true),
        };
        return json_reply(
            200,
            live_body(
                live.as_ref(),
                signed_in(headers, &paths.rancher, now_ms),
                arcgis,
                unreadable,
            ),
        );
    }
    if path == "/api/alerts" || path == "/api/log" {
        return list_route(
            path == "/api/alerts",
            method,
            url,
            headers,
            body,
            paths,
            state,
            now_ms,
            now_iso,
        );
    }
    json_reply(404, json!({"error": "Not found."}))
}

fn session_route(
    method: &str,
    headers: &HashMap<String, String>,
    body: &str,
    paths: &LocalPaths,
    state: &LocalState,
    now_ms: u64,
    secure: bool,
) -> Reply {
    if method == "GET" {
        return json_reply(
            200,
            json!({
                "mode": "local",
                "signedIn": signed_in(headers, &paths.rancher, now_ms),
                "passphraseSet": read_record(&paths.rancher).is_some(),
            }),
        );
    }
    if !same_site(
        headers,
        &format!("http://{}", header(headers, "host").unwrap_or("127.0.0.1")),
    ) && header(headers, "origin").is_some()
    {
        // same_site already compared origin to a synthetic URL. Callers pass the real URL
        // through local_api for alerts. Session uses the Host header.
    }
    if let Some(origin) = header(headers, "origin") {
        let host = header(headers, "host").unwrap_or("");
        let Ok(origin) = url::Url::parse(origin) else {
            return json_reply(403, json!({"error": "Sign in from this site."}));
        };
        if origin.host_str().map(|h| {
            format!(
                "{h}:{}",
                origin
                    .port()
                    .unwrap_or(if origin.scheme() == "https" { 443 } else { 80 })
            )
        }) != Some(host.to_string())
            && origin.host_str() != Some(host)
            && format!(
                "{}:{}",
                origin.host_str().unwrap_or(""),
                origin.port_or_known_default().unwrap_or(80)
            ) != host
        {
            return json_reply(403, json!({"error": "Sign in from this site."}));
        }
    }
    if method == "DELETE" {
        let mut reply = json_reply(200, json!({"signedIn": false}));
        reply
            .headers
            .push(("set-cookie".into(), clear_cookie(secure)));
        return reply;
    }
    if method != "POST" {
        let mut reply = json_reply(405, json!({"error": "Use GET, POST, or DELETE."}));
        reply
            .headers
            .push(("allow".into(), "GET, POST, DELETE".into()));
        return reply;
    }
    let who = "127.0.0.1".to_string();
    if state
        .limiter
        .lock()
        .map(|g| g.blocked(&who, now_ms))
        .unwrap_or(false)
    {
        let mut reply = json_reply(429, json!({"error": "Too many tries. Wait a minute."}));
        reply.headers.push(("retry-after".into(), "60".into()));
        return reply;
    }
    let Some(record) = read_record(&paths.rancher) else {
        return json_reply(
            409,
            json!({"error": "No rancher passphrase is set. Run fibershare passphrase."}),
        );
    };
    let passphrase = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| {
            v.get("passphrase")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_default();
    if passphrase.is_empty() && serde_json::from_str::<Value>(body).is_err() {
        return json_reply(400, json!({"error": "Send JSON with a passphrase."}));
    }
    if !verify_passphrase(&passphrase, &record) {
        if let Ok(mut guard) = state.limiter.lock() {
            guard.miss(&who, now_ms);
        }
        return json_reply(401, json!({"error": "That passphrase did not match."}));
    }
    if let Ok(mut guard) = state.limiter.lock() {
        guard.clear(&who);
    }
    let mut reply = json_reply(200, json!({"signedIn": true}));
    reply.headers.push((
        "set-cookie".into(),
        session_cookie(
            &make_session(&record.session_secret, now_ms, 12),
            secure,
            12,
        ),
    ));
    reply
}

#[allow(clippy::too_many_arguments)]
fn list_route(
    alerts: bool,
    method: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
    paths: &LocalPaths,
    state: &LocalState,
    now_ms: u64,
    now_iso: &str,
) -> Reply {
    if method != "GET" && method != "POST" {
        let mut reply = json_reply(405, json!({"error": "Use GET or POST."}));
        reply.headers.push(("allow".into(), "GET, POST".into()));
        return reply;
    }
    if method == "POST" && !same_site(headers, url) {
        let error = if alerts {
            "Answer alerts from this site."
        } else {
            "Save notes from this site."
        };
        return json_reply(403, json!({"error": error}));
    }
    if !signed_in(headers, &paths.rancher, now_ms) {
        let error = if alerts {
            "Sign in to see and answer alerts."
        } else {
            "Sign in to see and save notes."
        };
        return json_reply(401, json!({"error": error}));
    }
    if method == "GET" {
        return if alerts {
            json_reply(200, json!({"feedback": read_feedback(&paths.alerts)}))
        } else {
            json_reply(200, json!({"log": read_local_log(&paths.log)}))
        };
    }
    if body.len() > 4096 {
        let error = if alerts {
            "That answer is too long."
        } else {
            "That entry is too long."
        };
        return json_reply(413, json!({"error": error}));
    }
    if alerts {
        let _guard = state.alert_lock.lock();
        let current = read_feedback(&paths.alerts);
        let (status, body, list) = add_feedback(&current, body, now_iso);
        if let Some(list) = &list {
            let _ = write_private_json(
                &paths.alerts,
                &serde_json::to_string_pretty(list).unwrap_or_else(|_| "[]".into()),
            );
        }
        json_reply(status, body)
    } else {
        let _guard = state.log_lock.lock();
        let current = read_local_log(&paths.log);
        let (status, mut reply, entry, _) =
            add_log_entry(&current, body, now_iso, LOCAL_LOG_AUTHOR, None);
        if let Some(entry) = entry {
            let journal = journal_path(&paths.log);
            if let Some(parent) = journal.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            use std::io::Write;
            let mut open = std::fs::OpenOptions::new();
            open.create(true).append(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                open.mode(0o600);
            }
            if let Ok(mut file) = open.open(&journal) {
                let _ = writeln!(file, "{entry}");
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ =
                        std::fs::set_permissions(&journal, std::fs::Permissions::from_mode(0o600));
                }
            }
            let list = read_local_log(&paths.log);
            reply["log"] = json!(list);
            json_reply(200, reply)
        } else {
            json_reply(status, reply)
        }
    }
}

fn read_feedback(path: &std::path::Path) -> Vec<Value> {
    std::fs::read_to_string(path)
        .ok()
        .map(|text| parse_feedback_list(&text))
        .unwrap_or_default()
}

fn journal_path(log_file: &std::path::Path) -> PathBuf {
    let name = log_file
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("ranch-log.json");
    let journal = name.trim_end_matches(".json").to_string() + ".jsonl";
    log_file.with_file_name(journal)
}

pub fn read_local_log(log_file: &std::path::Path) -> Vec<Value> {
    let leftover = std::fs::read_to_string(log_file)
        .ok()
        .map(|text| parse_log_list(&text))
        .unwrap_or_default();
    let journal = std::fs::read_to_string(journal_path(log_file))
        .unwrap_or_default()
        .lines()
        .filter(|line| !line.is_empty())
        .flat_map(parse_log_value)
        .collect::<Vec<_>>();
    merge_log_entries(&[leftover, journal])
}

fn write_private_json(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, format!("{text}\n"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn ensure_passphrase(
    path: &std::path::Path,
    passphrase: &str,
    now_iso: &str,
) -> Result<(), String> {
    let record = hash_passphrase(passphrase, now_iso)?;
    write_record(path, &record).map_err(|err| err.to_string())
}
