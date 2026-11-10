import { HEAD, MAIN } from "./ui.js";
// Placeholder shapes shown while a page loads its data. They match the size
// of the real page, so the layout does not jump when the data arrives.

const line = (w, cls = "skel-line") => '<span class="skel ' + cls + '" style="width:' + w + '"></span>';
const block = (h, w = "100%") => '<span class="skel" style="height:' + h + ";width:" + w + '"></span>';

export function skeleton(kind) {
  const head =
    '<section class="' + HEAD + '" aria-hidden="true">' + line("min(24rem, 70%)", "skel-title") + line("min(36rem, 90%)") + line("min(28rem, 70%)") + "</section>";
  let body = "";
  if (kind === "herd") {
    body =
      '<div class="stat-row" aria-hidden="true">' + block("2.75rem", "6rem").repeat(3) + "</div>" +
      '<div class="herd-layout" aria-hidden="true"><div class="herd-main"><span class="skel skel-paddock"></span>' + line("100%") + "</div>" +
      '<div class="detail-skel">' + block("26rem") + "</div></div>";
  } else {
    body = '<div class="grid gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" aria-hidden="true">' + block("16rem") + block("16rem") + "</div>";
  }
  return (
    '<main class="' + (kind === "herd" ? "herd-page " : "") + MAIN + '" id="main" aria-busy="true">' +
    '<p class="sr-only" role="status">Loading</p>' + head + body + "</main>"
  );
}
