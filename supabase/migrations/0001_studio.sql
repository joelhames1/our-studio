-- Our Studio: one-time database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once.

create table if not exists projects (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists options (
  id text primary key,
  project_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists options_project_idx on options (project_id);

create table if not exists reactions (
  option_id text not null,
  user_id text not null,
  project_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index if not exists reactions_project_idx on reactions (project_id);

create table if not exists decisions (
  id text primary key,
  project_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists spend (
  id text primary key,
  at timestamptz not null default now(),
  usd numeric not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists spend_at_idx on spend (at);

-- Lock everything down: only the server (service-role key) can read or write.
alter table projects enable row level security;
alter table options enable row level security;
alter table reactions enable row level security;
alter table decisions enable row level security;
alter table spend enable row level security;
