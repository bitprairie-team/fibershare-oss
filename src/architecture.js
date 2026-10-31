import { nav, footer } from "./layout.js";
import { APP, DISCORD, REPO } from "./sites.js";
import { EXT } from "./util.js";
import { JOBS, PLANNED } from "./loops.js";

const PARTS = [
  ["Pages", "Plain web pages built with Vite. Run them yourself or publish a copy on Cloudflare Pages."],
  ["Sample data", "The goats, the sample day and the fiber lots are in <code>public/data</code>. The fleece trace reads <code>docs/schemas/examples</code>."],
  ["Server routes", "<code>/api/live</code> sends tracker data, <code>/api/session</code> handles sign-in and <code>/api/alerts</code> keeps a signed-in rancher's answers."],
  ["Your own trackers", "<code>npm run chirpstack:pull</code> reads trackers from a ChirpStack v4 server into <code>.local/live.json</code>. Git ignores that file and the build leaves it out."],
  ["Sign-in", "A passphrase on your own hardware, or Cloudflare Access on Pages. The server checks it on every request."],
  ["Alert rules", "<code>src/alerts.js</code> and <code>src/alert-config.js</code>. The browser and the server run the same code."],
];

export function renderArchitecture() {
  const jobs = JOBS.map((j) => "<li><strong>" + j.name + "</strong><span>" + j.detail + "</span></li>").join("");
  const planned = PLANNED.join(", ").replace(/, ([^,]*)$/, " and $1");
  const parts = PARTS.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("");
  return (
    nav("/architecture") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>How it works</h1>" +
    '<p class="lede">The demo is a small web app with a few server routes. All of it runs on your own hardware, with no account.</p>' +
    "</section>" +
    '<section class="section" aria-labelledby="jobs-title">' +
    '<h2 id="jobs-title">Automated jobs</h2>' +
    '<ul class="job-list">' + jobs + "</ul>" +
    '<p class="planned"><span class="tag">Planned</span> ' + planned.charAt(0).toUpperCase() + planned.slice(1) + ".</p>" +
    "</section>" +
    '<section class="section" aria-labelledby="parts-title">' +
    '<h2 id="parts-title">Parts</h2>' +
    '<dl class="def-list">' + parts + "</dl>" +
    "</section>" +
    '<section class="section" aria-labelledby="run-title">' +
    '<h2 id="run-title">Run your own copy</h2>' +
    "<p>You need Node 20.9 or newer. Then open http://localhost:5173.</p>" +
    "<pre><code>git clone " + REPO + ".git\ncd fibershare-oss\nnpm install\nnpm run dev</code></pre>" +
    "<p>The code is MIT licensed. Keep private ranch files and real tracker data out of the repository. " +
    'See the <a href="' + REPO + '/blob/main/CONTRIBUTING.md"' + EXT + ">contribution guide</a>, or ask on <a href=\"" + DISCORD + '"' + EXT + ">Discord</a>.</p>" +
    '<p>The FiberShare app is a separate product at <a href="' + APP + '"' + EXT + ">fibershare.app</a>.</p>" +
    "</section></main>" +
    footer()
  );
}
