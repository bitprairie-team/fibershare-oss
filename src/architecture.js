import { nav, footer } from "./layout.js";
import { APP, DISCORD, REPO } from "./sites.js";
import { EXT } from "./util.js";
import { PLANNED, PULL_JOB, jobsFor } from "./loops.js";
import { readJobs, readRules, setAllJobs, setJob } from "./settings.js";

const PARTS = [
  ["Pages", "Plain web pages built with Vite. Run them yourself or publish a copy on Cloudflare Pages."],
  ["Sample data", "The goats, the sample day and the fiber lots are in <code>public/data</code>. The fleece trace reads <code>docs/schemas/examples</code>."],
  ["Server routes", "<code>/api/live</code> sends tracker data, <code>/api/session</code> handles sign-in and <code>/api/alerts</code> keeps a signed-in rancher's answers."],
  ["Your own trackers", "A pull script reads trackers from your LoRaWAN network server into <code>.local/live.json</code>. Git ignores that file and the build leaves it out."],
  ["Sign-in", "A passphrase on your own hardware, or Cloudflare Access on Pages. The server checks it on every request."],
  ["Alert rules", "<code>src/alerts.js</code> and <code>src/alert-config.js</code>. The browser and the server run the same code."],
];

function jobState(job, on) {
  return (on ? "On. " + job.detail : "Off. " + job.off);
}

function allJobs() {
  return [...jobsFor(readRules()), PULL_JOB];
}

export function renderArchitecture() {
  const state = readJobs();
  const jobs = allJobs()
    .map(
      (j) =>
        '<li class="job-row"><label class="toggle"><input type="checkbox" data-job="' + j.id + '"' + (state[j.id] ? " checked" : "") +
        ' aria-describedby="job-' + j.id + '" /> <strong>' + j.name + "</strong></label>" +
        '<span id="job-' + j.id + '" data-job-what="' + j.id + '">' + jobState(j, state[j.id]) + "</span></li>"
    )
    .join("");
  const planned = PLANNED.join(", ").replace(/, ([^,]*)$/, " and $1");
  const parts = PARTS.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("");
  return (
    nav("/architecture") +
    '<main class="wrap editorial" id="main">' +
    '<section class="page-head">' +
    "<h1>How it works</h1>" +
    '<p class="lede">What the demo does with tracker data, and the parts it runs on. Each automated job can be turned off below. All of it runs on your own hardware, with no account.</p>' +
    "</section>" +
    '<section class="section" aria-labelledby="jobs-title">' +
    '<h2 id="jobs-title">Automated jobs</h2>' +
    '<div class="job-block">' +
    '<p class="job-intro">Every job is on until you turn it off. With all of them off, the herd view still works by hand: answer and add alerts, save notes, and mark animals checked. Saved in this browser.</p>' +
    '<ul class="job-list">' + jobs + "</ul>" +
    '<p class="job-all"><button type="button" class="btn-link" data-all-jobs>' + (Object.values(state).some(Boolean) ? "Turn every job off" : "Turn every job on") + "</button>" +
    '<span class="visually-hidden" role="status" data-job-status></span></p>' +
    "</div>" +
    '<p class="planned"><span class="tag">Planned</span> ' + planned.charAt(0).toUpperCase() + planned.slice(1) + ".</p>" +
    "</section>" +
    '<section class="section" aria-labelledby="parts-title">' +
    '<h2 id="parts-title">Parts</h2>' +
    '<dl class="def-list">' + parts + "</dl>" +
    "</section>" +
    '<section class="section" aria-labelledby="run-title">' +
    '<h2 id="run-title">Run your own copy</h2>' +
    "<p>You need Node 20.9 or newer.</p>" +
    "<pre><code>git clone " + REPO + ".git\ncd fibershare-oss\nnpm install\nnpm run dev</code></pre>" +
    "<p>Then open http://localhost:5173.</p>" +
    "<p>The code is MIT licensed. Keep private ranch files and real tracker data out of the repository. " +
    'See the <a href="' + REPO + '/blob/main/CONTRIBUTING.md"' + EXT + ">contribution guide</a>, or ask on <a href=\"" + DISCORD + '"' + EXT + ">Discord</a>.</p>" +
    '<p>The FiberShare app is a separate product at <a href="' + APP + '"' + EXT + ">fibershare.app</a>.</p>" +
    "</section></main>" +
    footer()
  );
}

export function bindArchitecture(root) {
  const jobs = allJobs();
  const sync = (state, message) => {
    for (const job of jobs) {
      const box = root.querySelector('[data-job="' + job.id + '"]');
      if (box) box.checked = state[job.id];
      const what = root.querySelector('[data-job-what="' + job.id + '"]');
      if (what) what.textContent = jobState(job, state[job.id]);
    }
    const all = root.querySelector("[data-all-jobs]");
    if (all) all.textContent = Object.values(state).some(Boolean) ? "Turn every job off" : "Turn every job on";
    const status = root.querySelector("[data-job-status]");
    if (status) status.textContent = message;
  };
  root.querySelectorAll("[data-job]").forEach((box) => {
    box.addEventListener("change", () => {
      const job = jobs.find((j) => j.id === box.dataset.job);
      sync(setJob(box.dataset.job, box.checked), job.name + (box.checked ? ": on." : ": off."));
    });
  });
  root.querySelector("[data-all-jobs]")?.addEventListener("click", () => {
    const on = !Object.values(readJobs()).some(Boolean);
    sync(setAllJobs(on), on ? "Every job is on." : "Every job is off.");
  });
}
