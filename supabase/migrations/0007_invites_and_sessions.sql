-- Invites and signed-in browsers. Safe to run more than once, after the
-- earlier files. Until it's run, inviting people and the list of your devices
-- say they need this step; everything else carries on as before.

-- A way in, sent as a link. The id is a hash of the secret in the link; the
-- secret itself is never stored. used_at is set once, by whoever gets in first.
create table if not exists invites (
  id text primary key,
  household_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists invites_household_idx on invites (household_id);

-- One row per signed-in browser, so you can see where you're signed in and
-- sign any of them out. Holds a short device name ("iPhone · Safari"), never
-- the browser's full description or an IP address.
create table if not exists sessions (
  id text primary key,
  person_id text not null,
  last_seen_at timestamptz not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_person_idx on sessions (person_id);

-- Only the server (secret key) can read or write these, as with every other table.
alter table invites enable row level security;
alter table sessions enable row level security;
revoke all on table invites, sessions from anon, authenticated;
grant select, insert, update, delete on table invites, sessions to service_role;
