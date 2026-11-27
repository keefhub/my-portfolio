import type { ListEntry, ListStore } from "@/lib/admin/list";

const FAILED = "The request failed.";
const TIMEOUT_MS = 15000;

function failure(): Error {
  return new Error(FAILED);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function send(url: string, method: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw failure();
  }
  if (!response.ok) throw failure();
  return response;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw failure();
  }
}

export function createHttpListStore<T>(
  url: string,
  fromData: (data: unknown) => T,
  toData: (content: T) => Record<string, unknown>,
): ListStore<T> {
  const withId = (id: string): string => `${url}?id=${encodeURIComponent(id)}`;
  return {
    async load() {
      const body = await readJson(await send(url, "GET"));
      if (!isObject(body) || !Array.isArray(body.entries)) throw failure();
      const entries: ListEntry<T>[] = [];
      for (const e of body.entries as unknown[]) {
        if (
          !isObject(e) ||
          typeof e.id !== "string" ||
          typeof e.position !== "number" ||
          !Number.isFinite(e.position) ||
          !isObject(e.content)
        ) {
          throw failure();
        }
        entries.push({ id: e.id, position: e.position, content: fromData(e.content) });
      }
      return entries;
    },
    async add(content, position) {
      const body = await readJson(await send(url, "POST", { content: toData(content), position }));
      if (!isObject(body) || typeof body.id !== "string") throw failure();
      return body.id;
    },
    async update(id, content) {
      await send(withId(id), "PUT", { content: toData(content) });
    },
    async reorder(changes) {
      if (changes.length === 0) return;
      await send(url, "PATCH", { changes });
    },
    async remove(id) {
      await send(withId(id), "DELETE");
    },
  };
}
