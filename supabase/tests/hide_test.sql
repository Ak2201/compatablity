-- Remove-from-dashboard rules (migration 0008). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hide_test.sql

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
  perform pg_temp.as_admin();
  insert into auth.users (id) values (a), (b), (c) on conflict do nothing;

  perform pg_temp.as_user(a);
  v_code := public.create_session('Maya', 'female', 'couple');
  perform pg_temp.as_user(b);
  perform public.join_session(v_code, 'Sam', 'male');

  -- A hides the session from A's own dashboard.
  perform pg_temp.as_user(a);
  insert into public.session_hidden (session_code, user_id) values (v_code, a);
  perform pg_temp.check_eq('hide: A sees their hidden row', (select count(*)::int from public.session_hidden where user_id = a), 1);
  perform pg_temp.check_eq('hide: the session itself is untouched for A', (select count(*)::int from public.sessions where code = v_code), 1);

  -- B's view is unchanged: hiding is per person.
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('hide: B does not see A''s hidden row', (select count(*)::int from public.session_hidden where user_id = a), 0);
  perform pg_temp.check_eq('hide: the session is still visible to B', (select count(*)::int from public.sessions where code = v_code), 1);

  -- B can hide it for B too, and not for A.
  perform pg_temp.check_error('hide: cannot hide for someone else',
    format($$insert into public.session_hidden (session_code, user_id) values ('%s', '%s')$$, v_code, a), 'row-level security');

  -- A stranger cannot hide a session they are not in.
  perform pg_temp.as_user(c);
  perform pg_temp.check_error('hide: a stranger cannot hide it',
    format($$insert into public.session_hidden (session_code, user_id) values ('%s', '%s')$$, v_code, c), 'row-level security');

  -- A can show it again.
  perform pg_temp.as_user(a);
  delete from public.session_hidden where session_code = v_code and user_id = a;
  perform pg_temp.check_eq('unhide: A sees the session on their list again', (select count(*)::int from public.session_hidden where user_id = a), 0);
end $t$;

rollback;
