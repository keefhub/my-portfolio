import { expect, test } from "@playwright/test";
import {
  PROJECT_MESSAGES,
  PROJECTS_COLLECTION,
  checkProject,
  emptyProject,
  projectFromData,
  projectLabel,
  projectToData,
} from "../src/lib/admin/projects";
import { UNPOSITIONED, bottomPosition, topPosition } from "../src/lib/admin/list";

const GITHUB_MSG = "GitHub link must start with https:// or http://";
const DEMO_MSG = "Demo link must start with https:// or http://";
const EMPTY = { title: "", shortDesc: "", description: [], tech: [], github: "", demo: "" };

test.describe("manage-projects", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkProject trims, drops blanks and does not mutate the input", () => {
    const input = {
      title: " Kaafei ",
      shortDesc: " My side coffee geek ",
      description: ["  Coffee shop site. ", "   ", ""],
      tech: ["  Next.js ", "", " Tailwind", "  "],
      github: "  ",
      demo: " https://kaafei.org ",
    };
    expect(checkProject(input)).toEqual({
      ok: true,
      content: {
        title: "Kaafei",
        shortDesc: "My side coffee geek",
        description: ["Coffee shop site."],
        tech: ["Next.js", "Tailwind"],
        github: "",
        demo: "https://kaafei.org",
      },
    });
    expect(input.tech).toHaveLength(4);
    expect(input.description).toHaveLength(3);
    expect(input.title).toBe(" Kaafei ");
  });

  test("E2E-02: checkProject refuses an empty title only", () => {
    const B = { title: "Kaafei", shortDesc: "", description: [], tech: [], github: "", demo: "" };
    const refused = [
      checkProject({ ...B, title: "   " }),
      checkProject({ ...B, title: "" }),
      checkProject({ ...B, title: "\t\n" }),
      checkProject({
        title: "",
        shortDesc: "My side coffee geek",
        description: [],
        tech: [],
        github: "",
        demo: "https://kaafei.org",
      }),
    ];
    for (const r of refused) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toEqual({ title: "Title is required" });
    }
    expect(checkProject(B)).toEqual({ ok: true, content: B });
    expect(checkProject({ ...B, title: "  Kaafei  " })).toEqual({ ok: true, content: B });
  });

  test("E2E-03: checkProject requires http(s) links when present", () => {
    const B = { title: "Kaafei", shortDesc: "", description: [], tech: [], github: "", demo: "" };
    const errorsOf = (r: ReturnType<typeof checkProject>) => {
      expect(r.ok).toBe(false);
      return r.ok ? null : r.errors;
    };
    expect(errorsOf(checkProject({ ...B, github: "ftp://x.test" }))).toEqual({ github: GITHUB_MSG });
    expect(errorsOf(checkProject({ ...B, demo: "kaafei.org" }))).toEqual({ demo: DEMO_MSG });
    expect(errorsOf(checkProject({ ...B, github: "httpx://a.test" }))).toEqual({ github: GITHUB_MSG });
    expect(errorsOf(checkProject({ ...B, github: "http:/a.test" }))).toEqual({ github: GITHUB_MSG });

    const okDemo = checkProject({ ...B, demo: "http://kaafei.org" });
    expect(okDemo.ok).toBe(true);
    if (okDemo.ok) expect(okDemo.content.demo).toBe("http://kaafei.org");
    const upper = checkProject({ ...B, demo: "HTTPS://Kaafei.org" });
    expect(upper.ok).toBe(true);
    if (upper.ok) expect(upper.content.demo).toBe("HTTPS://Kaafei.org");
    const padded = checkProject({ ...B, github: " https://github.com/keefhub/x " });
    expect(padded.ok).toBe(true);
    if (padded.ok) expect(padded.content.github).toBe("https://github.com/keefhub/x");
    const blank = checkProject({ ...B, demo: "   " });
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.content.demo).toBe("");

    expect(
      errorsOf(checkProject({ ...B, title: "", demo: "kaafei.org", github: "ftp://x.test" })),
    ).toEqual({ title: "Title is required", github: GITHUB_MSG, demo: DEMO_MSG });

    expect(PROJECT_MESSAGES.githubInvalid).toBe(GITHUB_MSG);
    expect(PROJECT_MESSAGES.demoInvalid).toBe(DEMO_MSG);
  });

  test("E2E-04: projectFromData is tolerant and the data helpers round-trip", () => {
    const a = projectFromData({
      title: "Kaafei",
      shortDesc: "My side coffee geek",
      description: ["One", "Two"],
      tech: ["Next.js"],
      github: "",
      demo: "https://kaafei.org",
      position: 3,
      updatedAt: 5,
    });
    expect(a).toEqual({
      title: "Kaafei",
      shortDesc: "My side coffee geek",
      description: ["One", "Two"],
      tech: ["Next.js"],
      github: "",
      demo: "https://kaafei.org",
    });
    expect(projectFromData({})).toEqual(EMPTY);
    expect(
      projectFromData({ title: 5, shortDesc: null, description: "x", tech: {}, github: [], demo: false }),
    ).toEqual(EMPTY);
    expect(projectFromData({ description: [1, "ok", null, "fine"], tech: ["a", 2] })).toEqual({
      ...EMPTY,
      description: ["ok", "fine"],
      tech: ["a"],
    });
    expect(projectFromData(null)).toEqual(EMPTY);
    expect(projectFromData("x")).toEqual(EMPTY);

    const first = emptyProject();
    const second = emptyProject();
    first.description.push("z");
    first.tech.push("z");
    expect(second.description).toHaveLength(0);
    expect(second.tech).toHaveLength(0);

    const data = projectToData(a);
    expect(Object.keys(data).sort()).toEqual(
      ["demo", "description", "github", "shortDesc", "tech", "title"],
    );
    expect(data.description).toEqual(a.description);
    expect(data.tech).toEqual(a.tech);
    expect(data.description).not.toBe(a.description);
    expect(data.tech).not.toBe(a.tech);

    expect(projectLabel(a)).toBe("Kaafei");
    expect(PROJECT_MESSAGES.titleRequired).toBe("Title is required");
    expect(PROJECT_MESSAGES.emptyList).toBe("No projects yet.");
    expect(PROJECT_MESSAGES.listLabel).toBe("Projects list");
    expect(PROJECTS_COLLECTION).toBe("projects");
  });

  test("E2E-05: bottomPosition gives the next place after the last and leaves input alone", () => {
    const E = (id: string, p: number) => ({ id, position: p, content: id });
    expect(bottomPosition([])).toBe(0);
    const two = [E("a", 0), E("b", 1)];
    expect(bottomPosition(two)).toBe(2);
    expect(bottomPosition([E("a", 5), E("b", -3)])).toBe(6);
    expect(bottomPosition([E("a", UNPOSITIONED)])).toBe(0);
    expect(bottomPosition([E("a", UNPOSITIONED), E("b", 7)])).toBe(8);
    expect(two).toEqual([E("a", 0), E("b", 1)]);
    expect(topPosition(two)).toBe(-1);
  });
});
