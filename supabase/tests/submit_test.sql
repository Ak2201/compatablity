-- Tests for saving answers and submit_answers (migration 0002). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/submit_test.sql

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
  r      text;
  n      int;
begin
  perform pg_temp.check_eq('size: old 20 KB constraint is gone',
    (select count(*)::int from pg_constraint where conname = 'answers_answers_check' and pg_get_constraintdef(oid) like '%20000%'), 0);

  perform pg_temp.as_user(a);
  v_code := public.create_session('Maya');
  perform pg_temp.check_error('submit: refused before the second person joins',
    format($$select public.submit_answers('%s', '{"a":1}')$$, v_code), 'not_full');

  perform pg_temp.as_user(b);
  perform public.join_session(v_code, 'Sam');

  -- A saves draft answers through the table (RLS applies), then submits.
  perform pg_temp.as_user(a);
  insert into public.answers (session_code, user_id, answers) values (v_code, a, '{"comm.open": 4}');
  update public.answers set answers = '{"comm.open": 5}' where session_code = v_code and user_id = a;
  perform pg_temp.check_eq('draft: own draft can be updated before lock',
    (select answers->>'comm.open' from public.answers where session_code = v_code and user_id = a), '5');

  r := public.submit_answers(v_code, '{"comm.open": 5, "comm.listen": 3}');
  perform pg_temp.check_eq('submit: first person submits', r, 'submitted');
  perform pg_temp.check_error('submit: cannot change after lock',
    format($$update public.answers set answers = '{}' where session_code = '%s' and user_id = '%s'$$, v_code, a), 'row-level security');
  perform pg_temp.check_error('submit: cannot submit twice',
    format($$select public.submit_answers('%s', '{}')$$, v_code), 'already_locked');
  perform pg_temp.check_eq('submit: session still waiting for the partner',
    (select status from public.sessions where code = v_code), 'both_joined');

  -- The partner cannot see the locked answers yet, and the status does not change.
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('gate: partner cannot read unlocked-by-reveal answers', (select count(*)::int from public.answers where user_id = a), 0);
  r := public.submit_answers(v_code, '{"comm.open": 2}');
  perform pg_temp.check_eq('submit: second person submits', r, 'revealed');
  perform pg_temp.check_eq('submit: both locked moves session to revealed',
    (select status from public.sessions where code = v_code), 'revealed');

  -- After reveal, the partner can read the other person's answers row, and a stranger cannot.
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('reveal: partner reads the other answers row', (select count(*)::int from public.answers where user_id = a), 1);
  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('reveal: stranger reads no answers rows', (select count(*)::int from public.answers where session_code = v_code), 0);

  -- Stranger cannot submit.
  perform pg_temp.as_user(c);
  perform pg_temp.check_error('submit: stranger refused',
    format($$select public.submit_answers('%s', '{}')$$, v_code), 'not_member');

  -- Only objects are accepted.
  perform pg_temp.as_user(a);
  perform pg_temp.check_error('submit: non-object refused', format($$select public.submit_answers('%s', '[1,2]')$$, v_code), 'bad_answers');
end $t$;

rollback;
