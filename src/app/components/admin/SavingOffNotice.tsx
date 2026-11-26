import { OWNER_UID_PLACEHOLDER } from "@/lib/admin/owner";

const paragraphStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--foreground)",
  overflowWrap: "anywhere",
};

export default function SavingOffNotice(): React.JSX.Element {
  return (
    <section
      aria-label="Saving status"
      style={{
        background: "var(--surface-alt)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxSizing: "border-box",
        overflowWrap: "anywhere",
      }}
    >
      <p style={paragraphStyle}>Saving is not switched on yet.</p>
      <p style={{ ...paragraphStyle, color: "var(--muted)" }}>
        You can look around, but nothing you change will be saved until your account is set up.
      </p>
      <p style={paragraphStyle}>To switch saving on:</p>
      <ol
        aria-label="How to switch saving on"
        style={{ ...paragraphStyle, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}
      >
        <li>In src/lib/admin/owner.ts, set OWNER_UID to your user ID, in quotes.</li>
        <li>
          {`In firestore.rules and storage.rules, replace ${OWNER_UID_PLACEHOLDER} with your user ID, keeping the quotes.`}
        </li>
        <li>Merge the change to master. The live deploy then publishes the database and file storage rules.</li>
      </ol>
    </section>
  );
}
