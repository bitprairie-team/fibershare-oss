// Alert thresholds. Change them here; the herd view, the tests, and the
// feedback records all read these values.
export const ALERT_RULES = Object.freeze({
  // A battery alert opens below this percent, unless the tracker is on outside power.
  lowBatteryPercent: 20,
  // A quiet-tracker alert opens when a tracker has sent nothing for longer than this.
  quietMinutes: 120,
  // The longest note a rancher can add to an answer.
  noteMaxLength: 280,
});
