-- The shared printer list (printer search on the final screen). Safe to run
-- more than once, after the earlier files.
create table if not exists printers (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table printers enable row level security;
revoke all on table printers from anon, authenticated;
grant select, insert, update, delete on table printers to service_role;
