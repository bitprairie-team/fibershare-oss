// The virtual paddock grid. Positions are 0-100 on each axis of a drawing.
// They are not map positions and do not stand for a real place.

export const GRID_COLS = 6;
export const GRID_ROWS = 4;
const COL_LETTERS = "ABCDEF";

function clampIndex(value, size) {
  const n = Math.floor((Number(value) / 100) * size);
  if (!Number.isFinite(n)) return 0;
  return Math.min(size - 1, Math.max(0, n));
}

/** The cell label, such as "C2", for a position on the grid. */
export function cellOf(x, y) {
  return COL_LETTERS[clampIndex(x, GRID_COLS)] + String(clampIndex(y, GRID_ROWS) + 1);
}

/** Every cell label, row by row. */
export function cellLabels() {
  const labels = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) labels.push(COL_LETTERS[col] + String(row + 1));
  }
  return labels;
}

/** The center of a cell, as a position on the grid. */
export function cellCenter(label) {
  const match = /^([A-F])([1-4])$/.exec(String(label));
  if (!match) return null;
  const col = COL_LETTERS.indexOf(match[1]);
  const row = Number(match[2]) - 1;
  return { x: ((col + 0.5) / GRID_COLS) * 100, y: ((row + 0.5) / GRID_ROWS) * 100 };
}
