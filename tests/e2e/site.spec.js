import { expect, test } from "@playwright/test";

test("home does not load the wasm island", async ({ page }) => {
  const wasm = [];
  page.on("request", (request) => {
    if (request.url().includes("/wasm/")) wasm.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  expect(wasm).toEqual([]);
  await expect(page.locator("script[src='/chrome.js']")).toHaveCount(1);
});

test("herd view shows pins, the ledger, and the phone sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/map?animal=bramble&sheet=1");
  await expect(page.locator("#herd-dynamic[data-island='1']")).toBeAttached();
  await expect(page.locator("[data-id='bramble']")).toBeVisible();
  await expect(page.locator("h2", { hasText: "All animals" })).toBeVisible();
  const sheet = page.locator("[data-detail], [data-sheet-close]").first();
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box.height).toBeLessThanOrEqual(844 * 0.45 + 8);
  await page.locator("[data-sheet-close]").click();
  await expect(page.locator("[data-id='bramble']")).toBeFocused();
});

test("escape closes the phone sheet and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/map?animal=bramble&sheet=1");
  await expect(page.locator("#herd-dynamic[data-island='1']")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-id='bramble']")).toBeFocused();
});

test("the tour opens a spotlight and traps focus", async ({ page }) => {
  await page.goto("/map");
  await page.locator("[data-tour-start]").click();
  await expect(page.locator(".tour-spot")).toBeVisible();
  await expect(page.locator(".tour-card")).toBeVisible();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.closest(".tour-card") !== null);
  expect(focused).toBe(true);
});

test("a missing page is the designed 404", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response.status()).toBe(404);
  const body = await response.text();
  expect(body).toContain("Page not found");
  expect(body).toContain("That address is not in this demo.");
  await expect(page.getByRole("link", { name: "Back home" })).toBeVisible();
});

test("a rancher error is decoded", async ({ page }) => {
  await page.goto("/rancher?error=That%20passphrase%20did%20not%20match.");
  await expect(page.getByRole("alert")).toHaveText("That passphrase did not match.");
  await expect(page.locator("body")).not.toContainText("%20");
});

test("trace does not load the wasm island", async ({ page }) => {
  const wasm = [];
  page.on("request", (request) => {
    if (request.url().includes("/wasm/")) wasm.push(request.url());
  });
  await page.goto("/trace");
  await expect(page.locator("[data-tour='chain']")).toBeVisible();
  expect(wasm).toEqual([]);
});

test("docs map, sitemap, and robots use the right content types", async ({ request, baseURL }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.ok()).toBeTruthy();
  expect(llms.headers()["content-type"]).toMatch(/text\/plain/);
  const llmsBody = await llms.text();
  expect(llmsBody).toContain("# FiberShare (open source)");
  expect(llmsBody).toContain("/docs/hardware.md");

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  expect(robots.headers()["content-type"]).toMatch(/text\/plain/);
  const robotsBody = await robots.text();
  expect(robotsBody).toContain("Sitemap:");
  expect(robotsBody).toContain("/llms.txt");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  expect(sitemap.headers()["content-type"]).toMatch(/application\/xml|text\/xml/);
  const xml = await sitemap.text();
  expect(xml).toContain("<loc>/docs</loc>");
  expect(xml).toContain("<loc>/docs/hardware</loc>");

  const markdown = await request.get("/docs/hardware.md");
  expect(markdown.ok()).toBeTruthy();
  expect(markdown.headers()["content-type"]).toMatch(/markdown|text\/plain/);
  expect(await markdown.text()).toContain("# Hardware");
});

test("docs pages are server-rendered HTML", async ({ page, request }) => {
  const wasm = [];
  const errors = [];
  page.on("request", (req) => {
    if (req.url().includes("/wasm/")) wasm.push(req.url());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  const response = await page.goto("/docs");
  expect(response.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Docs");
  await expect(page.getByRole("link", { name: "Hardware" })).toBeVisible();
  await page.getByRole("link", { name: "Hardware", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Hardware");
  expect(wasm).toEqual([]);
  expect(errors).toEqual([]);
  const missing = await request.get("/docs/no-such-guide");
  expect(missing.status()).toBe(404);
});
