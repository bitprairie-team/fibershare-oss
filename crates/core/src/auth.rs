//! Rancher sign-in for your own hardware: one passphrase, stored hashed,
//! and a signed session cookie.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use hmac::{Hmac, Mac};
use rand::RngCore;
use scrypt::{scrypt, Params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;

pub const COOKIE_NAME: &str = "fs_session";
pub const SESSION_HOURS: u64 = 12;
pub const MIN_PASSPHRASE: usize = 12;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RancherRecord {
    pub version: u32,
    pub kdf: String,
    pub params: ScryptParams,
    pub salt: String,
    pub hash: String,
    #[serde(rename = "sessionSecret")]
    pub session_secret: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScryptParams {
    #[serde(rename = "N")]
    pub n: u32,
    pub r: u32,
    pub p: u32,
}

pub fn hash_passphrase(passphrase: &str, now_iso: &str) -> Result<RancherRecord, String> {
    if passphrase.len() < MIN_PASSPHRASE {
        return Err(format!(
            "The passphrase needs at least {MIN_PASSPHRASE} characters."
        ));
    }
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let mut hash = [0u8; 32];
    let mut secret = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut secret);
    let params = Params::new(14, 8, 1, 32).map_err(|err| err.to_string())?;
    scrypt(passphrase.as_bytes(), &salt, &params, &mut hash).map_err(|err| err.to_string())?;
    Ok(RancherRecord {
        version: 1,
        kdf: "scrypt".into(),
        params: ScryptParams {
            n: 16384,
            r: 8,
            p: 1,
        },
        salt: STANDARD.encode(salt),
        hash: STANDARD.encode(hash),
        session_secret: STANDARD.encode(secret),
        created_at: now_iso.to_string(),
    })
}

pub fn verify_passphrase(passphrase: &str, record: &RancherRecord) -> bool {
    if record.kdf != "scrypt" {
        return false;
    }
    let Ok(expected) = STANDARD.decode(&record.hash) else {
        return false;
    };
    let Ok(salt) = STANDARD.decode(&record.salt) else {
        return false;
    };
    let log_n = (record.params.n as f64).log2() as u8;
    let Ok(params) = Params::new(log_n, record.params.r, record.params.p, expected.len()) else {
        return false;
    };
    let mut got = vec![0u8; expected.len()];
    if scrypt(passphrase.as_bytes(), &salt, &params, &mut got).is_err() {
        return false;
    }
    got == expected
}

pub fn read_record(path: &Path) -> Option<RancherRecord> {
    let text = fs::read_to_string(path).ok()?;
    let record: RancherRecord = serde_json::from_str(&text).ok()?;
    if record.kdf == "scrypt" && !record.session_secret.is_empty() {
        Some(record)
    } else {
        None
    }
}

pub fn write_record(path: &Path, record: &RancherRecord) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = PathBuf::from(format!("{}.tmp", path.display()));
    let text = serde_json::to_string_pretty(record).unwrap_or_else(|_| "{}".into()) + "\n";
    fs::write(&tmp, text)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
    }
    fs::rename(&tmp, path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn sign(secret_b64: &str, payload: &str) -> String {
    let key = STANDARD.decode(secret_b64).unwrap_or_default();
    let mut mac = HmacSha256::new_from_slice(&key).expect("hmac key");
    mac.update(payload.as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

pub fn make_session(secret_b64: &str, now_ms: u64, hours: u64) -> String {
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce);
    let payload = format!(
        "v1.{}.{}",
        now_ms + hours * 3_600_000,
        URL_SAFE_NO_PAD.encode(nonce)
    );
    format!("{payload}.{}", sign(secret_b64, &payload))
}

pub fn check_session(value: &str, secret_b64: &str, now_ms: u64) -> bool {
    if secret_b64.is_empty() {
        return false;
    }
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() != 4 || parts[0] != "v1" {
        return false;
    }
    let Ok(expires) = parts[1].parse::<u64>() else {
        return false;
    };
    if expires <= now_ms {
        return false;
    }
    let expected = sign(secret_b64, &parts[..3].join("."));
    // Compare the raw signature bytes so a different length cannot match.
    let Ok(got) = URL_SAFE_NO_PAD.decode(parts[3]) else {
        return false;
    };
    let Ok(exp) = URL_SAFE_NO_PAD.decode(expected) else {
        return false;
    };
    got.len() == exp.len()
        && got
            .iter()
            .zip(exp.iter())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

pub fn parse_cookies(header: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for part in header.split(';') {
        let Some((name, value)) = part.split_once('=') else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() || out.contains_key(name) {
            continue;
        }
        out.insert(name.to_string(), value.trim().to_string());
    }
    out
}

pub fn session_cookie(value: &str, secure: bool, hours: u64) -> String {
    let mut parts = vec![
        format!("{COOKIE_NAME}={value}"),
        "Path=/".into(),
        "HttpOnly".into(),
        "SameSite=Strict".into(),
        format!("Max-Age={}", hours * 3600),
    ];
    if secure {
        parts.push("Secure".into());
    }
    parts.join("; ")
}

pub fn clear_cookie(secure: bool) -> String {
    let mut parts = vec![
        format!("{COOKIE_NAME}="),
        "Path=/".into(),
        "HttpOnly".into(),
        "SameSite=Strict".into(),
        "Max-Age=0".into(),
    ];
    if secure {
        parts.push("Secure".into());
    }
    parts.join("; ")
}

#[derive(Default)]
pub struct Limiter {
    misses: HashMap<String, (u32, u64)>,
    tries: u32,
    pause_ms: u64,
}

impl Limiter {
    pub fn new() -> Self {
        Self {
            misses: HashMap::new(),
            tries: 5,
            pause_ms: 60_000,
        }
    }
    pub fn blocked(&self, key: &str, now: u64) -> bool {
        self.misses.get(key).is_some_and(|(count, at)| {
            *count >= self.tries && now.saturating_sub(*at) < self.pause_ms
        })
    }
    pub fn miss(&mut self, key: &str, now: u64) {
        let fresh = self
            .misses
            .get(key)
            .map(|(_, at)| now.saturating_sub(*at) >= self.pause_ms)
            .unwrap_or(true);
        let count = if fresh {
            1
        } else {
            self.misses.get(key).map(|(c, _)| c + 1).unwrap_or(1)
        };
        self.misses.insert(key.to_string(), (count, now));
    }
    pub fn clear(&mut self, key: &str) {
        self.misses.remove(key);
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn record_json(record: &RancherRecord) -> Value {
    serde_json::to_value(record).unwrap_or(Value::Null)
}
