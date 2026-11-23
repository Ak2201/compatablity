-- Pairing rule (migration 0007). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pairing_test.sql

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
  d      uuid := '44444444-4444-4444-4444-444444444444';
  e      uuid := '55555555-5555-5555-5555-555555555555';
  v_couple text;
  v_friend text;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id) values (a), (b), (c), (d), (e) on conflict do nothing;

  -- A female creates a couple session.
  perform pg_temp.as_user(a);
  v_couple := public.create_session('Maya', 'female', 'couple');

  -- Another female cannot join a couple session.
  perform pg_temp.as_user(b);
  perform pg_temp.check_error('couple: same gender refused',
    format($$select public.join_session('%s', 'Lena', 'female')$$, v_couple), 'same_gender');

  -- A male can.
  perform pg_temp.check_eq('couple: opposite gender joins', public.join_session(v_couple, 'Sam', 'male'), 'joined');

  -- A friendship session accepts two people of the same gender.
  perform pg_temp.as_user(c);
  v_friend := public.create_session('Ruth', 'female', 'friendship');
  perform pg_temp.as_user(d);
  perform pg_temp.check_eq('friendship: same gender joins', public.join_session(v_friend, 'Nina', 'female'), 'joined');

  -- Gender is still validated.
  perform pg_temp.as_user(e);
  perform pg_temp.check_error('couple: bad gender still refused',
    format($$select public.join_session('%s', 'X', 'other')$$, v_couple), 'bad_gender');
end $t$;

rollback;
