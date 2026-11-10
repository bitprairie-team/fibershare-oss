//! How the demo writes times: 24-hour clock, "Sep 6" for dates, and
//! "10 min ago" style ages. One place, so every page reads the same.
//!
//! A timestamp with no zone is a clock reading, not an instant in another
//! zone. A `Z` or numeric offset is an instant, shown in UTC so the tests
//! and the sample day agree on every machine.

use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Timelike, Utc};

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

#[derive(Clone, Copy)]
struct Clock {
    /// Milliseconds used for differences.
    ms: i64,
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
}

fn clock_of(iso: &str) -> Option<Clock> {
    let text = iso.trim();
    if text.is_empty() {
        return None;
    }
    if text.ends_with('Z') || text.contains('+') || has_negative_offset(text) {
        let dt = DateTime::parse_from_rfc3339(text).ok()?;
        let utc = dt.with_timezone(&Utc);
        return Some(Clock {
            ms: utc.timestamp_millis(),
            year: utc.year(),
            month: utc.month(),
            day: utc.day(),
            hour: utc.hour(),
            minute: utc.minute(),
        });
    }
    let naive = parse_naive(text)?;
    let ms = naive.and_utc().timestamp_millis();
    Some(Clock {
        ms,
        year: naive.year(),
        month: naive.month(),
        day: naive.day(),
        hour: naive.hour(),
        minute: naive.minute(),
    })
}

fn has_negative_offset(text: &str) -> bool {
    // "2026-09-06T10:00:00-07:00" has a zone. A date hyphen does not count.
    text.rfind('T').is_some_and(|i| text[i + 1..].contains('-'))
}

fn parse_naive(text: &str) -> Option<NaiveDateTime> {
    let (date, time) = text.split_once('T')?;
    let date = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    let time = if time.len() >= 8 {
        NaiveTime::parse_from_str(&time[..8], "%H:%M:%S").ok()?
    } else {
        NaiveTime::parse_from_str(time, "%H:%M").ok()?
    };
    Some(date.and_time(time))
}

/// Milliseconds since the Unix epoch, matching `Date.parse` for these inputs.
pub fn parse_ms(iso: &str) -> Option<i64> {
    clock_of(iso).map(|c| c.ms)
}

/// "16:40"
pub fn time_of(iso: &str) -> String {
    clock_of(iso)
        .map(|c| format!("{:02}:{:02}", c.hour, c.minute))
        .unwrap_or_default()
}

/// "Sep 6, 16:40"
pub fn date_time(iso: &str) -> String {
    let Some(c) = clock_of(iso) else {
        return String::new();
    };
    format!(
        "{} {}, {}",
        MONTHS[(c.month as usize).saturating_sub(1)],
        c.day,
        time_of(iso)
    )
}

/// The time alone when it is the same day as `now_ms`, else the date and time.
pub fn day_time(iso: &str, now_ms: i64) -> String {
    let Some(c) = clock_of(iso) else {
        return String::new();
    };
    let now = Utc.timestamp_millis_opt(now_ms).single();
    let same = now.is_some_and(|n| n.year() == c.year && n.month() == c.month && n.day() == c.day);
    if same {
        time_of(iso)
    } else {
        date_time(iso)
    }
}

/// "just now", "10 min ago", "3 hours ago", "4 days ago".
pub fn ago(iso: Option<&str>, now_iso: &str, none: &str) -> String {
    let Some(iso) = iso.filter(|s| !s.is_empty()) else {
        return none.to_string();
    };
    let (Some(then), Some(now)) = (parse_ms(iso), parse_ms(now_iso)) else {
        return "unknown".to_string();
    };
    let minutes = ((now - then) as f64 / 60000.0).round().max(0.0) as i64;
    if minutes < 1 {
        return "just now".to_string();
    }
    if minutes < 60 {
        return format!("{minutes} min ago");
    }
    let hours = (minutes as f64 / 60.0).round() as i64;
    if hours < 48 {
        return format!(
            "{hours} {}",
            if hours == 1 { "hour ago" } else { "hours ago" }
        );
    }
    format!("{} days ago", (hours as f64 / 24.0).round() as i64)
}

/// "2 hours", "90 min", "1 hour 30 min".
pub fn minutes_text(minutes: i64) -> String {
    if minutes < 60 {
        return format!("{minutes} min");
    }
    let h = minutes / 60;
    let m = minutes % 60;
    let mut out = format!("{h} {}", if h == 1 { "hour" } else { "hours" });
    if m != 0 {
        out.push_str(&format!(" {m} min"));
    }
    out
}

/// Local-looking ISO "YYYY-MM-DDTHH:MM:00" from a naive start plus milliseconds.
pub fn local_iso(start_iso: &str, plus_ms: i64) -> Option<String> {
    let naive = parse_naive(start_iso)?;
    let dt = naive.and_utc() + chrono::Duration::milliseconds(plus_ms);
    Some(dt.format("%Y-%m-%dT%H:%M:00").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn times_read_the_same_everywhere() {
        assert_eq!(time_of("2026-09-06T16:40:00"), "16:40");
        assert_eq!(time_of("2026-09-06T05:05:00"), "05:05");
        assert_eq!(time_of("nope"), "");
        assert_eq!(date_time("2026-09-06T16:40:00"), "Sep 6, 16:40");
        let now = parse_ms("2026-09-06T18:05:00").unwrap();
        assert_eq!(day_time("2026-09-06T17:55:00", now), "17:55");
        assert_eq!(day_time("2026-07-12T10:00:00", now), "Jul 12, 10:00");
        assert_eq!(
            ago(
                Some("2026-09-06T17:55:00"),
                "2026-09-06T18:05:00",
                "not yet"
            ),
            "10 min ago"
        );
        assert_eq!(
            ago(
                Some("2026-09-06T15:05:00"),
                "2026-09-06T18:05:00",
                "not yet"
            ),
            "3 hours ago"
        );
        assert_eq!(
            ago(
                Some("2026-09-01T18:05:00"),
                "2026-09-06T18:05:00",
                "not yet"
            ),
            "5 days ago"
        );
        assert_eq!(ago(Some(""), "2026-09-06T18:05:00", "not yet"), "not yet");
        assert_eq!(ago(None, "x", "not yet today"), "not yet today");
        for s in [
            time_of("2026-09-06T16:40:00"),
            date_time("2026-09-06T16:40:00"),
        ] {
            assert!(!s.contains("AM") && !s.contains("PM"));
        }
    }
}
