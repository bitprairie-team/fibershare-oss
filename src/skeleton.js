// Placeholder shapes shown while a page loads its data. They match the size
// of the real page, so the layout does not jump when the data arrives.

const line = (w, cls = "skel-line") => '<span class="skel ' + cls + '" style="width:' + w + '"></span>';
const block = (h, extra = "") => '<span class="skel skel-block" style="height:' + h + extra + '"></span>';

export function skeleton(kind) {
  const head =
    '<section class="page-head" aria-hidden="true">' + line("min(24rem, 70%)", "skel-title") + line("min(36rem, 90%)") + line("min(28rem, 70%)") + "</section>";
  let body = "";
  if (kind === "herd") {
    body =
      '<div class="stat-row" aria-hidden="true">' + block("5.25rem").repeat(4) + "</div>" +
      '<div class="herd-layout" aria-hidden="true"><div class="herd-main"><span class="skel skel-block skel-paddock"></span>' + line("100%") + "</div>" +
      '<div class="detail-skel">' + block("26rem") + "</div></div>";
  } else if (kind === "grid") {
    body = '<div class="product-grid" aria-hidden="true">' + block("20rem").repeat(4) + "</div>";
  } else {
    body = '<div class="rancher-grid" aria-hidden="true">' + block("16rem") + block("16rem") + "</div>";
  }
  return (
    '<main class="wrap' + (kind === "herd" ? " wrap-wide herd-page" : "") + '" id="main" aria-busy="true">' +
    '<p class="visually-hidden" role="status">Loading</p>' + head + body + "</main>"
  );
}
