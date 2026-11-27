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
import { readStandIn, readStandInImages, standInPath, writeStandIn, writeStandInImages } from "@/lib/server/standin";

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
