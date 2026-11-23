-- Wellbeing bank rules (migration 0013). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/wellbeing_test.sql

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
  a      uuid := '55555555-5555-5555-5555-555555555555';  -- Maya, owner of the wellbeing row
  b      uuid := '66666666-6666-6666-6666-666666666666';  -- Sam, partner
  c      uuid := '77777777-7777-7777-7777-777777777777';  -- Eve, stranger
  v_res  jsonb;
  v_code text;
  v_id   uuid;
begin
  -- Auth users and profiles.
  perform pg_temp.as_admin();
  insert into auth.users (id) values (a), (b), (c) on conflict do nothing;
  insert into public.profiles (user_id, display_name, gender) values
    (a, 'Maya', 'female'), (b, 'Sam', 'male'), (c, 'Eve', 'female')
  on conflict do nothing;

  -- ---- owner saves a wellbeing row ----
  perform pg_temp.as_user(a);
  insert into public.profile_answers (user_id, bank, answers) values (a, 'wellbeing', '{"q1": "maya-wellbeing"}');
  perform pg_temp.check_eq('wellbeing: owner can save a wellbeing row',
    (select answers->>'q1' from public.profile_answers where user_id = a and bank = 'wellbeing'), 'maya-wellbeing');
  perform pg_temp.check_eq('wellbeing: owner can read it back through my_wellbeing()',
    public.my_wellbeing()->>'q1', 'maya-wellbeing');

  -- ---- another user cannot read it ----
  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('wellbeing: stranger cannot read it (count 0)',
    (select count(*)::int from public.profile_answers where user_id = a and bank = 'wellbeing'), 0);
  perform pg_temp.check_eq('wellbeing: stranger my_wellbeing() sees only their own (empty)',
    public.my_wellbeing(), '{}'::jsonb);

  -- ---- a connection with both sides sharing still cannot return wellbeing ----
  perform pg_temp.as_user(a);
  v_res  := public.create_connection(null);
  v_id   := (v_res->>'id')::uuid;
  v_code := v_res->>'code';

  perform pg_temp.as_user(b);
  perform public.accept_connection(v_code);
  insert into public.profile_answers (user_id, bank, answers) values (b, 'wellbeing', '{"q1": "sam-wellbeing"}');

  perform pg_temp.as_user(a);
  perform public.set_connection_sharing(v_id, true);
  perform pg_temp.as_user(b);
  perform public.set_connection_sharing(v_id, true);

  perform pg_temp.as_user(a);
  perform pg_temp.check_error('wellbeing: connection_answers refuses bank wellbeing even with both sharing (bad_bank)',
    format($$select public.connection_answers('%s', 'wellbeing')$$, v_id), 'bad_bank');

  -- ---- save_snapshot refuses wellbeing ----
  perform pg_temp.check_error('wellbeing: save_snapshot refuses bank wellbeing (bad_bank)',
    $$select public.save_snapshot('wellbeing', null)$$, 'bad_bank');

  -- ---- a bank outside the four is refused by the check ----
  perform pg_temp.check_error('wellbeing: bank other is refused by the check',
    $$insert into public.profile_answers (user_id, bank, answers) values (auth.uid(), 'other', '{"q1": "x"}')$$,
    'profile_answers_bank_check');
end $t$;

rollback;
