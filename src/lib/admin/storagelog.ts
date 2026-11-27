export type StorageOperation = "bucket" | "sign" | "stat" | "remove";

const CODE_PATTERN = /^[A-Za-z0-9_]{1,20}$/;

function codeOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = (value as { code?: unknown }).code;
  return typeof candidate === "string" && CODE_PATTERN.test(candidate) ? candidate : null;
}

export function storageLogLine(operation: StorageOperation, failure: unknown): string {
  let code = "unknown";
  if (typeof failure === "object" && failure !== null) {
    const status = (failure as { status?: unknown }).status;
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
      code = "HTTP_" + status;
    } else {
      const own = codeOf(failure);
      const cause = own ?? codeOf((failure as { cause?: unknown }).cause);
      if (cause !== null) code = cause;
    }
  }
  return "[storage] " + operation + " failed " + code;
}
