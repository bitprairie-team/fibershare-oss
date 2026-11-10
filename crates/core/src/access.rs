//! Cloudflare Access JWT checks. The team domain and audience come from the
//! environment, never from the repository.

use std::collections::HashMap;
use std::sync::Mutex;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde_json::{json, Value};

const CERT_TTL_MS: u64 = 10 * 60 * 1000;

struct Cache {
    at: u64,
    keys: Vec<Value>,
}

static CERTS: Mutex<Option<HashMap<String, Cache>>> = Mutex::new(None);

pub fn clear_cert_cache() {
    if let Ok(mut guard) = CERTS.lock() {
        *guard = Some(HashMap::new());
    }
}

pub fn team_host(value: &str) -> Option<String> {
    let text = value
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    let text = text.split('/').next().unwrap_or("").to_lowercase();
    if text.contains('.')
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
    {
        Some(text)
    } else {
        None
    }
}

pub fn access_token(headers: &HashMap<String, String>) -> Option<String> {
    if let Some(header) = headers
        .get("cf-access-jwt-assertion")
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        return Some(header.to_string());
    }
    let cookie = headers.get("cookie").cloned().unwrap_or_default();
    for part in cookie.split(';') {
        let mut bits = part.trim().splitn(2, '=');
        if bits.next() == Some("CF_Authorization") {
            return bits.next().map(|v| v.to_string());
        }
    }
    None
}

fn b64url_json(text: &str) -> Option<Value> {
    let bytes = URL_SAFE_NO_PAD.decode(text).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub async fn verify_access_jwt<F, Fut>(
    token: Option<&str>,
    team_domain: &str,
    aud: &str,
    now_ms: u64,
    fetch: F,
) -> Result<Value, &'static str>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    let host = team_host(team_domain).ok_or("not-configured")?;
    if aud.is_empty() {
        return Err("not-configured");
    }
    let Some(token) = token else {
        return Err("no-token");
    };
    let mut parts = token.split('.');
    let (Some(h), Some(p), Some(s), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err("no-token");
    };
    let header = b64url_json(h).ok_or("malformed")?;
    let claims = b64url_json(p).ok_or("malformed")?;
    if header.get("alg").and_then(Value::as_str) != Some("RS256")
        || header.get("kid").and_then(Value::as_str).is_none()
    {
        return Err("alg");
    }
    let kid = header.get("kid").and_then(Value::as_str).unwrap_or("");
    let keys = load_certs(&host, now_ms, false, &fetch)
        .await
        .map_err(|_| "certs")?;
    let keys = if keys
        .iter()
        .any(|k| k.get("kid").and_then(Value::as_str) == Some(kid))
    {
        keys
    } else {
        load_certs(&host, now_ms, true, &fetch)
            .await
            .map_err(|_| "certs")?
    };
    let Some(jwk) = keys.iter().find(|k| {
        k.get("kid").and_then(Value::as_str) == Some(kid)
            && k.get("kty").and_then(Value::as_str) == Some("RSA")
    }) else {
        return Err("unknown-key");
    };
    let header_parsed = decode_header(token).map_err(|_| "malformed")?;
    if header_parsed.alg != Algorithm::RS256 {
        return Err("alg");
    }
    let jwk_text = serde_json::to_string(jwk).map_err(|_| "unknown-key")?;
    let key = DecodingKey::from_jwk(&serde_json::from_str(&jwk_text).map_err(|_| "unknown-key")?)
        .map_err(|_| "unknown-key")?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[aud]);
    validation.set_issuer(&[format!("https://{host}")]);
    validation.leeway = 60;
    validation.validate_exp = true;
    validation.validate_nbf = true;
    if decode::<Value>(token, &key, &validation).is_err() {
        let _ = s;
        return Err("signature");
    }
    let _ = (claims, now_ms);
    Ok(b64url_json(p).unwrap_or(json!({})))
}

async fn load_certs<F, Fut>(
    host: &str,
    now_ms: u64,
    force: bool,
    fetch: &F,
) -> Result<Vec<Value>, ()>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<String, ()>>,
{
    {
        let guard = CERTS.lock().map_err(|_| ())?;
        if let Some(cache) = guard.as_ref().and_then(|map| map.get(host)) {
            if !force && now_ms.saturating_sub(cache.at) < CERT_TTL_MS {
                return Ok(cache.keys.clone());
            }
            if force && now_ms.saturating_sub(cache.at) < 60_000 {
                return Ok(cache.keys.clone());
            }
        }
    }
    let body = fetch(format!("https://{host}/cdn-cgi/access/certs")).await?;
    let parsed: Value = serde_json::from_str(&body).map_err(|_| ())?;
    let keys = parsed
        .get("keys")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if let Ok(mut guard) = CERTS.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(
            host.to_string(),
            Cache {
                at: now_ms,
                keys: keys.clone(),
            },
        );
    }
    Ok(keys)
}
