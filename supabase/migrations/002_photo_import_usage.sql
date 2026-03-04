-- Photo import usage: 5 free per month per user (or per anon id). Server uses service role to update.
create table if not exists public.photo_import_usage (
  identifier text not null,
  month text not null,
  count int not null default 0,
  primary key (identifier, month)
);

alter table public.photo_import_usage enable row level security;

-- No policies: only service role (used by API) can read/write. Anon and authenticated cannot access.
