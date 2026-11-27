"use client";

import {
  emptyExperience,
  checkExperience,
  experienceFromData,
  experienceLabel,
  experienceToData,
  type ExperienceContent,
} from "@/lib/admin/experience";
import { createHttpListStore } from "@/lib/admin/listClient";
import ListEditor, { type ListFieldsProps } from "./ListEditor";
import {
  FieldError,
  buttonStyle,
  fieldProps,
  groupStyle,
  inputStyle,
  labelStyle,
  legendStyle,
  listStyle,
  textareaStyle,
} from "./formParts";

const store = createHttpListStore<ExperienceContent>(
  "/api/admin/experience/",
  experienceFromData,
  experienceToData,
);

type TextKey = "year" | "title" | "company" | "duration";

const TEXT_FIELDS: { key: TextKey; label: string }[] = [
  { key: "year", label: "Year" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "duration", label: "Duration" },
];

function renderFields(props: ListFieldsProps<ExperienceContent>): React.ReactNode {
  const { value, onChange, errors, disabled } = props;

  function setDetail(index: number, text: string): void {
    onChange({ ...value, details: value.details.map((d, i) => (i === index ? text : d)) });
  }

  return (
    <>
      {TEXT_FIELDS.map((f) => {
        const errorId = `experience-${f.key}-error`;
        const inputId = `experience-${f.key}`;
        return (
          <div key={f.key} style={labelStyle}>
            <label htmlFor={inputId}>{f.label}</label>
            <input
              id={inputId}
              type="text"
              style={inputStyle}
              value={value[f.key]}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              {...fieldProps(errorId, errors[f.key])}
            />
            <FieldError id={errorId} text={errors[f.key]} />
          </div>
        );
      })}
      <div style={labelStyle}>
        <label htmlFor="experience-description">Description</label>
        <textarea
          id="experience-description"
          style={textareaStyle}
          value={value.description}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          {...fieldProps("experience-description-error", errors.description)}
        />
        <FieldError id="experience-description-error" text={errors.description} />
      </div>
      <fieldset style={groupStyle}>
        <legend style={legendStyle}>Details</legend>
        <ul aria-label="Detail lines" style={listStyle}>
          {value.details.map((line, index) => (
            <li
              key={index}
              style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
            >
              <input
                type="text"
                aria-label={`Detail line ${index + 1}`}
                style={{ ...inputStyle, flex: "1 1 12rem", width: "auto", minWidth: 0 }}
                value={line}
                disabled={disabled}
                onChange={(e) => setDetail(index, e.target.value)}
              />
              <button
                type="button"
                aria-label={`Remove detail line ${index + 1}`}
                style={buttonStyle}
                disabled={disabled}
                onClick={() =>
                  onChange({ ...value, details: value.details.filter((_, i) => i !== index) })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div>
          <button
            type="button"
            style={buttonStyle}
            disabled={disabled}
            onClick={() => onChange({ ...value, details: [...value.details, ""] })}
          >
            Add detail line
          </button>
        </div>
      </fieldset>
    </>
  );
}

export default function ExperienceEditor(): React.JSX.Element {
  return (
    <ListEditor<ExperienceContent>
      heading="Experience"
      store={store}
      label={experienceLabel}
      emptyContent={emptyExperience}
      check={checkExperience}
      renderFields={renderFields}
    />
  );
}
