// Alert thresholds. Change them here; the herd view, the tests, and the
// feedback records all read these values.
export const ALERT_RULES = Object.freeze({
  // A battery alert opens below this percent, unless the tracker is on outside power.
  lowBatteryPercent: 20,
  // A quiet-tracker alert opens when a tracker has sent nothing for longer than this.
  quietMinutes: 120,
  // A not-moving alert opens when a tracker keeps checking in but stays near the same spot.
  stillMinutes: 120,
  // How far (on the 0-100 paddock grid, or meters once live GPS is wired) counts as a real move.
  stillDistance: 3,
  // Active paddock on the same 0-100 grid. Live fences can replace this later.
  paddock: Object.freeze({ minX: 0, maxX: 100, minY: 0, maxY: 100 }),
  // The longest note a rancher can add to an answer.
  noteMaxLength: 280,
});
