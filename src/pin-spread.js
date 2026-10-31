// Nudge pins apart on screen so each one stays easy to tap. Positions are in
// percent of the paddock; the gap is in pixels. The data is not changed, only
// where the pin is drawn. A few passes are enough for a herd-sized set.
export function spreadPins(points, width, height, gap = 34, passes = 12) {
  const out = points.map((p) => ({ id: p.id, x: p.x, y: p.y }));
  if (!(width > 0 && height > 0) || out.length < 2) return out;
  const minX = (gap / 2 / width) * 100;
  const minY = (gap / 2 / height) * 100;
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        let dx = ((b.x - a.x) / 100) * width;
        let dy = ((b.y - a.y) / 100) * height;
        let d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.01) {
          // Same spot: split them sideways, in a fixed direction.
          dx = 1;
          dy = 0;
          d = 1;
        }
        const push = (gap - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ((ux * push) / width) * 100;
        a.y -= ((uy * push) / height) * 100;
        b.x += ((ux * push) / width) * 100;
        b.y += ((uy * push) / height) * 100;
        moved = true;
      }
    }
    for (const p of out) {
      p.x = Math.min(100 - minX, Math.max(minX, p.x));
      p.y = Math.min(100 - minY, Math.max(minY, p.y));
    }
    if (!moved) break;
  }
  return out;
}
