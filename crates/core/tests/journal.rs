//! The local ranch journal is an owner-only jsonl file.

use std::collections::HashMap;
use std::os::unix::fs::PermissionsExt;

use fibershare_core::api::{ensure_passphrase, local_api, LocalPaths, LocalState};

#[test]
fn local_journal_is_mode_0600_and_ignores_the_client_author() {
    let dir = std::env::temp_dir().join(format!(
        "fs-journal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let paths = LocalPaths {
        live: dir.join("live.json"),
        rancher: dir.join("rancher.json"),
        alerts: dir.join("alerts.json"),
        log: dir.join("ranch-log.json"),
    };
    ensure_passphrase(&paths.rancher, "sample-journal", "2026-09-06T18:00:00Z").unwrap();
    let state = LocalState::new();
    let now_ms = 1_700_000_000_000u64;
    let session = local_api(
        "POST",
        "/api/session",
        "http://127.0.0.1:4174/api/session",
        &HashMap::new(),
        r#"{"passphrase":"sample-journal"}"#,
        &paths,
        &state,
        now_ms,
        "2026-09-06T18:00:00Z",
        false,
        None,
    );
    assert_eq!(session.status, 200, "{}", session.body);
    let cookie = session
        .headers
        .iter()
        .find(|(name, _)| name == "set-cookie")
        .map(|(_, value)| value.clone())
        .expect("session cookie");
    let mut headers = HashMap::new();
    headers.insert("cookie".into(), cookie);
    let body = r#"{"type":"note","animalId":"bramble","text":"Fence check","author":"ignored"}"#;
    for _ in 0..2 {
        let saved = local_api(
            "POST",
            "/api/log",
            "http://127.0.0.1:4174/api/log",
            &headers,
            body,
            &paths,
            &state,
            now_ms,
            "2026-09-06T18:05:00Z",
            false,
            None,
        );
        assert_eq!(saved.status, 200, "{}", saved.body);
    }
    let journal = dir.join("ranch-log.jsonl");
    let mode = std::fs::metadata(&journal).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
    let text = std::fs::read_to_string(&journal).unwrap();
    assert_eq!(text.lines().filter(|line| !line.is_empty()).count(), 2);
    assert!(text.contains("Fence check"));
    assert!(text.contains("\"author\":\"rancher\""));
    assert!(!text.contains("ignored"));
    let _ = std::fs::remove_dir_all(&dir);
}
