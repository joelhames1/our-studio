-- The activity log and per-person rate limits. Safe to run more than once,
-- after the earlier files. Until it's run the app still works: nothing is
-- logged and nobody is limited, and Setup says this file is missing.

-- Who approved, reopened, archived, renamed or deleted what, and when. Kept
-- after a project is deleted, so the record of deleting it survives.
create table if not exists activity (
  id text primary key,
  at timestamptz not null default now(),
  project_id text,
  data jsonb not null
);
create index if not exists activity_at_idx on activity (at desc);
create index if not exists activity_project_idx on activity (project_id, at desc);

-- One counter per person, kind of request and time window.
create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  expires_at timestamptz not null
);

-- Counts one request and returns the count so far in its window, in one step,
-- so two requests at the same moment can't both slip under the limit. Now and
-- then it clears out windows that have ended.
create or replace function rate_hit(p_key text, p_expires timestamptz)
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  insert into rate_limits as r (key, count, expires_at)
  values (p_key, 1, p_expires)
  on conflict (key) do update set count = r.count + 1
  returning r.count into n;
  if random() < 0.02 then
    delete from rate_limits where expires_at < now();
  end if;
  return n;
end;
$$;

-- Only the server (secret key) can read or write these, as with every other table.
alter table activity enable row level security;
alter table rate_limits enable row level security;
revoke all on table activity, rate_limits from anon, authenticated;
grant select, insert, update, delete on table activity, rate_limits to service_role;
revoke all on function rate_hit(text, timestamptz) from public, anon, authenticated;
grant execute on function rate_hit(text, timestamptz) to service_role;
