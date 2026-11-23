-- Features: invite expiry, cancel, message and nicknames; answer snapshots; access log; notifications;
-- account deletion. Run after 0009_connections.sql. Idempotent.
-- Sessions, answers (session-side), and session_hidden are not touched by anything in this file.

-- ---------- connections: invite columns ----------

alter table public.connections add column if not exists expires_at timestamptz not null
  default (now() + interval '14 days');
alter table public.connections add column if not exists message text
  check (message is null or char_length(message) <= 200);
alter table public.connections add column if not exists cancelled_at timestamptz;
-- One nickname per side: each person names the partner for their own view only.
alter table public.connections add column if not exists nickname_a text
  check (nickname_a is null or char_length(nickname_a) <= 30);
alter table public.connections add column if not exists nickname_b text
  check (nickname_b is null or char_length(nickname_b) <= 30);

-- ---------- tables ----------

create table if not exists public.profile_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  bank       text not null check (bank in ('couple', 'friendship')),
  answers    jsonb not null
             check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 60000),
  label      text check (label is null or char_length(label) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists profile_snapshots_user_idx on public.profile_snapshots (user_id, created_at desc);

create table if not exists public.share_events (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  actor         uuid references auth.users(id) on delete set null,
  event         text not null
                check (event in ('shared', 'unshared', 'accepted', 'answers_viewed', 'cancelled', 'nickname_set')),
  at            timestamptz not null default now()
);
create index if not exists share_events_connection_idx on public.share_events (connection_id, at desc);

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,
  body          text not null check (char_length(body) <= 200),
  connection_id uuid references public.connections(id) on delete cascade,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- row level security ----------

alter table public.profile_snapshots enable row level security;
alter table public.share_events      enable row level security;
alter table public.notifications     enable row level security;

-- Snapshots belong to their owner only.
drop policy if exists profile_snapshots_select_own on public.profile_snapshots;
create policy profile_snapshots_select_own on public.profile_snapshots
  for select to authenticated using (user_id = auth.uid());

drop policy if exists profile_snapshots_insert_own on public.profile_snapshots;
create policy profile_snapshots_insert_own on public.profile_snapshots
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists profile_snapshots_delete_own on public.profile_snapshots;
create policy profile_snapshots_delete_own on public.profile_snapshots
  for delete to authenticated using (user_id = auth.uid());

-- Access log: members of the connection can read its events. No direct writes.
drop policy if exists share_events_select_members on public.share_events;
create policy share_events_select_members on public.share_events
  for select to authenticated
  using (exists (
    select 1 from public.connections c
    where c.id = share_events.connection_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));

-- Notifications: read your own; you may only change read_at.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- grants on tables ----------

revoke all on public.profile_snapshots from anon, authenticated;
revoke all on public.share_events      from anon, authenticated;
revoke all on public.notifications     from anon, authenticated;
grant select, insert, delete on public.profile_snapshots to authenticated;
grant select on public.share_events to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- functions: drop first so signature or return-type changes apply cleanly ----------

drop function if exists public.create_connection();
drop function if exists public.create_connection(text);
drop function if exists public.connection_preview(text);
drop function if exists public.accept_connection(text);
drop function if exists public.list_connections();
drop function if exists public.set_connection_sharing(uuid, boolean);
drop function if exists public.connection_answers(uuid, text);
drop function if exists public.set_nickname(uuid, text);
drop function if exists public.cancel_invite(uuid);
drop function if exists public.save_snapshot(text, text);
drop function if exists public.list_share_events(uuid);
drop function if exists public.list_notifications();
drop function if exists public.mark_all_read();
drop function if exists public.delete_my_data();

-- ---------- RPC: create an invite (you are user_a) ----------

create or replace function public.create_connection(p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg      text := nullif(trim(p_message), '');
  v_code     text;
  v_id       uuid;
  v_expires  timestamptz;
  v_attempts int := 0;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v_msg is not null and char_length(v_msg) > 200 then raise exception 'bad_message'; end if;

  loop
    v_code := public.gen_session_code();
    begin
      insert into public.connections (code, user_a, message)
      values (v_code, auth.uid(), v_msg)
      returning id, expires_at into v_id, v_expires;
      return jsonb_build_object('id', v_id, 'code', v_code, 'expires_at', v_expires);
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 3 then raise; end if;
    end;
  end loop;
end;
$$;

-- ---------- RPC: preview before accepting (names and genders; the invite message only to the invitee) ----------

create or replace function public.connection_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.connections%rowtype;
  p public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  select * into c from public.connections where code = p_code;
  if not found then return null; end if;

  select * into p from public.profiles where user_id = c.user_a;

  return jsonb_build_object(
    'host_name', p.display_name,
    'host_gender', p.gender,
    'is_full', c.user_b is not null,
    'is_member', coalesce(c.user_a = auth.uid() or c.user_b = auth.uid(), false),
    'is_expired', c.expires_at < now(),
    'is_cancelled', c.cancelled_at is not null,
    'message', case
      when c.user_b is null
       and c.user_a <> auth.uid()
       and c.cancelled_at is null
       and c.expires_at >= now()
      then c.message
      else null
    end
  );
end;
$$;

-- ---------- RPC: accept an invite (row lock, so two accepts at once cannot both take the seat) ----------

create or replace function public.accept_connection(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c      public.connections%rowtype;
  v_name text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  select * into c from public.connections where code = p_code for update;
  if not found then raise exception 'not_found'; end if;
  if c.user_a = auth.uid() then raise exception 'own_connection'; end if;

  if c.user_b is not null then
    if c.user_b = auth.uid() then return c.id; end if;
    raise exception 'full';
  end if;

  if c.cancelled_at is not null then raise exception 'cancelled'; end if;
  if c.expires_at < now() then raise exception 'expired'; end if;

  update public.connections set user_b = auth.uid() where id = c.id;

  insert into public.share_events (connection_id, actor, event)
  values (c.id, auth.uid(), 'accepted');

  select display_name into v_name from public.profiles where user_id = auth.uid();
  insert into public.notifications (user_id, kind, body, connection_id)
  values (c.user_a, 'accepted', coalesce(v_name, 'Someone') || ' accepted your invite', c.id);

  return c.id;
end;
$$;

-- ---------- RPC: your connections, plus your pending invites (cancelled ones are hidden) ----------

create or replace function public.list_connections()
returns table (
  id             uuid,
  code           text,
  partner_name   text,
  partner_gender text,
  my_gender      text,
  my_share       boolean,
  partner_share  boolean,
  accepted       boolean,
  expires_at     timestamptz,
  my_nickname    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  return query
  select
    c.id,
    c.code,
    case when c.user_a = auth.uid() then pb.display_name else pa.display_name end,
    case when c.user_a = auth.uid() then pb.gender else pa.gender end,
    me.gender,
    case when c.user_a = auth.uid() then c.share_a else c.share_b end,
    case when c.user_a = auth.uid() then c.share_b else c.share_a end,
    (c.user_b is not null),
    c.expires_at,
    case when c.user_a = auth.uid() then c.nickname_a else c.nickname_b end
  from public.connections c
  left join public.profiles pa on pa.user_id = c.user_a
  left join public.profiles pb on pb.user_id = c.user_b
  left join public.profiles me on me.user_id = auth.uid()
  where (c.user_a = auth.uid() or c.user_b = auth.uid())
    and c.cancelled_at is null
  order by c.created_at desc;
end;
$$;

-- ---------- RPC: turn your sharing on or off for one connection ----------

create or replace function public.set_connection_sharing(p_id uuid, p_share boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c        public.connections%rowtype;
  v_name   text;
  v_other  uuid;
  v_event  text := case when p_share then 'shared' else 'unshared' end;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  select * into c from public.connections where id = p_id for update;
  if not found then raise exception 'not_member'; end if;

  if c.user_a = auth.uid() then
    if c.share_a = p_share then return; end if;
    update public.connections set share_a = p_share where id = p_id;
    v_other := c.user_b;
  elsif c.user_b is not distinct from auth.uid() then
    if c.share_b = p_share then return; end if;
    update public.connections set share_b = p_share where id = p_id;
    v_other := c.user_a;
  else
    raise exception 'not_member';
  end if;

  insert into public.share_events (connection_id, actor, event)
  values (p_id, auth.uid(), v_event);

  if v_other is not null then
    select display_name into v_name from public.profiles where user_id = auth.uid();
    insert into public.notifications (user_id, kind, body, connection_id)
    values (
      v_other,
      v_event,
      coalesce(v_name, 'Your partner') || case when p_share
        then ' is sharing their answers with you'
        else ' stopped sharing their answers' end,
      p_id
    );
  end if;
end;
$$;

-- ---------- RPC: read both sides' answers for one bank, only when both have shared (logged) ----------
-- Volatile on purpose: it writes an 'answers_viewed' event.

create or replace function public.connection_answers(p_id uuid, p_bank text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c       public.connections%rowtype;
  v_other uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_bank not in ('couple', 'friendship') then raise exception 'bad_bank'; end if;

  select * into c from public.connections where id = p_id;
  if not found then raise exception 'not_member'; end if;
  if c.user_a is distinct from auth.uid() and c.user_b is distinct from auth.uid() then
    raise exception 'not_member';
  end if;

  if c.user_b is null or not c.share_a or not c.share_b then
    raise exception 'not_shared';
  end if;

  v_other := case when c.user_a = auth.uid() then c.user_b else c.user_a end;

  insert into public.share_events (connection_id, actor, event)
  values (p_id, auth.uid(), 'answers_viewed');

  return jsonb_build_object(
    'mine', coalesce((
      select pa.answers from public.profile_answers pa
      where pa.user_id = auth.uid() and pa.bank = p_bank
    ), '{}'::jsonb),
    'theirs', coalesce((
      select pa.answers from public.profile_answers pa
      where pa.user_id = v_other and pa.bank = p_bank
    ), '{}'::jsonb)
  );
end;
$$;

-- ---------- RPC: nickname for the partner, stored on your side only ----------

create or replace function public.set_nickname(p_id uuid, p_nickname text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c      public.connections%rowtype;
  v_nick text := nullif(trim(p_nickname), '');
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v_nick is not null and char_length(v_nick) > 30 then raise exception 'bad_nickname'; end if;

  select * into c from public.connections where id = p_id for update;
  if not found then raise exception 'not_member'; end if;

  if c.user_a = auth.uid() then
    update public.connections set nickname_a = v_nick where id = p_id;
  elsif c.user_b is not distinct from auth.uid() then
    update public.connections set nickname_b = v_nick where id = p_id;
  else
    raise exception 'not_member';
  end if;

  insert into public.share_events (connection_id, actor, event)
  values (p_id, auth.uid(), 'nickname_set');
end;
$$;

-- ---------- RPC: cancel a pending invite (creator only, before anyone has joined) ----------

create or replace function public.cancel_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.connections%rowtype;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  select * into c from public.connections where id = p_id for update;
  if not found then raise exception 'not_pending'; end if;
  if c.user_a <> auth.uid() or c.user_b is not null or c.cancelled_at is not null then
    raise exception 'not_pending';
  end if;

  update public.connections set cancelled_at = now() where id = p_id;

  insert into public.share_events (connection_id, actor, event)
  values (p_id, auth.uid(), 'cancelled');
end;
$$;

-- ---------- RPC: snapshot your current answers for one bank (private to you) ----------

create or replace function public.save_snapshot(p_bank text, p_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answers jsonb;
  v_label   text := nullif(trim(p_label), '');
  v_id      uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_bank not in ('couple', 'friendship') then raise exception 'bad_bank'; end if;
  if v_label is not null and char_length(v_label) > 60 then raise exception 'bad_label'; end if;

  select pa.answers into v_answers
  from public.profile_answers pa
  where pa.user_id = auth.uid() and pa.bank = p_bank;

  if v_answers is null or v_answers = '{}'::jsonb then raise exception 'empty'; end if;

  insert into public.profile_snapshots (user_id, bank, answers, label)
  values (auth.uid(), p_bank, v_answers, v_label)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- RPC: access log for one connection (members only; anyone else gets no rows) ----------

create or replace function public.list_share_events(p_id uuid)
returns table (
  id    uuid,
  event text,
  actor uuid,
  at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  if not exists (
    select 1 from public.connections c
    where c.id = p_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ) then
    return;
  end if;

  return query
  select e.id, e.event, e.actor, e.at
  from public.share_events e
  where e.connection_id = p_id
  order by e.at desc;
end;
$$;

-- ---------- RPC: your notifications, unread first, latest 30 ----------

create or replace function public.list_notifications()
returns table (
  id            uuid,
  kind          text,
  body          text,
  connection_id uuid,
  created_at    timestamptz,
  read_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  return query
  select n.id, n.kind, n.body, n.connection_id, n.created_at, n.read_at
  from public.notifications n
  where n.user_id = auth.uid()
  order by (n.read_at is not null), n.created_at desc
  limit 30;
end;
$$;

-- ---------- RPC: mark your unread notifications as read ----------

create or replace function public.mark_all_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;
end;
$$;

-- ---------- RPC: delete your own data ----------
-- Removes: your answers, your snapshots, your notifications, your profile, and your pending invites.
-- Connections you joined stay for the partner: they become a pending invite of the partner (you leave the
-- seat, and both sharing switches reset so nothing is shared with a new person by accident).
-- Your access-log rows stay, with your id cleared from them. Other people's answers and sessions are not touched.
-- NOTE: this does NOT delete the auth.users row. The client cannot call supabase.auth.admin, so the app must
-- delete the auth user through its server side or the Supabase dashboard, and must sign the user out after this call.
-- (Deleting auth.users also cascades to all of the above, so that path is safe to run afterwards.)

create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c   public.connections%rowtype;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  -- Pending invites you created: nobody has joined, so the invite goes (its access log goes with it).
  delete from public.connections where user_a = uid and user_b is null;

  -- Connections where you are the partner: the host keeps the connection as a pending invite.
  for c in select * from public.connections where user_b = uid for update loop
    insert into public.share_events (connection_id, actor, event) values (c.id, uid, 'unshared');
    update public.connections
       set user_b = null, share_a = false, share_b = false, nickname_b = null
     where id = c.id;
  end loop;

  -- Connections where you are the host and someone joined: the partner moves into the host seat as a
  -- pending invite. Both sharing switches reset; the partner's nickname for you moves with them.
  for c in select * from public.connections where user_a = uid and user_b is not null for update loop
    insert into public.share_events (connection_id, actor, event) values (c.id, uid, 'unshared');
    update public.connections
       set user_a = c.user_b, user_b = null,
           share_a = false, share_b = false,
           nickname_a = c.nickname_b, nickname_b = null
     where id = c.id;
  end loop;

  delete from public.notifications     where user_id = uid;
  delete from public.profile_snapshots where user_id = uid;
  delete from public.profile_answers   where user_id = uid;
  delete from public.profiles          where user_id = uid;

  update public.share_events set actor = null where actor = uid;
end;
$$;

-- ---------- grants on functions ----------

revoke execute on function public.create_connection(text)              from public, anon;
revoke execute on function public.connection_preview(text)             from public, anon;
revoke execute on function public.accept_connection(text)              from public, anon;
revoke execute on function public.list_connections()                   from public, anon;
revoke execute on function public.set_connection_sharing(uuid, boolean) from public, anon;
revoke execute on function public.connection_answers(uuid, text)       from public, anon;
revoke execute on function public.set_nickname(uuid, text)             from public, anon;
revoke execute on function public.cancel_invite(uuid)                  from public, anon;
revoke execute on function public.save_snapshot(text, text)            from public, anon;
revoke execute on function public.list_share_events(uuid)              from public, anon;
revoke execute on function public.list_notifications()                 from public, anon;
revoke execute on function public.mark_all_read()                      from public, anon;
revoke execute on function public.delete_my_data()                     from public, anon;

grant execute on function public.create_connection(text)              to authenticated;
grant execute on function public.connection_preview(text)             to authenticated;
grant execute on function public.accept_connection(text)              to authenticated;
grant execute on function public.list_connections()                   to authenticated;
grant execute on function public.set_connection_sharing(uuid, boolean) to authenticated;
grant execute on function public.connection_answers(uuid, text)       to authenticated;
grant execute on function public.set_nickname(uuid, text)             to authenticated;
grant execute on function public.cancel_invite(uuid)                  to authenticated;
grant execute on function public.save_snapshot(text, text)            to authenticated;
grant execute on function public.list_share_events(uuid)              to authenticated;
grant execute on function public.list_notifications()                 to authenticated;
grant execute on function public.mark_all_read()                      to authenticated;
grant execute on function public.delete_my_data()                     to authenticated;
