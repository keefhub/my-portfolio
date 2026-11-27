import "server-only";
import postgres from "postgres";
import { PROFILE_DOC_ID, type ProfileContent } from "@/lib/admin/profile";
import { databaseLogLine, type DatabaseOperation } from "@/lib/admin/dblog";
import { READ_PROFILE_SQL, SCHEMA_STATEMENTS, WRITE_PROFILE_SQL } from "@/lib/server/sql";
import {
  DELETE_IMAGE_SQL,
  IMAGE_EXISTS_SQL,
  IMAGE_SCHEMA_STATEMENTS,
  INSERT_IMAGE_SQL,
  LIST_IMAGES_SQL,
} from "@/lib/server/imageSql";
import {
  LIST_TABLES,
  listDeleteSql,
  listInsertSql,
  listReadSql,
  listReorderSql,
  listSchemaStatements,
  listUpdateSql,
  type ListTable,
} from "@/lib/server/listSql";
import {
  POST_DELETE_SQL,
  POST_INSERT_SQL,
  POST_READ_ALL_SQL,
  POST_READ_ONE_PUBLISHED_SQL,
  POST_READ_ONE_SQL,
  POST_READ_PUBLISHED_SQL,
  POST_SCHEMA_STATEMENTS,
  POST_UPDATE_SQL,
} from "@/lib/server/postSql";
import {
  readStandIn,
  readStandInImages,
  readStandInList,
  standInPath,
  writeStandIn,
  writeStandInImages,
  writeStandInList,
} from "@/lib/server/standin";

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("The database is unavailable.");
    this.name = "DatabaseUnavailableError";
  }
}

type Client = ReturnType<typeof postgres>;

let clientSetting: string | null = null;
let client: Client | null = null;
let schemaSetting: string | null = null;
let schemaReady: Promise<void> | null = null;

function clientFor(setting: string): Client {
  if (client === null || clientSetting !== setting) {
    client = postgres(setting, {
      max: 1,
      connect_timeout: 5,
      query_timeout: 8,
      idle_timeout: 20,
      prepare: false,
      max_pipeline: 1,
      ssl: "require",
      onnotice: false,
    });
    clientSetting = setting;
  }
  return client;
}

async function ensureSchema(setting: string, sql: Client): Promise<void> {
  if (schemaReady === null || schemaSetting !== setting) {
    const attempt = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await sql.unsafe(statement);
      }
      for (const statement of IMAGE_SCHEMA_STATEMENTS) {
        await sql.unsafe(statement);
      }
      for (const table of LIST_TABLES) {
        for (const statement of listSchemaStatements(table)) {
          await sql.unsafe(statement);
        }
      }
      for (const statement of POST_SCHEMA_STATEMENTS) {
        await sql.unsafe(statement);
      }
    })();
    schemaReady = attempt;
    schemaSetting = setting;
    attempt.catch(() => {
      if (schemaReady === attempt) {
        schemaReady = null;
        schemaSetting = null;
      }
    });
  }
  return schemaReady;
}

async function run<T>(operation: "read" | "write", work: (setting: string, path: string | null) => Promise<T>): Promise<T> {
  let stage: DatabaseOperation = operation;
  try {
    const setting = process.env.SUPABASE_DB_URL;
    const path = standInPath(setting);
    if (path !== null) return await work(setting as string, path);
    if (typeof setting !== "string" || setting.trim() === "" || setting.startsWith("stand-in:")) {
      throw new Error("The database setting is missing.");
    }
    const sql = clientFor(setting);
    stage = "schema";
    await ensureSchema(setting, sql);
    stage = operation;
    return await work(setting, null);
  } catch (error) {
    const line = databaseLogLine(stage, error);
    console.error(line);
    throw new DatabaseUnavailableError();
  }
}

export async function readProfileRecord(): Promise<unknown | null> {
  return run("read", async (setting, path) => {
    if (path !== null) return readStandIn(path);
    const rows = await clientFor(setting).unsafe(READ_PROFILE_SQL, [PROFILE_DOC_ID]);
    return rows.length === 0 ? null : (rows[0] as unknown as { data: unknown }).data;
  });
}

export async function writeProfileRecord(content: ProfileContent): Promise<void> {
  await run("write", async (setting, path) => {
    if (path !== null) {
      await writeStandIn(path, content);
      return;
    }
    await clientFor(setting).unsafe(WRITE_PROFILE_SQL, [PROFILE_DOC_ID, JSON.stringify(content)]);
  });
}

export type StoredImage = { id: string; name: string; contentType: string; size: number };

function asStoredImage(value: unknown): StoredImage | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.contentType !== "string" ||
    typeof item.size !== "number"
  ) {
    return null;
  }
  return { id: item.id, name: item.name, contentType: item.contentType, size: item.size };
}

export async function listImageRecords(): Promise<StoredImage[]> {
  return run("read", async (setting, path) => {
    if (path !== null) {
      const stored = await readStandInImages(path);
      const records: StoredImage[] = [];
      for (const element of stored) {
        const record = asStoredImage(element);
        if (record !== null) records.push(record);
      }
      return records;
    }
    const rows = await clientFor(setting).unsafe(LIST_IMAGES_SQL);
    return rows.map((row) => {
      const item = row as unknown as { id: string; name: string; content_type: string; size: number | string };
      return { id: item.id, name: item.name, contentType: item.content_type, size: Number(item.size) };
    });
  });
}

export async function imageRecordExists(id: string): Promise<boolean> {
  return run("read", async (setting, path) => {
    if (path !== null) {
      const stored = await readStandInImages(path);
      return stored.some((element) => asStoredImage(element)?.id === id);
    }
    const rows = await clientFor(setting).unsafe(IMAGE_EXISTS_SQL, [id]);
    return rows.length > 0;
  });
}

export async function insertImageRecord(record: StoredImage): Promise<void> {
  await run("write", async (setting, path) => {
    if (path !== null) {
      const stored = await readStandInImages(path);
      if (stored.some((element) => asStoredImage(element)?.id === record.id)) return;
      await writeStandInImages(path, [record, ...stored]);
      return;
    }
    await clientFor(setting).unsafe(INSERT_IMAGE_SQL, [record.id, record.name, record.contentType, record.size]);
  });
}

export async function deleteImageRecord(id: string): Promise<boolean> {
  return run("write", async (setting, path) => {
    if (path !== null) {
      const stored = await readStandInImages(path);
      const kept = stored.filter((element) => asStoredImage(element)?.id !== id);
      if (kept.length === stored.length) return false;
      await writeStandInImages(path, kept);
      return true;
    }
    const rows = await clientFor(setting).unsafe(DELETE_IMAGE_SQL, [id]);
    return rows.length > 0;
  });
}

export type StoredListRecord = { id: string; position: number; data: unknown };

function asStoredListRecord(value: unknown): StoredListRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.position !== "number" || !Number.isFinite(item.position)) {
    return null;
  }
  return { id: item.id, position: item.position, data: item.data === undefined ? null : item.data };
}

function validListElements(stored: unknown[]): StoredListRecord[] {
  const records: StoredListRecord[] = [];
  for (const element of stored) {
    const record = asStoredListRecord(element);
    if (record !== null) records.push(record);
  }
  return records;
}

export async function readListRecords(table: ListTable): Promise<StoredListRecord[]> {
  return run("read", async (setting, path) => {
    if (path !== null) {
      const records = validListElements(await readStandInList(path, table));
      return records
        .map((record, index) => ({ record, index }))
        .sort((a, b) => a.record.position - b.record.position || a.index - b.index)
        .map((item) => item.record);
    }
    const rows = await clientFor(setting).unsafe(listReadSql(table));
    return rows.map((row) => {
      const item = row as unknown as { id: string; position: number | string; data: unknown };
      return { id: item.id, position: Number(item.position), data: item.data };
    });
  });
}

export async function insertListRecord(table: ListTable, record: StoredListRecord): Promise<void> {
  await run("write", async (setting, path) => {
    if (path !== null) {
      const stored = await readStandInList(path, table);
      await writeStandInList(path, table, [...stored, { id: record.id, position: record.position, data: record.data }]);
      return;
    }
    await clientFor(setting).unsafe(listInsertSql(table), [record.id, record.position, JSON.stringify(record.data)]);
  });
}

export async function updateListRecord(table: ListTable, id: string, data: unknown): Promise<boolean> {
  return run("write", async (setting, path) => {
    if (path !== null) {
      const stored = await readStandInList(path, table);
      let found = false;
      const next = stored.map((element) => {
        const record = asStoredListRecord(element);
        if (record === null || record.id !== id) return element;
        found = true;
        return { ...(element as Record<string, unknown>), data };
      });
      if (!found) return false;
      await writeStandInList(path, table, next);
      return true;
    }
    const rows = await clientFor(setting).unsafe(listUpdateSql(table), [id, JSON.stringify(data)]);
    return rows.length > 0;
  });
}

export async function reorderListRecords(
  table: ListTable,
  changes: { id: string; position: number }[],
): Promise<boolean> {
  return run("write", async (setting, path) => {
    if (path !== null) {
      const stored = await readStandInList(path, table);
      const wanted = new Map(changes.map((change) => [change.id, change.position]));
      const present = new Set<string>();
      for (const element of stored) {
        const record = asStoredListRecord(element);
        if (record !== null && wanted.has(record.id)) present.add(record.id);
      }
      for (const id of wanted.keys()) {
        if (!present.has(id)) return false;
      }
      const next = stored.map((element) => {
        const record = asStoredListRecord(element);
        if (record === null || !wanted.has(record.id)) return element;
        return { ...(element as Record<string, unknown>), position: wanted.get(record.id) };
      });
      await writeStandInList(path, table, next);
      return true;
    }
    const rows = await clientFor(setting).unsafe(listReorderSql(table), [JSON.stringify(changes)]);
    return rows.length === changes.length;
  });
}

export async function deleteListRecord(table: ListTable, id: string): Promise<boolean> {
  return run("write", async (setting, path) => {
    if (path !== null) {
      const stored = await readStandInList(path, table);
      const kept = stored.filter((element) => asStoredListRecord(element)?.id !== id);
      if (kept.length === stored.length) return false;
      await writeStandInList(path, table, kept);
      return true;
    }
    const rows = await clientFor(setting).unsafe(listDeleteSql(table), [id]);
    return rows.length > 0;
  });
}

export type StoredPost = { slug: string; published: boolean; data: unknown };

type StandInPost = { slug: string; status: "draft" | "published"; data: unknown };

const POSTS_KEY = "blog_posts";

function asStandInPost(value: unknown): StandInPost | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.slug !== "string") return null;
  if (item.status !== "draft" && item.status !== "published") return null;
  return { slug: item.slug, status: item.status, data: item.data };
}

let standInPostWrites: Promise<unknown> = Promise.resolve();

function serialisePostWrite<T>(work: () => Promise<T>): Promise<T> {
  const next = standInPostWrites.then(work, work);
  standInPostWrites = next.catch(() => undefined);
  return next;
}

function toStoredPost(record: { slug: string; status: string; data: unknown }): StoredPost {
  return { slug: record.slug, published: record.status === "published", data: record.data };
}

function statusOf(record: StoredPost): "draft" | "published" {
  return record.published ? "published" : "draft";
}

export async function readPostRecords(onlyPublished: boolean): Promise<StoredPost[]> {
  return run("read", async (setting, path) => {
    if (path !== null) {
      const records: StoredPost[] = [];
      for (const element of await readStandInList(path, POSTS_KEY)) {
        const post = asStandInPost(element);
        if (post === null) continue;
        const stored = toStoredPost(post);
        if (onlyPublished && !stored.published) continue;
        records.push(stored);
      }
      return records;
    }
    const rows = await clientFor(setting).unsafe(onlyPublished ? POST_READ_PUBLISHED_SQL : POST_READ_ALL_SQL);
    return rows.map((row) => toStoredPost(row as unknown as { slug: string; status: string; data: unknown }));
  });
}

export async function readPostRecord(slug: string, onlyPublished: boolean): Promise<StoredPost | null> {
  return run("read", async (setting, path) => {
    if (path !== null) {
      for (const element of await readStandInList(path, POSTS_KEY)) {
        const post = asStandInPost(element);
        if (post === null || post.slug !== slug) continue;
        const stored = toStoredPost(post);
        if (onlyPublished && !stored.published) return null;
        return stored;
      }
      return null;
    }
    const rows = await clientFor(setting).unsafe(onlyPublished ? POST_READ_ONE_PUBLISHED_SQL : POST_READ_ONE_SQL, [
      slug,
    ]);
    if (rows.length === 0) return null;
    return toStoredPost(rows[0] as unknown as { slug: string; status: string; data: unknown });
  });
}

export async function insertPostRecord(record: StoredPost): Promise<boolean> {
  return run("write", async (setting, path) => {
    if (path !== null) {
      return serialisePostWrite(async () => {
        const stored = await readStandInList(path, POSTS_KEY);
        if (stored.some((element) => asStandInPost(element)?.slug === record.slug)) return false;
        await writeStandInList(path, POSTS_KEY, [
          ...stored,
          { slug: record.slug, status: statusOf(record), data: record.data },
        ]);
        return true;
      });
    }
    const rows = await clientFor(setting).unsafe(POST_INSERT_SQL, [
      record.slug,
      statusOf(record),
      JSON.stringify(record.data),
    ]);
    return rows.length > 0;
  });
}

export async function updatePostRecord(record: StoredPost): Promise<boolean> {
  return run("write", async (setting, path) => {
    if (path !== null) {
      return serialisePostWrite(async () => {
        const stored = await readStandInList(path, POSTS_KEY);
        let found = false;
        const next = stored.map((element) => {
          const post = asStandInPost(element);
          if (post === null || post.slug !== record.slug) return element;
          found = true;
          return { ...(element as Record<string, unknown>), status: statusOf(record), data: record.data };
        });
        if (!found) return false;
        await writeStandInList(path, POSTS_KEY, next);
        return true;
      });
    }
    const rows = await clientFor(setting).unsafe(POST_UPDATE_SQL, [
      record.slug,
      statusOf(record),
      JSON.stringify(record.data),
    ]);
    return rows.length > 0;
  });
}

export async function deletePostRecord(slug: string): Promise<boolean> {
  return run("write", async (setting, path) => {
    if (path !== null) {
      return serialisePostWrite(async () => {
        const stored = await readStandInList(path, POSTS_KEY);
        const kept = stored.filter((element) => asStandInPost(element)?.slug !== slug);
        if (kept.length === stored.length) return false;
        await writeStandInList(path, POSTS_KEY, kept);
        return true;
      });
    }
    const rows = await clientFor(setting).unsafe(POST_DELETE_SQL, [slug]);
    return rows.length > 0;
  });
}
