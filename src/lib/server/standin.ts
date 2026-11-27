import "server-only";
import { readFile, rename, writeFile } from "node:fs/promises";

const PREFIX = "stand-in:";

export function standInPath(setting: string | undefined): string | null {
  if (typeof setting !== "string" || !setting.startsWith(PREFIX)) return null;
  const rest = setting.slice(PREFIX.length);
  return rest === "" ? null : rest;
}

function unreachable(): Error {
  return Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432 (password-marker-standin)"), {
    code: "ECONNREFUSED",
  });
}

async function readFileObject(filePath: string): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") return null;
    throw unreachable();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unreachable();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw unreachable();
  const file = parsed as Record<string, unknown>;
  if (file.unreachable === true) throw unreachable();
  return file;
}

export async function readStandIn(filePath: string): Promise<unknown | null> {
  const file = await readFileObject(filePath);
  if (file === null) return null;
  const profile = file.profile;
  return profile === undefined ? null : profile;
}

async function writeFileObject(filePath: string, next: Record<string, unknown>): Promise<void> {
  const temporary = filePath + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(next), "utf8");
    await rename(temporary, filePath);
  } catch {
    throw unreachable();
  }
}

export async function writeStandIn(filePath: string, content: unknown): Promise<void> {
  const existing = await readFileObject(filePath);
  await writeFileObject(filePath, { ...(existing ?? {}), profile: content });
}

export async function readStandInImages(filePath: string): Promise<unknown[]> {
  const file = await readFileObject(filePath);
  if (file === null) return [];
  return Array.isArray(file.images) ? file.images : [];
}

export async function writeStandInImages(filePath: string, images: unknown[]): Promise<void> {
  const existing = await readFileObject(filePath);
  await writeFileObject(filePath, { ...(existing ?? {}), images });
}
