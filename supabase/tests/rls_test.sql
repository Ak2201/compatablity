-- RLS and RPC tests. Run after the migration, inside a transaction that is rolled back:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Each check prints PASS, or raises FAIL and stops the run.
-- Needs roles `anon` and `authenticated` and an auth.uid() function (both exist in Supabase).

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
  a      uuid := '11111111-1111-1111-1111-111111111111';  -- creator
  b      uuid := '22222222-2222-2222-2222-222222222222';  -- joiner
  c      uuid := '33333333-3333-3333-3333-333333333333';  -- stranger
  v_code text;
  v_join text;
  n      int;
  p      jsonb;
begin
  -- ---- create ----
  perform pg_temp.as_user(a);
  v_code := public.create_session('Maya');
  perform pg_temp.check_eq('create: code is 8 chars', length(v_code), 8);
  perform pg_temp.check_error('create: empty name rejected', $$select public.create_session('   ')$$, 'bad_name');
  perform pg_temp.check_eq('create: creator sees own session', (select count(*)::int from public.sessions where code = v_code), 1);

  -- ---- stranger cannot see anything yet ----
  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('stranger: cannot read the session row', (select count(*)::int from public.sessions where code = v_code), 0);
  p := public.session_preview(v_code);
  perform pg_temp.check_eq('preview: host name visible', p->>'host_name', 'Maya');
  perform pg_temp.check_eq('preview: not full before anyone joins', (p->>'is_full')::boolean, false);
  perform pg_temp.check_eq('preview: stranger is not a member', (p->>'is_member')::boolean, false);
  perform pg_temp.check_eq('preview: unknown code returns null', public.session_preview('ZZZZZZZZ') is null, true);

  -- ---- joiner ----
  perform pg_temp.as_user(b);
  v_join := public.join_session(v_code, 'Sam');
  perform pg_temp.check_eq('join: first joiner gets the seat', v_join, 'joined');
  perform pg_temp.check_eq('join: joiner sees the session now', (select count(*)::int from public.sessions where code = v_code), 1);
  perform pg_temp.check_eq('join: status is both_joined', (select status from public.sessions where code = v_code), 'both_joined');
  perform pg_temp.check_eq('join: joiner name stored', (select member_b_name from public.sessions where code = v_code), 'Sam');

  perform pg_temp.check_eq('join: rejoining is idempotent', public.join_session(v_code, 'Sam'), 'already');

  -- ---- a third person is refused ----
  perform pg_temp.as_user(c);
  perform pg_temp.check_error('join: third person refused', format($$select public.join_session('%s', 'Eve')$$, v_code), 'full');
  p := public.session_preview(v_code);
  perform pg_temp.check_eq('preview: full after two joins', (p->>'is_full')::boolean, true);

  -- ---- answers: each person writes only their own row ----
  perform pg_temp.as_user(a);
  insert into public.answers (session_code, user_id, answers) values (v_code, a, '{"comm.open": 4}');
  perform pg_temp.check_error('answers: cannot write as someone else', format($$insert into public.answers (session_code, user_id, answers) values ('%s', '%s', '{}')$$, v_code, b), 'row-level security');
  perform pg_temp.check_error('answers: cannot write a locked row', format($$insert into public.answers (session_code, user_id, answers, locked) values ('%s', '%s', '{}', true)$$, v_code, a), 'row-level security');

  -- ---- reveal gate ----
  perform pg_temp.as_user(b);
  insert into public.answers (session_code, user_id, answers) values (v_code, b, '{"comm.open": 2}');
  perform pg_temp.check_eq('gate: joiner cannot read creator answers before reveal', (select count(*)::int from public.answers where user_id = a), 0);
  perform pg_temp.check_eq('gate: joiner can read own answers', (select count(*)::int from public.answers where user_id = b), 1);

  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('gate: stranger sees no answers', (select count(*)::int from public.answers where session_code = v_code), 0);

  -- Reveal (the server sets this later, once both have locked in).
  perform pg_temp.as_admin();
  update public.sessions set status = 'revealed' where code = v_code;

  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('gate: joiner reads creator answers after reveal', (select count(*)::int from public.answers where user_id = a), 1);

  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('gate: stranger still sees no answers after reveal', (select count(*)::int from public.answers where session_code = v_code), 0);

  -- ---- direct writes to sessions are refused (writes go through the RPCs) ----
  perform pg_temp.as_user(a);
  perform pg_temp.check_error('sessions: direct update refused', format($$update public.sessions set status = 'locked' where code = '%s'$$, v_code), 'permission denied');
  perform pg_temp.check_error('sessions: direct insert refused', $$insert into public.sessions (code, member_a, member_a_name) values ('ABCDEFGH', '11111111-1111-1111-1111-111111111111', 'X')$$, 'permission denied');

  -- ---- signed-out callers are refused ----
  perform pg_temp.as_user(null);
  perform pg_temp.check_error('auth: signed-out create refused', $$select public.create_session('Nobody')$$, 'not_signed_in');
end $t$;

rollback;
