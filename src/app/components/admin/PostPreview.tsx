"use client";

import { useEffect, useState } from "react";
import { markdownToHtml } from "@/lib/markdown";
import PostBody from "@/app/components/blog/PostBody";
import { buttonStyle, errorStyle, statusStyle } from "./formParts";

type Converted = { body: string; html: string; failed: boolean };

export default function PostPreview(props: {
  body: string;
  onBack: () => void;
}): React.JSX.Element {
  const { body, onBack } = props;
  const blank = body.trim() === "";
  const [converted, setConverted] = useState<Converted | null>(null);

  useEffect(() => {
    if (body.trim() === "") return;
    let mounted = true;
    async function convert(): Promise<void> {
      let next: Converted;
      try {
        next = { body, html: await markdownToHtml(body), failed: false };
      } catch {
        next = { body, html: "", failed: true };
      }
      if (!mounted) return;
      setConverted(next);
    }
    void convert();
    return () => {
      mounted = false;
    };
  }, [body]);

  const current = converted !== null && converted.body === body ? converted : null;

  let content: React.ReactNode = null;
  if (blank) {
    content = (
      <p role="status" style={statusStyle}>
        Nothing to preview yet
      </p>
    );
  } else if (current !== null && current.failed) {
    content = (
      <p role="alert" style={errorStyle}>
        The preview could not be built.
      </p>
    );
  } else if (current !== null) {
    content = (
      <div
        style={{
          minWidth: 0,
          maxWidth: "100%",
          overflowX: "auto",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 16,
          background: "var(--surface)",
          color: "var(--foreground)",
        }}
      >
        <PostBody html={current.html} />
      </div>
    );
  }

  return (
    <section
      aria-label="Post preview"
      style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}
    >
      <button type="button" style={{ ...buttonStyle, alignSelf: "flex-start" }} onClick={onBack}>
        Back to form
      </button>
      {content}
    </section>
  );
}
