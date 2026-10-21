-- Extra locks. Safe to run more than once, and after 0001_studio.sql.

-- Only the server (with the secret key) ever touches these tables. Row level
-- security already blocks the public roles; this removes their table rights too.
revoke all on table projects, options, reactions, decisions, spend from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- The file bucket exists and is private: files are only reachable through
-- short-lived signed links the app hands out after checking who's asking.
insert into storage.buckets (id, name, public)
values ('studio', 'studio', false)
on conflict (id) do update set public = false;
