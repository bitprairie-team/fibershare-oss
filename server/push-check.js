// The checks a hidden live file must pass before it is written to disk or
// stored on Pages. No Node-only imports, so Pages Functions can use it.
import { leakProblems } from "../src/live-format.js";
import { committedTextProblems, privateDataProblems } from "../scripts/private-data.js";

/** Kinds of private data found in a hidden file. Never the values. */
export function hiddenProblems(hidden, full) {
  const found = [];
  privateDataProblems(hidden, "live", found);
  committedTextProblems(JSON.stringify(hidden, null, 2), "live", found);
  const leaks = leakProblems(hidden, full);
  return [...new Set([...found.map((p) => p.replace(/^live[^:]*: /, "").replace(/^\d+: /, "")), ...leaks])];
}
