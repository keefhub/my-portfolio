"use client";

import {
  PROJECT_MESSAGES,
  checkProject,
  emptyProject,
  projectLabel,
  type ProjectContent,
} from "@/lib/admin/projects";
import { bottomPosition } from "@/lib/admin/list";
import { projectsStore } from "@/lib/firebase/projects";
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

type TextKey = "title" | "shortDesc" | "github" | "demo";

const TEXT_FIELDS: { key: TextKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "shortDesc", label: "Short description" },
  { key: "github", label: "GitHub link" },
  { key: "demo", label: "Demo link" },
];

const lineStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

function renderFields(props: ListFieldsProps<ProjectContent>): React.ReactNode {
  const { value, onChange, errors, disabled } = props;

  function setLine(key: "description" | "tech", index: number, text: string): void {
    onChange({ ...value, [key]: value[key].map((d, i) => (i === index ? text : d)) });
  }

  function removeLine(key: "description" | "tech", index: number): void {
    onChange({ ...value, [key]: value[key].filter((_, i) => i !== index) });
  }

  function addLine(key: "description" | "tech"): void {
    onChange({ ...value, [key]: [...value[key], ""] });
  }

  return (
    <>
      {TEXT_FIELDS.map((f) => {
        const errorId = `project-${f.key}-error`;
        const inputId = `project-${f.key}`;
        const error = f.key === "shortDesc" ? undefined : errors[f.key];
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
              {...fieldProps(errorId, error)}
            />
            <FieldError id={errorId} text={error} />
          </div>
        );
      })}
      <fieldset style={groupStyle}>
        <legend style={legendStyle}>Description paragraphs</legend>
        <ul aria-label="Paragraphs" style={listStyle}>
          {value.description.map((line, index) => (
            <li key={index} style={lineStyle}>
              <textarea
                aria-label={`Paragraph ${index + 1}`}
                style={{ ...textareaStyle, flex: "1 1 12rem", width: "auto", minWidth: 0 }}
                value={line}
                disabled={disabled}
                onChange={(e) => setLine("description", index, e.target.value)}
              />
              <button
                type="button"
                aria-label={`Remove paragraph ${index + 1}`}
                style={buttonStyle}
                disabled={disabled}
                onClick={() => removeLine("description", index)}
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
            onClick={() => addLine("description")}
          >
            Add paragraph
          </button>
        </div>
      </fieldset>
      <fieldset style={groupStyle}>
        <legend style={legendStyle}>Tech</legend>
        <ul aria-label="Tech names" style={listStyle}>
          {value.tech.map((line, index) => (
            <li key={index} style={lineStyle}>
              <input
                type="text"
                aria-label={`Tech name ${index + 1}`}
                style={{ ...inputStyle, flex: "1 1 12rem", width: "auto", minWidth: 0 }}
                value={line}
                disabled={disabled}
                onChange={(e) => setLine("tech", index, e.target.value)}
              />
              <button
                type="button"
                aria-label={`Remove tech name ${index + 1}`}
                style={buttonStyle}
                disabled={disabled}
                onClick={() => removeLine("tech", index)}
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
            onClick={() => addLine("tech")}
          >
            Add tech name
          </button>
        </div>
      </fieldset>
    </>
  );
}

export default function ProjectsEditor(props: { savingOn: boolean }): React.JSX.Element {
  return (
    <ListEditor<ProjectContent>
      heading="Projects"
      savingOn={props.savingOn}
      store={projectsStore}
      label={projectLabel}
      emptyContent={emptyProject}
      check={checkProject}
      renderFields={renderFields}
      emptyText={PROJECT_MESSAGES.emptyList}
      listLabel={PROJECT_MESSAGES.listLabel}
      newPosition={bottomPosition}
    />
  );
}
