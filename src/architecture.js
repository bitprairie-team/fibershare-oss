import { nav, footer } from "./layout.js";
import { REPO } from "./sites.js";
import { EXT } from "./util.js";

export function renderArchitecture() {
  return (
    nav("/architecture") +
    '<main class="wrap" id="main">' +
    '<section class="page-head">' +
    "<h1>How this site is built</h1>" +
    '<p class="lede">You can run it on your computer. You do not need an account.</p>' +
    "</section>" +
    '<ol class="arch-list">' +
    '<li><span class="feature-num" aria-hidden="true">01</span><div><h3>The pages</h3><p>Home, the herd map, and the shop are simple web pages. You can publish a copy on Cloudflare Pages. The live fibershare.dev site is the BitPrairie ranch product. This demo is not that site.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">02</span><div><h3>Sample files</h3><p>Goat and fiber data live in the public/data folder. Edit herd.json and shop.json to change the samples.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">03</span><div><h3>Health check</h3><p>A Pages Function is a small server step beside the site. Today it only answers /api/health to say the site is up. Later, herd and shop data can come from that step.</p></div></li>' +
    '<li><span class="feature-num" aria-hidden="true">04</span><div><h3>Other sites</h3><p>fibershare.app is the phone app. fibershare.us is the paid shop in the US. The BitPrairie ranch page hosts the same live product.</p></div></li>' +
    "</ol>" +
    '<section class="section">' +
    '<h2 class="section-rule">Help out</h2>' +
    "<p>Keep secrets out of this repo. Do not add private ranch files or mail settings.</p>" +
    "<p>The license is MIT. You may use, share, and change the code.</p>" +
    "<p>You need a GitHub account to send a change. A pull request is the change you ask us to add.</p>" +
    '<p><a href="' +
    REPO +
    "/blob/main/CONTRIBUTING.md\"" +
    EXT +
    ">Read the contribution rules</a></p>" +
    '<p class="cta-row"><a class="btn btn-primary" href="' +
    REPO +
    '"' +
    EXT +
    ">View the code</a></p>" +
    "</section></main>" +
    footer()
  );
}
