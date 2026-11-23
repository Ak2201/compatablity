-- Feature rules (migration 0010). Runs in a transaction, rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/features_test.sql

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
  v_code2 text;
  v_id2  uuid;
  v_snap uuid;
  v_n    int;
  v_row  record;
begin
  -- Auth users and profiles.
  perform pg_temp.as_admin();
  insert into auth.users (id) values (a), (b), (c), (d) on conflict do nothing;
  insert into public.profiles (user_id, display_name, gender) values
    (a, 'Maya', 'female'), (b, 'Sam', 'male'), (c, 'Eve', 'female'), (d, 'Ola', 'female');

  -- ---- invite: message, expiry ----
  perform pg_temp.as_user(a);
  v_res  := public.create_connection('  Hi, shall we try this?  ');
  v_id   := (v_res->>'id')::uuid;
  v_code := v_res->>'code';
  perform pg_temp.check_eq('create: returns expires_at', v_res->>'expires_at' is not null, true);
  perform pg_temp.check_eq('create: expiry is about 14 days out',
    (select expires_at > now() + interval '13 days' and expires_at < now() + interval '15 days'
       from public.connections where id = v_id), true);
  perform pg_temp.check_eq('create: message is trimmed and stored',
    (select message from public.connections where id = v_id), 'Hi, shall we try this?');
  perform pg_temp.check_error('create: message over 200 chars refused',
    $$select public.create_connection(repeat('x', 201))$$, 'bad_message');

  perform pg_temp.as_user(b);
  v_res := public.connection_preview(v_code);
  perform pg_temp.check_eq('preview: invitee sees the message', v_res->>'message', 'Hi, shall we try this?');
  perform pg_temp.check_eq('preview: not expired', (v_res->>'is_expired')::boolean, false);
  perform pg_temp.check_eq('preview: not cancelled', (v_res->>'is_cancelled')::boolean, false);

  perform pg_temp.as_user(a);
  v_res := public.connection_preview(v_code);
  perform pg_temp.check_eq('preview: host does not see the message back', (v_res->>'message') is null, true);

  -- Expired invite is refused, then comes back in date.
  perform pg_temp.as_admin();
  update public.connections set expires_at = now() - interval '1 day' where id = v_id;

  perform pg_temp.as_user(b);
  perform pg_temp.check_error('accept: expired invite refused',
    format($$select public.accept_connection('%s')$$, v_code), 'expired');
  v_res := public.connection_preview(v_code);
  perform pg_temp.check_eq('preview: expired invite flagged', (v_res->>'is_expired')::boolean, true);
  perform pg_temp.check_eq('preview: expired invite hides the message', (v_res->>'message') is null, true);

  perform pg_temp.as_admin();
  update public.connections set expires_at = now() + interval '14 days' where id = v_id;

  -- ---- cancel: creator only, only while pending ----
  perform pg_temp.as_user(a);
  v_res  := public.create_connection(null);
  v_id2  := (v_res->>'id')::uuid;
  v_code2 := v_res->>'code';

  perform pg_temp.as_user(b);
  perform pg_temp.check_error('cancel: a stranger cannot cancel (not_pending)',
    format($$select public.cancel_invite('%s')$$, v_id2), 'not_pending');

  perform pg_temp.as_user(a);
  perform public.cancel_invite(v_id2);
  perform pg_temp.check_eq('cancel: creator cancels a pending invite',
    (select cancelled_at is not null from public.connections where id = v_id2), true);
  perform pg_temp.check_error('cancel: cancelling twice refused (not_pending)',
    format($$select public.cancel_invite('%s')$$, v_id2), 'not_pending');

  perform pg_temp.as_user(c);
  perform pg_temp.check_error('accept: cancelled invite refused',
    format($$select public.accept_connection('%s')$$, v_code2), 'cancelled');
  v_res := public.connection_preview(v_code2);
  perform pg_temp.check_eq('preview: cancelled invite flagged', (v_res->>'is_cancelled')::boolean, true);

  -- ---- partner accepts the good invite ----
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('accept: partner accepts once the invite is in date',
    public.accept_connection(v_code), v_id);

  perform pg_temp.as_user(a);
  perform pg_temp.check_error('cancel: an accepted connection cannot be cancelled (not_pending)',
    format($$select public.cancel_invite('%s')$$, v_id), 'not_pending');
  perform pg_temp.check_eq('list: cancelled invite is hidden from the creator',
    (select count(*)::int from public.list_connections() l where l.id = v_id2), 0);

  -- ---- nicknames: stored per side, each person sees their own ----
  perform pg_temp.as_user(a);
  perform public.set_nickname(v_id, '  Mo  ');
  perform pg_temp.as_user(b);
  perform public.set_nickname(v_id, 'Sammy');

  perform pg_temp.as_admin();
  perform pg_temp.check_eq('nickname: stored on the host side', (select nickname_a from public.connections where id = v_id), 'Mo');
  perform pg_temp.check_eq('nickname: stored on the partner side', (select nickname_b from public.connections where id = v_id), 'Sammy');

  perform pg_temp.as_user(a);
  select * into v_row from public.list_connections() l where l.id = v_id;
  perform pg_temp.check_eq('nickname: host sees own nickname as my_nickname', v_row.my_nickname, 'Mo');
  perform pg_temp.check_eq('list: host sees expires_at', v_row.expires_at is not null, true);

  perform pg_temp.as_user(b);
  select * into v_row from public.list_connections() l where l.id = v_id;
  perform pg_temp.check_eq('nickname: partner sees own nickname as my_nickname', v_row.my_nickname, 'Sammy');

  perform pg_temp.as_user(d);
  perform pg_temp.check_error('nickname: stranger refused (not_member)',
    format($$select public.set_nickname('%s', 'Ola')$$, v_id), 'not_member');
  perform pg_temp.as_user(a);
  perform pg_temp.check_error('nickname: over 30 chars refused',
    format($$select public.set_nickname('%s', repeat('n', 31))$$, v_id), 'bad_nickname');

  -- ---- access log and notifications from accept ----
  perform pg_temp.as_admin();
  perform pg_temp.check_eq('events: accept wrote one accepted event',
    (select count(*)::int from public.share_events where connection_id = v_id and event = 'accepted'), 1);
  perform pg_temp.check_eq('notifications: host told about the accept',
    (select body from public.notifications where user_id = a and kind = 'accepted'), 'Sam accepted your invite');
  perform pg_temp.check_eq('notifications: partner not notified of their own accept',
    (select count(*)::int from public.notifications where user_id = b and kind = 'accepted'), 0);

  -- ---- sharing: events and notifications on the other side ----
  perform pg_temp.as_user(a);
  perform public.set_connection_sharing(v_id, true);
  perform pg_temp.as_user(b);
  perform public.set_connection_sharing(v_id, true);

  perform pg_temp.as_admin();
  perform pg_temp.check_eq('events: share wrote shared events for both sides',
    (select count(*)::int from public.share_events where connection_id = v_id and event = 'shared'), 2);
  perform pg_temp.check_eq('notifications: host told the partner shared',
    (select count(*)::int from public.notifications where user_id = a and kind = 'shared' and connection_id = v_id), 1);
  perform pg_temp.check_eq('notifications: partner told the host shared',
    (select count(*)::int from public.notifications where user_id = b and kind = 'shared' and connection_id = v_id), 1);

  -- Access log: members read it, strangers get nothing.
  perform pg_temp.as_user(a);
  v_res := public.connection_answers(v_id, 'couple');  -- logs answers_viewed (both have shared)
  perform pg_temp.check_eq('events: answers_viewed logged for the viewer',
    (select count(*)::int from public.list_share_events(v_id) e where e.event = 'answers_viewed'), 1);
  perform pg_temp.check_eq('events: member sees the log',
    (select count(*)::int from public.list_share_events(v_id)) >= 4, true);
  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('events: partner sees the same log',
    (select count(*)::int from public.list_share_events(v_id)) >= 4, true);
  perform pg_temp.as_user(c);
  perform pg_temp.check_eq('events: third person sees none (log)',
    (select count(*)::int from public.list_share_events(v_id)), 0);
  perform pg_temp.as_user(d);
  perform pg_temp.check_eq('events: stranger sees none (log)',
    (select count(*)::int from public.list_share_events(v_id)), 0);
  perform pg_temp.check_error('events: no direct writes to the log',
    format($$insert into public.share_events (connection_id, event) values ('%s', 'shared')$$, v_id), 'permission denied');

  -- ---- notifications: unread counts, mark all read ----
  perform pg_temp.as_user(a);
  perform pg_temp.check_eq('notifications: host has 2 unread (accepted, shared)',
    (select count(*)::int from public.list_notifications() n where n.read_at is null), 2);
  perform public.mark_all_read();
  perform pg_temp.check_eq('notifications: mark_all_read clears unread',
    (select count(*)::int from public.list_notifications() n where n.read_at is null), 0);

  perform pg_temp.as_user(b);
  perform public.set_connection_sharing(v_id, false);
  perform pg_temp.as_user(a);
  perform pg_temp.check_eq('notifications: host told the partner stopped sharing',
    (select count(*)::int from public.list_notifications() n where n.kind = 'unshared' and n.read_at is null), 1);

  -- ---- snapshots: private to the owner ----
  perform pg_temp.as_user(a);
  insert into public.profile_answers (user_id, bank, answers) values (a, 'couple', '{"q1": "maya-snap"}');
  v_snap := public.save_snapshot('couple', '  Before the move  ');
  perform pg_temp.check_eq('snapshot: saved and returns an id', v_snap is not null, true);
  perform pg_temp.check_eq('snapshot: owner reads it back', (select count(*)::int from public.profile_snapshots where id = v_snap), 1);

  perform pg_temp.as_admin();
  perform pg_temp.check_eq('snapshot: copies the answers at save time',
    (select answers->>'q1' from public.profile_snapshots where id = v_snap), 'maya-snap');
  perform pg_temp.check_eq('snapshot: label trimmed and stored',
    (select label from public.profile_snapshots where id = v_snap), 'Before the move');

  perform pg_temp.as_user(b);
  perform pg_temp.check_eq('snapshot: partner cannot read it (count 0)',
    (select count(*)::int from public.profile_snapshots where user_id = a), 0);
  perform pg_temp.as_user(c);
  perform pg_temp.check_error('snapshot: empty answers refused',
    $$select public.save_snapshot('couple', 'nothing yet')$$, 'empty');
  perform pg_temp.as_user(a);
  perform pg_temp.check_error('snapshot: bad bank refused',
    $$select public.save_snapshot('work', null)$$, 'bad_bank');

  -- ---- account deletion: the caller's data goes, the partner's stays ----
  perform pg_temp.as_user(b);
  insert into public.profile_answers (user_id, bank, answers) values (b, 'couple', '{"q1": "sam-keep"}');

  perform pg_temp.as_user(a);
  perform public.delete_my_data();

  perform pg_temp.as_admin();
  perform pg_temp.check_eq('delete: caller answers gone', (select count(*)::int from public.profile_answers where user_id = a), 0);
  perform pg_temp.check_eq('delete: caller snapshots gone', (select count(*)::int from public.profile_snapshots where user_id = a), 0);
  perform pg_temp.check_eq('delete: caller notifications gone', (select count(*)::int from public.notifications where user_id = a), 0);
  perform pg_temp.check_eq('delete: caller profile gone', (select count(*)::int from public.profiles where user_id = a), 0);
  perform pg_temp.check_eq('delete: partner answers intact',
    (select answers->>'q1' from public.profile_answers where user_id = b and bank = 'couple'), 'sam-keep');
  perform pg_temp.check_eq('delete: pending invite of the caller removed',
    (select count(*)::int from public.connections where id = v_id2), 0);
  perform pg_temp.check_eq('delete: connection kept, partner is now the pending host',
    (select user_a = b and user_b is null from public.connections where id = v_id), true);
  perform pg_temp.check_eq('delete: sharing switches reset',
    (select share_a or share_b from public.connections where id = v_id), false);
  perform pg_temp.check_eq('delete: unshared event recorded',
    (select count(*)::int from public.share_events where connection_id = v_id and event = 'unshared') >= 1, true);

  perform pg_temp.as_user(b);
  select * into v_row from public.list_connections() l where l.id = v_id;
  perform pg_temp.check_eq('delete: partner sees a pending invite', v_row.accepted, false);
  perform pg_temp.check_eq('delete: partner still sees own gender', v_row.my_gender, 'male');
end $t$;

rollback;
