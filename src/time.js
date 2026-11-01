// How the demo writes times: 24-hour clock, "Sep 6" for dates, and
// "10 min ago" style ages. One place, so every page reads the same.

function valid(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "16:40" */
export function timeOf(iso) {
  const date = valid(iso);
  return date ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
}

/** "Sep 6, 16:40" */
export function dateTime(iso) {
  const date = valid(iso);
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + timeOf(iso) : "";
}

/** The time alone when it is the same day as nowMs, else the date and time. */
export function dayTime(iso, nowMs) {
  const date = valid(iso);
  if (!date) return "";
  return date.toDateString() === new Date(nowMs).toDateString() ? timeOf(iso) : dateTime(iso);
}

/** "just now", "10 min ago", "3 hours ago", "4 days ago". */
export function ago(iso, nowIso, none = "not yet") {
  if (!iso) return none;
  const ms = new Date(nowIso).getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours + (hours === 1 ? " hour ago" : " hours ago");
  return Math.round(hours / 24) + " days ago";
}
