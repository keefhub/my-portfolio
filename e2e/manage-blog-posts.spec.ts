import { expect, test } from "@playwright/test";
import {
  BLOG_MESSAGES,
  BLOG_POSTS_COLLECTION,
  blogPostFromData,
  blogPostLabel,
  blogPostLines,
  blogPostToData,
  checkBlogPost,
  emptyBlogPost,
  isRealDate,
  parseTags,
  sortBlogPosts,
  type BlogPostContent,
} from "../src/lib/admin/blogposts";

const DATE_MSG = "Enter a date as YYYY-MM-DD that is a real day";
const SLUG_MSG = "Enter a slug of lowercase letters, digits and hyphens";

test.describe("manage-blog-posts", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkBlogPost trims, accepts real dates and keeps the body as typed", async () => {
    const I: BlogPostContent = {
      title: " Why I moved to static export ",
      excerpt: " Notes on the trade-offs ",
      date: " 2026-05-15 ",
      slug: " why-static-export ",
      tags: " nextjs ,firebase,, ",
      coverImage: " /images/blog/static.png ",
      coverAlt: " A diagram of the build ",
      body: "  ## Heading\n\nBody  \n",
      featured: true,
      status: "Published",
    };
    expect(checkBlogPost(I)).toEqual({
      ok: true,
      content: {
        title: "Why I moved to static export",
        excerpt: "Notes on the trade-offs",
        date: "2026-05-15",
        slug: "why-static-export",
        tags: "nextjs, firebase",
        coverImage: "/images/blog/static.png",
        coverAlt: "A diagram of the build",
        body: "  ## Heading\n\nBody  \n",
        featured: true,
        status: "Published",
      },
    });
    expect(I.title).toBe(" Why I moved to static export ");

    const base: BlogPostContent = { title: "T", excerpt: "E", date: "2024-02-29", slug: "a-1", tags: "", coverImage: "", coverAlt: "", body: "B", featured: false, status: "Draft" };
    const address = "http://127.0.0.1:9199/v0/b/x/o/images%2Fa.png?alt=media&token=t";
    const results = [
      checkBlogPost(base),
      checkBlogPost({ ...base, date: "2000-02-29" }),
      checkBlogPost({ ...base, date: "1000-01-01" }),
      checkBlogPost({ ...base, date: "9999-12-31" }),
      checkBlogPost({ ...base, coverImage: address }),
    ];
    for (const r of results) expect(r.ok).toBe(true);
    const first = results[0];
    if (first.ok) {
      expect(first.content.tags).toBe("");
      expect(first.content.coverImage).toBe("");
      expect(first.content.coverAlt).toBe("");
    }
    const last = results[4];
    if (last.ok) expect(last.content.coverImage).toBe(address);

    expect(parseTags(" a ,, b ,")).toEqual(["a", "b"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags("x, x")).toEqual(["x", "x"]);
    expect(isRealDate("2024-02-29")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
  });

  test("E2E-02: checkBlogPost refuses each bad field with its own message", async () => {
    const B: BlogPostContent = {
      title: "Why I moved to static export",
      excerpt: "Notes on the trade-offs",
      date: "2026-05-15",
      slug: "why-static-export",
      tags: "nextjs, firebase",
      coverImage: "",
      coverAlt: "",
      body: "Body",
      featured: false,
      status: "Draft",
    };
    expect(checkBlogPost(B).ok).toBe(true);

    const errorsOf = (patch: Partial<BlogPostContent>) => {
      const r = checkBlogPost({ ...B, ...patch });
      if (r.ok) return null;
      return r.errors;
    };
    const cases: [Partial<BlogPostContent>, Record<string, string>][] = [];
    for (const title of ["", "   ", "\t\n"]) cases.push([{ title }, { title: "Enter a title" }]);
    for (const excerpt of ["", "   "]) cases.push([{ excerpt }, { excerpt: "Enter an excerpt" }]);
    const dates = ["", "15 May 2026", "2026-02-30", "2026-02-29", "2100-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-05-00", "2026-5-15", "26-05-15", "0999-12-31", "10000-01-01", "2026/05/15", "2026-05-15T00:00:00Z"];
    expect(dates).toHaveLength(15);
    for (const date of dates) cases.push([{ date }, { date: DATE_MSG }]);
    const slugs = ["", "   ", "Why Static Export", "why static export", "why_static_export", "Why-Static-Export", "why/static", "café"];
    expect(slugs).toHaveLength(8);
    for (const slug of slugs) cases.push([{ slug }, { slug: SLUG_MSG }]);
    for (const body of ["", "   ", "\n\n"]) cases.push([{ body }, { body: "Enter the post body" }]);
    expect(cases).toHaveLength(31);

    for (const [patch, expected] of cases) {
      const errors = errorsOf(patch);
      expect(errors, JSON.stringify(patch)).toEqual(expected);
      expect(Object.keys(errors ?? {})).toHaveLength(1);
    }

    expect(errorsOf({ title: "", excerpt: " ", date: "x", slug: "A B", body: "" })).toEqual({
      title: "Enter a title",
      excerpt: "Enter an excerpt",
      date: DATE_MSG,
      slug: SLUG_MSG,
      body: "Enter the post body",
    });
    expect(BLOG_MESSAGES.slugTaken).toBe("A post with this slug already exists");
  });

  test("E2E-03: row mapping, defaults, stored shape, labels, lines and messages", async () => {
    const a = blogPostFromData(
      {
        title: "Why I moved to static export",
        excerpt: "Notes on the trade-offs",
        date: "2026-05-15",
        tags: ["nextjs", "firebase"],
        draft: false,
        featured: true,
        coverImage: "/images/blog/static.png",
        coverAlt: "A diagram of the build",
        body: "Body",
        createdAt: 1,
        updatedAt: 2,
        slug: "ignored",
      },
      "why-static-export",
    );
    expect(a).toEqual({
      title: "Why I moved to static export",
      excerpt: "Notes on the trade-offs",
      date: "2026-05-15",
      slug: "why-static-export",
      tags: "nextjs, firebase",
      coverImage: "/images/blog/static.png",
      coverAlt: "A diagram of the build",
      body: "Body",
      featured: true,
      status: "Published",
    });
    expect(blogPostFromData({}, "x")).toEqual({ title: "", excerpt: "", date: "", slug: "x", tags: "", coverImage: "", coverAlt: "", body: "", featured: false, status: "Draft" });
    const c = blogPostFromData({ title: 5, tags: "a,b", draft: "false", featured: "true", body: null }, "y");
    expect(c.title).toBe("");
    expect(c.tags).toBe("");
    expect(c.featured).toBe(false);
    expect(c.body).toBe("");
    expect(c.status).toBe("Draft");
    expect(c.slug).toBe("y");
    const d = blogPostFromData({ tags: ["a", 3, "b", ""], draft: true }, "z");
    expect(d.tags).toBe("a, b");
    expect(d.status).toBe("Draft");
    expect(blogPostFromData(null, "n")).toEqual({ ...emptyBlogPost(), slug: "n" });
    expect(blogPostFromData("text", "m")).toEqual({ ...emptyBlogPost(), slug: "m" });
    expect(blogPostFromData({ draft: 0 }, "w").status).toBe("Draft");

    const e1 = emptyBlogPost();
    const e2 = emptyBlogPost();
    expect(e1).toEqual({ title: "", excerpt: "", date: "", slug: "", tags: "", coverImage: "", coverAlt: "", body: "", featured: false, status: "Draft" });
    expect(e1).not.toBe(e2);

    expect(blogPostToData(a)).toEqual({
      title: "Why I moved to static export",
      excerpt: "Notes on the trade-offs",
      date: "2026-05-15",
      tags: ["nextjs", "firebase"],
      draft: false,
      featured: true,
      coverImage: "/images/blog/static.png",
      coverAlt: "A diagram of the build",
      body: "Body",
    });
    expect(blogPostToData({ ...a, status: "Draft" }).draft).toBe(true);
    expect(blogPostToData({ ...a, status: "x" as never }).draft).toBe(true);

    expect(blogPostLabel(a)).toBe("Why I moved to static export");
    expect(blogPostLabel({ ...a, title: "   " })).toBe("why-static-export");
    expect(blogPostLines(a)).toEqual(["Slug: why-static-export", "Date: 15 May 2026", "Status: Published"]);
    expect(blogPostLines({ ...a, date: "", status: "Draft" })).toEqual(["Slug: why-static-export", "Date: No date", "Status: Draft"]);
    expect(blogPostLines({ ...a, date: "2026-02-30" })).toEqual(["Slug: why-static-export", "Date: No date", "Status: Published"]);

    expect(BLOG_POSTS_COLLECTION).toBe("blogPosts");
    expect(BLOG_MESSAGES).toEqual({
      titleRequired: "Enter a title",
      excerptRequired: "Enter an excerpt",
      dateInvalid: DATE_MSG,
      slugInvalid: SLUG_MSG,
      bodyRequired: "Enter the post body",
      slugTaken: "A post with this slug already exists",
      slugFixed: "The slug cannot be changed after the first save.",
      emptyList: "No posts yet.",
      listLabel: "Blog posts list",
      addLabel: "Add post",
      imagesFailed: "The uploaded images could not be loaded.",
    });
  });

  test("E2E-04: sortBlogPosts orders by date desc, title asc, id asc without mutating", async () => {
    const mk = (id: string, title: string, date: string) => ({ id, position: 0, content: blogPostFromData({ title, date }, id) });
    const entries = [
      mk("c", "Zeta", "2026-01-02"),
      mk("b", "Beta", "2026-05-15"),
      mk("a2", "Alpha", "2026-05-15"),
      mk("a1", "Alpha", "2026-05-15"),
      mk("p", "Partial", ""),
      mk("u", "alpha lower", "2026-05-15"),
      mk("n", "Newest", "2026-12-31"),
    ];
    const sorted = sortBlogPosts(entries);
    expect(sorted.map((e) => e.id)).toEqual(["n", "a1", "a2", "b", "u", "c", "p"]);
    expect(entries.map((e) => e.id)).toEqual(["c", "b", "a2", "a1", "p", "u", "n"]);
    expect(sortBlogPosts(sorted).map((e) => e.id)).toEqual(["n", "a1", "a2", "b", "u", "c", "p"]);
    expect(sorted).not.toBe(entries);
  });
});
