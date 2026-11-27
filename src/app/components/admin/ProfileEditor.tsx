"use client";

import { useEffect, useRef, useState } from "react";
import {
  PROFILE_MESSAGES,
  checkProfile,
  emptyProfile,
  profileFromData,
  type ProfileContent,
  type ProfileErrors,
} from "@/lib/admin/profile";
import {
  FieldError,
  buttonStyle,
  errorStyle,
  fieldProps,
  groupStyle,
  inputStyle,
  labelStyle,
  legendStyle,
  listStyle,
  statusStyle,
  textareaStyle,
} from "./formParts";

const PROFILE_URL = "/api/admin/profile/";
const REQUEST_TIMEOUT_MS = 15000;

type LoadState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; exists: boolean; form: ProfileContent };

type Message = { kind: "status" | "alert"; text: string } | null;

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
};

const actionStyle: React.CSSProperties = { ...buttonStyle, alignSelf: "flex-start" };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.ok) return null;
  try {
    const body: unknown = await response.json();
    return isObject(body) ? body : null;
  } catch {
    return null;
  }
}

export default function ProfileEditor(): React.JSX.Element {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [errors, setErrors] = useState<ProfileErrors | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    async function initialLoad(): Promise<void> {
      let next: LoadState = { kind: "failed" };
      try {
        const response = await fetch(PROFILE_URL, {
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const body = await readBody(response);
        if (body !== null && "profile" in body) {
          const stored = body.profile;
          if (stored === null) {
            next = { kind: "ready", exists: false, form: emptyProfile() };
          } else if (isObject(stored)) {
            next = { kind: "ready", exists: true, form: profileFromData(stored) };
          }
        }
      } catch {
        next = { kind: "failed" };
      }
      if (!mounted.current) return;
      setLoad(next);
    }
    void initialLoad();
    return () => {
      mounted.current = false;
    };
  }, []);

  function update(patch: Partial<ProfileContent>): void {
    setLoad((cur) => (cur.kind === "ready" ? { ...cur, form: { ...cur.form, ...patch } } : cur));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (savingRef.current || load.kind !== "ready") return;
    const { form } = load;
    setErrors(null);
    setMessage(null);
    const result = checkProfile(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setMessage({ kind: "status", text: PROFILE_MESSAGES.saving });
    try {
      const response = await fetch(PROFILE_URL, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result.content),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await readBody(response);
      if (body === null || !isObject(body.profile)) throw new Error("save failed");
      const saved = profileFromData(body.profile);
      if (!mounted.current) return;
      setLoad({ kind: "ready", exists: true, form: saved });
      setMessage({ kind: "status", text: PROFILE_MESSAGES.saved });
    } catch {
      if (!mounted.current) return;
      setMessage({ kind: "alert", text: PROFILE_MESSAGES.notSaved });
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  let content: React.JSX.Element;
  if (load.kind === "loading") {
    content = (
      <p role="status" style={statusStyle}>
        {PROFILE_MESSAGES.loading}
      </p>
    );
  } else if (load.kind === "failed") {
    content = (
      <p role="alert" style={errorStyle}>
        {PROFILE_MESSAGES.loadFailed}
      </p>
    );
  } else {
    const { form } = load;
    const linkErrors = errors?.socialLinks ?? [];
    const fieldStyle: React.CSSProperties = { ...inputStyle, minWidth: 0 };
    const labelBox: React.CSSProperties = { ...labelStyle, minWidth: 0 };
    content = (
      <>
        {!load.exists && (
          <p role="status" style={statusStyle}>
            {PROFILE_MESSAGES.noProfile}
          </p>
        )}
        {message && (
          <p
            role={message.kind === "alert" ? "alert" : "status"}
            style={message.kind === "alert" ? errorStyle : statusStyle}
          >
            {message.text}
          </p>
        )}
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}
        >
          <label style={labelBox}>
            Name
            <input
              type="text"
              style={fieldStyle}
              value={form.name}
              disabled={saving}
              onChange={(e) => update({ name: e.target.value })}
              {...fieldProps("profile-name-error", errors?.name)}
            />
          </label>
          <FieldError id="profile-name-error" text={errors?.name} />

          <label style={labelBox}>
            Headline
            <input
              type="text"
              style={fieldStyle}
              value={form.headline}
              disabled={saving}
              onChange={(e) => update({ headline: e.target.value })}
              {...fieldProps("profile-headline-error", errors?.headline)}
            />
          </label>
          <FieldError id="profile-headline-error" text={errors?.headline} />

          <fieldset style={groupStyle}>
            <legend style={legendStyle}>About</legend>
            <ul aria-label="About paragraphs" style={listStyle}>
              {form.about.map((paragraph, i) => (
                <li key={i} style={rowStyle}>
                  <textarea
                    aria-label={`About paragraph ${i + 1}`}
                    style={{ ...textareaStyle, minWidth: 0 }}
                    value={paragraph}
                    disabled={saving}
                    onChange={(e) =>
                      update({ about: form.about.map((p, j) => (j === i ? e.target.value : p)) })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove paragraph ${i + 1}`}
                    style={actionStyle}
                    disabled={saving}
                    onClick={() => update({ about: form.about.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              style={actionStyle}
              disabled={saving}
              onClick={() => update({ about: [...form.about, ""] })}
            >
              Add paragraph
            </button>
          </fieldset>

          <fieldset style={groupStyle}>
            <legend style={legendStyle}>Photo</legend>
            <label style={labelBox}>
              Photo path
              <input
                type="text"
                style={fieldStyle}
                value={form.photo}
                disabled={saving}
                onChange={(e) => update({ photo: e.target.value })}
              />
            </label>
          </fieldset>

          <label style={labelBox}>
            Email
            <input
              type="text"
              style={fieldStyle}
              value={form.email}
              disabled={saving}
              onChange={(e) => update({ email: e.target.value })}
              {...fieldProps("profile-email-error", errors?.email)}
            />
          </label>
          <FieldError id="profile-email-error" text={errors?.email} />

          <label style={labelBox}>
            Resume link
            <input
              type="text"
              style={fieldStyle}
              value={form.resumeLink}
              disabled={saving}
              onChange={(e) => update({ resumeLink: e.target.value })}
              {...fieldProps("profile-resume-error", errors?.resumeLink)}
            />
          </label>
          <FieldError id="profile-resume-error" text={errors?.resumeLink} />

          <fieldset style={groupStyle}>
            <legend style={legendStyle}>Social links</legend>
            <ul aria-label="Social links" style={listStyle}>
              {form.socialLinks.map((link, i) => (
                <li key={i} style={rowStyle}>
                  <input
                    type="text"
                    aria-label={`Social link ${i + 1} label`}
                    style={fieldStyle}
                    value={link.label}
                    disabled={saving}
                    onChange={(e) =>
                      update({
                        socialLinks: form.socialLinks.map((l, j) =>
                          j === i ? { ...l, label: e.target.value } : l,
                        ),
                      })
                    }
                  />
                  <input
                    type="text"
                    aria-label={`Social link ${i + 1} address`}
                    style={fieldStyle}
                    value={link.url}
                    disabled={saving}
                    onChange={(e) =>
                      update({
                        socialLinks: form.socialLinks.map((l, j) =>
                          j === i ? { ...l, url: e.target.value } : l,
                        ),
                      })
                    }
                    {...fieldProps(`profile-link-${i}-error`, linkErrors[i])}
                  />
                  <FieldError id={`profile-link-${i}-error`} text={linkErrors[i]} />
                  <button
                    type="button"
                    aria-label={`Remove social link ${i + 1}`}
                    style={actionStyle}
                    disabled={saving}
                    onClick={() =>
                      update({ socialLinks: form.socialLinks.filter((_, j) => j !== i) })
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              style={actionStyle}
              disabled={saving}
              onClick={() => update({ socialLinks: [...form.socialLinks, { label: "", url: "" }] })}
            >
              Add social link
            </button>
          </fieldset>

          <button type="submit" style={actionStyle} disabled={saving}>
            Save
          </button>
        </form>
      </>
    );
  }

  return (
    <section
      aria-label="Profile editor"
      style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}
    >
      <h2 style={{ margin: 0, color: "var(--foreground)" }}>Profile</h2>
      {content}
    </section>
  );
}
