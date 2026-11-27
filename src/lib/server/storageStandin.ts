import "server-only";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

function unreachable(): Error {
  return Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:443 (key-marker-standin)"), {
    code: "ECONNREFUSED",
  });
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

export async function checkStandInStorage(directory: string): Promise<void> {
  try {
    await stat(path.join(directory, "unreachable"));
  } catch (error) {
    if (!isMissing(error)) throw unreachable();
    try {
      await readdir(directory);
    } catch (listError) {
      if (!isMissing(listError)) throw unreachable();
    }
    return;
  }
  throw unreachable();
}

export async function statStandIn(
  directory: string,
  id: string,
): Promise<{ size: number; contentType: string | null } | null> {
  await checkStandInStorage(directory);
  let size: number;
  try {
    size = (await readFile(path.join(directory, id))).length;
  } catch (error) {
    if (isMissing(error)) return null;
    throw unreachable();
  }
  let contentType: string | null = null;
  try {
    contentType = (await readFile(path.join(directory, id + ".type"), "utf8")).trim();
  } catch (error) {
    if (!isMissing(error)) throw unreachable();
  }
  return { size, contentType };
}

export async function removeStandIn(directory: string, id: string): Promise<void> {
  await checkStandInStorage(directory);
  try {
    await rm(path.join(directory, id), { force: true });
    await rm(path.join(directory, id + ".type"), { force: true });
  } catch {
    throw unreachable();
  }
}
