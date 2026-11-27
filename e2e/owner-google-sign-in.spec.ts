import fs from "node:fs";
import { expect, test } from "@playwright/test";

// Public-site checks that must still hold once the static export is lifted and the
// site is served by `next start` (Step 1 of owner-google-sign-in).

test("E2E-20: landing page, blog index and a blog post render with their titles and headings, without console errors", async ({
  browser,
}) => {
  const cases = [
    {
      path: "/",
      title: "thegoldenpothos — Keith Lim | Software Engineer & Portfolio",
      heading: "Keith Lim",
    },
    {
      path: "/blog/",
      title: "Blog | thegoldenpothos",
      heading: "Blog",
    },
    {
      path: "/blog/hello-world/",
      title: "Hello, World — Welcome to My Blog | thegoldenpothos",
      heading: "Hello, World — Welcome to My Blog",
    },
  ];

  for (const c of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    const response = await page.goto(c.path);
    expect(response?.status(), c.path).toBe(200);
    await expect(page, c.path).toHaveTitle(c.title);
    await expect(page.getByRole("heading", { level: 1 }).first(), c.path).toHaveText(c.heading);
    expect(errors, c.path).toEqual([]);

    await context.close();
  }
});

test("E2E-21: rss.xml, sitemap.xml and robots.txt are served with the expected content", async ({ request }) => {
  const rss = await request.get("/rss.xml");
  expect(rss.status()).toBe(200);
  expect(rss.headers()["content-type"]).toBe("application/rss+xml; charset=utf-8");
  const rssBody = await rss.text();
  expect(rssBody).toContain('<rss version="2.0"');
  expect(rssBody).toContain("<link>https://thegoldenpothos.xyz/blog/hello-world/</link>");
  expect(rssBody).toContain("<link>https://thegoldenpothos.xyz/blog/building-portfolio-nextjs/</link>");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain("<urlset");
  for (const loc of [
    "https://thegoldenpothos.xyz/",
    "https://thegoldenpothos.xyz/blog/",
    "https://thegoldenpothos.xyz/blog/building-portfolio-nextjs/",
    "https://thegoldenpothos.xyz/blog/hello-world/",
  ]) {
    expect(sitemapBody).toContain(`<loc>${loc}</loc>`);
  }

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect((await robots.text()).trim()).toBe(
    "User-Agent: *\nAllow: /\n\nSitemap: https://thegoldenpothos.xyz/sitemap.xml",
  );
});

test("E2E-22: an unknown page and an unknown blog post answer 404 with the built-in 404 page", async ({ page }) => {
  for (const path of ["/no-such-page/", "/blog/no-such-post/"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "404", exact: true }), path).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true }),
      path,
    ).toBeVisible();
  }
});

test("E2E-26: vercel.json and next.config.ts no longer declare a static export", async () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as Record<string, unknown>;
  expect(vercel.outputDirectory).toBeUndefined();
  expect(vercel.trailingSlash).toBe(true);
  expect(vercel.buildCommand).toBe("npm run build");
  expect(vercel.installCommand).toBe("npm ci");
  expect(vercel.framework).toBe("nextjs");

  const allowed = ["$schema", "framework", "installCommand", "buildCommand", "trailingSlash", "cleanUrls", "headers"];
  for (const key of Object.keys(vercel)) {
    expect(allowed, `unexpected vercel.json key ${key}`).toContain(key);
  }

  const nextConfig = fs.readFileSync("next.config.ts", "utf8");
  expect(nextConfig).not.toMatch(/\boutput\s*:/);
  expect(nextConfig).toMatch(/trailingSlash:\s*true/);
  expect(nextConfig).toMatch(/unoptimized:\s*true/);
});

test("E2E-27: next-auth is pinned exactly, http-server is gone and the Firebase packages stay", async () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  expect(pkg.dependencies?.["next-auth"]).toBe("5.0.0-beta.32");
  expect(pkg.dependencies?.["http-server"]).toBeUndefined();
  expect(pkg.devDependencies?.["http-server"]).toBeUndefined();
  expect(pkg.dependencies?.firebase).toBeDefined();
  expect(pkg.devDependencies?.["firebase-tools"]).toBeDefined();
});
