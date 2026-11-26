import { expect, test } from "@playwright/test";
import { checkProfile, emptyProfile, photoSelection, profileFromData } from "../src/lib/admin/profile";

const B = { name: "Keith", headline: "Engineer", about: [] as string[], photo: "", email: "", resumeLink: "", socialLinks: [] as { label: string; url: string }[] };
const EMPTY = { name: "", headline: "", about: [], photo: "", email: "", resumeLink: "", socialLinks: [] };
const LINK_MSG = "Enter a full web address starting with https://";

test.describe("manage-profile", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkProfile trims, drops blank rows and keeps order", () => {
    const result = checkProfile({
      name: "  Keith Lim  ",
      headline: "Engineer",
      about: ["  First  ", "   ", "Second"],
      photo: " /images/keith.jpg ",
      email: " a@b.c ",
      resumeLink: " https://example.com/cv.pdf ",
      socialLinks: [
        { label: " GitHub ", url: " https://github.com/keefhub " },
        { label: "", url: "" },
        { label: "  ", url: "  " },
      ],
    });
    expect(result).toEqual({
      ok: true,
      content: {
        name: "Keith Lim",
        headline: "Engineer",
        about: ["First", "Second"],
        photo: "/images/keith.jpg",
        email: "a@b.c",
        resumeLink: "https://example.com/cv.pdf",
        socialLinks: [{ label: "GitHub", url: "https://github.com/keefhub" }],
      },
    });
  });

  test("E2E-02: name and headline are required", () => {
    const r1 = checkProfile({ ...B, name: "   " });
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.errors.name).toBe("Name is required");
      expect(r1.errors.headline).toBeUndefined();
      expect(r1.errors.email).toBeUndefined();
      expect(r1.errors.resumeLink).toBeUndefined();
    }
    const r2 = checkProfile({ ...B, headline: "" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.errors.headline).toBe("Headline is required");
      expect(r2.errors.name).toBeUndefined();
      expect(r2.errors.email).toBeUndefined();
      expect(r2.errors.resumeLink).toBeUndefined();
    }
    const r3 = checkProfile({ ...B, name: "\t", headline: "  " });
    expect(r3.ok).toBe(false);
    if (!r3.ok) {
      expect(r3.errors.name).toBe("Name is required");
      expect(r3.errors.headline).toBe("Headline is required");
      expect(r3.errors.email).toBeUndefined();
      expect(r3.errors.resumeLink).toBeUndefined();
    }
    const r4 = checkProfile(B);
    expect(r4.ok).toBe(true);
    if (r4.ok) expect(r4.content).toEqual(B);
  });

  test("E2E-03: email must look like an address when given", () => {
    for (const email of ["keith-at-example", "a@b", "a b@c.de", "@b.cd"]) {
      const r = checkProfile({ ...B, email });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.email).toBe("Enter an email address like name@site.com");
        expect(r.errors.name).toBeUndefined();
        expect(r.errors.headline).toBeUndefined();
        expect(r.errors.resumeLink).toBeUndefined();
      }
    }
    const good: [string, string][] = [["a@b.c", "a@b.c"], ["name@site.com", "name@site.com"], ["", ""], ["  a@b.c  ", "a@b.c"]];
    for (const [email, expected] of good) {
      const r = checkProfile({ ...B, email });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.content.email).toBe(expected);
    }
  });

  test("E2E-04: resume link must be a web address or a path", () => {
    for (const resumeLink of ["resume please", "github.com/cv", "ftp://example.com/cv", "https://", "//example.com/cv"]) {
      const r = checkProfile({ ...B, resumeLink });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.resumeLink).toBe("Enter a web address or a path starting with /");
        expect(r.errors.name).toBeUndefined();
        expect(r.errors.headline).toBeUndefined();
        expect(r.errors.email).toBeUndefined();
      }
    }
    const good: [string, string][] = [
      ["/resume.pdf", "/resume.pdf"],
      ["/", "/"],
      ["https://example.com/cv.pdf", "https://example.com/cv.pdf"],
      ["http://example.com/cv.pdf", "http://example.com/cv.pdf"],
      ["", ""],
      ["  /resume.pdf  ", "/resume.pdf"],
    ];
    for (const [resumeLink, expected] of good) {
      const r = checkProfile({ ...B, resumeLink });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.content.resumeLink).toBe(expected);
    }
  });

  test("E2E-05: social links need an https address unless blank", () => {
    const bad: { label: string; url: string }[][] = [
      [{ label: "GitHub", url: "github.com/keefhub" }],
      [{ label: "X", url: "http://example.com" }],
      [{ label: "X", url: "https://" }],
      [{ label: "X", url: "HTTPS://example.com" }],
      [{ label: "X", url: "" }],
    ];
    for (const socialLinks of bad) {
      const r = checkProfile({ ...B, socialLinks });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.socialLinks).toEqual([LINK_MSG]);
    }
    const f = [{ label: "Mastodon", url: "https://example.social/@keith" }];
    const rf = checkProfile({ ...B, socialLinks: f });
    expect(rf.ok).toBe(true);
    if (rf.ok) expect(rf.content.socialLinks).toEqual(f);

    const rg = checkProfile({ ...B, socialLinks: [{ label: "", url: "https://example.com" }] });
    expect(rg.ok).toBe(true);
    if (rg.ok) expect(rg.content.socialLinks).toEqual([{ label: "", url: "https://example.com" }]);

    const rh = checkProfile({ ...B, socialLinks: [{ label: "", url: "" }] });
    expect(rh.ok).toBe(true);
    if (rh.ok) expect(rh.content.socialLinks).toEqual([]);

    const ri = checkProfile({
      ...B,
      socialLinks: [{ label: "A", url: "https://a.test" }, { label: "B", url: "nope" }, { label: "", url: "" }],
    });
    expect(ri.ok).toBe(false);
    if (!ri.ok) {
      expect(ri.errors.socialLinks).toHaveLength(3);
      expect(ri.errors.socialLinks[0]).toBeUndefined();
      expect(ri.errors.socialLinks[1]).toBe(LINK_MSG);
      expect(ri.errors.socialLinks[2]).toBeUndefined();
    }
  });

  test("E2E-06: profileFromData reads a stored record tolerantly", () => {
    expect(
      profileFromData({
        name: "Keith Lim",
        headline: "Engineer",
        about: ["One", "Two"],
        photo: "/images/keith.jpg",
        email: "a@b.c",
        resumeLink: "/resume.pdf",
        socialLinks: [{ label: "GitHub", url: "https://github.com/keefhub" }],
        updatedAt: 5,
      }),
    ).toEqual({
      name: "Keith Lim",
      headline: "Engineer",
      about: ["One", "Two"],
      photo: "/images/keith.jpg",
      email: "a@b.c",
      resumeLink: "/resume.pdf",
      socialLinks: [{ label: "GitHub", url: "https://github.com/keefhub" }],
    });
    expect(profileFromData({})).toEqual(EMPTY);
    expect(
      profileFromData({
        name: 5,
        headline: null,
        about: "text",
        photo: 7,
        email: {},
        resumeLink: [],
        socialLinks: [{ label: "a" }, "bad", null, { label: "L", url: "https://x.test" }],
      }),
    ).toEqual({ ...EMPTY, socialLinks: [{ label: "a", url: "" }, { label: "L", url: "https://x.test" }] });
    expect(profileFromData({ about: [1, "ok", null] })).toEqual({ ...EMPTY, about: ["ok"] });
    expect(profileFromData(null)).toEqual(EMPTY);
    expect(profileFromData("x")).toEqual(EMPTY);

    const first = emptyProfile();
    const second = emptyProfile();
    first.about.push("z");
    expect(second.about).toHaveLength(0);
  });

  test("E2E-07: photoSelection matches a stored photo to an uploaded image", () => {
    const I = [
      { id: "i1", url: "https://x.test/1.png" },
      { id: "i2", url: "https://x.test/2.png" },
    ];
    expect(photoSelection("https://x.test/2.png", I)).toEqual({ imageId: "i2", path: "" });
    expect(photoSelection("/images/keith.jpg", I)).toEqual({ imageId: "", path: "/images/keith.jpg" });
    expect(photoSelection("https://x.test/gone.png", I)).toEqual({ imageId: "", path: "https://x.test/gone.png" });
    expect(photoSelection("", I)).toEqual({ imageId: "", path: "" });
    expect(photoSelection("https://x.test/1.png", [])).toEqual({ imageId: "", path: "https://x.test/1.png" });
  });
});
