//! Local FiberShare server: pages, the rancher API, and `fibershare pull`.

use std::collections::HashMap;
mod pull_cmd;

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, Method, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{any, get};
use axum::Router;
use fibershare_core::api::{local_api, local_health, LocalPaths, LocalState};
use fibershare_core::auth::now_ms;
use fibershare_html::render;
use serde_json::Value;
use tower_http::services::{ServeDir, ServeFile};

struct App {
    root: PathBuf,
    state: LocalState,
    secure: bool,
}

fn paths(root: &Path) -> LocalPaths {
    let local = root.join(".local");
    LocalPaths {
        live: local.join("live.json"),
        rancher: local.join("rancher.json"),
        alerts: local.join("alert-feedback.json"),
        log: local.join("ranch-log.json"),
    }
}

fn header_map(headers: &HeaderMap) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for (name, value) in headers.iter() {
        if let Ok(text) = value.to_str() {
            out.insert(name.as_str().to_lowercase(), text.to_string());
        }
    }
    out
}

async fn page(State(_app): State<Arc<App>>, request: Request) -> Response {
    let path = request.uri().path();
    let query = request.uri().query().unwrap_or("");
    let html = render(path, query);
    Html(html).into_response()
}

async fn api(State(app): State<Arc<App>>, request: Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let query = request.uri().query().unwrap_or("");
    let url = format!(
        "http://{}{}{}",
        request
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("127.0.0.1:4174"),
        path,
        if query.is_empty() {
            String::new()
        } else {
            format!("?{query}")
        }
    );
    let headers = header_map(request.headers());
    let bytes = axum::body::to_bytes(request.into_body(), 6 * 1024 * 1024)
        .await
        .unwrap_or_default();
    let body = String::from_utf8_lossy(&bytes).to_string();
    if path == "/api/rancher/login" && method == Method::POST {
        let session_headers = headers.clone();
        let reply = local_api(
            "POST",
            "/api/session",
            &url,
            &session_headers,
            &body,
            &paths(&app.root),
            &app.state,
            now_ms(),
            &iso_now(),
            app.secure,
            None,
        );
        if reply.status == 200 {
            return axum::response::Redirect::to("/map").into_response();
        }
        let error = reply
            .body
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("access");
        return axum::response::Redirect::to(&format!("/rancher?error={}", urlencoding(error)))
            .into_response();
    }
    if path == "/api/herd-view" && method == Method::POST {
        let html = fibershare_html::herd_view_html(&body);
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(html))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }
    let reply = if path == "/api/health" {
        local_health()
    } else {
        local_api(
            method.as_str(),
            &path,
            &url,
            &headers,
            &body,
            &paths(&app.root),
            &app.state,
            now_ms(),
            &iso_now(),
            app.secure,
            std::env::var("ARCGIS_API_KEY").ok().as_deref(),
        )
    };
    let mut response = Response::builder()
        .status(StatusCode::from_u16(reply.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));
    for (name, value) in reply.headers {
        response = response.header(name, value);
    }
    response
        .body(Body::from(reply.body.to_string()))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("json") => "application/json",
        Some("woff2") => "font/woff2",
        Some("txt") => "text/plain; charset=utf-8",
        Some("xml") => "application/xml",
        Some("wasm") => "application/wasm",
        Some("png") => "image/png",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn public_file(root: &Path, url_path: &str) -> Option<PathBuf> {
    let mut file = root.to_path_buf();
    let rel = url_path.trim_start_matches('/');
    if rel.is_empty() {
        return None;
    }
    for part in Path::new(rel).components() {
        match part {
            std::path::Component::Normal(name) => file.push(name),
            _ => return None,
        }
    }
    file.is_file().then_some(file)
}

async fn fallback(State(app): State<Arc<App>>, request: Request) -> Response {
    let path = request.uri().path().to_string();
    let query = request.uri().query().unwrap_or("").to_string();
    let looks_like_file = path.rsplit('/').next().unwrap_or("").contains('.');
    if let Some(file) = public_file(&app.root.join("public"), &path) {
        let bytes = std::fs::read(&file).unwrap_or_default();
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type(&file))
            .body(Body::from(bytes))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }
    if looks_like_file {
        return StatusCode::NOT_FOUND.into_response();
    }
    let html = render(&path, &query);
    (StatusCode::NOT_FOUND, Html(html)).into_response()
}

fn iso_now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn urlencoding(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn build_site(root: &Path) -> std::io::Result<()> {
    let dist = root.join("dist");
    std::fs::create_dir_all(dist.join("data"))?;
    for (path, _) in [
        ("/", "index.html"),
        ("/map", "map.html"),
        ("/trace", "trace.html"),
        ("/setups", "setups.html"),
        ("/architecture", "architecture.html"),
        ("/rancher", "rancher.html"),
    ] {
        let file = if path == "/" {
            dist.join("index.html")
        } else {
            dist.join(path.trim_start_matches('/')).join("index.html")
        };
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(file, render(path, ""))?;
    }
    std::fs::write(dist.join("sitemap.xml"), fibershare_html::sitemap())?;
    std::fs::write(dist.join("robots.txt"), "User-agent: *\nAllow: /\n")?;
    copy_dir(&root.join("public"), &dist)?;
    if root.join("dist/style.css").exists() {
        // Tailwind output is already in dist when the CLI ran first.
    }
    Ok(())
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    if !from.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let cmd = args.next().unwrap_or_else(|| "serve".into());
    let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    match cmd.as_str() {
        "build" => {
            if let Err(err) = build_site(&root) {
                eprintln!("build failed: {err}");
                std::process::exit(1);
            }
            println!("wrote dist/");
        }
        "passphrase" => {
            let passphrase = args
                .next()
                .or_else(|| std::env::var("FIBERSHARE_PASSPHRASE").ok())
                .unwrap_or_default();
            let path = root.join(".local/rancher.json");
            match fibershare_core::api::ensure_passphrase(&path, &passphrase, &iso_now()) {
                Ok(()) => println!("Saved the rancher passphrase hash in .local/rancher.json"),
                Err(err) => {
                    eprintln!("{err}");
                    std::process::exit(1);
                }
            }
        }
        "pull" => {
            let code = pull_cmd::pull(&root, args.collect());
            std::process::exit(code);
        }
        _ => serve(root).await,
    }
}

async fn serve(root: PathBuf) {
    let host = std::env::var("FIBERSHARE_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = std::env::var("FIBERSHARE_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4174);
    let app = Arc::new(App {
        root: root.clone(),
        state: LocalState::new(),
        secure: false,
    });
    let public = root.join("public");
    let dist = root.join("dist");
    let style = if public.join("style.css").exists() {
        public.join("style.css")
    } else if dist.join("style.css").exists() {
        dist.join("style.css")
    } else {
        root.join("assets/style.css")
    };
    let router = Router::new()
        .route("/api/*rest", any(api))
        .route("/api/health", any(api))
        .route("/api/session", any(api))
        .route("/api/live", any(api))
        .route("/api/alerts", any(api))
        .route("/api/log", any(api))
        .route("/api/rancher/login", any(api))
        .route("/", get(page))
        .route("/map", get(page))
        .route("/trace", get(page))
        .route("/shop", get(page))
        .route("/setups", get(page))
        .route("/architecture", get(page))
        .route("/rancher", get(page))
        .route(
            "/sitemap.xml",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "application/xml")],
                    fibershare_html::sitemap(),
                )
            }),
        )
        .nest_service("/style.css", ServeFile::new(style))
        .nest_service("/brand", ServeDir::new(public.join("brand")))
        .nest_service("/fonts", ServeDir::new(public.join("fonts")))
        .nest_service("/data", ServeDir::new(public.join("data")))
        .nest_service("/licenses", ServeDir::new(public.join("licenses")))
        .fallback(fallback)
        .with_state(app);
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .unwrap_or_else(|_| SocketAddr::from(([127, 0, 0, 1], 4174)));
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    println!("FiberShare demo at http://{addr}");
    axum::serve(listener, router).await.expect("serve");
}
