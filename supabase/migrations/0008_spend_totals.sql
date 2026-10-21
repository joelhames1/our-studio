-- 0008: the month's AI spending, added up in the database.
--
-- The budget check used to fetch the month's spending entries and add them up
-- in the app. Supabase sends at most 1,000 rows per request, so past that many
-- entries in a month the totals stopped growing and the budgets stopped
-- working. This adds them up where they are, one total per household (entries
-- from before households are the first household's).
create or replace function spend_totals(since timestamptz)
returns table (household_id text, usd numeric)
language sql
stable
set search_path = public
as $$
  select coalesce(data->>'householdId', 'first') as household_id, coalesce(sum(spend.usd), 0) as usd
  from spend
  where spend.at >= since
  group by 1;
$$;

-- Only the server (secret key) can call it, as with every other table and function.
revoke all on function spend_totals(timestamptz) from public, anon, authenticated;
grant execute on function spend_totals(timestamptz) to service_role;
