export async function onRequestGet(context) {
  const env = context?.env || {};
  return Response.json({
    ok: true,
    project: "fibershare-oss",
    mode: "pages",
    store: Boolean(env.FIBERSHARE_LIVE),
  });
}
