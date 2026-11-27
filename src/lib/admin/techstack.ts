import type { ListCheck } from "./list";

export const TECH_COLLECTION: string = "techCategories";
export const TECH_NAME_MAX: number = 80;

export type TechItem = { name: string; icon: string };
export type TechCategoryContent = { category: string; tools: TechItem[] };

export const TECH_MESSAGES = {
  categoryRequired: "Category name is required",
  categoryTooLong: "Category name must be 80 characters or fewer",
  itemRequired: "Item name is required",
  itemTooLong: "Item name must be 80 characters or fewer",
  iconRequired: "Icon is required",
  iconInvalid: 'Icon path must start with "/"',
  emptyList: "No tech categories yet.",
  listLabel: "Tech categories list",
  addLabel: "Add category",
  imagesFailed: "The uploaded images could not be loaded.",
  noItems: "No items",
};

const ICON_PATH = /^\/(?!\/)\S+$/;
const ICON_UPLOADED = /^https?:\/\/[^\s/]+\/storage\/v1\/object\/public\/images\/\S+$/;

export function emptyTechCategory(): TechCategoryContent {
  return { category: "", tools: [{ name: "", icon: "" }] };
}

export function itemErrorKey(index: number, field: "name" | "icon"): string {
  return `tools.${index}.${field}`;
}

export function checkTechCategory(input: TechCategoryContent): ListCheck<TechCategoryContent> {
  const errors: Record<string, string> = {};
  const category = input.category.trim();
  if (category === "") errors.category = TECH_MESSAGES.categoryRequired;
  else if (category.length > TECH_NAME_MAX) errors.category = TECH_MESSAGES.categoryTooLong;

  const tools: TechItem[] = input.tools.map((item, i) => {
    const name = item.name.trim();
    const icon = item.icon.trim();
    if (name === "") errors[itemErrorKey(i, "name")] = TECH_MESSAGES.itemRequired;
    else if (name.length > TECH_NAME_MAX) errors[itemErrorKey(i, "name")] = TECH_MESSAGES.itemTooLong;
    if (icon === "") errors[itemErrorKey(i, "icon")] = TECH_MESSAGES.iconRequired;
    else if (!ICON_PATH.test(icon) && !ICON_UPLOADED.test(icon)) {
      errors[itemErrorKey(i, "icon")] = TECH_MESSAGES.iconInvalid;
    }
    return { name, icon };
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, content: { category, tools } };
}

export function techShape(input: unknown): TechCategoryContent | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const d = input as Record<string, unknown>;
  const category = d.category === undefined ? "" : d.category;
  if (typeof category !== "string") return null;
  const rawTools = d.tools === undefined ? [] : d.tools;
  if (!Array.isArray(rawTools)) return null;
  const tools: TechItem[] = [];
  for (const entry of rawTools) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const e = entry as Record<string, unknown>;
    const name = e.name === undefined ? "" : e.name;
    const icon = e.icon === undefined ? "" : e.icon;
    if (typeof name !== "string" || typeof icon !== "string") return null;
    tools.push({ name, icon });
  }
  return { category, tools };
}

export function techFromData(data: unknown): TechCategoryContent {
  if (typeof data !== "object" || data === null) return { category: "", tools: [] };
  const d = data as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === "string" ? v : "");
  const tools: TechItem[] = [];
  if (Array.isArray(d.tools)) {
    for (const entry of d.tools) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      tools.push({ name: text(e.name), icon: text(e.icon) });
    }
  }
  return { category: text(d.category), tools };
}

export function techToData(content: TechCategoryContent): Record<string, unknown> {
  return {
    category: content.category,
    tools: content.tools.map((t) => ({ name: t.name, icon: t.icon })),
  };
}

export function techLabel(content: TechCategoryContent): string {
  return content.category;
}

export function techDeleteText(content: TechCategoryContent): string {
  const n = content.tools.length;
  return `Delete "${content.category}" (${n} ${n === 1 ? "item" : "items"})? This cannot be undone.`;
}

export function techItemDeleteText(name: string, index: number): string {
  const trimmed = name.trim();
  if (trimmed === "") return `Delete item ${index + 1}? This cannot be undone.`;
  return `Delete the item "${trimmed}"? This cannot be undone.`;
}

export function techItemLine(
  item: TechItem,
  images: readonly { url: string; name: string }[],
): string {
  if (item.icon !== "") {
    const match = images.find((img) => img.url === item.icon);
    if (match) return `${item.name}: image ${match.name}`;
  }
  return `${item.name}: path ${item.icon}`;
}

export function moveTool(
  tools: readonly TechItem[],
  index: number,
  direction: "up" | "down",
): TechItem[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= tools.length) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= tools.length) return null;
  const next = [...tools];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
