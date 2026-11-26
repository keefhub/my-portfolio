"use client";

import { useEffect, useState } from "react";
import {
  TECH_MESSAGES,
  checkTechCategory,
  emptyTechCategory,
  itemErrorKey,
  moveTool,
  techDeleteText,
  techItemDeleteText,
  techItemLine,
  techLabel,
  type TechCategoryContent,
} from "@/lib/admin/techstack";
import { bottomPosition } from "@/lib/admin/list";
import { photoSelection } from "@/lib/admin/profile";
import type { ImageRecord } from "@/lib/admin/images";
import { techStore } from "@/lib/firebase/techstack";
import { listImages } from "@/lib/firebase/images";
import ListEditor, { type ListFieldsProps } from "./ListEditor";
import {
  FieldError,
  buttonStyle,
  errorStyle,
  fieldProps,
  groupStyle,
  inputStyle,
  labelStyle,
  legendStyle,
} from "./formParts";

type ImagesState = { images: ImageRecord[]; failed: boolean };

const rowStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

const lineStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--muted)",
  overflowWrap: "anywhere",
};

type FieldsProps = {
  fields: ListFieldsProps<TechCategoryContent>;
  images: ImageRecord[];
  failed: boolean;
};

function TechFields({ fields, images, failed }: FieldsProps): React.JSX.Element {
  const { value, onChange, errors, disabled, mode, saveNow } = fields;
  const [confirming, setConfirming] = useState<number | null>(null);
  const last = value.tools.length - 1;

  function setTools(tools: TechCategoryContent["tools"]): void {
    onChange({ ...value, tools });
  }

  function setItem(index: number, patch: Partial<TechCategoryContent["tools"][number]>): void {
    setTools(value.tools.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function move(index: number, direction: "up" | "down"): void {
    setConfirming(null);
    const next = moveTool(value.tools, index, direction);
    if (next !== null) setTools(next);
  }

  function confirmRemove(index: number): void {
    const next = { ...value, tools: value.tools.filter((_, i) => i !== index) };
    setConfirming(null);
    if (mode === "edit") saveNow(next);
    else onChange(next);
  }

  return (
    <>
      <div style={labelStyle}>
        <label htmlFor="tech-category">Category name</label>
        <input
          id="tech-category"
          type="text"
          style={inputStyle}
          value={value.category}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, category: e.target.value })}
          {...fieldProps("tech-category-error", errors.category)}
        />
        <FieldError id="tech-category-error" text={errors.category} />
      </div>
      <fieldset style={groupStyle}>
        <legend style={legendStyle}>Items</legend>
        {failed && (
          <p role="alert" style={errorStyle}>
            {TECH_MESSAGES.imagesFailed}
          </p>
        )}
        {value.tools.map((item, i) => {
          const n = i + 1;
          const selection = photoSelection(item.icon, images);
          const nameId = `tech-item-${i}-name`;
          const imageId = `tech-item-${i}-image`;
          const pathId = `tech-item-${i}-icon`;
          const nameKey = itemErrorKey(i, "name");
          const iconKey = itemErrorKey(i, "icon");
          return (
            <fieldset key={i} style={groupStyle}>
              <legend style={legendStyle}>{`Item ${n}`}</legend>
              <div style={labelStyle}>
                <label htmlFor={nameId}>{`Item ${n} name`}</label>
                <input
                  id={nameId}
                  type="text"
                  style={inputStyle}
                  value={item.name}
                  disabled={disabled}
                  onChange={(e) => setItem(i, { name: e.target.value })}
                  {...fieldProps(`${nameId}-error`, errors[nameKey])}
                />
                <FieldError id={`${nameId}-error`} text={errors[nameKey]} />
              </div>
              <div style={labelStyle}>
                <label htmlFor={imageId}>{`Item ${n} uploaded image`}</label>
                <select
                  id={imageId}
                  style={inputStyle}
                  value={selection.imageId}
                  disabled={disabled}
                  onChange={(e) => {
                    const picked = images.find((img) => img.id === e.target.value);
                    setItem(i, { icon: picked ? picked.url : "" });
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
                <label htmlFor={pathId}>{`Item ${n} icon path`}</label>
                <input
                  id={pathId}
                  type="text"
                  style={inputStyle}
                  value={selection.path}
                  disabled={disabled}
                  onChange={(e) => setItem(i, { icon: e.target.value })}
                  {...fieldProps(`${pathId}-error`, errors[iconKey])}
                />
                <FieldError id={`${pathId}-error`} text={errors[iconKey]} />
              </div>
              <div style={rowStyle}>
                {i > 0 && (
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={disabled}
                    onClick={() => move(i, "up")}
                  >
                    Move up
                  </button>
                )}
                {i < last && (
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={disabled}
                    onClick={() => move(i, "down")}
                  >
                    Move down
                  </button>
                )}
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={disabled}
                  onClick={() => setConfirming(i)}
                >
                  Delete
                </button>
              </div>
              {confirming === i && (
                <div
                  role="group"
                  aria-label="Confirm item delete"
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <p style={{ ...lineStyle, color: "var(--foreground)" }}>
                    {techItemDeleteText(item.name, i)}
                  </p>
                  <div style={rowStyle}>
                    <button
                      type="button"
                      style={buttonStyle}
                      disabled={disabled}
                      onClick={() => confirmRemove(i)}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      style={buttonStyle}
                      disabled={disabled}
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </fieldset>
          );
        })}
        <div style={rowStyle}>
          <button
            type="button"
            style={buttonStyle}
            disabled={disabled}
            onClick={() => {
              setConfirming(null);
              setTools([...value.tools, { name: "", icon: "" }]);
            }}
          >
            Add item
          </button>
        </div>
      </fieldset>
    </>
  );
}

export default function TechStackEditor(props: { savingOn: boolean }): React.JSX.Element {
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

  return (
    <ListEditor<TechCategoryContent>
      heading="Tech stack"
      savingOn={props.savingOn}
      store={techStore}
      label={techLabel}
      emptyContent={emptyTechCategory}
      check={(draft) =>
        checkTechCategory(
          draft,
          images.map((i) => i.url),
        )
      }
      renderFields={(fields) => <TechFields fields={fields} images={images} failed={failed} />}
      emptyText={TECH_MESSAGES.emptyList}
      listLabel={TECH_MESSAGES.listLabel}
      addLabel={TECH_MESSAGES.addLabel}
      newPosition={bottomPosition}
      deleteText={techDeleteText}
      rowDetails={(content) => (
        <div role="group" aria-label={`Items of ${content.category}`}>
          {content.tools.length === 0 ? (
            <p style={lineStyle}>{TECH_MESSAGES.noItems}</p>
          ) : (
            content.tools.map((item, i) => (
              <p key={i} style={lineStyle}>
                {techItemLine(item, images)}
              </p>
            ))
          )}
        </div>
      )}
    />
  );
}
