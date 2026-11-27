export type ListEntry<T> = { id: string; position: number; content: T };
export type FieldErrors = Record<string, string | undefined>;
export type ListCheck<T> = { ok: true; content: T } | { ok: false; errors: FieldErrors };
export type ListStore<T> = {
  load(): Promise<ListEntry<T>[]>;
  add(content: T, position: number): Promise<string>;
  update(id: string, content: T): Promise<void>;
  reorder(changes: { id: string; position: number }[]): Promise<void>;
  remove(id: string): Promise<void>;
};

export const LIST_ID_PATTERN: RegExp =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ListMove = "up" | "down";
export type ListFailure = "save" | "move" | "delete";

export const UNPOSITIONED: number = Number.MAX_SAFE_INTEGER;

export const LIST_MESSAGES = {
  loading: "Loading entries…",
  loadFailed: "The entries could not be loaded.",
  empty: "No entries yet.",
  saved: "Entry saved",
  moved: "Order saved",
  deleted: "Entry deleted",
  saving: "Saving…",
  deleting: "Deleting…",
};

export function sortEntries<T>(entries: readonly ListEntry<T>[]): ListEntry<T>[] {
  return [...entries].sort((a, b) => {
    if (a.position !== b.position) return a.position < b.position ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

export function topPosition<T>(entries: readonly ListEntry<T>[]): number {
  let min: number | null = null;
  for (const e of entries) {
    if (e.position < UNPOSITIONED && (min === null || e.position < min)) min = e.position;
  }
  return min === null ? 0 : min - 1;
}

export function bottomPosition<T>(entries: readonly ListEntry<T>[]): number {
  let max: number | null = null;
  for (const e of entries) {
    if (e.position < UNPOSITIONED && (max === null || e.position > max)) max = e.position;
  }
  return max === null ? 0 : max + 1;
}

export function moveEntry<T>(
  entries: readonly ListEntry<T>[],
  id: string,
  direction: ListMove,
): ListEntry<T>[] | null {
  const index = entries.findIndex((e) => e.id === id);
  if (index < 0) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= entries.length) return null;
  const next = [...entries];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((e, i) => ({ ...e, position: i }));
}

export function changedPositions<T>(
  before: readonly ListEntry<T>[],
  after: readonly ListEntry<T>[],
): { id: string; position: number }[] {
  const old = new Map(before.map((e) => [e.id, e.position]));
  return after
    .filter((e) => !old.has(e.id) || old.get(e.id) !== e.position)
    .map((e) => ({ id: e.id, position: e.position }));
}

const FAILURE_SENTENCES: Record<ListFailure, string> = {
  save: "The entry could not be saved.",
  move: "The entry could not be moved.",
  delete: "The entry could not be deleted.",
};

export function failureMessage(action: ListFailure, savingOn: boolean): string {
  const reason = savingOn
    ? "Try again, and check that you are signed in as the owner."
    : "Saving is not switched on yet.";
  return `${FAILURE_SENTENCES[action]} ${reason}`;
}

export function deleteQuestion(label: string): string {
  return `Delete "${label}"? This cannot be undone.`;
}
