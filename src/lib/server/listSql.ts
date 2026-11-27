import "server-only";

export type ListTable = "experience" | "projects";

export const LIST_TABLES: readonly ListTable[] = ["experience", "projects"];

function known(table: ListTable): ListTable {
  if (!LIST_TABLES.includes(table)) throw new Error("Unknown list table.");
  return table;
}

export function listSchemaStatements(table: ListTable): readonly string[] {
  known(table);
  return [
    `create table if not exists ${table} (seq bigint generated always as identity, id text primary key, position integer not null, data jsonb not null, updated_at timestamptz not null default now())`,
    `alter table ${table} enable row level security`,
  ];
}

export function listReadSql(table: ListTable): string {
  known(table);
  return `select id, position, data from ${table} order by position, seq`;
}

export function listInsertSql(table: ListTable): string {
  known(table);
  return `insert into ${table} (id, position, data) values ($1, $2, $3::text::jsonb) returning id`;
}

export function listUpdateSql(table: ListTable): string {
  known(table);
  return `update ${table} set data = $2::text::jsonb, updated_at = now() where id = $1 returning id`;
}

export function listDeleteSql(table: ListTable): string {
  known(table);
  return `delete from ${table} where id = $1 returning id`;
}

export function listReorderSql(table: ListTable): string {
  known(table);
  return `with wanted as (select id, position from jsonb_to_recordset($1::text::jsonb) as w(id text, position integer)) update ${table} e set position = wanted.position, updated_at = now() from wanted where e.id = wanted.id and (select count(*) from ${table} x join wanted w on w.id = x.id) = (select count(*) from wanted) returning e.id`;
}
