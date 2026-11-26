import { expect, test } from "@playwright/test";

test("E2E-01: landing page renders its sections without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("E2E-02: blog index lists posts and a post page loads at its trailing-slash URL", async ({ page }) => {
  await page.goto("/blog/");
  const firstPost = page.locator('a[href^="/blog/"]:not([href="/blog/"])').first();
  await expect(firstPost).toBeVisible();

  await firstPost.click();
  await expect(page).toHaveURL(/\/blog\/[^/]+\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("E2E-03: rss.xml and sitemap.xml are served", async ({ request }) => {
  const rss = await request.get("/rss.xml");
  expect(rss.ok()).toBe(true);
  expect(await rss.text()).toContain("<rss");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("<urlset");
});
