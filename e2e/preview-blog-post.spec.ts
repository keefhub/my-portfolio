import { expect, test } from "@playwright/test";

test.describe("preview-blog-post", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-09: the public blog article keeps its prose container and content", async ({ page }) => {
    await page.goto("/blog/building-portfolio-nextjs/");

    const article = page.locator("article");
    const body = article.locator("> div");
    await expect(body).toHaveCount(1);
    await expect(body).toHaveAttribute(
      "class",
      "prose prose-lg max-w-none prose-a:no-underline hover:prose-a:underline",
    );

    const title = page.getByRole("heading", {
      level: 1,
      name: "Building a Portfolio with Next.js and Tailwind CSS",
    });
    await expect(title).toBeVisible();
    await expect(body.getByRole("heading", { level: 1 })).toHaveCount(0);

    const stack = body.locator("h3", { hasText: /^The Stack/ });
    await expect(stack.locator("a.heading-anchor")).toHaveAttribute("href", "#the-stack");

    const code = body.locator("pre code.hljs.language-javascript");
    await expect(code).toHaveCount(1);
    await expect(code.locator("span.hljs-keyword", { hasText: /^const$/ }).first()).toBeVisible();

    await expect(page.getByRole("link", { name: "All posts", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to all posts" })).toBeVisible();
  });
});
