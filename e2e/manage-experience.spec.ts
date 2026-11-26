import { expect, test } from "@playwright/test";
import {
  UNPOSITIONED,
  LIST_MESSAGES,
  changedPositions,
  deleteQuestion,
  failureMessage,
  moveEntry,
  sortEntries,
  topPosition,
} from "../src/lib/admin/list";
import {
  EXPERIENCE_MESSAGES,
  checkExperience,
  emptyExperience,
  experienceFromData,
  experienceLabel,
  experienceToData,
} from "../src/lib/admin/experience";

test.describe("manage-experience", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkExperience trims texts, drops blank detail lines and does not mutate input", () => {
    const I = {
      year: " 2027 ",
      title: "  Software Engineer ",
      company: " Acme Pte Ltd",
      duration: " Jan 2027 - Present ",
      description: "  Built internal tools.  ",
      details: ["  Shipped a billing dashboard ", "   ", "", "Mentored two interns"],
    };
    const first = checkExperience(I);
    expect(first).toEqual({
      ok: true,
      content: {
        year: "2027",
        title: "Software Engineer",
        company: "Acme Pte Ltd",
        duration: "Jan 2027 - Present",
        description: "Built internal tools.",
        details: ["Shipped a billing dashboard", "Mentored two interns"],
      },
    });
    expect(I.details).toHaveLength(4);
    expect(I.year).toBe(" 2027 ");
    const second = checkExperience({ ...I, details: [] });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.content.details).toEqual([]);
  });

  test("E2E-02: checkExperience refuses each blank required text with its own message", () => {
    const B = {
      year: "2027",
      title: "Engineer",
      company: "Alpha",
      duration: "Jan 2027 - Present",
      description: "Built things.",
      details: [] as string[],
    };
    const r1 = checkExperience({ ...B, year: "   " });
    const r2 = checkExperience({ ...B, title: "" });
    const r3 = checkExperience({ ...B, company: "\t" });
    const r4 = checkExperience({ ...B, duration: "" });
    const r5 = checkExperience({ ...B, description: " \n " });
    const r6 = checkExperience({
      ...B,
      year: "   ",
      title: "",
      company: "\t",
      duration: "",
      description: " \n ",
    });
    const r7 = checkExperience(B);
    expect(r1).toEqual({ ok: false, errors: { year: "Year is required" } });
    expect(r2).toEqual({ ok: false, errors: { title: "Title is required" } });
    expect(r3).toEqual({ ok: false, errors: { company: "Company is required" } });
    expect(r4).toEqual({ ok: false, errors: { duration: "Duration is required" } });
    expect(r5).toEqual({ ok: false, errors: { description: "Description is required" } });
    expect(r6).toEqual({
      ok: false,
      errors: {
        year: "Year is required",
        title: "Title is required",
        company: "Company is required",
        duration: "Duration is required",
        description: "Description is required",
      },
    });
    expect(r7).toEqual({ ok: true, content: B });
  });

  test("E2E-03: experienceFromData is tolerant and experienceToData copies details", () => {
    const empty = { year: "", title: "", company: "", duration: "", description: "", details: [] };
    const a = experienceFromData({
      year: "2026",
      title: "Engineer",
      company: "Alpha",
      duration: "Jan 2026 - Present",
      description: "Alpha work.",
      details: ["One", "Two"],
      position: 3,
      updatedAt: 5,
    });
    expect(a).toEqual({
      year: "2026",
      title: "Engineer",
      company: "Alpha",
      duration: "Jan 2026 - Present",
      description: "Alpha work.",
      details: ["One", "Two"],
    });
    expect(experienceFromData({})).toEqual(empty);
    expect(
      experienceFromData({
        year: 5,
        title: null,
        company: {},
        duration: [],
        description: false,
        details: "x",
      }),
    ).toEqual(empty);
    expect(experienceFromData({ details: [1, "ok", null, "fine"] })).toEqual({
      ...empty,
      details: ["ok", "fine"],
    });
    expect(experienceFromData(null)).toEqual(empty);
    expect(experienceFromData("x")).toEqual(empty);

    const e1 = emptyExperience();
    const e2 = emptyExperience();
    e1.details.push("z");
    expect(e2.details).toHaveLength(0);

    const data = experienceToData(a);
    expect(Object.keys(data).sort()).toEqual(
      ["company", "description", "details", "duration", "title", "year"].sort(),
    );
    expect(data.details).toEqual(a.details);
    expect(data.details).not.toBe(a.details);
  });

  test("E2E-04: sortEntries orders by position then id, topPosition finds the new top", () => {
    const E = (id: string, p: number) => ({ id, position: p, content: id });
    const input = [E("b", 2), E("a", 2), E("c", -1), E("d", UNPOSITIONED)];
    const sorted = sortEntries(input);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b", "d"]);
    expect(input.map((e) => e.id)).toEqual(["b", "a", "c", "d"]);
    expect(UNPOSITIONED).toBe(Number.MAX_SAFE_INTEGER);
    expect(topPosition([])).toBe(0);
    expect(topPosition([E("a", 0), E("b", 1)])).toBe(-1);
    expect(topPosition([E("a", 5), E("b", -3)])).toBe(-4);
    expect(topPosition([E("a", UNPOSITIONED)])).toBe(0);
    expect(topPosition([E("a", UNPOSITIONED), E("b", 7)])).toBe(6);
  });

  test("E2E-05: moveEntry swaps one step and changedPositions lists the renumbered entries", () => {
    const E = (id: string, p: number) => ({ id, position: p, content: id });
    const L = [E("a", 10), E("b", 20), E("c", 30)];
    const L0 = [E("a", 0), E("b", 1), E("c", 2)];
    const m1 = moveEntry(L, "c", "up");
    const m2 = moveEntry(L, "a", "down");
    expect(m1?.map((e) => e.id)).toEqual(["a", "c", "b"]);
    expect(m1?.map((e) => e.position)).toEqual([0, 1, 2]);
    expect(m2?.map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(m2?.map((e) => e.position)).toEqual([0, 1, 2]);
    expect(moveEntry(L, "a", "up")).toBeNull();
    expect(moveEntry(L, "c", "down")).toBeNull();
    expect(moveEntry(L, "zzz", "up")).toBeNull();
    expect(moveEntry([E("a", 5)], "a", "up")).toBeNull();
    expect(moveEntry([E("a", 5)], "a", "down")).toBeNull();
    expect(L.map((e) => e.position)).toEqual([10, 20, 30]);
    expect(changedPositions(L, moveEntry(L, "c", "up")!)).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
    expect(changedPositions(L0, moveEntry(L0, "a", "down")!)).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
    expect(changedPositions(L0, L0)).toEqual([]);
  });

  test("E2E-06: shared wording, failure sentences, label and messages are exact", () => {
    expect(deleteQuestion("Engineer at Beta")).toBe(
      'Delete "Engineer at Beta"? This cannot be undone.',
    );
    expect(failureMessage("save", false)).toBe(
      "The entry could not be saved. Saving is not switched on yet.",
    );
    expect(failureMessage("save", true)).toBe(
      "The entry could not be saved. Try again, and check that you are signed in as the owner.",
    );
    expect(failureMessage("move", false)).toBe(
      "The entry could not be moved. Saving is not switched on yet.",
    );
    expect(failureMessage("move", true)).toBe(
      "The entry could not be moved. Try again, and check that you are signed in as the owner.",
    );
    expect(failureMessage("delete", false)).toBe(
      "The entry could not be deleted. Saving is not switched on yet.",
    );
    expect(failureMessage("delete", true)).toBe(
      "The entry could not be deleted. Try again, and check that you are signed in as the owner.",
    );
    expect(
      experienceLabel({
        year: "2026",
        title: "Engineer",
        company: "Alpha",
        duration: "d",
        description: "x",
        details: [],
      }),
    ).toBe("Engineer at Alpha");
    expect(LIST_MESSAGES).toMatchObject({
      loading: "Loading entries…",
      loadFailed: "The entries could not be loaded.",
      empty: "No entries yet.",
      saved: "Entry saved",
      moved: "Order saved",
      deleted: "Entry deleted",
      saving: "Saving…",
      deleting: "Deleting…",
    });
    expect(EXPERIENCE_MESSAGES).toMatchObject({
      yearRequired: "Year is required",
      titleRequired: "Title is required",
      companyRequired: "Company is required",
      durationRequired: "Duration is required",
      descriptionRequired: "Description is required",
    });
  });
});
