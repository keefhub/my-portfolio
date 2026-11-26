"use client";

import { useEffect, useRef, useState } from "react";
import {
  LIST_MESSAGES,
  changedPositions,
  deleteQuestion,
  failureMessage,
  moveEntry,
  sortEntries,
  topPosition,
  type FieldErrors,
  type ListCheck,
  type ListEntry,
  type ListMove,
} from "@/lib/admin/list";
import type { ListStore } from "@/lib/firebase/list";
import { buttonStyle, errorStyle, listStyle, statusStyle } from "./formParts";

export type ListFieldsProps<T> = {
  value: T;
  onChange: (next: T) => void;
  errors: FieldErrors;
  disabled: boolean;
};

export type ListEditorProps<T> = {
  heading: string;
  savingOn: boolean;
  store: ListStore<T>;
  label: (content: T) => string;
  emptyContent: () => T;
  check: (draft: T) => ListCheck<T>;
  renderFields: (props: ListFieldsProps<T>) => React.ReactNode;
  emptyText?: string;
  listLabel?: string;
  newPosition?: (entries: readonly ListEntry<T>[]) => number;
};

type LoadState = "loading" | "failed" | "ready";
type Message = { kind: "status" | "alert"; text: string } | null;
type FormState = { mode: "add" } | { mode: "edit"; id: string };

const rowButtonsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const itemStyle: React.CSSProperties = {
  background: "var(--surface-alt)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
};

export default function ListEditor<T>(props: ListEditorProps<T>): React.JSX.Element {
  const { heading, savingOn, store, label, emptyContent, check, renderFields } = props;
  const emptyText = props.emptyText ?? LIST_MESSAGES.empty;
  const listLabel = props.listLabel ?? `${heading} entries`;
  const newPosition = props.newPosition ?? topPosition;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [entries, setEntries] = useState<ListEntry<T>[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<Message>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    async function initialLoad(): Promise<void> {
      let loaded: ListEntry<T>[] | null = null;
      try {
        loaded = await store.load();
      } catch {
        loaded = null;
      }
      if (!mounted.current) return;
      if (loaded === null) {
        setLoadState("failed");
      } else {
        setEntries(loaded);
        setLoadState("ready");
      }
    }
    void initialLoad();
    return () => {
      mounted.current = false;
    };
  }, [store]);

  function openForm(next: FormState, content: T): void {
    setConfirming(null);
    setMessage(null);
    setErrors({});
    setDraft(content);
    setForm(next);
  }

  function closeForm(): void {
    setMessage(null);
    setErrors({});
    setDraft(null);
    setForm(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busyRef.current || form === null || draft === null) return;
    setErrors({});
    setMessage(null);
    const result = check(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const content = result.content;
    busyRef.current = true;
    setBusy(true);
    setMessage({ kind: "status", text: LIST_MESSAGES.saving });
    try {
      if (form.mode === "add") {
        const position = newPosition(entries);
        const id = await store.add(content, position);
        if (!mounted.current) return;
        setEntries((cur) => sortEntries([...cur, { id, position, content }]));
      } else {
        const id = form.id;
        await store.update(id, content);
        if (!mounted.current) return;
        setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, content } : e)));
      }
      setDraft(null);
      setForm(null);
      setMessage({ kind: "status", text: LIST_MESSAGES.saved });
    } catch {
      if (!mounted.current) return;
      setMessage({ kind: "alert", text: failureMessage("save", savingOn) });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function handleMove(id: string, direction: ListMove): Promise<void> {
    if (busyRef.current) return;
    const moved = moveEntry(entries, id, direction);
    if (moved === null) return;
    busyRef.current = true;
    setBusy(true);
    setMessage({ kind: "status", text: LIST_MESSAGES.saving });
    try {
      await store.reorder(changedPositions(entries, moved));
      if (!mounted.current) return;
      setEntries(moved);
      setMessage({ kind: "status", text: LIST_MESSAGES.moved });
    } catch {
      if (!mounted.current) return;
      setMessage({ kind: "alert", text: failureMessage("move", savingOn) });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function handleConfirmDelete(id: string): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage({ kind: "status", text: LIST_MESSAGES.deleting });
    try {
      await store.remove(id);
      if (!mounted.current) return;
      setEntries((cur) => cur.filter((e) => e.id !== id));
      setConfirming(null);
      setMessage({ kind: "status", text: LIST_MESSAGES.deleted });
    } catch {
      if (!mounted.current) return;
      setMessage({ kind: "alert", text: failureMessage("delete", savingOn) });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const messageLine =
    message === null ? null : message.kind === "alert" ? (
      <p role="alert" style={errorStyle}>
        {message.text}
      </p>
    ) : (
      <p role="status" style={statusStyle}>
        {message.text}
      </p>
    );

  let body: React.JSX.Element;

  if (loadState === "loading") {
    body = (
      <p role="status" style={statusStyle}>
        {LIST_MESSAGES.loading}
      </p>
    );
  } else if (loadState === "failed") {
    body = (
      <p role="alert" style={errorStyle}>
        {LIST_MESSAGES.loadFailed}
      </p>
    );
  } else if (form !== null && draft !== null) {
    body = (
      <>
        <h3 style={{ margin: 0, color: "var(--foreground)" }}>
          {form.mode === "add" ? "Add entry" : "Edit entry"}
        </h3>
        {messageLine}
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}
        >
          {renderFields({ value: draft, onChange: setDraft, errors, disabled: busy })}
          <div style={rowButtonsStyle}>
            <button type="submit" style={buttonStyle} disabled={busy}>
              Save
            </button>
            <button type="button" style={buttonStyle} disabled={busy} onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      </>
    );
  } else {
    body = (
      <>
        {messageLine}
        {entries.length === 0 ? (
          <p role="status" style={statusStyle}>
            {emptyText}
          </p>
        ) : (
          <ul aria-label={listLabel} style={listStyle}>
            {entries.map((entry, index) => {
              const text = label(entry.content);
              return (
                <li key={entry.id} style={itemStyle}>
                  <span
                    style={{ color: "var(--foreground)", overflowWrap: "anywhere", minWidth: 0 }}
                  >
                    {text}
                  </span>
                  <div style={rowButtonsStyle}>
                    <button
                      type="button"
                      style={buttonStyle}
                      disabled={busy}
                      onClick={() => openForm({ mode: "edit", id: entry.id }, entry.content)}
                    >
                      Edit
                    </button>
                    {index > 0 && (
                      <button
                        type="button"
                        style={buttonStyle}
                        disabled={busy}
                        onClick={() => void handleMove(entry.id, "up")}
                      >
                        Move up
                      </button>
                    )}
                    {index < entries.length - 1 && (
                      <button
                        type="button"
                        style={buttonStyle}
                        disabled={busy}
                        onClick={() => void handleMove(entry.id, "down")}
                      >
                        Move down
                      </button>
                    )}
                    <button
                      type="button"
                      style={buttonStyle}
                      disabled={busy || confirming === entry.id}
                      onClick={() => setConfirming(entry.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {confirming === entry.id && (
                    <div
                      role="group"
                      aria-label="Confirm delete"
                      style={{ display: "flex", flexDirection: "column", gap: 8 }}
                    >
                      <p style={{ margin: 0, color: "var(--foreground)", overflowWrap: "anywhere" }}>
                        {deleteQuestion(text)}
                      </p>
                      <div style={rowButtonsStyle}>
                        <button
                          type="button"
                          style={buttonStyle}
                          disabled={busy}
                          onClick={() => void handleConfirmDelete(entry.id)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          style={buttonStyle}
                          disabled={busy}
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div style={rowButtonsStyle}>
          <button
            type="button"
            style={buttonStyle}
            disabled={busy}
            onClick={() => openForm({ mode: "add" }, emptyContent())}
          >
            Add entry
          </button>
        </div>
      </>
    );
  }

  return (
    <section
      aria-label={`${heading} editor`}
      style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}
    >
      <h2 style={{ margin: 0, color: "var(--foreground)" }}>{heading}</h2>
      {body}
    </section>
  );
}
