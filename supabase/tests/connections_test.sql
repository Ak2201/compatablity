-- Connection rules (migration 0009). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/connections_test.sql

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
  a      uuid := '11111111-1111-1111-1111-111111111111';  -- Maya, host
  b      uuid := '22222222-2222-2222-2222-222222222222';  -- Sam, partner
  c      uuid := '33333333-3333-3333-3333-333333333333';  -- Eve, third person
  d      uuid := '44444444-4444-4444-4444-444444444444';  -- Ola, stranger who never joins
  v_res  jsonb;
  v_code text;
  v_id   uuid;
  v_n    int;
  v_row  record;
  v_ok   boolean;
begin
  -- Auth users and profiles (names and genders show on previews and lists).
  perform pg_temp.as_admin();
  insert into auth.users (id) values (a), (b), (c), (d) on conflict do nothing;
  insert into public.profiles (user_id, display_name, gender) values
    (a, 'Maya', 'female'), (b, 'Sam', 'male'), (c, 'Eve', 'female'), (d, 'Ola', 'female');

  -- ---- answers: private per person, per bank ----
  perform pg_temp.as_user(a);
  insert into public.profile_answers (user_id, bank, answers) values (a, 'couple', '{"q1": "maya-yes"}');
  update public.profile_answers set answers = '{"q1": "maya-no"}' where user_id = a and bank = 'couple';
  perform pg_temp.check_eq('answers: owner saves and updates own couple answers',
    (select answers->>'q1' from public.profile_answers where user_id = a and bank = 'couple'), 'maya-no');

  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('answers: another user cannot read them (count 0)',
    (select count(*)::int from public.profile_answers where user_id = a), 0);
  perform pg_temp.check_error('answers: another user cannot write under your id',
    format($$insert into public.profile_answers (user_id, bank, answers) values ('%s', 'couple', '{}')$$, a), 'row-level security');
  perform pg_temp.check_error('answers: bad bank refused',
    format($$insert into public.profile_answers (user_id, bank, answers) values ('%s', 'work', '{}')$$, b), 'check constraint');
  insert into public.profile_answers (user_id, bank, answers) values (b, 'couple', '{"q1": "sam-yes"}');

  -- ---- create: host gets a code ----
  perform pg_temp.as_user(a);
  v_res := public.create_connection();
  v_id   := (v_res->>'id')::uuid;
  v_code := v_res->>'code';
  perform pg_temp.check_eq('create: returns a code of 8 characters', length(v_code), 8);
  perform pg_temp.check_eq('create: returns an id', v_id is not null, true);

  -- ---- preview: a stranger sees names only ----
  perform pg_temp.as_user(c);
  v_res := public.connection_preview(v_code);
  perform pg_temp.check_eq('preview: shows host name', v_res->>'host_name', 'Maya');
  perform pg_temp.check_eq('preview: shows host gender', v_res->>'host_gender', 'female');
  perform pg_temp.check_eq('preview: stranger is not a member', (v_res->>'is_member')::boolean, false);
  perform pg_temp.check_eq('preview: not full before accept', (v_res->>'is_full')::boolean, false);
  perform pg_temp.check_eq('preview: unknown code returns null', public.connection_preview('ZZZZZZZZ') is null, true);

  -- ---- accept: partner joins ----
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('accept: partner accepts', public.accept_connection(v_code), v_id);
  perform pg_temp.check_eq('accept: accepting again is idempotent', public.accept_connection(v_code), v_id);

  perform pg_temp.as_user(a);
  perform pg_temp.check_error('accept: host cannot accept own code', format($$select public.accept_connection('%s')$$, v_code), 'own_connection');

  perform pg_temp.as_user(c);
  perform pg_temp.check_error('accept: third person refused (full)', format($$select public.accept_connection('%s')$$, v_code), 'full');
  v_res := public.connection_preview(v_code);
  perform pg_temp.check_eq('preview: full after accept', (v_res->>'is_full')::boolean, true);

  -- ---- list: both members see the connection with the other's name ----
  perform pg_temp.as_user(a);
  select * into v_row from public.list_connections() l where l.code = v_code;
  perform pg_temp.check_eq('list: host sees the connection', v_row.id, v_id);
  perform pg_temp.check_eq('list: host sees partner name', v_row.partner_name, 'Sam');
  perform pg_temp.check_eq('list: host sees partner gender', v_row.partner_gender, 'male');
  perform pg_temp.check_eq('list: host sees own gender', v_row.my_gender, 'female');
  perform pg_temp.check_eq('list: host sees accepted', v_row.accepted, true);

  perform pg_temp.as_user(b);
  select * into v_row from public.list_connections() l where l.code = v_code;
  perform pg_temp.check_eq('list: partner sees the connection', v_row.id, v_id);
  perform pg_temp.check_eq('list: partner sees host name', v_row.partner_name, 'Maya');
  perform pg_temp.check_eq('list: partner sees own gender', v_row.my_gender, 'male');

  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('list: stranger sees none of it', (select count(*)::int from public.list_connections() l where l.id = v_id), 0);

  -- ---- sharing gate ----
  perform pg_temp.as_user(b);
  perform pg_temp.check_error('answers: refused before any share (not_shared)',
    format($$select public.connection_answers('%s', 'couple')$$, v_id), 'not_shared');

  perform pg_temp.as_user(a);
  perform public.set_connection_sharing(v_id, true);
  perform pg_temp.check_error('answers: refused after only the host shares (not_shared)',
    format($$select public.connection_answers('%s', 'couple')$$, v_id), 'not_shared');
  select * into v_row from public.list_connections() l where l.id = v_id;
  perform pg_temp.check_eq('list: host sees own share on', v_row.my_share, true);
  perform pg_temp.check_eq('list: host sees partner share off', v_row.partner_share, false);

  perform pg_temp.as_user(b);
  perform pg_temp.check_error('answers: still refused when only host has shared (partner view)',
    format($$select public.connection_answers('%s', 'couple')$$, v_id), 'not_shared');
  perform public.set_connection_sharing(v_id, true);

  -- ---- both shared: each side gets both answers ----
  v_res := public.connection_answers(v_id, 'couple');
  perform pg_temp.check_eq('answers: partner sees own answers as mine', v_res->'mine'->>'q1', 'sam-yes');
  perform pg_temp.check_eq('answers: partner sees host answers as theirs', v_res->'theirs'->>'q1', 'maya-no');

  perform pg_temp.as_user(a);
  v_res := public.connection_answers(v_id, 'couple');
  perform pg_temp.check_eq('answers: host sees own answers as mine', v_res->'mine'->>'q1', 'maya-no');
  perform pg_temp.check_eq('answers: host sees partner answers as theirs', v_res->'theirs'->>'q1', 'sam-yes');
  perform pg_temp.check_eq('answers: no friendship answers saved, theirs is empty',
    public.connection_answers(v_id, 'friendship')->'theirs', '{}'::jsonb);
  perform pg_temp.check_error('answers: unknown bank refused',
    format($$select public.connection_answers('%s', 'work')$$, v_id), 'bad_bank');

  -- ---- strangers ----
  perform pg_temp.as_user(d);
  perform pg_temp.check_error('answers: stranger refused (not_member)',
    format($$select public.connection_answers('%s', 'couple')$$, v_id), 'not_member');
  perform pg_temp.check_error('sharing: stranger cannot change sharing (not_member)',
    format($$select public.set_connection_sharing('%s', false)$$, v_id), 'not_member');

  -- ---- writes to connections go through functions only ----
  perform pg_temp.as_user(a);
  v_ok := false;
  begin
    insert into public.connections (code, user_a) values ('ABCDEFGH', a);
  exception when others then
    if sqlerrm like '%permission denied%' or sqlerrm like '%row-level security%' then
      v_ok := true;
    else
      raise exception 'FAIL connections: direct insert gave unexpected error [%]', sqlerrm;
    end if;
  end;
  perform pg_temp.check_eq('connections: direct insert refused', v_ok, true);
end $t$;

rollback;
