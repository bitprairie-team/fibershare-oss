//! Each tracker's usual gap between check-ins.
//!
//! The hourly uplink counts already on a sample animal are enough. Times
//! inside an hour are spread the same way as `heard_by`, so the gap and the
//! last-heard time agree. A gap longer than the missed-check-in limit is an
//! outage, not the habit, and it is left out of the median.

use serde_json::Value;

use crate::time::parse_ms;

/// Habitual gaps required before a usual interval is real.
pub const MIN_HABIT_GAPS: usize = 4;
/// A silence longer than this multiple of the usual gap is unusual.
pub const UNUSUAL_FACTOR: i64 = 2;
/// Do not call a gap unusual before this many minutes. For a tracker that
/// checks in about every 20 minutes, that is just after two missed check-ins.
pub const UNUSUAL_FLOOR_MINUTES: i64 = 45;

const HOUR_MS: i64 = 3_600_000;

/// Minutes of silence after which `usual_minutes` counts as unusual.
pub fn unusual_after(usual_minutes: i64) -> i64 {
    usual_minutes
        .saturating_mul(UNUSUAL_FACTOR)
        .max(UNUSUAL_FLOOR_MINUTES)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CheckinPattern {
    /// Median habitual gap, in whole minutes.
    pub usual_minutes: i64,
    /// How many habitual gaps the median came from.
    pub gaps: usize,
    /// Open silence longer than this counts as unusual for this tracker.
    pub unusual_after_minutes: i64,
}

/// Check-in instants implied by hourly counts, at or before `now_ms`.
pub fn implied_uplink_ms(counts: &[i64], start_ms: i64, now_ms: i64) -> Vec<i64> {
    let mut times = Vec::new();
    for (i, count) in counts.iter().enumerate() {
        let n = (*count).max(0);
        if n == 0 {
            continue;
        }
        for k in 0..n {
            let slot = ((k + 1) * HOUR_MS) as f64 / (n as f64 + 1.0);
            let t = start_ms + i as i64 * HOUR_MS + slot.round() as i64;
            if t <= now_ms {
                times.push(t);
            }
        }
    }
    times
}

pub fn pattern_from_times(
    times_ms: &[i64],
    now_ms: i64,
    quiet_limit_minutes: i64,
) -> Option<CheckinPattern> {
    if quiet_limit_minutes < 1 {
        return None;
    }
    let mut times: Vec<i64> = times_ms.iter().copied().filter(|t| *t <= now_ms).collect();
    times.sort_unstable();
    times.dedup();
    let limit_ms = quiet_limit_minutes.saturating_mul(60_000);
    let mut gaps = Vec::new();
    for pair in times.windows(2) {
        let elapsed = pair[1].saturating_sub(pair[0]);
        // Compare the raw gap first. Rounding 120 minutes and 10 seconds
        // down to 120 would count an over-limit gap as a habit.
        if elapsed == 0 || elapsed > limit_ms {
            continue;
        }
        let minutes = (elapsed as f64 / 60_000.0).round() as i64;
        if minutes >= 1 {
            gaps.push(minutes);
        }
    }
    if gaps.len() < MIN_HABIT_GAPS {
        return None;
    }
    let usual = median(&mut gaps).max(1);
    Some(CheckinPattern {
        usual_minutes: usual,
        gaps: gaps.len(),
        unusual_after_minutes: unusual_after(usual),
    })
}

pub fn pattern_from_counts(
    counts: &[i64],
    start_ms: i64,
    now_ms: i64,
    quiet_limit_minutes: i64,
) -> Option<CheckinPattern> {
    if now_ms < start_ms {
        return None;
    }
    let times = implied_uplink_ms(counts, start_ms, now_ms);
    pattern_from_times(&times, now_ms, quiet_limit_minutes)
}

/// The pattern on one animal, from `uplinks` and a start time.
pub fn animal_pattern(
    animal: &Value,
    start_iso: Option<&str>,
    now: &str,
    quiet_limit_minutes: i64,
) -> Option<CheckinPattern> {
    let start = start_iso
        .or_else(|| animal.get("uplinksStart").and_then(Value::as_str))
        .and_then(parse_ms)?;
    let now_ms = parse_ms(now)?;
    let counts = uplink_counts(animal.get("uplinks")?)?;
    pattern_from_counts(&counts, start, now_ms, quiet_limit_minutes)
}

fn uplink_counts(value: &Value) -> Option<Vec<i64>> {
    Some(
        value
            .as_array()?
            .iter()
            .map(|count| count.as_f64().unwrap_or(0.0).floor().max(0.0) as i64)
            .collect(),
    )
}

fn median(values: &mut [i64]) -> i64 {
    values.sort_unstable();
    let mid = values.len() / 2;
    if values.len() % 2 == 1 {
        values[mid]
    } else {
        (values[mid - 1] + values[mid]) / 2
    }
}
