//! Map layers for the signed-in rancher view.

use serde_json::{json, Value};

pub const DEFAULT_BASEMAP: &str = "usgs-imagery";
pub const KEYED_DEFAULT_BASEMAP: &str = "esri-imagery";

pub fn layers() -> Vec<Value> {
    serde_json::from_str(include_str!("layers.json")).unwrap_or_else(|_| Vec::new())
}

pub fn available_layers(has_key: bool) -> Vec<Value> {
    layers()
        .into_iter()
        .filter(|layer| has_key || layer.get("needsKey") != Some(&json!(true)))
        .collect()
}

pub fn tile_url(layer: &Value, api_key: &str) -> Option<String> {
    let url = layer.get("url").and_then(Value::as_str)?.to_string();
    if layer.get("needsKey") != Some(&json!(true)) {
        return Some(url);
    }
    if api_key.is_empty() {
        return None;
    }
    let joiner = if url.contains('?') { "&" } else { "?" };
    Some(format!("{url}{joiner}token={}", urlencoding_token(api_key)))
}

fn urlencoding_token(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

pub fn custom_layer(input: &str, name: &str) -> Result<Value, &'static str> {
    let Ok(url) = url::Url::parse(input.trim()) else {
        return Err("That is not a web address.");
    };
    if url.scheme() != "https" {
        return Err("Use an https address.");
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Leave the login out of the address.");
    }
    for (key, _) in url.query_pairs() {
        let key = key.to_lowercase();
        if key.contains("token")
            || key.contains("key")
            || key.contains("secret")
            || key.contains("password")
        {
            return Err("Leave keys and tokens out of the address.");
        }
    }
    let path = url.path();
    let feature = regex_ends(path, r"(?i)/(FeatureServer|MapServer)/\d+/?$");
    let service = regex_ends(path, r"(?i)/MapServer/?$");
    let geo = path.to_lowercase().ends_with(".json")
        || path.to_lowercase().ends_with(".geojson")
        || url.query_pairs().any(|(k, v)| k == "f" && v == "geojson");
    let kind = if feature {
        "feature"
    } else if service {
        "dynamic"
    } else if geo {
        "geojson"
    } else {
        return Err(
            "Use an ArcGIS layer (ending in /FeatureServer/0 or /MapServer) or a GeoJSON file.",
        );
    };
    let clean_path = path.trim_end_matches('/');
    let search = if kind == "geojson" {
        url.query().map(|q| format!("?{q}")).unwrap_or_default()
    } else {
        String::new()
    };
    let clean = format!("{}{clean_path}{search}", url.origin().ascii_serialization());
    let label = name.trim();
    Ok(json!({
        "id": format!("custom-{}", fnv(&clean)),
        "group": "overlay",
        "custom": true,
        "name": if label.is_empty() { "Your layer" } else { label },
        "type": kind,
        "url": clean,
        "needsKey": false,
        "attribution": url.host_str().unwrap_or(""),
    }))
}

fn regex_ends(path: &str, pattern: &str) -> bool {
    regex::Regex::new(pattern)
        .map(|re| re.is_match(path))
        .unwrap_or(false)
}

fn fnv(text: &str) -> String {
    let mut h: u32 = 2_166_136_261;
    for b in text.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(16_777_619);
    }
    let mut n = h;
    if n == 0 {
        return "0".into();
    }
    let digits = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = Vec::new();
    while n > 0 {
        out.push(digits[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_else(|_| "0".into())
}
