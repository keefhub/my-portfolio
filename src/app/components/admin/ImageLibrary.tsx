"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_MESSAGES,
  formatBytes,
  validateImageFile,
  type ImageRecord,
} from "@/lib/admin/images";
import { ImageGoneError, deleteImage, listImages, uploadImage } from "@/lib/firebase/images";

type ListState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; images: ImageRecord[] };

type Message = { kind: "error" | "status"; text: string } | null;

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  background: "var(--surface-alt)",
  border: "1px solid var(--border-strong)",
  color: "var(--foreground)",
  borderRadius: "var(--radius-md)",
  padding: "0 16px",
  cursor: "pointer",
};

export default function ImageLibrary(): React.JSX.Element {
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  async function load(): Promise<void> {
    try {
      const images = await listImages();
      if (!mounted.current) return;
      setConfirming(null);
      setList({ kind: "ready", images });
    } catch {
      if (!mounted.current) return;
      setConfirming(null);
      setList({ kind: "failed" });
    }
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    async function initialLoad(): Promise<void> {
      let next: ListState;
      try {
        next = { kind: "ready", images: await listImages() };
      } catch {
        next = { kind: "failed" };
      }
      if (!active) return;
      setList(next);
    }
    void initialLoad();
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);

  function show(kind: "error" | "status", text: string): void {
    setMessage({ kind, text });
  }

  async function handleUpload(): Promise<void> {
    if (busyRef.current) return;
    const file = inputRef.current?.files?.[0];
    if (!file) {
      show("error", IMAGE_MESSAGES.noFile);
      return;
    }
    const refusal = validateImageFile(file);
    if (refusal) {
      show("error", refusal);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    show("status", IMAGE_MESSAGES.uploading);
    try {
      await uploadImage(file);
      if (!mounted.current) return;
      if (inputRef.current) inputRef.current.value = "";
      setMessage(null);
      busyRef.current = false;
      setBusy(false);
      await load();
    } catch {
      if (!mounted.current) return;
      show("error", IMAGE_MESSAGES.uploadFailed);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function handleCopy(record: ImageRecord): Promise<void> {
    setMessage(null);
    try {
      await navigator.clipboard.writeText(record.url);
      show("status", IMAGE_MESSAGES.copied);
    } catch {
      show("error", IMAGE_MESSAGES.copyFailed);
    }
  }

  async function handleConfirm(record: ImageRecord): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    show("status", IMAGE_MESSAGES.deleting);
    let reload = false;
    try {
      await deleteImage(record);
      setMessage(null);
      reload = true;
    } catch (err) {
      if (err instanceof ImageGoneError) {
        show("error", IMAGE_MESSAGES.alreadyDeleted);
        reload = true;
      } else {
        show("error", IMAGE_MESSAGES.deleteFailed);
        setConfirming(null);
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
    if (reload && mounted.current) await load();
  }

  let area: React.JSX.Element;
  if (list.kind === "loading") {
    area = (
      <p role="status" style={{ margin: 0, color: "var(--muted)" }}>
        {IMAGE_MESSAGES.loading}
      </p>
    );
  } else if (list.kind === "failed") {
    area = (
      <p role="alert" style={{ margin: 0, color: "var(--accent-rose)" }}>
        {IMAGE_MESSAGES.loadFailed}
      </p>
    );
  } else if (list.images.length === 0) {
    area = <p style={{ margin: 0, color: "var(--muted)" }}>{IMAGE_MESSAGES.emptyList}</p>;
  } else {
    area = (
      <ul
        aria-label="Uploaded images"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}
      >
        {list.images.map((record) => (
          <li
            key={record.id}
            style={{
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--foreground)",
              padding: 12,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <Image
              src={record.url}
              alt={record.name}
              width={160}
              height={160}
              unoptimized
              loading="eager"
              style={{ maxWidth: "100%", width: "auto", height: "auto", maxHeight: 160, objectFit: "contain" }}
            />
            <span style={{ overflowWrap: "anywhere" }}>{record.name}</span>
            <span style={{ overflowWrap: "anywhere", color: "var(--muted)" }}>
              {formatBytes(record.size)}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                style={buttonStyle}
                disabled={busy}
                onClick={() => void handleCopy(record)}
              >
                Copy address
              </button>
              <button
                type="button"
                style={buttonStyle}
                disabled={busy || confirming === record.id}
                onClick={() => setConfirming(record.id)}
              >
                Delete
              </button>
            </div>
            {confirming === record.id && (
              <div
                role="group"
                aria-label="Confirm delete"
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <p style={{ margin: 0, overflowWrap: "anywhere" }}>
                  {`Delete "${record.name}"? Records that still use this image will show a broken image.`}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={busy}
                    onClick={() => void handleConfirm(record)}
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
        ))}
      </ul>
    );
  }

  return (
    <section
      aria-label="Image library"
      style={{ display: "flex", flexDirection: "column", gap: 12, color: "var(--foreground)" }}
    >
      <h2 style={{ margin: 0 }}>Images</h2>
      <p style={{ margin: 0, color: "var(--muted)" }}>PNG, JPEG, WebP or SVG, up to 5 MB.</p>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Image file
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          disabled={busy}
          style={{ maxWidth: "100%" }}
        />
      </label>
      <button type="button" style={buttonStyle} disabled={busy} onClick={() => void handleUpload()}>
        Upload
      </button>
      {message ? (
        message.kind === "error" ? (
          <p role="alert" style={{ margin: 0, color: "var(--accent-rose)", overflowWrap: "anywhere" }}>
            {message.text}
          </p>
        ) : (
          <p role="status" style={{ margin: 0, color: "var(--muted)" }}>
            {message.text}
          </p>
        )
      ) : (
        <p style={{ margin: 0 }} />
      )}
      {area}
    </section>
  );
}
