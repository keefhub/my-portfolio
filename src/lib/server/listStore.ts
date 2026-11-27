import "server-only";
import { LIST_ID_PATTERN, type ListCheck } from "@/lib/admin/list";
import {
  deleteListRecord,
  insertListRecord,
  readListRecords,
  reorderListRecords,
  updateListRecord,
} from "@/lib/server/database";
import type { ListTable } from "@/lib/server/listSql";

export type ListRecord<T> = { id: string; position: number; content: T };

export type ListDefinition<T> = {
  table: ListTable;
  shape(input: unknown): T | null;
  check(input: T): ListCheck<T>;
  fromData(data: unknown): T;
  toData(content: T): Record<string, unknown>;
};

export type ListService<T> = {
  list(): Promise<ListRecord<T>[]>;
  add(body: unknown): Promise<{ ok: true; id: string } | { ok: false }>;
  update(id: unknown, body: unknown): Promise<"updated" | "not-found" | "invalid">;
  reorder(body: unknown): Promise<"moved" | "not-found" | "invalid">;
  remove(id: unknown): Promise<"deleted" | "not-found" | "invalid">;
};

const MIN_POSITION = -2147483648;
const MAX_POSITION = 2147483647;

function plainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function validPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= MIN_POSITION && value <= MAX_POSITION;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && LIST_ID_PATTERN.test(value);
}

export function createListService<T>(definition: ListDefinition<T>): ListService<T> {
  const { table } = definition;

  function checkedContent(body: Record<string, unknown>): T | null {
    const shaped = definition.shape(body.content);
    if (shaped === null) return null;
    const checked = definition.check(shaped);
    return checked.ok ? checked.content : null;
  }

  return {
    async list() {
      const records = await readListRecords(table);
      return records.map((record) => ({
        id: record.id,
        position: record.position,
        content: definition.fromData(record.data),
      }));
    },

    async add(body) {
      const object = plainObject(body);
      if (object === null || !validPosition(object.position)) return { ok: false };
      const content = checkedContent(object);
      if (content === null) return { ok: false };
      const id = crypto.randomUUID();
      await insertListRecord(table, { id, position: object.position, data: definition.toData(content) });
      return { ok: true, id };
    },

    async update(id, body) {
      if (!validId(id)) return "invalid";
      const object = plainObject(body);
      if (object === null) return "invalid";
      const content = checkedContent(object);
      if (content === null) return "invalid";
      return (await updateListRecord(table, id, definition.toData(content))) ? "updated" : "not-found";
    },

    async reorder(body) {
      const object = plainObject(body);
      if (object === null || !Array.isArray(object.changes) || object.changes.length === 0) return "invalid";
      const changes: { id: string; position: number }[] = [];
      const seen = new Set<string>();
      for (const item of object.changes) {
        const change = plainObject(item);
        if (change === null || !validId(change.id) || !validPosition(change.position)) return "invalid";
        if (seen.has(change.id)) return "invalid";
        seen.add(change.id);
        changes.push({ id: change.id, position: change.position });
      }
      return (await reorderListRecords(table, changes)) ? "moved" : "not-found";
    },

    async remove(id) {
      if (!validId(id)) return "invalid";
      return (await deleteListRecord(table, id)) ? "deleted" : "not-found";
    },
  };
}
