import "server-only";

export const SCHEMA_STATEMENTS: readonly string[] = [
  "create table if not exists profile (id text primary key, data jsonb not null, updated_at timestamptz not null default now())",
  "alter table profile enable row level security",
];

export const READ_PROFILE_SQL: string = "select data from profile where id = $1";

export const WRITE_PROFILE_SQL: string =
  "insert into profile (id, data, updated_at) values ($1, $2::text::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()";
