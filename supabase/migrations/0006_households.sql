-- People, households and who belongs to which. Safe to run more than once,
-- after the earlier files. Until it's run the app carries on as before: Joel
-- and Erin are worked out from ERIN_GOOGLE_EMAIL and JOEL_GOOGLE_EMAIL. The
-- first time the app finds these tables empty, it adds the two of them as
-- the first household, Joel as its owner.

create table if not exists people (
  id text primary key,
  -- The address Google sign-in and email codes match, lowercase. One person per address.
  email text unique,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists households (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  household_id text not null,
  person_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (household_id, person_id)
);
create index if not exists memberships_person_idx on memberships (person_id);

-- Everything made before households belongs to the first one.
update projects set data = jsonb_set(data, '{householdId}', '"first"') where data->>'householdId' is null;
update activity set data = jsonb_set(data, '{householdId}', '"first"') where data->>'householdId' is null;

-- Only the server (secret key) can read or write these, as with every other table.
alter table people enable row level security;
alter table households enable row level security;
alter table memberships enable row level security;
revoke all on table people, households, memberships from anon, authenticated;
grant select, insert, update, delete on table people, households, memberships to service_role;
