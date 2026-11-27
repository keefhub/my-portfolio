import "server-only";

export const IMAGE_SCHEMA_STATEMENTS: readonly string[] = [
  "create table if not exists images (seq bigint generated always as identity, id text primary key, name text not null, content_type text not null, size integer not null, created_at timestamptz not null default now())",
  "alter table images enable row level security",
];

export const LIST_IMAGES_SQL = "select id, name, content_type, size from images order by seq desc";

export const IMAGE_EXISTS_SQL = "select id from images where id = $1";

export const INSERT_IMAGE_SQL =
  "insert into images (id, name, content_type, size) values ($1, $2, $3, $4) on conflict (id) do nothing";

export const DELETE_IMAGE_SQL = "delete from images where id = $1 returning id";
