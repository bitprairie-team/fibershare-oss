//! The virtual paddock grid. Positions are 0-100 on each axis of a drawing.
//! They are not map positions and do not stand for a real place.

pub const GRID_COLS: usize = 6;
pub const GRID_ROWS: usize = 4;
const COL_LETTERS: &[u8] = b"ABCDEF";

fn clamp_index(value: f64, size: usize) -> usize {
    if !value.is_finite() {
        return 0;
    }
    let n = ((value / 100.0) * size as f64).floor() as i64;
    n.clamp(0, size as i64 - 1) as usize
}

/// The cell label, such as "C2", for a position on the grid.
pub fn cell_of(x: f64, y: f64) -> String {
    let col = COL_LETTERS[clamp_index(x, GRID_COLS)] as char;
    format!("{col}{}", clamp_index(y, GRID_ROWS) + 1)
}

/// Every cell label, row by row.
pub fn cell_labels() -> Vec<String> {
    let mut labels = Vec::with_capacity(GRID_COLS * GRID_ROWS);
    for row in 0..GRID_ROWS {
        for letter in COL_LETTERS.iter().take(GRID_COLS) {
            labels.push(format!("{}{}", *letter as char, row + 1));
        }
    }
    labels
}

/// Nudge pins apart on screen so each one stays easy to tap. Positions are in
/// percent of the paddock; the gap is in pixels. The data is not changed.
pub fn spread_pins(
    points: &[(String, f64, f64)],
    width: f64,
    height: f64,
    gap: f64,
    passes: usize,
) -> Vec<(String, f64, f64)> {
    let mut out: Vec<(String, f64, f64)> = points.to_vec();
    if !(width > 0.0 && height > 0.0) || out.len() < 2 {
        return out;
    }
    let min_x = (gap / 2.0 / width) * 100.0;
    let min_y = (gap / 2.0 / height) * 100.0;
    for _ in 0..passes {
        let mut moved = false;
        for i in 0..out.len() {
            for j in (i + 1)..out.len() {
                let mut dx = ((out[j].1 - out[i].1) / 100.0) * width;
                let mut dy = ((out[j].2 - out[i].2) / 100.0) * height;
                let mut d = dx.hypot(dy);
                if d >= gap {
                    continue;
                }
                if d < 0.01 {
                    dx = 1.0;
                    dy = 0.0;
                    d = 1.0;
                }
                let push = (gap - d) / 2.0;
                let ux = dx / d;
                let uy = dy / d;
                out[i].1 -= ((ux * push) / width) * 100.0;
                out[i].2 -= ((uy * push) / height) * 100.0;
                out[j].1 += ((ux * push) / width) * 100.0;
                out[j].2 += ((uy * push) / height) * 100.0;
                moved = true;
            }
        }
        for p in &mut out {
            p.1 = (100.0 - min_x).min(min_x.max(p.1));
            p.2 = (100.0 - min_y).min(min_y.max(p.2));
        }
        if !moved {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn twenty_four_cells() {
        assert_eq!(cell_labels().len(), 24);
        assert_eq!(cell_of(0.0, 0.0), "A1");
        assert_eq!(cell_of(99.9, 99.9), "F4");
    }

    #[test]
    fn spread_keeps_a_gap_and_leaves_inputs_alone() {
        let points = vec![
            ("a".into(), 66.0, 52.0),
            ("b".into(), 70.0, 56.0),
            ("c".into(), 70.0, 56.0),
            ("d".into(), 1.0, 99.0),
        ];
        let out = spread_pins(&points, 340.0, 340.0, 34.0, 12);
        assert_eq!(points[0].1, 66.0);
        for p in &out {
            assert!(p.1 > 0.0 && p.1 < 100.0 && p.2 > 0.0 && p.2 < 100.0);
        }
        for i in 0..out.len() {
            for j in (i + 1)..out.len() {
                let d = ((out[i].1 - out[j].1) / 100.0 * 340.0)
                    .hypot((out[i].2 - out[j].2) / 100.0 * 340.0);
                assert!(d >= 33.0, "{}-{} {d}", out[i].0, out[j].0);
            }
        }
        assert_eq!(
            spread_pins(&points[..1], 340.0, 340.0, 34.0, 12),
            vec![("a".into(), 66.0, 52.0)]
        );
        let flat = spread_pins(&points, 0.0, 0.0, 34.0, 12);
        assert_eq!(
            flat.iter().map(|p| p.1).collect::<Vec<_>>(),
            vec![66.0, 70.0, 70.0, 1.0]
        );
    }
}
