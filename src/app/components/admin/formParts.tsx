export const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  background: "var(--surface-alt)",
  border: "1px solid var(--border-strong)",
  color: "var(--foreground)",
  borderRadius: "var(--radius-md)",
  padding: "0 16px",
  cursor: "pointer",
};

export const inputStyle: React.CSSProperties = {
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

export const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 88 };

export const labelStyle: React.CSSProperties = {
  color: "var(--foreground)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  overflowWrap: "anywhere",
};

export const errorStyle: React.CSSProperties = {
  color: "var(--accent-rose)",
  margin: 0,
  overflowWrap: "anywhere",
};

export const statusStyle: React.CSSProperties = {
  color: "var(--muted)",
  margin: 0,
  overflowWrap: "anywhere",
};

export const groupStyle: React.CSSProperties = {
  border: "none",
  margin: 0,
  padding: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export const legendStyle: React.CSSProperties = {
  color: "var(--foreground)",
  padding: 0,
  marginBottom: 8,
};

export const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export function FieldError(props: { id: string; text: string | undefined }): React.JSX.Element | null {
  if (!props.text) return null;
  return (
    <p role="alert" id={props.id} style={errorStyle}>
      {props.text}
    </p>
  );
}

export function fieldProps(
  id: string,
  text: string | undefined,
): { "aria-describedby"?: string; "aria-invalid"?: true } {
  if (!text) return {};
  return { "aria-describedby": id, "aria-invalid": true };
}
