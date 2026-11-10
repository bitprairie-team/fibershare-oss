//! `fibershare pull`: read the rancher's network server into `.local/live.json`.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;
use std::time::Duration;

use fibershare_core::chirpstack::{collect_uplinks, parse_mqtt_url, uplink_topics};
use fibershare_core::pull::{run_pull, HttpReply};

pub fn pull(root: &Path, args: Vec<String>) -> i32 {
    let mut env = BTreeMap::new();
    for (key, value) in std::env::vars() {
        env.insert(key, value);
    }
    load_dotenv(&root.join(".env"), &mut env);
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let watch = fibershare_core::chirpstack::parse_args(&args, &env)
        .map(|options| options.watch)
        .unwrap_or(0);
    loop {
        let code = once(root, &args, &env, &now);
        if watch == 0 {
            return code;
        }
        std::thread::sleep(Duration::from_secs(u64::from(watch)));
    }
}

fn once(root: &Path, args: &[String], env: &BTreeMap<String, String>, now: &str) -> i32 {
    let (code, log) = run_pull(
        args,
        env,
        &|path| std::fs::read_to_string(path).map_err(|_| ()),
        &file_mode_of,
        now,
        http_get,
        |path, text, mode| write_atomic(root, path, text, mode),
        http_post,
        |apps, seconds| {
            let settings = parse_mqtt_url(
                env.get("CHIRPSTACK_MQTT_URL")
                    .map(String::as_str)
                    .unwrap_or(""),
                env,
            )?;
            collect_uplinks(&settings, &uplink_topics(apps), f64::from(seconds))
        },
    );
    for line in log.lines() {
        if line.contains("stopped")
            || line.contains("failed")
            || line.starts_with("chirpstack:pull: No ")
        {
            eprintln!("{line}");
        } else {
            println!("{line}");
        }
    }
    code
}

fn file_mode_of(path: &str) -> Option<u32> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path).ok().map(|m| m.permissions().mode())
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}

fn http_get(url: &str, headers: &BTreeMap<String, String>) -> Result<HttpReply, String> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(30))
        .build();
    let mut req = agent.get(url);
    for (key, value) in headers {
        req = req.set(key, value);
    }
    reply_of(req.call())
}

fn http_post(url: &str, token: &str, body: &str) -> Result<HttpReply, String> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(60))
        .build();
    let req = agent
        .post(url)
        .set("content-type", "application/json")
        .set("x-fibershare-push-token", token);
    reply_of(req.send_string(body))
}

fn reply_of(result: Result<ureq::Response, ureq::Error>) -> Result<HttpReply, String> {
    match result {
        Ok(resp) => Ok(read_resp(resp)),
        Err(ureq::Error::Status(_, resp)) => Ok(read_resp(resp)),
        Err(err) => Err(err.to_string()),
    }
}

fn read_resp(resp: ureq::Response) -> HttpReply {
    let status = resp.status();
    let content_type = resp.header("content-type").unwrap_or("").to_string();
    let body = resp.into_string().unwrap_or_default();
    HttpReply {
        status,
        content_type,
        body,
    }
}

fn write_atomic(root: &Path, path: &str, text: &str, mode: u32) -> Result<(), String> {
    let path = if Path::new(path).is_absolute() {
        Path::new(path).to_path_buf()
    } else {
        root.join(path)
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = std::fs::File::create(&tmp).map_err(|err| err.to_string())?;
        file.write_all(text.as_bytes())
            .map_err(|err| err.to_string())?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(mode));
    }
    std::fs::rename(&tmp, &path).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode));
    }
    let _ = mode;
    Ok(())
}

fn load_dotenv(path: &Path, env: &mut BTreeMap<String, String>) {
    let Ok(text) = std::fs::read_to_string(path) else {
        return;
    };
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if !env.contains_key(key) {
            env.insert(key.to_string(), value.trim_matches('"').to_string());
        }
    }
}
