export type DatabaseOperation = "schema" | "read" | "write";

const CODE_PATTERN = /^[A-Za-z0-9_]{1,20}$/;

export function databaseLogLine(operation: DatabaseOperation, error: unknown): string {
  let code = "unknown";
  if (typeof error === "object" && error !== null) {
    const candidate = (error as { code?: unknown }).code;
    if (typeof candidate === "string" && CODE_PATTERN.test(candidate)) code = candidate;
  }
  return "[database] " + operation + " failed " + code;
}
