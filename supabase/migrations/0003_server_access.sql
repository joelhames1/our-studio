-- Makes sure the app's server can use its tables. Safe to run more than once.
--
-- Supabase usually grants new tables to its built-in roles automatically, but
-- projects with "automatically expose new tables" switched off don't. The app
-- signs in with the secret (service_role) key, so that's the only role that
-- needs anything; the public roles stay locked out (see 0002).
grant usage on schema public to service_role;
grant select, insert, update, delete on table projects, options, reactions, decisions, spend to service_role;
