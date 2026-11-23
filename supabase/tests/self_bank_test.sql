-- Third bank 'self' rules (migration 0012). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/self_bank_test.sql

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
  a      uuid := '55555555-5555-5555-5555-555555555555';  -- Maya, host
  b      uuid := '66666666-6666-6666-6666-666666666666';  -- Sam, partner
  c      uuid := '77777777-7777-7777-7777-777777777777';  -- Eve, stranger
  v_res  jsonb;
  v_code text;
  v_id   uuid;
  v_snap uuid;
begin
  -- Auth users and profiles.
  perform pg_temp.as_admin();
  insert into auth.users (id) values (a), (b), (c) on conflict do nothing;
  insert into public.profiles (user_id, display_name, gender) values
    (a, 'Maya', 'female'), (b, 'Sam', 'male'), (c, 'Eve', 'female');

  -- ---- saving a 'self' row ----
  perform pg_temp.as_user(a);
  insert into public.profile_answers (user_id, bank, answers) values (a, 'self', '{"q1": "maya-self"}');
  perform pg_temp.check_eq('self: a self row saves',
    (select answers->>'q1' from public.profile_answers where user_id = a and bank = 'self'), 'maya-self');

  -- ---- a bank outside the three is refused by the check ----
  perform pg_temp.check_error('self: bank other is refused by the check',
    $$insert into public.profile_answers (user_id, bank, answers) values (auth.uid(), 'other', '{"q1": "x"}')$$,
    'profile_answers_bank_check');

  -- ---- connection_answers with 'self' ----
  perform pg_temp.as_user(a);
  v_res  := public.create_connection(null);
  v_id   := (v_res->>'id')::uuid;
  v_code := v_res->>'code';

  perform pg_temp.as_user(b);
  perform public.accept_connection(v_code);
  insert into public.profile_answers (user_id, bank, answers) values (b, 'self', '{"q1": "sam-self"}');

  -- Before both share: refused.
  perform pg_temp.as_user(a);
  perform pg_temp.check_error('self: connection_answers before sharing is refused (not_shared)',
    format($$select public.connection_answers('%s', 'self')$$, v_id), 'not_shared');
  perform public.set_connection_sharing(v_id, true);
  perform pg_temp.check_error('self: still refused with only one side sharing (not_shared)',
    format($$select public.connection_answers('%s', 'self')$$, v_id), 'not_shared');

  perform pg_temp.as_user(b);
  perform public.set_connection_sharing(v_id, true);

  -- After both share: both sides come back.
  perform pg_temp.as_user(a);
  v_res := public.connection_answers(v_id, 'self');
  perform pg_temp.check_eq('self: mine is my self answers', v_res->'mine'->>'q1', 'maya-self');
  perform pg_temp.check_eq('self: theirs is the partner self answers', v_res->'theirs'->>'q1', 'sam-self');

  perform pg_temp.as_user(b);
  v_res := public.connection_answers(v_id, 'self');
  perform pg_temp.check_eq('self: partner sees mine and theirs swapped (mine)', v_res->'mine'->>'q1', 'sam-self');
  perform pg_temp.check_eq('self: partner sees theirs (maya)', v_res->'theirs'->>'q1', 'maya-self');

  perform pg_temp.as_user(c);
  perform pg_temp.check_error('self: stranger refused (not_member)',
    format($$select public.connection_answers('%s', 'self')$$, v_id), 'not_member');

  -- Access log: the reads above were logged.
  perform pg_temp.as_admin();
  perform pg_temp.check_eq('self: answers_viewed logged for both reads',
    (select count(*)::int from public.share_events where connection_id = v_id and event = 'answers_viewed'), 2);

  -- ---- save_snapshot with 'self' ----
  perform pg_temp.as_user(a);
  v_snap := public.save_snapshot('self', '  Before the move  ');
  perform pg_temp.check_eq('self: snapshot saved and returns an id', v_snap is not null, true);
  perform pg_temp.as_admin();
  perform pg_temp.check_eq('self: snapshot copies the self answers',
    (select answers->>'q1' from public.profile_snapshots where id = v_snap), 'maya-self');
  perform pg_temp.check_eq('self: snapshot stored with bank self',
    (select bank from public.profile_snapshots where id = v_snap), 'self');

  perform pg_temp.as_user(a);
  perform pg_temp.check_error('self: save_snapshot still refuses bank other (bad_bank)',
    $$select public.save_snapshot('other', null)$$, 'bad_bank');
  perform pg_temp.check_error('self: connection_answers still refuses bank other (bad_bank)',
    format($$select public.connection_answers('%s', 'other')$$, v_id), 'bad_bank');
end $t$;

rollback;
