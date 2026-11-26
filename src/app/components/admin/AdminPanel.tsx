"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithGoogle, signOutUser, watchAuth } from "@/lib/firebase/auth";
import { accessFor, getOwnerUid } from "@/lib/admin/owner";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import SavingOffNotice from "./SavingOffNotice";

type PanelState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; uid: string };

const buttonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  background: "var(--surface-alt)",
  border: "1px solid var(--border-strong)",
  color: "var(--foreground)",
  borderRadius: "var(--radius-md)",
  padding: "0 16px",
  cursor: "pointer",
};

const messageStyle: React.CSSProperties = {
  color: "var(--accent-rose)",
  margin: 0,
};

function UserIdLine({ uid }: { uid: string }): React.JSX.Element {
  return (
    <p style={{ margin: 0, color: "var(--muted)" }}>
      Your user ID: <code style={{ overflowWrap: "anywhere" }}>{uid}</code>
    </p>
  );
}

export default function AdminPanel(): React.JSX.Element {
  const [state, setState] = useState<PanelState>({ kind: "loading" });
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const lastKind = useRef<PanelState["kind"]>("loading");

  useEffect(() => {
    return watchAuth((user) => {
      const next: PanelState = user
        ? { kind: "signed-in", uid: user.uid }
        : { kind: "signed-out" };
      if (lastKind.current !== next.kind) {
        lastKind.current = next.kind;
        setFailed(false);
        setSelected(null);
      }
      setState(next);
    });
  }, []);

  async function handleSignIn(): Promise<void> {
    setFailed(false);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    try {
      await signOutUser();
    } catch {
      // the screen stays as it is, with no message
    }
  }

  let body: React.JSX.Element | null = null;

  if (state.kind === "loading") {
    body = (
      <p role="status" style={{ margin: 0, color: "var(--muted)" }}>
        Checking sign-in…
      </p>
    );
  } else if (state.kind === "signed-out") {
    body = (
      <>
        <button
          type="button"
          style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={handleSignIn}
        >
          Sign in with Google
        </button>
        {failed && (
          <p role="alert" style={messageStyle}>
            Sign-in was not completed.
          </p>
        )}
      </>
    );
  } else {
    const access = accessFor(state.uid, getOwnerUid());
    if (access === "not-allowed") {
      body = (
        <>
          <p role="alert" style={messageStyle}>
            This account is not allowed to use the admin panel.
          </p>
          <UserIdLine uid={state.uid} />
          <button type="button" style={buttonStyle} onClick={handleSignOut}>
            Sign out
          </button>
        </>
      );
    } else {
      const section = ADMIN_SECTIONS.find((s) => s.id === selected);
      body = (
        <>
          <nav aria-label="Admin sections">
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {ADMIN_SECTIONS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => setSelected(s.id)}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {section && (
            <p role="status" style={{ margin: 0, color: "var(--muted)" }}>
              {section.label} editor is not available yet.
            </p>
          )}
          {access === "unfilled" && (
            <>
              <SavingOffNotice />
              <UserIdLine uid={state.uid} />
            </>
          )}
          <button type="button" style={buttonStyle} onClick={handleSignOut}>
            Sign out
          </button>
        </>
      );
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "var(--background)",
      }}
    >
      <section
        aria-label="Admin"
        style={{
          width: "100%",
          maxWidth: "28rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-md)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ margin: 0, color: "var(--foreground)" }}>Admin</h1>
        {body}
      </section>
    </main>
  );
}
