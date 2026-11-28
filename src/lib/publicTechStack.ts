export type PublicTechTool = { name: string; icon: string };
export type PublicTechCategory = { category: string; tools: PublicTechTool[] };

const ICON_PATH = /^\/(?!\/)\S+$/;
const ICON_UPLOADED =
  /^https?:\/\/[^\s/]+\/storage\/v1\/object\/public\/images\/\S+$/;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function publicTechStackFrom(
  records: readonly { data: unknown }[],
): PublicTechCategory[] {
  const categories: PublicTechCategory[] = [];
  for (const record of records) {
    const data = record?.data;
    if (!isPlainObject(data)) continue;
    const category = text(data.category);
    if (category.trim() === "") continue;
    const tools: PublicTechTool[] = [];
    if (Array.isArray(data.tools)) {
      for (const item of data.tools) {
        if (!isPlainObject(item)) continue;
        const name = text(item.name);
        const icon = text(item.icon);
        if (name.trim() === "") continue;
        if (!ICON_PATH.test(icon) && !ICON_UPLOADED.test(icon)) continue;
        tools.push({ name, icon });
      }
    }
    if (tools.length === 0) continue;
    categories.push({ category, tools });
  }
  return categories;
}
