"use client";

import { useEffect, useState } from "react";
import {
  BLOG_MESSAGES,
  blogPostLabel,
  blogPostLines,
  checkBlogPost,
  emptyBlogPost,
  sortBlogPosts,
  type BlogPostContent,
  type BlogStatus,
} from "@/lib/admin/blogposts";
import { photoSelection } from "@/lib/admin/profile";
import type { ImageRecord } from "@/lib/admin/images";
import { SlugTakenError, blogPostsStore } from "@/lib/firebase/blogposts";
import { listImages } from "@/lib/firebase/images";
import ListEditor, { type ListFieldsProps } from "./ListEditor";
import {
  FieldError,
  errorStyle,
  fieldProps,
  groupStyle,
  inputStyle,
  labelStyle,
  legendStyle,
  textareaStyle,
} from "./formParts";

type ImagesState = { images: ImageRecord[]; failed: boolean };

function rowDetails(content: BlogPostContent): React.ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {blogPostLines(content).map((line) => (
        <p
          key={line}
          style={{ margin: 0, color: "var(--muted)", overflowWrap: "anywhere" }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function newPosition(): number {
  return 0;
}

function saveFailure(error: unknown): string | null {
  return error instanceof SlugTakenError ? BLOG_MESSAGES.slugTaken : null;
}

export default function BlogPostsEditor(props: { savingOn: boolean }): React.JSX.Element {
  const [loaded, setLoaded] = useState<ImagesState>({ images: [], failed: false });

  useEffect(() => {
    let mounted = true;
    async function loadImages(): Promise<void> {
      let next: ImagesState;
      try {
        next = { images: await listImages(), failed: false };
      } catch {
        next = { images: [], failed: true };
      }
      if (!mounted) return;
      setLoaded(next);
    }
    void loadImages();
    return () => {
      mounted = false;
    };
  }, []);

  const { images, failed } = loaded;

  function renderFields(fields: ListFieldsProps<BlogPostContent>): React.ReactNode {
    const { value, onChange, errors, disabled, mode } = fields;
    const selection = photoSelection(value.coverImage, images);
    return (
      <>
        <div style={labelStyle}>
          <label htmlFor="blog-title">Title</label>
          <input
            id="blog-title"
            type="text"
            style={inputStyle}
            value={value.title}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            {...fieldProps("blog-title-error", errors.title)}
          />
          <FieldError id="blog-title-error" text={errors.title} />
        </div>
        <div style={labelStyle}>
          <label htmlFor="blog-excerpt">Excerpt</label>
          <textarea
            id="blog-excerpt"
            style={textareaStyle}
            value={value.excerpt}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, excerpt: e.target.value })}
            {...fieldProps("blog-excerpt-error", errors.excerpt)}
          />
          <FieldError id="blog-excerpt-error" text={errors.excerpt} />
        </div>
        <div style={labelStyle}>
          <label htmlFor="blog-date">Date</label>
          <input
            id="blog-date"
            type="text"
            placeholder="YYYY-MM-DD"
            style={inputStyle}
            value={value.date}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            {...fieldProps("blog-date-error", errors.date)}
          />
          <FieldError id="blog-date-error" text={errors.date} />
        </div>
        <div style={labelStyle}>
          <label htmlFor="blog-slug">Slug</label>
          <input
            id="blog-slug"
            type="text"
            style={inputStyle}
            value={value.slug}
            readOnly={mode === "edit"}
            disabled={disabled && mode !== "edit"}
            onChange={(e) => onChange({ ...value, slug: e.target.value })}
            {...fieldProps("blog-slug-error", errors.slug)}
          />
          <FieldError id="blog-slug-error" text={errors.slug} />
          {mode === "edit" && (
            <p style={{ margin: 0, color: "var(--muted)" }}>{BLOG_MESSAGES.slugFixed}</p>
          )}
        </div>
        <div style={labelStyle}>
          <label htmlFor="blog-tags">Tags</label>
          <input
            id="blog-tags"
            type="text"
            style={inputStyle}
            value={value.tags}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, tags: e.target.value })}
          />
        </div>
        <fieldset style={groupStyle}>
          <legend style={legendStyle}>Cover image</legend>
          {failed && (
            <p role="alert" style={errorStyle}>
              {BLOG_MESSAGES.imagesFailed}
            </p>
          )}
          <div style={labelStyle}>
            <label htmlFor="blog-cover-uploaded">Uploaded image</label>
            <select
              id="blog-cover-uploaded"
              style={inputStyle}
              value={selection.imageId}
              disabled={disabled}
              onChange={(e) => {
                const picked = images.find((i) => i.id === e.target.value);
                onChange({ ...value, coverImage: picked ? picked.url : "" });
              }}
            >
              <option value="">None</option>
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.name}
                </option>
              ))}
            </select>
          </div>
          <div style={labelStyle}>
            <label htmlFor="blog-cover-path">Cover image path</label>
            <input
              id="blog-cover-path"
              type="text"
              style={inputStyle}
              value={selection.path}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, coverImage: e.target.value })}
            />
          </div>
        </fieldset>
        <div style={labelStyle}>
          <label htmlFor="blog-cover-alt">Cover alt text</label>
          <input
            id="blog-cover-alt"
            type="text"
            style={inputStyle}
            value={value.coverAlt}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, coverAlt: e.target.value })}
          />
        </div>
        <div style={labelStyle}>
          <label htmlFor="blog-body">Body</label>
          <textarea
            id="blog-body"
            style={{ ...textareaStyle, minHeight: 240, resize: "vertical" }}
            value={value.body}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, body: e.target.value })}
            {...fieldProps("blog-body-error", errors.body)}
          />
          <FieldError id="blog-body-error" text={errors.body} />
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 44,
            color: "var(--foreground)",
          }}
        >
          <input
            type="checkbox"
            checked={value.featured}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, featured: e.target.checked })}
          />
          Featured
        </label>
        <div style={labelStyle}>
          <label htmlFor="blog-status">Status</label>
          <select
            id="blog-status"
            style={inputStyle}
            value={value.status}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, status: e.target.value as BlogStatus })}
          >
            <option value="Draft">Draft</option>
            <option value="Published">Published</option>
          </select>
        </div>
      </>
    );
  }

  return (
    <ListEditor<BlogPostContent>
      heading="Blog posts"
      savingOn={props.savingOn}
      store={blogPostsStore}
      label={blogPostLabel}
      emptyContent={emptyBlogPost}
      check={checkBlogPost}
      renderFields={renderFields}
      emptyText={BLOG_MESSAGES.emptyList}
      listLabel={BLOG_MESSAGES.listLabel}
      addLabel={BLOG_MESSAGES.addLabel}
      newPosition={newPosition}
      rowDetails={rowDetails}
      movable={false}
      order={sortBlogPosts}
      saveFailure={saveFailure}
    />
  );
}
