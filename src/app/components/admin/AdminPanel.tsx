"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction, signOutAction } from "@/app/bright-warm-greenhouse/actions";
import type { PanelState } from "@/lib/admin/access";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import BlogPostsEditor from "./BlogPostsEditor";
import CertificationsEditor from "./CertificationsEditor";
import ExperienceEditor from "./ExperienceEditor";
import ImageLibrary from "./ImageLibrary";
import ProfileEditor from "./ProfileEditor";
import ProjectsEditor from "./ProjectsEditor";
import TechStackEditor from "./TechStackEditor";

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

function SubmitButton({ label }: { label: string }): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      style={{ ...buttonStyle, opacity: pending ? 0.6 : 1 }}
      disabled={pending}
    >
      {label}
    </button>
  );
}

function SignOutForm(): React.JSX.Element {
  return (
    <form action={signOutAction}>
      <SubmitButton label="Sign out" />
    </form>
  );
}

export default function AdminPanel(props: {
  state: PanelState;
  failed: boolean;
}): React.JSX.Element {
  const { state, failed } = props;
  const [selected, setSelected] = useState<string | null>(null);

  let body: React.JSX.Element;

  if (state === "signed-out") {
    body = (
      <>
        <form action={signInAction}>
          <SubmitButton label="Sign in with Google" />
        </form>
        {failed && (
          <p role="alert" style={messageStyle}>
            Sign-in was not completed.
          </p>
        )}
      </>
    );
  } else if (state === "not-allowed") {
    body = (
      <>
        <p role="alert" style={messageStyle}>
          This account is not allowed to use the admin panel.
        </p>
        <SignOutForm />
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
        {section && section.id === "profile" && <ProfileEditor />}
        {section && section.id === "images" && <ImageLibrary />}
        {section && section.id === "experience" && <ExperienceEditor />}
        {section && section.id === "projects" && <ProjectsEditor />}
        {section && section.id === "certifications" && <CertificationsEditor />}
        {section && section.id === "tech-stack" && <TechStackEditor />}
        {section && section.id === "blog-posts" && <BlogPostsEditor />}
        <SignOutForm />
      </>
    );
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
