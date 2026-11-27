import "server-only";
import postgres from "postgres";
import { PROFILE_DOC_ID, type ProfileContent } from "@/lib/admin/profile";
import { databaseLogLine, type DatabaseOperation } from "@/lib/admin/dblog";
import { READ_PROFILE_SQL, SCHEMA_STATEMENTS, WRITE_PROFILE_SQL } from "@/lib/server/sql";
import { readStandIn, standInPath, writeStandIn } from "@/lib/server/standin";

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
