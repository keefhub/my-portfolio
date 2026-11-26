import { expect, test } from "@playwright/test";
import {
  TECH_COLLECTION,
  TECH_MESSAGES,
  TECH_NAME_MAX,
  checkTechCategory,
  emptyTechCategory,
  itemErrorKey,
  moveTool,
  techDeleteText,
  techFromData,
  techItemDeleteText,
  techItemLine,
  techLabel,
  techToData,
  type TechCategoryContent,
  type TechItem,
} from "../src/lib/admin/techstack";

const IMG = "http://127.0.0.1:9199/v0/b/x/o/images%2Fa.png?alt=media&token=t";
const rep = (c: string, n: number) => c.repeat(n);

test.describe("manage-tech-stack", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkTechCategory accepts valid categories and returns trimmed content", () => {
    const I: TechCategoryContent = {
      category: " Cloud ",
      tools: [
        { name: " Firebase ", icon: " /icons/firebase.png " },
        { name: "Docker", icon: "/icons/docker.png" },
      ],
    };
    expect(checkTechCategory(I, [])).toEqual({
      ok: true,
      content: {
        category: "Cloud",
        tools: [
          { name: "Firebase", icon: "/icons/firebase.png" },
          { name: "Docker", icon: "/icons/docker.png" },
        ],
      },
    });
    expect(I.category).toBe(" Cloud ");
    expect(I.tools[0].name).toBe(" Firebase ");

    expect(checkTechCategory({ category: "Cloud", tools: [{ name: "Firebase", icon: IMG }] }, [IMG])).toEqual({
      ok: true,
      content: { category: "Cloud", tools: [{ name: "Firebase", icon: IMG }] },
    });

    const live = "https://firebasestorage.googleapis.com/v0/b/x/o/images%2Fa.png?alt=media";
    expect(
      checkTechCategory({ category: "Cloud", tools: [{ name: "Firebase", icon: ` ${live} ` }] }, [live]),
    ).toEqual({ ok: true, content: { category: "Cloud", tools: [{ name: "Firebase", icon: live }] } });

    expect(
      checkTechCategory({ category: rep("A", 80), tools: [{ name: rep("B", 80), icon: "/icons/b.png" }] }, []),
    ).toEqual({
      ok: true,
      content: { category: rep("A", 80), tools: [{ name: rep("B", 80), icon: "/icons/b.png" }] },
    });

    expect(checkTechCategory({ category: "Empty", tools: [] }, [])).toEqual({
      ok: true,
      content: { category: "Empty", tools: [] },
    });
  });

  test("E2E-02: checkTechCategory refuses bad values with keyed messages", () => {
    const B: TechCategoryContent = { category: "Frontend", tools: [{ name: "React", icon: "/icons/react.png" }] };
    const withCat = (category: string): TechCategoryContent => ({ ...B, category });
    const withItem = (patch: Partial<TechItem>, uploaded: string[] = []) =>
      checkTechCategory({ ...B, tools: [{ ...B.tools[0], ...patch }] }, uploaded);
    const iconBad = { ok: false, errors: { "tools.0.icon": 'Icon path must start with "/"' } };

    expect(checkTechCategory(withCat(""), [])).toEqual({ ok: false, errors: { category: "Category name is required" } });
    expect(checkTechCategory(withCat("   "), [])).toEqual({ ok: false, errors: { category: "Category name is required" } });
    expect(checkTechCategory(withCat("\t\n"), [])).toEqual({ ok: false, errors: { category: "Category name is required" } });
    expect(checkTechCategory(withCat(rep("A", 81)), [])).toEqual({
      ok: false,
      errors: { category: "Category name must be 80 characters or fewer" },
    });

    expect(withItem({ name: "" })).toEqual({ ok: false, errors: { "tools.0.name": "Item name is required" } });
    expect(withItem({ name: "   " })).toEqual({ ok: false, errors: { "tools.0.name": "Item name is required" } });
    expect(withItem({ name: rep("B", 81) })).toEqual({
      ok: false,
      errors: { "tools.0.name": "Item name must be 80 characters or fewer" },
    });

    expect(withItem({ icon: "" })).toEqual({ ok: false, errors: { "tools.0.icon": "Icon is required" } });
    expect(withItem({ icon: "   " })).toEqual({ ok: false, errors: { "tools.0.icon": "Icon is required" } });

    expect(withItem({ icon: "https://example.com/react.png" })).toEqual(iconBad);
    expect(withItem({ icon: "icons/react.png" })).toEqual(iconBad);
    expect(withItem({ icon: "//cdn.example.com/a.png" })).toEqual(iconBad);
    expect(withItem({ icon: "/" })).toEqual(iconBad);
    expect(withItem({ icon: "/icons/my react.png" })).toEqual(iconBad);
    expect(withItem({ icon: IMG }, [])).toEqual(iconBad);

    expect(
      checkTechCategory(
        { category: "", tools: [{ name: "", icon: "" }, { name: "Vue", icon: "vue.png" }] },
        [],
      ),
    ).toEqual({
      ok: false,
      errors: {
        category: "Category name is required",
        "tools.0.name": "Item name is required",
        "tools.0.icon": "Icon is required",
        "tools.1.icon": 'Icon path must start with "/"',
      },
    });

    expect(checkTechCategory(withCat("  Frontend  "), [])).toEqual({ ok: true, content: B });

    expect(itemErrorKey(0, "name")).toBe("tools.0.name");
    expect(itemErrorKey(3, "icon")).toBe("tools.3.icon");
    expect(TECH_MESSAGES.categoryRequired).toBe("Category name is required");
    expect(TECH_MESSAGES.categoryTooLong).toBe("Category name must be 80 characters or fewer");
    expect(TECH_MESSAGES.itemRequired).toBe("Item name is required");
    expect(TECH_MESSAGES.itemTooLong).toBe("Item name must be 80 characters or fewer");
    expect(TECH_MESSAGES.iconRequired).toBe("Icon is required");
    expect(TECH_MESSAGES.iconInvalid).toBe('Icon path must start with "/"');
  });

  test("E2E-03: pure helpers read, write, label, word and move tech categories", () => {
    const a = techFromData({
      category: "Cloud",
      tools: [
        { name: "Firebase", icon: "/icons/firebase.png" },
        { name: "Docker", icon: "/icons/docker.png" },
      ],
      position: 3,
      updatedAt: 5,
    });
    expect(a).toEqual({
      category: "Cloud",
      tools: [
        { name: "Firebase", icon: "/icons/firebase.png" },
        { name: "Docker", icon: "/icons/docker.png" },
      ],
    });
    expect(techFromData({})).toEqual({ category: "", tools: [] });
    expect(techFromData({ category: 5, tools: "x" })).toEqual({ category: "", tools: [] });
    expect(techFromData({ category: "Only a name" })).toEqual({ category: "Only a name", tools: [] });
    expect(
      techFromData({
        category: "Mixed",
        tools: ["x", null, 7, { name: "Ok", icon: "/icons/ok.png" }, { name: 5, icon: null }],
      }),
    ).toEqual({
      category: "Mixed",
      tools: [
        { name: "Ok", icon: "/icons/ok.png" },
        { name: "", icon: "" },
      ],
    });
    expect(techFromData(null)).toEqual({ category: "", tools: [] });
    expect(techFromData("x")).toEqual({ category: "", tools: [] });

    const e1 = emptyTechCategory();
    const e2 = emptyTechCategory();
    expect(e1).toEqual({ category: "", tools: [{ name: "", icon: "" }] });
    expect(e2).toEqual({ category: "", tools: [{ name: "", icon: "" }] });
    expect(e1).not.toBe(e2);
    expect(e1.tools).not.toBe(e2.tools);

    const data = techToData(a);
    expect(Object.keys(data).sort()).toEqual(["category", "tools"]);
    const dataTools = data.tools as TechItem[];
    for (const t of dataTools) expect(Object.keys(t).sort()).toEqual(["icon", "name"]);
    expect(dataTools).not.toBe(a.tools);

    expect(techLabel(a)).toBe("Cloud");

    expect(techDeleteText(a)).toBe('Delete "Cloud" (2 items)? This cannot be undone.');
    expect(techDeleteText({ category: "Solo", tools: [{ name: "A", icon: "/a.png" }] })).toBe(
      'Delete "Solo" (1 item)? This cannot be undone.',
    );
    expect(techDeleteText({ category: "Bare", tools: [] })).toBe('Delete "Bare" (0 items)? This cannot be undone.');

    expect(techItemDeleteText(" Node.js ", 0)).toBe('Delete the item "Node.js"? This cannot be undone.');
    expect(techItemDeleteText("  ", 1)).toBe("Delete item 2? This cannot be undone.");

    expect(techItemLine({ name: "Firebase", icon: IMG }, [{ url: IMG, name: "firebase-logo.png" }])).toBe(
      "Firebase: image firebase-logo.png",
    );
    expect(
      techItemLine({ name: "Docker", icon: "/icons/docker.png" }, [{ url: IMG, name: "firebase-logo.png" }]),
    ).toBe("Docker: path /icons/docker.png");
    expect(techItemLine({ name: "X", icon: "" }, [{ url: "", name: "blank.png" }])).toBe("X: path ");

    const T: TechItem[] = [
      { name: "A", icon: "/a.png" },
      { name: "B", icon: "/b.png" },
      { name: "C", icon: "/c.png" },
    ];
    const names = (r: TechItem[] | null) => (r === null ? null : r.map((t) => t.name));
    expect(names(moveTool(T, 1, "up"))).toEqual(["B", "A", "C"]);
    expect(names(moveTool(T, 1, "down"))).toEqual(["A", "C", "B"]);
    expect(moveTool(T, 0, "up")).toBeNull();
    expect(moveTool(T, 2, "down")).toBeNull();
    expect(moveTool(T, 5, "up")).toBeNull();
    expect(moveTool(T, -1, "down")).toBeNull();
    expect(T.map((t) => t.name)).toEqual(["A", "B", "C"]);

    expect(TECH_COLLECTION).toBe("techCategories");
    expect(TECH_NAME_MAX).toBe(80);
    expect(TECH_MESSAGES.emptyList).toBe("No tech categories yet.");
    expect(TECH_MESSAGES.listLabel).toBe("Tech categories list");
    expect(TECH_MESSAGES.addLabel).toBe("Add category");
    expect(TECH_MESSAGES.imagesFailed).toBe("The uploaded images could not be loaded.");
    expect(TECH_MESSAGES.noItems).toBe("No items");
  });
});
