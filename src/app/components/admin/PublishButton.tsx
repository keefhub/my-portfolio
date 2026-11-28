"use client";

import { useEffect, useRef, useState } from "react";
import { PUBLISH_MESSAGES, publishSite } from "@/lib/admin/publish";
import { buttonStyle, errorStyle, statusStyle } from "./formParts";

type Message = { kind: "status" | "alert"; text: string } | null;

export default function PublishButton(): React.JSX.Element {
  const [message, setMessage] = useState<Message>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handlePress(): Promise<void> {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setMessage({ kind: "status", text: PUBLISH_MESSAGES.publishing });
    const outcome = await publishSite();
    runningRef.current = false;
    if (!mounted.current) return;
    setRunning(false);
    if (outcome === "published") {
      setMessage({ kind: "status", text: PUBLISH_MESSAGES.published });
    } else if (outcome === "refused") {
      setMessage({ kind: "alert", text: PUBLISH_MESSAGES.refused });
    } else {
      setMessage({ kind: "alert", text: PUBLISH_MESSAGES.failed });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <button
        type="button"
        style={{ ...buttonStyle, opacity: running ? 0.6 : 1 }}
        disabled={running}
        onClick={() => void handlePress()}
      >
        Publish
      </button>
      {message && (
        <p
          role={message.kind === "alert" ? "alert" : "status"}
          style={message.kind === "alert" ? errorStyle : statusStyle}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
