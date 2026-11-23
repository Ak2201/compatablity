-- Session kind rules (migration 0006). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/kind_test.sql

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
  a         uuid := '11111111-1111-1111-1111-111111111111';
  b         uuid := '22222222-2222-2222-2222-222222222222';
  c         uuid := '33333333-3333-3333-3333-333333333333';
  v_friend  text;
  v_couple  text;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id) values (a), (b), (c) on conflict do nothing;

  -- ---- create: kind is stored ----
  perform pg_temp.as_user(a);
  v_friend := public.create_session('Maya', 'female', 'friendship');
  perform pg_temp.check_eq('kind: friendship session reads back as friendship',
    (select kind from public.sessions where code = v_friend), 'friendship');

  v_couple := public.create_session('Maya', 'female');
  perform pg_temp.check_eq('kind: default session reads back as couple',
    (select kind from public.sessions where code = v_couple), 'couple');

  -- ---- create: bad kind refused ----
  perform pg_temp.check_error('kind: bad kind refused',
    $$select public.create_session('Maya', 'female', 'family')$$, 'bad_kind');

  -- ---- join: a second member joins a friendship session the normal way ----
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('kind: partner joins friendship session',
    public.join_session(v_friend, 'Sam', 'male'), 'joined');
  perform pg_temp.check_eq('kind: friendship session still friendship after join',
    (select kind from public.sessions where code = v_friend), 'friendship');

  -- ---- visibility: creator sees it, a stranger does not ----
  perform pg_temp.as_user(a);
  perform pg_temp.check_eq('kind: creator sees own friendship session',
    (select count(*)::int from public.sessions where code = v_friend), 1);
  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('kind: stranger does not see friendship session',
    (select count(*)::int from public.sessions where code = v_friend), 0);
end $t$;

rollback;
