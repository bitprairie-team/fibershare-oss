export async function onRequestGet() {
  return Response.json({
    ok: true,
    project: "fibershare-oss",
    note: "Pages Function stub. Sample data stays in the JSON files. A store is Planned.",
  });
}
