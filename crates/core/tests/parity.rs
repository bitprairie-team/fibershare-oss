//! Ports of the Node suites the owner asked to keep: ChirpStack pull, Access
//! JWT, ranch log keys, schemas, and the wording rules.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, OnceLock};

use async_trait::async_trait;
use base64::Engine;
use fibershare_core::access::{access_token, clear_cert_cache, verify_access_jwt};
use fibershare_core::api::{get_log, post_log, post_push, KvStore, MemoryKv, PagesEnv};
use fibershare_core::chirpstack::{
    assign_aliases, build_headers, collect_uplinks, decode_object, device_key, grid_position,
    parse_args, parse_publish, parse_uplink_event, read_config, read_packets, redact,
    signal_bucket, subscribe_packet, uplink_topics, PullConfig, DEFAULT_URL,
};
use fibershare_core::live::{hide_tracker_details, is_live_data, leak_problems};
use fibershare_core::log::{
    add_log_entry, author_from_claims, merge_log_entries, parse_log_list, parse_log_value, KV_LOG,
    KV_LOG_PREFIX, LOCAL_LOG_AUTHOR, LOG_LIMIT,
};
use fibershare_core::private_data::{forbidden_keys, key_parts, private_data_problems};
use fibershare_core::pull::{pull_raw, run_pull, to_live_data, HttpReply, RawPull};
use fibershare_core::tour::TOUR_STEPS;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use rsa::pkcs8::{EncodePrivateKey, LineEnding};
use rsa::traits::PublicKeyParts;
use rsa::RsaPrivateKey;
use serde_json::{json, Value};

const NOW: &str = "2026-09-06T18:00:00.000Z";
const TOKEN: &str = "fake-token-xxxxxxxxxxxxxxxxxxxxxxxx";
const TEAM: &str = "fake-team.example";
const AUD: &str = "fake-aud-tag";
const KID: &str = "fake-kid-log";

fn fake_eui(n: u64) -> String {
    format!("{:016x}", 0xf00d0000 + n)
}
fn fake_uuid(n: u64) -> String {
    format!("{n:08x}-0000-4000-8000-{n:012x}")
}
fn fake_position(n: u64) -> (f64, f64) {
    (
        10.0 + n as f64 / 1000.0 + 0.00012,
        20.0 + n as f64 / 1000.0 + 0.00034,
    )
}

fn device(
    n: u64,
    battery: Option<i64>,
    last_seen: Option<&str>,
    external: bool,
    description: &str,
    tags: Value,
) -> Value {
    json!({
        "devEui": fake_eui(n),
        "name": format!("Fake collar {n}"),
        "description": description,
        "deviceProfileName": "Fake tracker profile",
        "lastSeenAt": last_seen,
        "deviceStatus": battery.map(|level| json!({"marginDb": 7, "externalPowerSource": external, "batteryLevel": level})),
        "tags": tags,
    })
}

fn all_devices() -> Vec<Value> {
    vec![
        device(
            1,
            Some(88),
            Some("2026-09-06T17:50:00Z"),
            false,
            "Fake note about collar one",
            json!({"herd": "fake-herd-north"}),
        ),
        device(
            2,
            Some(12),
            Some("2026-09-06T17:40:00Z"),
            false,
            "",
            json!({}),
        ),
        device(
            3,
            Some(-1),
            Some("2026-09-06T17:30:00Z"),
            false,
            "",
            json!({}),
        ),
        device(
            4,
            Some(64),
            Some("2026-09-06T09:00:00Z"),
            false,
            "",
            json!({}),
        ),
        device(
            5,
            Some(100),
            Some("2026-09-06T17:55:00Z"),
            true,
            "",
            json!({}),
        ),
        device(6, None, Some("2026-09-06T17:20:00Z"), false, "", json!({})),
        device(7, Some(40), None, false, "", json!({})),
        device(
            8,
            Some(73),
            Some("2026-09-06T17:45:00Z"),
            false,
            "",
            json!({"color": "fake-blue"}),
        ),
    ]
}

fn apps() -> Value {
    json!({"totalCount": 2, "result": [{"id": fake_uuid(11)}, {"id": fake_uuid(12)}]})
}

fn metric(n: u64) -> Value {
    let packets = if n == 7 { vec![0, 0, 0] } else { vec![2, 0, 3] };
    let snr = if n == 2 {
        vec![-12, 0, -11]
    } else if n == 3 {
        vec![-3, 0, -4]
    } else {
        vec![6, 0, 7]
    };
    let times: Vec<String> = (0..3)
        .map(|i| format!("2026-09-06T1{i}:00:00.000Z"))
        .collect();
    let rssi: Vec<i64> = packets
        .iter()
        .map(|p| if *p == 0 { 0 } else { -90 })
        .collect();
    json!({
        "rxPackets": {"timestamps": times, "datasets": [{"data": packets}]},
        "gwRssi": {"datasets": [{"data": rssi}]},
        "gwSnr": {"datasets": [{"data": snr}]},
    })
}

fn fake_fetch(
    page_size: Option<usize>,
    token: &str,
) -> impl FnMut(&str, &BTreeMap<String, String>) -> Result<HttpReply, String> + '_ {
    let token = token.to_string();
    move |url: &str, headers: &BTreeMap<String, String>| {
        let parsed = url::Url::parse(url).unwrap();
        let reply = |status: u16, body: Value| HttpReply {
            status,
            content_type: "application/json".into(),
            body: body.to_string(),
        };
        if headers
            .get("Grpc-Metadata-Authorization")
            .map(String::as_str)
            != Some(format!("Bearer {token}").as_str())
        {
            return Ok(reply(
                401,
                json!({"code": 16, "message": "no authorization provided"}),
            ));
        }
        let limit = parsed
            .query_pairs()
            .find(|(k, _)| k == "limit")
            .and_then(|(_, v)| v.parse::<usize>().ok());
        let offset = parsed
            .query_pairs()
            .find(|(k, _)| k == "offset")
            .and_then(|(_, v)| v.parse::<usize>().ok())
            .unwrap_or(0);
        let page = |body: Value| {
            if limit.is_none() {
                return json!({"totalCount": body.get("totalCount"), "result": []});
            }
            let size = limit.unwrap().min(page_size.unwrap_or(limit.unwrap()));
            let result = body
                .get("result")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let slice = result
                .into_iter()
                .skip(offset)
                .take(size)
                .collect::<Vec<_>>();
            json!({"totalCount": body.get("totalCount"), "result": slice})
        };
        let path = parsed.path();
        if path == "/api/tenants" {
            return Ok(reply(
                200,
                page(json!({"totalCount": 1, "result": [{"id": fake_uuid(1)}]})),
            ));
        }
        if path == "/api/applications" {
            return Ok(reply(200, page(apps())));
        }
        if path == "/api/devices" {
            let app = parsed
                .query_pairs()
                .find(|(k, _)| k == "applicationId")
                .map(|(_, v)| v.to_string())
                .unwrap_or_default();
            let list: Vec<Value> = if app == fake_uuid(11) {
                all_devices().into_iter().take(4).collect()
            } else if app == fake_uuid(12) {
                all_devices().into_iter().skip(4).collect()
            } else {
                Vec::new()
            };
            return Ok(reply(
                200,
                page(json!({"totalCount": list.len(), "result": list})),
            ));
        }
        if let Some(rest) = path
            .strip_prefix("/api/devices/")
            .and_then(|s| s.strip_suffix("/link-metrics"))
        {
            let n = (1..=8).find(|n| fake_eui(*n) == rest).unwrap_or(0);
            return if n == 0 {
                Ok(reply(
                    404,
                    json!({"code": 5, "message": "object does not exist"}),
                ))
            } else {
                Ok(reply(200, metric(n)))
            };
        }
        Ok(reply(404, json!({"code": 5, "message": "not found"})))
    }
}

fn base_config() -> PullConfig {
    PullConfig {
        base_url: Some(DEFAULT_URL.into()),
        token: TOKEN.into(),
        token_source: Some("env".into()),
        access_id: None,
        access_secret: None,
        tenant_ids: vec![],
        application_ids: vec![],
    }
}

fn pulled(page_size: Option<usize>) -> RawPull {
    let mut fetch = fake_fetch(page_size, TOKEN);
    pull_raw(&base_config(), 24, NOW, &mut fetch).unwrap()
}

fn uplink(n: u64, sos: bool) -> Value {
    let (lat, lon) = fake_position(n);
    let readings = json!([
        {"type": "Longitude", "measurementValue": lon},
        {"type": "Latitude", "measurementValue": lat},
        {"type": "Air Temperature", "measurementValue": 21.46},
        {"type": "Light", "measurementValue": 312},
        {"type": "Battery", "measurementValue": 77},
        {"type": "Motion Id", "measurementValue": 2}
    ]);
    let mut messages = vec![readings];
    if sos {
        messages.push(json!([{"type": "SOS", "measurementValue": 1}]));
    }
    let topic = format!(
        "application/{}/device/{}/event/up",
        fake_uuid(11),
        fake_eui(n)
    );
    let payload = json!({
        "time": "2026-09-06T17:58:00Z",
        "deviceInfo": {"devEui": fake_eui(n), "deviceName": format!("Fake collar {n}"), "tags": {}},
        "object": {"messages": messages},
        "rxInfo": [{"gatewayId": "aeeef", "rssi": -95, "snr": 4.5, "location": {"latitude": 1, "longitude": 2}}, {"gatewayId": "fake-receiver", "rssi": -101, "snr": -2}]
    });
    parse_uplink_event(&topic, payload.to_string().as_bytes()).unwrap()
}

#[test]
fn config_defaults_to_local_rest_gateway() {
    let mut env = BTreeMap::new();
    env.insert("CHIRPSTACK_API_TOKEN".into(), TOKEN.into());
    let read = read_config(&env, &|_| Err(()), &|_| None);
    assert_eq!(DEFAULT_URL, "http://localhost:8090");
    assert_eq!(read.config.base_url.as_deref(), Some(DEFAULT_URL));
    assert!(read.errors.is_empty());
    assert_eq!(read.config.token_source.as_deref(), Some("env"));
}

#[test]
fn config_reads_token_file_and_warns_on_loose_mode() {
    let seen = std::cell::RefCell::new(String::new());
    let read = read_config(
        &BTreeMap::new(),
        &|path| {
            *seen.borrow_mut() = path.to_string();
            Ok(format!("{TOKEN}\n"))
        },
        &|_| Some(0o644),
    );
    assert!(seen
        .borrow()
        .ends_with(".config/fibershare/chirpstack-token"));
    assert_eq!(read.config.token, TOKEN);
    assert_eq!(read.config.token_source.as_deref(), Some("file"));
    assert!(read.errors.is_empty());
    assert_eq!(read.warnings.len(), 1);
    assert!(!read.warnings.join(" ").contains(TOKEN));
}

#[test]
fn config_errors_without_a_token_or_half_an_access_pair() {
    assert_eq!(
        read_config(&BTreeMap::new(), &|_| Err(()), &|_| None)
            .errors
            .len(),
        1
    );
    let mut env = BTreeMap::new();
    env.insert("CHIRPSTACK_API_TOKEN".into(), TOKEN.into());
    env.insert("CF_ACCESS_CLIENT_ID".into(), "fake-id".into());
    assert_eq!(read_config(&env, &|_| Err(()), &|_| None).errors.len(), 1);
    env.remove("CF_ACCESS_CLIENT_ID");
    env.insert(
        "CHIRPSTACK_URL".into(),
        "http://example.invalid:8090".into(),
    );
    assert_eq!(read_config(&env, &|_| Err(()), &|_| None).warnings.len(), 1);
}

#[test]
fn requests_carry_grpc_gateway_bearer_header() {
    let plain = build_headers(&base_config());
    let bearer = format!("Bearer {TOKEN}");
    assert_eq!(
        plain.get("Grpc-Metadata-Authorization").map(String::as_str),
        Some(bearer.as_str())
    );
    assert!(!plain.contains_key("CF-Access-Client-Id"));
    let mut config = base_config();
    config.access_id = Some("fake-id".into());
    config.access_secret = Some("fake-secret".into());
    let access = build_headers(&config);
    assert_eq!(
        access.get("CF-Access-Client-Id").map(String::as_str),
        Some("fake-id")
    );
    assert_eq!(
        access.get("CF-Access-Client-Secret").map(String::as_str),
        Some("fake-secret")
    );
}

#[test]
fn pull_raw_walks_tenants_applications_devices_and_metrics() {
    let calls = Mutex::new(Vec::<String>::new());
    let mut fetch = |url: &str, headers: &BTreeMap<String, String>| {
        calls.lock().unwrap().push(url.to_string());
        let mut inner = fake_fetch(Some(3), TOKEN);
        inner(url, headers)
    };
    let raw = pull_raw(&base_config(), 24, NOW, &mut fetch).unwrap();
    assert_eq!(raw.application_count, 2);
    assert_eq!(raw.devices.len(), 8);
    assert_eq!(raw.link_metrics.len(), 8);
    let calls = calls.lock().unwrap();
    let device_calls: Vec<_> = calls
        .iter()
        .filter(|u| url::Url::parse(u).unwrap().path() == "/api/devices")
        .collect();
    assert!(device_calls.len() >= 4, "pages through results");
    assert!(device_calls
        .iter()
        .all(|u| u.contains("applicationId=") && u.contains("limit=")));
    let metric = calls.iter().find(|u| u.contains("/link-metrics")).unwrap();
    assert!(metric.contains("aggregation=HOUR"));
    assert!(metric.contains("start=") && metric.contains("end="));
}

#[test]
fn wrong_token_error_never_holds_the_token() {
    let mut fetch = fake_fetch(None, "other-token");
    let err = pull_raw(&base_config(), 24, NOW, &mut fetch).unwrap_err();
    assert!(err.contains("gRPC code 16"), "{err}");
    assert!(!err.contains(TOKEN));
    let mut config = base_config();
    assert_eq!(
        redact(&format!("x {TOKEN} y"), &[config.token.clone()]),
        "x [hidden] y"
    );
    config.token.clear();
}

#[test]
fn full_live_data_keeps_names_and_positions() {
    let mut raw = pulled(None);
    raw.uplinks = vec![uplink(1, false), uplink(2, true)];
    let (data, _) = to_live_data(&raw, &BTreeMap::new());
    assert!(is_live_data(&data));
    assert_eq!(data.get("hidden"), Some(&json!(false)));
    let one = data
        .get("animals")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .find(|a| a.pointer("/details/devEui").and_then(Value::as_str) == Some(&fake_eui(1)))
        .unwrap();
    assert_eq!(
        one.get("name").and_then(Value::as_str),
        Some("Fake collar 1")
    );
    assert_eq!(
        one.pointer("/details/description").and_then(Value::as_str),
        Some("Fake note about collar one")
    );
    assert_eq!(
        one.pointer("/details/tags/herd").and_then(Value::as_str),
        Some("fake-herd-north")
    );
    let (lat, _) = fake_position(1);
    assert!(
        (one.pointer("/details/position/latitude")
            .and_then(Value::as_f64)
            .unwrap()
            - lat)
            .abs()
            < 1e-9
    );
    assert_eq!(
        one.pointer("/sensors/temperature").and_then(Value::as_f64),
        Some(21.5)
    );
    assert_eq!(
        one.pointer("/sensors/light").and_then(Value::as_f64),
        Some(312.0)
    );
    assert_eq!(
        one.pointer("/sensors/motion").and_then(Value::as_f64),
        Some(2.0)
    );
    assert!(one.pointer("/sensors/sos").is_none());
    assert!(data
        .get("events")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e.get("type").and_then(Value::as_str) == Some("sos")));
}

#[test]
fn hidden_live_data_drops_private_fields() {
    let mut raw = pulled(None);
    raw.uplinks = vec![uplink(1, false), uplink(3, false)];
    let (full, _) = to_live_data(&raw, &BTreeMap::new());
    let hidden = hide_tracker_details(&full);
    assert!(is_live_data(&hidden));
    assert_eq!(hidden.get("hidden"), Some(&json!(true)));
    let text = hidden.to_string();
    for device in all_devices() {
        let eui = device.get("devEui").and_then(Value::as_str).unwrap();
        let name = device.get("name").and_then(Value::as_str).unwrap();
        assert!(!text.to_lowercase().contains(&eui.to_lowercase()));
        assert!(!text.contains(name));
    }
    for word in [
        "fake-herd-north",
        "fake-blue",
        "Fake note",
        "Fake tracker profile",
        "latitude",
        "\"details\"",
        "\"tags\"",
    ] {
        assert!(!text.contains(word), "{word}");
    }
    assert!(leak_problems(&hidden, &full).is_empty());
    assert!(hidden
        .get("animals")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .all(|a| a.get("name") == a.get("alias")));
    assert_eq!(
        hidden
            .get("animals")
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a.get("sensors").is_some_and(Value::is_object))
            .unwrap()
            .pointer("/sensors/temperature")
            .and_then(Value::as_f64),
        Some(21.5)
    );
}

#[test]
fn leak_check_catches_a_leftover_name() {
    let (full, _) = to_live_data(&pulled(None), &BTreeMap::new());
    let mut hidden = hide_tracker_details(&full);
    let name = full
        .pointer("/animals/0/details/deviceName")
        .and_then(Value::as_str)
        .unwrap()
        .to_string();
    hidden["note"] = json!(format!("about {name}"));
    assert!(leak_problems(&hidden, &full)
        .iter()
        .any(|p| p == "device name"));
}

#[test]
fn grid_cells_are_stable_and_aliases_survive() {
    for n in 1..=50 {
        let (x, y) = grid_position(&fake_eui(n));
        assert_eq!((x, y), grid_position(&fake_eui(n).to_uppercase()));
        assert!(x > 0.0 && x < 100.0 && y > 0.0 && y < 100.0);
    }
    let first = assign_aliases(&[fake_eui(1), fake_eui(2)], &BTreeMap::new());
    let later = assign_aliases(&[fake_eui(9), fake_eui(1), fake_eui(2)], &first);
    assert_eq!(
        later.get(&device_key(&fake_eui(1))),
        first.get(&device_key(&fake_eui(1)))
    );
    assert_eq!(later.get(&device_key(&fake_eui(9))).copied(), Some(3));
}

#[test]
fn battery_status_and_signal_follow_the_server() {
    let (data, _) = to_live_data(&pulled(None), &BTreeMap::new());
    let by = |n: u64| {
        data.get("animals")
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .find(|a| {
                a.pointer("/details/devEui").and_then(Value::as_str) == Some(fake_eui(n).as_str())
            })
            .unwrap()
            .clone()
    };
    assert_eq!(by(2).get("battery").and_then(Value::as_i64), Some(12));
    assert!(by(3).get("battery").unwrap().is_null());
    assert!(by(6).get("battery").unwrap().is_null());
    assert_eq!(by(5).get("externalPower"), Some(&json!(true)));
    assert_eq!(by(4).get("status").and_then(Value::as_str), Some("stale"));
    assert_eq!(
        by(7).get("status").and_then(Value::as_str),
        Some("never seen")
    );
    assert_eq!(by(1).get("status").and_then(Value::as_str), Some("online"));
    assert_eq!(by(1).get("signal").and_then(Value::as_str), Some("good"));
    assert_eq!(by(2).get("signal").and_then(Value::as_str), Some("weak"));
    assert_eq!(by(3).get("signal").and_then(Value::as_str), Some("fair"));
    assert_eq!(by(1).get("uplinks24h").and_then(Value::as_i64), Some(5));
    assert!(signal_bucket(&json!({})).is_none());
}

#[test]
fn decode_object_reads_plain_keys_and_ignores_zero_fix() {
    assert_eq!(
        decode_object(&json!({"latitude": 0, "longitude": 0, "temperature": 3.26}))
            .get("temperature")
            .and_then(Value::as_f64),
        Some(3.3)
    );
    let plain = decode_object(
        &json!({"data": {"lat": 10.5, "lng": 20.25, "light": 9, "sos": true, "motionSegmentNumber": 4}}),
    );
    assert_eq!(plain.get("latitude").and_then(Value::as_f64), Some(10.5));
    assert_eq!(plain.get("longitude").and_then(Value::as_f64), Some(20.25));
    assert_eq!(plain.get("motion").and_then(Value::as_i64), Some(4));
    assert_eq!(plain.get("sos"), Some(&json!(true)));
    assert_eq!(decode_object(&Value::Null), json!({}));
}

#[test]
fn mqtt_uplink_keeps_the_device_not_the_receivers() {
    let event = uplink(5, false);
    assert_eq!(
        event.get("devEui").and_then(Value::as_str),
        Some(fake_eui(5).as_str())
    );
    assert_eq!(event.get("rssi").and_then(Value::as_f64), Some(-95.0));
    assert!(!event.to_string().contains("fake-receiver"));
    assert!(event.get("rxInfo").is_none());
    assert!(parse_uplink_event("application/x/device/y/event/join", b"{}").is_none());
    assert_eq!(
        uplink_topics(&[]),
        vec!["application/+/device/+/event/up".to_string()]
    );
}

#[test]
fn mqtt_packets_round_trip() {
    let (packets, _) = read_packets(&fibershare_core::chirpstack::connect_packet(
        "fake", "u", "p", 30,
    ));
    assert_eq!(packets[0].kind, 1);
    assert_eq!(packets[0].body[7], 0xc2);
    let (sub, _) = read_packets(&subscribe_packet(1, &uplink_topics(&[])));
    assert_eq!(sub[0].kind, 8);
    assert_eq!(sub[0].flags, 2);
    let topic = b"application/a/device/b/event/up";
    let mut body = Vec::new();
    body.extend_from_slice(&(topic.len() as u16).to_be_bytes());
    body.extend_from_slice(topic);
    body.extend_from_slice(b"{}");
    let mut big = vec![0x30, body.len() as u8];
    big.extend_from_slice(&body);
    big.push(0x30);
    let (packets, rest) = read_packets(&big);
    assert_eq!(packets.len(), 1);
    assert_eq!(rest.len(), 1);
    let (_, payload) = parse_publish(packets[0].flags, &packets[0].body).unwrap();
    assert_eq!(payload, b"{}");
}

#[test]
fn collect_uplinks_from_a_local_fake_broker() {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let handle = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut buf = [0u8; 2048];
        let mut pending = Vec::new();
        loop {
            let n = socket.read(&mut buf).unwrap_or(0);
            if n == 0 && pending.is_empty() {
                break;
            }
            pending.extend_from_slice(&buf[..n]);
            let (packets, rest) = read_packets(&pending);
            pending = rest;
            for packet in packets {
                if packet.kind == 1 {
                    socket.write_all(&[0x20, 2, 0, 0]).unwrap();
                } else if packet.kind == 8 {
                    socket.write_all(&[0x90, 3, 0, 1, 0]).unwrap();
                    for n in [1_u64, 2] {
                        let topic = format!(
                            "application/{}/device/{}/event/up",
                            fake_uuid(11),
                            fake_eui(n)
                        );
                        let payload =
                            format!("{{\"deviceInfo\":{{\"devEui\":\"{}\"}}}}", fake_eui(n));
                        let mut body = Vec::new();
                        body.extend_from_slice(&(topic.len() as u16).to_be_bytes());
                        body.extend_from_slice(topic.as_bytes());
                        body.extend_from_slice(payload.as_bytes());
                        let mut frame = vec![0x30, body.len() as u8];
                        frame.extend_from_slice(&body);
                        socket.write_all(&frame).unwrap();
                    }
                    return;
                }
            }
        }
    });
    let settings = fibershare_core::chirpstack::MqttSettings {
        secure: false,
        host: "127.0.0.1".into(),
        port,
        username: "fake-user".into(),
        password: "fake-pass".into(),
    };
    let events = collect_uplinks(&settings, &uplink_topics(&[]), 0.4).unwrap();
    assert_eq!(events.len(), 2);
    handle.join().ok();
}

#[test]
fn hide_setting_defaults_on() {
    assert!(parse_args(&[], &BTreeMap::new()).unwrap().hide);
    let mut env = BTreeMap::new();
    env.insert("FIBERSHARE_HIDE_TRACKERS".into(), "0".into());
    assert!(!parse_args(&[], &env).unwrap().hide);
    assert!(parse_args(&["--hide".into()], &env).unwrap().hide);
    assert!(
        !parse_args(&["--no-hide".into()], &BTreeMap::new())
            .unwrap()
            .hide
    );
    assert!(parse_args(&["--bogus".into()], &BTreeMap::new()).is_err());
}

#[test]
fn pull_writes_a_hidden_file_and_prints_counts_only() {
    let dir = std::env::temp_dir().join(format!("fs-pull-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("live.json");
    let mut env = BTreeMap::new();
    env.insert("CHIRPSTACK_API_TOKEN".into(), TOKEN.into());
    let (code, log) = run_pull(
        &[format!("--out={}", out.display())],
        &env,
        &|path| std::fs::read_to_string(path).map_err(|_| ()),
        &|path| {
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
        },
        NOW,
        |url, headers| fake_fetch(None, TOKEN)(url, headers),
        |path, text, mode| {
            if let Some(parent) = std::path::Path::new(path).parent() {
                std::fs::create_dir_all(parent).ok();
            }
            std::fs::write(path, text).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode));
            }
            let _ = mode;
            Ok(())
        },
        |_, _, _| {
            Ok(HttpReply {
                status: 200,
                content_type: "application/json".into(),
                body: "{\"ok\":true}".into(),
            })
        },
        |_, _| Ok(vec![]),
    );
    assert_eq!(code, 0, "{log}");
    let hidden: Value = serde_json::from_str(&std::fs::read_to_string(&out).unwrap()).unwrap();
    assert_eq!(hidden.get("hidden"), Some(&json!(true)));
    assert_eq!(hidden.get("animals").unwrap().as_array().unwrap().len(), 8);
    assert!(!hidden.to_string().contains(&fake_eui(1)));
    assert!(!log.contains(TOKEN));
    assert!(log.contains("8 tracker(s)"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn server_sets_author_and_ignores_the_client() {
    let note = r#"{"type":"note","animalId":"tracker-1","text":"Fake note for tests.","author":"eve@evil.example"}"#;
    let (status, _, entry, _) = add_log_entry(
        &[],
        note,
        "2026-10-31T20:00:00.000Z",
        "rancher@example.com",
        None,
    );
    assert_eq!(status, 200);
    let entry = entry.unwrap();
    assert_eq!(
        entry.get("author").and_then(Value::as_str),
        Some("rancher@example.com")
    );
    assert_ne!(
        entry.get("author").and_then(Value::as_str),
        Some("eve@evil.example")
    );
    assert_eq!(
        author_from_claims(Some("rancher@example.com"), Some("abc")),
        "rancher@example.com"
    );
    assert_eq!(
        author_from_claims(None, Some("access-sub-1")),
        "access-sub-1"
    );
    assert_eq!(author_from_claims(None, None), LOCAL_LOG_AUTHOR);
    let full = (0..LOG_LIMIT).map(|i| json!({"id": format!("x{i}"), "type": "note", "animalId": "a", "text": "n", "at": NOW})).collect::<Vec<_>>();
    let (_, _, _, next) = add_log_entry(
        &full,
        r#"{"type":"note","animalId":"a","text":"n"}"#,
        NOW,
        "rancher",
        None,
    );
    assert_eq!(next.unwrap().len(), LOG_LIMIT);
    assert!(parse_log_list("{").is_empty());
    assert_eq!(
        parse_log_value(&entry.to_string())[0].get("id"),
        entry.get("id")
    );
    let merged = merge_log_entries(&[
        vec![json!({"id":"old-1","type":"note","at":"2026-10-01T00:00:00.000Z"})],
        vec![entry],
    ]);
    assert_eq!(merged[0].get("id").and_then(Value::as_str), Some("old-1"));
}

struct SlowKv {
    inner: MemoryKv,
}

#[async_trait(?Send)]
impl KvStore for SlowKv {
    async fn get(&self, key: &str) -> Option<String> {
        self.inner.get(key).await
    }
    async fn put(&self, key: &str, value: String) {
        std::thread::sleep(std::time::Duration::from_millis(20));
        self.inner.put(key, value).await;
    }
    async fn delete(&self, key: &str) {
        self.inner.delete(key).await
    }
    async fn list_prefix(&self, prefix: &str) -> Vec<String> {
        self.inner.list_prefix(prefix).await
    }
}

fn jwt_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

fn certs() -> &'static Mutex<String> {
    static CERTS: OnceLock<Mutex<String>> = OnceLock::new();
    CERTS.get_or_init(|| Mutex::new(String::new()))
}

fn fetch_cert(_: String) -> std::future::Ready<Result<String, ()>> {
    std::future::ready(Ok(certs().lock().unwrap().clone()))
}

fn sign_token(email: Option<&str>, sub: &str) -> (String, String) {
    let mut rng = rand::thread_rng();
    let key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
    let n = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(key.n().to_bytes_be());
    let e = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(key.e().to_bytes_be());
    let jwk = json!({"keys":[{"kty":"RSA","alg":"RS256","use":"sig","kid":KID,"n":n,"e":e}]});
    let pem = key.to_pkcs8_pem(LineEnding::LF).unwrap();
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(KID.into());
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let mut claims = json!({"aud":[AUD],"iss":format!("https://{TEAM}"),"sub":sub,"iat":now,"nbf":now-5,"exp":now+3600});
    if let Some(email) = email {
        claims["email"] = json!(email);
    }
    let token = encode(
        &header,
        &claims,
        &EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
    )
    .unwrap();
    (token, jwk.to_string())
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

#[test]
fn pages_log_needs_access_and_ignores_client_author() {
    let _lock = jwt_lock();
    clear_cert_cache();
    let (token, jwk) = sign_token(Some("rancher@example.com"), "fake-user");
    *certs().lock().unwrap() = jwk;
    let store = MemoryKv::new();
    let env = PagesEnv {
        team: Some(TEAM),
        aud: Some(AUD),
        push_token: None,
        arcgis: None,
        store: Some(&store),
    };
    let headers = HashMap::from([("cf-access-jwt-assertion".into(), token.clone())]);
    let empty = HashMap::new();
    let rt = runtime();
    let unsigned = rt.block_on(get_log(&empty, &env, 1_761_868_800_000, fetch_cert));
    assert_eq!(unsigned.status, 401);
    let saved = rt.block_on(post_log(
        &headers,
        "https://copy.example/api/log",
        r#"{"type":"note","animalId":"tracker-1","text":"Fake note for tests.","author":"eve@evil.example"}"#,
        &env,
        "2026-10-31T20:00:00.000Z",
        1_761_868_800_000,
        fetch_cert,
    ));
    assert_eq!(saved.status, 200, "{}", saved.body);
    assert_eq!(
        saved.body.pointer("/entry/author").and_then(Value::as_str),
        Some("rancher@example.com")
    );
    let keys = rt.block_on(store.list_prefix(KV_LOG_PREFIX));
    assert_eq!(keys.len(), 1);
    assert!(rt.block_on(store.get(KV_LOG)).is_none());
}

#[test]
fn pages_log_keeps_concurrent_posts_and_the_legacy_key() {
    let _lock = jwt_lock();
    clear_cert_cache();
    let mut rng = rand::thread_rng();
    let key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
    let n = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(key.n().to_bytes_be());
    let e = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(key.e().to_bytes_be());
    *certs().lock().unwrap() =
        json!({"keys":[{"kty":"RSA","alg":"RS256","use":"sig","kid":KID,"n":n,"e":e}]}).to_string();
    let pem = key.to_pkcs8_pem(LineEnding::LF).unwrap().to_string();
    let encode_for = |email: &str, sub: &str| {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(KID.into());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let mut claims = json!({"aud":[AUD],"iss":format!("https://{TEAM}"),"sub":sub,"iat":now,"nbf":now-5,"exp":now+3600});
        if !email.is_empty() {
            claims["email"] = json!(email);
        }
        encode(
            &header,
            &claims,
            &EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
        )
        .unwrap()
    };
    let token_a = encode_for("rancher@example.com", "fake-user");
    let token_b = encode_for("", "subject-only-user");
    let store: &'static SlowKv = Box::leak(Box::new(SlowKv {
        inner: MemoryKv::new(),
    }));
    let rt = runtime();
    rt.block_on(store.put(
        KV_LOG,
        json!([{"id":"old-1","type":"note","animalId":"tracker-1","text":"Leftover note from the single key.","at":"2026-10-01T12:00:00.000Z"}]).to_string(),
    ));
    let post = |token: String, text: &'static str| {
        let rt = runtime();
        let headers = HashMap::from([
            ("cf-access-jwt-assertion".into(), token),
            ("origin".into(), "https://copy.example".into()),
        ]);
        let body = format!(
            r#"{{"type":"note","animalId":"tracker-1","text":"{text}","author":"ignored@client.example"}}"#
        );
        let env = PagesEnv {
            team: Some(TEAM),
            aud: Some(AUD),
            push_token: None,
            arcgis: None,
            store: Some(store),
        };
        rt.block_on(post_log(
            &headers,
            "https://copy.example/api/log",
            &body,
            &env,
            "2026-10-31T20:00:00.000Z",
            1_761_868_800_000,
            fetch_cert,
        ))
    };
    let first = std::thread::spawn(move || post(token_a, "First concurrent note."));
    let second = std::thread::spawn(move || post(token_b, "Second concurrent note."));
    let first = first.join().unwrap();
    let second = second.join().unwrap();
    assert_eq!(first.status, 200, "{}", first.body);
    assert_eq!(second.status, 200, "{}", second.body);
    assert_eq!(
        first.body.pointer("/entry/author").and_then(Value::as_str),
        Some("rancher@example.com")
    );
    assert_eq!(
        second.body.pointer("/entry/author").and_then(Value::as_str),
        Some("subject-only-user")
    );
    let list = rt.block_on(fibershare_core::api::read_log(store));
    assert_eq!(list.len(), 3);
    assert_eq!(list[0].get("id").and_then(Value::as_str), Some("old-1"));
    assert!(list[0].get("author").is_none());
}

#[test]
fn access_jwt_rejects_a_bad_signature_and_reads_the_header() {
    let _lock = jwt_lock();
    clear_cert_cache();
    let (token, jwk) = sign_token(Some("rancher@example.com"), "fake-user");
    *certs().lock().unwrap() = jwk;
    let rt = runtime();
    let ok = rt.block_on(verify_access_jwt(
        Some(&token),
        TEAM,
        AUD,
        1_761_868_800_000,
        fetch_cert,
    ));
    assert!(ok.is_ok(), "{ok:?}");
    let bad = rt.block_on(verify_access_jwt(
        Some("a.b.c"),
        TEAM,
        AUD,
        1_761_868_800_000,
        fetch_cert,
    ));
    assert!(bad.is_err());
    let mut headers = HashMap::new();
    headers.insert("cf-access-jwt-assertion".into(), token.clone());
    assert_eq!(access_token(&headers).as_deref(), Some(token.as_str()));
    headers.clear();
    headers.insert("cookie".into(), format!("CF_Authorization={token}"));
    assert_eq!(access_token(&headers).as_deref(), Some(token.as_str()));
}

#[test]
fn tour_has_five_steps_in_order() {
    assert_eq!(TOUR_STEPS.len(), 5);
    assert_eq!(
        TOUR_STEPS.iter().map(|s| s.id).collect::<Vec<_>>(),
        vec!["herd", "predator", "alerts", "trace", "rancher-map"]
    );
    assert!(TOUR_STEPS.iter().filter(|s| s.simulated).all(|s| s
        .body
        .to_lowercase()
        .contains("simulated")
        || s.id == "predator"));
    assert!(TOUR_STEPS[1].body.contains("simulated"));
}

#[test]
fn schemas_are_draft_2020_and_examples_link() {
    for name in ["animal", "shearing", "fleece", "fiber-lot"] {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let schema: Value = serde_json::from_str(
            &std::fs::read_to_string(root.join(format!("docs/schemas/{name}.schema.json")))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            schema.get("$schema").and_then(Value::as_str),
            Some("https://json-schema.org/draft/2020-12/schema")
        );
        assert_eq!(
            schema.get("$id").and_then(Value::as_str),
            Some(format!("fibershare/{name}.schema.json").as_str())
        );
        assert!(schema
            .pointer("/properties/sharing/properties/audience/enum")
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v == "private"));
        let example: Value = serde_json::from_str(
            &std::fs::read_to_string(
                root.join(format!("docs/schemas/examples/{name}.example.json")),
            )
            .unwrap(),
        )
        .unwrap();
        let mut found = Vec::new();
        forbidden_keys(&example, name, &mut found);
        private_data_problems(&example, name, &mut found);
        assert!(found.is_empty(), "{found:?}");
    }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let animal: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("docs/schemas/examples/animal.example.json")).unwrap(),
    )
    .unwrap();
    let shearing: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("docs/schemas/examples/shearing.example.json")).unwrap(),
    )
    .unwrap();
    let fleece: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("docs/schemas/examples/fleece.example.json")).unwrap(),
    )
    .unwrap();
    let lot: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("docs/schemas/examples/fiber-lot.example.json"))
            .unwrap(),
    )
    .unwrap();
    assert_eq!(shearing.get("animalId"), animal.get("id"));
    assert_eq!(fleece.get("shearingId"), shearing.get("id"));
    assert!(lot
        .get("fleeceIds")
        .unwrap()
        .as_array()
        .unwrap()
        .contains(fleece.get("id").unwrap()));
}

#[test]
fn banned_record_field_names_are_caught() {
    let rejected = [
        "location",
        "ownerName",
        "owner_email",
        "Phone",
        "deviceId",
        "collarSerial",
        "priceUsd",
        "GPS",
        "mac_address",
    ];
    let parts = [
        "location",
        "coordinates",
        "coords",
        "gps",
        "address",
        "geo",
        "price",
        "cost",
        "usd",
        "currency",
        "payment",
        "card",
        "invoice",
        "email",
        "phone",
        "owner",
        "person",
        "contact",
        "device",
        "serial",
        "eui",
        "mac",
        "imei",
    ];
    for name in rejected {
        assert!(
            key_parts(name)
                .iter()
                .any(|part| parts.contains(&part.as_str())),
            "{name}"
        );
    }
}

#[test]
fn screen_copy_says_rancher_and_not_ai() {
    let html = fibershare_html_pages();
    let text = strip_tags(&html);
    assert!(!text.to_lowercase().contains("producer"));
    assert!(!regex_ai(&text), "{text}");
    assert!(text.contains("realtime intelligence systems") || readme_has_phrase());
    for name in ["SX1262", "SX1276", "LLCC68", "RAK4631", "nRF52840"] {
        assert!(!text.contains(name), "{name}");
    }
}

fn fibershare_html_pages() -> String {
    // The html crate is not a dependency of the core tests. Scan the source instead.
    let mut out = String::new();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    for path in [
        "crates/html/src/pages.rs",
        "crates/html/src/herd.rs",
        "crates/html/src/layout.rs",
        "README.md",
        "public/data/herd.json",
    ] {
        if let Ok(text) = std::fs::read_to_string(root.join(path)) {
            out.push_str(&text);
        }
    }
    out
}

fn strip_tags(text: &str) -> String {
    text.to_string()
}

fn strip_urls(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    loop {
        let http = rest.find("http://");
        let https = rest.find("https://");
        let start = match (http, https) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        };
        let Some(start) = start else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let after = &rest[start..];
        let end = after
            .find(|c: char| c.is_whitespace())
            .unwrap_or(after.len());
        rest = &after[end..];
    }
    out
}

fn regex_ai(text: &str) -> bool {
    // URLs may contain the letters. Screen sentences may not say AI, A.I., or SI.
    let without_urls = strip_urls(text);
    let lower = without_urls.to_lowercase();
    lower.contains("artificial intelligence")
        || lower.contains("a.i.")
        || without_urls.split_whitespace().any(|word| {
            let word = word.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '.');
            word == "AI" || word == "A.I." || word == "SI"
        })
}

fn readme_has_phrase() -> bool {
    std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../README.md"),
    )
    .unwrap_or_default()
    .contains("realtime intelligence systems")
}

#[test]
fn push_refuses_a_bad_token() {
    let rt = runtime();
    let store = MemoryKv::new();
    let env = PagesEnv {
        team: None,
        aud: None,
        push_token: Some("fake-push-token-qqqqqqqqqqqqqqqqqqqqqqqq"),
        arcgis: None,
        store: Some(&store),
    };
    let headers = HashMap::from([(
        "x-fibershare-push-token".into(),
        "wrong-token-wrong-token-wrong".into(),
    )]);
    let reply = rt.block_on(post_push(&headers, "{}", &env));
    assert_eq!(reply.status, 401);
}
