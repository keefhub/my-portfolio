"use client";

import { useEffect, useRef, useState } from "react";
import {
  PROFILE_MESSAGES,
  checkProfile,
  emptyProfile,
  photoSelection,
  type ProfileContent,
  type ProfileErrors,
  type SocialLink,
} from "@/lib/admin/profile";
import type { ImageRecord } from "@/lib/admin/images";
import { listImages } from "@/lib/firebase/images";
import { loadProfile, saveProfile } from "@/lib/firebase/profile";

type FormState = {
  name: string;
  headline: string;
  about: string[];
  imageId: string;
  path: string;
  email: string;
  resumeLink: string;
  socialLinks: SocialLink[];
};

type Loaded = {
  kind: "ready";
  exists: boolean;
  images: ImageRecord[];
  imagesFailed: boolean;
  form: FormState;
};

type LoadState = { kind: "loading" } | { kind: "failed" } | Loaded;

type Message = { kind: "status" | "alert"; text: string } | null;

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  background: "var(--surface-alt)",
  border: "1px solid var(--border-strong)",
  color: "var(--foreground)",
  borderRadius: "var(--radius-md)",
  padding: "0 16px",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 44,
  background: "var(--surface-alt)",
  color: "var(--foreground)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  padding: "8px 12px",
  font: "inherit",
  overflowWrap: "anywhere",
};

const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 88 };

const labelStyle: React.CSSProperties = {
  color: "var(--foreground)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  overflowWrap: "anywhere",
};

const errorStyle: React.CSSProperties = {
  color: "var(--accent-rose)",
  margin: 0,
  overflowWrap: "anywhere",
};

const statusStyle: React.CSSProperties = {
  color: "var(--muted)",
  margin: 0,
  overflowWrap: "anywhere",
};

const groupStyle: React.CSSProperties = {
  border: "none",
  margin: 0,
  padding: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const legendStyle: React.CSSProperties = {
  color: "var(--foreground)",
  padding: 0,
  marginBottom: 8,
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

function toForm(content: ProfileContent, images: readonly ImageRecord[]): FormState {
  const sel = photoSelection(content.photo, images);
  return {
    name: content.name,
    headline: content.headline,
    about: content.about,
    imageId: sel.imageId,
    path: sel.path,
    email: content.email,
    resumeLink: content.resumeLink,
    socialLinks: content.socialLinks,
  };
}

function FieldError({ id, text }: { id: string; text: string | undefined }): React.JSX.Element | null {
  if (!text) return null;
  return (
    <p role="alert" id={id} style={errorStyle}>
      {text}
    </p>
  );
}

export default function ProfileEditor(props: { savingOn: boolean }): React.JSX.Element {
  const { savingOn } = props;
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [errors, setErrors] = useState<ProfileErrors | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    async function initialLoad(): Promise<void> {
      let next: LoadState;
      const [profileResult, imagesResult] = await Promise.allSettled([loadProfile(), listImages()]);
      if (profileResult.status === "rejected") {
        next = { kind: "failed" };
      } else {
        const images = imagesResult.status === "fulfilled" ? imagesResult.value : [];
        const stored = profileResult.value;
        next = {
          kind: "ready",
          exists: stored !== null,
          images,
          imagesFailed: imagesResult.status === "rejected",
          form: toForm(stored ?? emptyProfile(), images),
        };
      }
      if (!mounted.current) return;
      setLoad(next);
    }
    void initialLoad();
    return () => {
      mounted.current = false;
    };
  }, []);

  function update(patch: Partial<FormState>): void {
    setLoad((cur) => (cur.kind === "ready" ? { ...cur, form: { ...cur.form, ...patch } } : cur));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (savingRef.current || load.kind !== "ready") return;
    const { form, images } = load;
    setErrors(null);
    setMessage(null);
    const picked = images.find((i) => i.id === form.imageId);
    const photo = picked ? picked.url : form.path;
    const result = checkProfile({
      name: form.name,
      headline: form.headline,
      about: form.about,
      photo,
      email: form.email,
      resumeLink: form.resumeLink,
      socialLinks: form.socialLinks,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setMessage({ kind: "status", text: PROFILE_MESSAGES.saving });
    try {
      await saveProfile(result.content);
      if (!mounted.current) return;
      setLoad((cur) =>
        cur.kind === "ready"
          ? { ...cur, exists: true, form: toForm(result.content, cur.images) }
          : cur,
      );
      setMessage({ kind: "status", text: PROFILE_MESSAGES.saved });
    } catch {
      if (!mounted.current) return;
      setMessage({
        kind: "alert",
        text: savingOn ? PROFILE_MESSAGES.notSaved : PROFILE_MESSAGES.notSavedOff,
      });
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
    const { form, images } = load;
    const linkErrors = errors?.socialLinks ?? [];
    const describe = (id: string, text: string | undefined): React.HTMLAttributes<HTMLElement> & {
      "aria-invalid"?: true;
    } => (text ? { "aria-describedby": id, "aria-invalid": true } : {});
    content = (
      <>
        {!load.exists && (
          <p role="status" style={statusStyle}>
            {PROFILE_MESSAGES.noProfile}
          </p>
        )}
        {load.imagesFailed && (
          <p role="alert" style={errorStyle}>
            {PROFILE_MESSAGES.imagesFailed}
          </p>
        )}
        {message && (
          <p role={message.kind === "alert" ? "alert" : "status"} style={message.kind === "alert" ? errorStyle : statusStyle}>
            {message.text}
          </p>
        )}
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <label style={labelStyle}>
            Name
            <input
              type="text"
              style={inputStyle}
              value={form.name}
              disabled={saving}
              onChange={(e) => update({ name: e.target.value })}
              {...describe("profile-name-error", errors?.name)}
            />
          </label>
          <FieldError id="profile-name-error" text={errors?.name} />

          <label style={labelStyle}>
            Headline
            <input
              type="text"
              style={inputStyle}
              value={form.headline}
              disabled={saving}
              onChange={(e) => update({ headline: e.target.value })}
              {...describe("profile-headline-error", errors?.headline)}
            />
          </label>
          <FieldError id="profile-headline-error" text={errors?.headline} />

          <fieldset style={groupStyle}>
            <legend style={legendStyle}>About</legend>
            <ul aria-label="About paragraphs" style={listStyle}>
              {form.about.map((paragraph, i) => (
                <li key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    aria-label={`About paragraph ${i + 1}`}
                    style={textareaStyle}
                    value={paragraph}
                    disabled={saving}
                    onChange={(e) =>
                      update({ about: form.about.map((p, j) => (j === i ? e.target.value : p)) })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove paragraph ${i + 1}`}
                    style={{ ...buttonStyle, alignSelf: "flex-start" }}
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
              style={{ ...buttonStyle, alignSelf: "flex-start" }}
              disabled={saving}
              onClick={() => update({ about: [...form.about, ""] })}
            >
              Add paragraph
            </button>
          </fieldset>

          <fieldset style={groupStyle}>
            <legend style={legendStyle}>Photo</legend>
            <div style={labelStyle}>
              <label htmlFor="profile-uploaded-image">Uploaded image</label>
              <select
                id="profile-uploaded-image"
                style={inputStyle}
                value={form.imageId}
                disabled={saving}
                onChange={(e) => update({ imageId: e.target.value, path: "" })}
              >
                <option value="">None</option>
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name}
                  </option>
                ))}
              </select>
            </div>
            <label style={labelStyle}>
              Photo path
              <input
                type="text"
                style={inputStyle}
                value={form.path}
                disabled={saving}
                onChange={(e) => update({ path: e.target.value, imageId: "" })}
              />
            </label>
          </fieldset>

          <label style={labelStyle}>
            Email
            <input
              type="text"
              style={inputStyle}
              value={form.email}
              disabled={saving}
              onChange={(e) => update({ email: e.target.value })}
              {...describe("profile-email-error", errors?.email)}
            />
          </label>
          <FieldError id="profile-email-error" text={errors?.email} />

          <label style={labelStyle}>
            Resume link
            <input
              type="text"
              style={inputStyle}
              value={form.resumeLink}
              disabled={saving}
              onChange={(e) => update({ resumeLink: e.target.value })}
              {...describe("profile-resume-error", errors?.resumeLink)}
            />
          </label>
          <FieldError id="profile-resume-error" text={errors?.resumeLink} />

          <fieldset style={groupStyle}>
            <legend style={legendStyle}>Social links</legend>
            <ul aria-label="Social links" style={listStyle}>
              {form.socialLinks.map((link, i) => (
                <li key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    type="text"
                    aria-label={`Social link ${i + 1} label`}
                    style={inputStyle}
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
                    style={inputStyle}
                    value={link.url}
                    disabled={saving}
                    onChange={(e) =>
                      update({
                        socialLinks: form.socialLinks.map((l, j) =>
                          j === i ? { ...l, url: e.target.value } : l,
                        ),
                      })
                    }
                    {...describe(`profile-link-${i}-error`, linkErrors[i])}
                  />
                  <FieldError id={`profile-link-${i}-error`} text={linkErrors[i]} />
                  <button
                    type="button"
                    aria-label={`Remove social link ${i + 1}`}
                    style={{ ...buttonStyle, alignSelf: "flex-start" }}
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
              style={{ ...buttonStyle, alignSelf: "flex-start" }}
              disabled={saving}
              onClick={() => update({ socialLinks: [...form.socialLinks, { label: "", url: "" }] })}
            >
              Add social link
            </button>
          </fieldset>

          <button
            type="submit"
            style={{ ...buttonStyle, alignSelf: "flex-start" }}
            disabled={saving}
          >
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
