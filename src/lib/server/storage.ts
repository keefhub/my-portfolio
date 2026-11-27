import "server-only";
import { storageLogLine, type StorageOperation } from "@/lib/admin/storagelog";
import { standInPath } from "@/lib/server/standin";
import { checkStandInStorage, removeStandIn, statStandIn } from "@/lib/server/storageStandin";

export class StorageUnavailableError extends Error {
  constructor() {
    super("The file storage is unavailable.");
    this.name = "StorageUnavailableError";
  }
}

export const IMAGE_BUCKET = "images";

const STAND_IN_HOST = "https://stand-in.invalid";
const TIMEOUT_MS = 5000;
const BUCKET_BODY =
  '{"id":"images","name":"images","public":true,"file_size_limit":5242880,"allowed_mime_types":["image/png","image/jpeg","image/webp","image/svg+xml"]}';

// A non-success answer. Only its status is kept: the body of a failed response is never read.
class HttpFailure extends Error {
  readonly status: number;
  constructor(status: number) {
    super("The storage request failed.");
    this.status = status;
  }
}

type Settings = { mode: "stand-in"; directory: string } | { mode: "real"; base: string; key: string };

function settings(): Settings {
  const url = process.env.SUPABASE_URL;
  const directory = standInPath(url);
  if (directory !== null) return { mode: "stand-in", directory };
  if (typeof url !== "string" || url.startsWith("stand-in:")) throw new Error("The storage setting is unusable.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("The storage setting is unusable.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("The storage setting is unusable.");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key !== "string" || key.trim() === "") throw new Error("The storage setting is unusable.");
  return { mode: "real", base: parsed.origin, key };
}

function keyHeaders(key: string): Record<string, string> {
  return { apikey: key, authorization: "Bearer " + key };
}

async function call(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function refuse(response: Response): never {
  void response.body?.cancel().catch(() => undefined);
  throw new HttpFailure(response.status);
}

async function guarded<T>(operation: StorageOperation, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const failure = error instanceof HttpFailure ? { status: error.status } : error;
    const line = storageLogLine(operation, failure);
    console.error(line);
    throw new StorageUnavailableError();
  }
}

let bucketPair: string | null = null;
let bucketReady: Promise<void> | null = null;

async function prepareBucket(base: string, key: string): Promise<void> {
  const read = await call(base + "/storage/v1/bucket/" + IMAGE_BUCKET, { method: "GET", headers: keyHeaders(key) });
  if (read.status === 200) return;
  if (read.status !== 400 && read.status !== 404) refuse(read);
  const created = await call(base + "/storage/v1/bucket", {
    method: "POST",
    headers: { ...keyHeaders(key), "content-type": "application/json" },
    body: BUCKET_BODY,
  });
  if (created.status === 200 || created.status === 409) return;
  refuse(created);
}

export async function ensureBucket(): Promise<void> {
  await guarded("bucket", async () => {
    const current = settings();
    if (current.mode === "stand-in") {
      await checkStandInStorage(current.directory);
      return;
    }
    const pair = current.base + "\n" + current.key;
    if (bucketReady === null || bucketPair !== pair) {
      const attempt = prepareBucket(current.base, current.key);
      bucketReady = attempt;
      bucketPair = pair;
      attempt.catch(() => {
        if (bucketReady === attempt) {
          bucketReady = null;
          bucketPair = null;
        }
      });
    }
    await bucketReady;
  });
}

export function publicImageUrl(id: string): string {
  let current: Settings;
  try {
    current = settings();
  } catch {
    throw new StorageUnavailableError();
  }
  if (current.mode === "stand-in") return STAND_IN_HOST + "/storage/v1/object/public/" + IMAGE_BUCKET + "/" + id;
  return current.base + "/storage/v1/object/public/" + IMAGE_BUCKET + "/" + id;
}

export async function createUploadAddress(id: string): Promise<string> {
  return guarded("sign", async () => {
    const current = settings();
    if (current.mode === "stand-in") {
      await checkStandInStorage(current.directory);
      return STAND_IN_HOST + "/storage/v1/object/upload/sign/" + IMAGE_BUCKET + "/" + id + "?token=stand-in-token";
    }
    const response = await call(current.base + "/storage/v1/object/upload/sign/" + IMAGE_BUCKET + "/" + id, {
      method: "POST",
      headers: { ...keyHeaders(current.key), "content-type": "application/json" },
      body: "{}",
    });
    if (response.status < 200 || response.status > 299) refuse(response);
    const answer: unknown = await response.json();
    const url = typeof answer === "object" && answer !== null ? (answer as { url?: unknown }).url : undefined;
    const prefix = "/object/upload/sign/" + IMAGE_BUCKET + "/" + id + "?token=";
    if (typeof url !== "string" || !url.startsWith(prefix) || url.length <= prefix.length) {
      throw new Error("The signing answer is malformed.");
    }
    return current.base + "/storage/v1" + url;
  });
}

export async function statStoredImage(id: string): Promise<{ size: number | null; contentType: string | null } | null> {
  return guarded("stat", async () => {
    const current = settings();
    if (current.mode === "stand-in") return statStandIn(current.directory, id);
    const response = await call(current.base + "/storage/v1/object/public/" + IMAGE_BUCKET + "/" + id, {
      method: "HEAD",
      headers: { "accept-encoding": "identity" },
    });
    if (response.status === 400 || response.status === 404) return null;
    if (response.status !== 200) refuse(response);
    const length = response.headers.get("content-length");
    const size = length !== null && /^\d+$/.test(length.trim()) ? Number(length.trim()) : null;
    const type = response.headers.get("content-type");
    const contentType = type === null ? null : type.split(";")[0].trim().toLowerCase() || null;
    return { size: size !== null && Number.isSafeInteger(size) ? size : null, contentType };
  });
}

export async function deleteStoredImage(id: string): Promise<void> {
  await guarded("remove", async () => {
    const current = settings();
    if (current.mode === "stand-in") {
      await removeStandIn(current.directory, id);
      return;
    }
    const response = await call(current.base + "/storage/v1/object/" + IMAGE_BUCKET, {
      method: "DELETE",
      headers: { ...keyHeaders(current.key), "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [id] }),
    });
    if (response.status < 200 || response.status > 299) refuse(response);
  });
}
