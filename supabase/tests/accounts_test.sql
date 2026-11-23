-- Account rules (migration 0005). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/accounts_test.sql

begin;

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'reset role';
end $$;

create or replace function pg_temp.check_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: got %, want %', label, got, want;
  end if;
  raise notice 'PASS %', label;
end $$;

create or replace function pg_temp.check_error(label text, stmt text, expect text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL %: expected an error containing [%]', label, expect;
exception when others then
  if sqlerrm not like '%' || expect || '%' then
    raise exception 'FAIL %: got error [%], wanted [%]', label, sqlerrm, expect;
  end if;
  raise notice 'PASS %', label;
end $$;

do $t$
declare
  a      uuid := '11111111-1111-1111-1111-111111111111';
  b      uuid := '22222222-2222-2222-2222-222222222222';
  c      uuid := '33333333-3333-3333-3333-333333333333';
  v_code text;
begin
  -- Auth users must exist for the profile foreign key.
  perform pg_temp.as_admin();
  insert into auth.users (id) values (a), (b), (c) on conflict do nothing;

  -- ---- profiles: each person writes and reads only their own ----
  perform pg_temp.as_user(a);
  insert into public.profiles (user_id, display_name, gender) values (a, 'Maya', 'female');
  perform pg_temp.check_eq('profile: owner can read own profile', (select count(*)::int from public.profiles where user_id = a), 1);
  perform pg_temp.check_error('profile: cannot create one for someone else',
    format($$insert into public.profiles (user_id, display_name, gender) values ('%s', 'X', 'male')$$, b), 'row-level security');
  perform pg_temp.as_admin();
  perform pg_temp.check_error('profile: bad gender refused', format($$insert into public.profiles (user_id, display_name, gender) values ('%s', 'X', 'other')$$, c), 'check constraint');
  perform pg_temp.as_user(a);

  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('profile: another person cannot read it', (select count(*)::int from public.profiles where user_id = a), 0);

  -- ---- sessions: gender is required and stored per member ----
  perform pg_temp.as_user(a);
  perform pg_temp.check_error('create: bad gender refused', $$select public.create_session('Maya', 'other')$$, 'bad_gender');
  v_code := public.create_session('Maya', 'female');
  perform pg_temp.check_eq('create: creator gender stored', (select member_a_gender from public.sessions where code = v_code), 'female');

  -- ---- join: a different account, with its own gender ----
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('join: partner joins with their own account', public.join_session(v_code, 'Sam', 'male'), 'joined');
  perform pg_temp.check_eq('join: partner gender stored', (select member_b_gender from public.sessions where code = v_code), 'male');

  -- The same account cannot take the second seat twice, and a third account is refused.
  perform pg_temp.check_eq('join: same account again is idempotent', public.join_session(v_code, 'Sam', 'male'), 'already');
  perform pg_temp.as_user(c);
  perform pg_temp.check_error('join: a third account is refused', format($$select public.join_session('%s', 'Eve', 'female')$$, v_code), 'full');
  perform pg_temp.check_error('join: bad gender refused', format($$select public.join_session('%s', 'Eve', 'x')$$, v_code), 'bad_gender');

  -- ---- dashboard: you see only the sessions you are in ----
  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('dashboard: a stranger sees none of these sessions', (select count(*)::int from public.sessions where code = v_code), 0);
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('dashboard: partner sees the session', (select count(*)::int from public.sessions where code = v_code), 1);
end $t$;

rollback;
