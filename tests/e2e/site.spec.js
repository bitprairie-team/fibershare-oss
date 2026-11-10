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
  await page.goto("/");
  await page.locator("[data-tour-start]").click();
  await expect(page.locator(".tour-spot")).toBeVisible();
  await expect(page.locator(".tour-card")).toBeVisible();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.closest(".tour-card") !== null);
  expect(focused).toBe(true);
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
