export async function onRequestGet() {
  return Response.json({
    ok: true,
    project: "fibershare-oss",
    note: "Pages Function stub. Swap JSON files for a store later.",
  });
}
