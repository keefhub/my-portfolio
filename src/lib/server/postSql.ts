import "server-only";

export const POST_SCHEMA_STATEMENTS: readonly string[] = [
  `create table if not exists blog_posts (slug text primary key, status text not null check (status in ('draft', 'published')), data jsonb not null, updated_at timestamptz not null default now())`,
  `alter table blog_posts enable row level security`,
];

export const POST_READ_ALL_SQL = `select slug, status, data from blog_posts order by slug`;

export const POST_READ_PUBLISHED_SQL = `select slug, status, data from blog_posts where status = 'published' order by slug`;

export const POST_READ_ONE_SQL = `select slug, status, data from blog_posts where slug = $1`;

export const POST_READ_ONE_PUBLISHED_SQL = `select slug, status, data from blog_posts where slug = $1 and status = 'published'`;

export const POST_INSERT_SQL = `insert into blog_posts (slug, status, data) values ($1, $2, $3::text::jsonb) on conflict (slug) do nothing returning slug`;

export const POST_UPDATE_SQL = `update blog_posts set status = $2, data = $3::text::jsonb, updated_at = now() where slug = $1 returning slug`;

export const POST_DELETE_SQL = `delete from blog_posts where slug = $1 returning slug`;
