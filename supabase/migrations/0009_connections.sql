-- Connections: two people link up by a code. Each person keeps private answers per bank (couple or
-- friendship). Nobody sees the other's answers until both have chosen to share the connection.
-- Run after 0008_hide_sessions.sql. Idempotent.

-- ---------- tables ----------

create table if not exists public.profile_answers (
  user_id    uuid not null references auth.users(id) on delete cascade,
  bank       text not null check (bank in ('couple', 'friendship')),
  answers    jsonb not null default '{}'::jsonb
             check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 60000),
  updated_at timestamptz not null default now(),
  primary key (user_id, bank)
);

create table if not exists public.connections (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique
             check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  user_a     uuid not null references auth.users(id) on delete cascade,
  user_b     uuid references auth.users(id) on delete cascade,
  share_a    boolean not null default false,
  share_b    boolean not null default false,
  created_at timestamptz not null default now(),
  check (user_b is null or user_b <> user_a)
);

-- ---------- row level security ----------

alter table public.profile_answers enable row level security;
alter table public.connections     enable row level security;

-- Each person reads and writes only their own answers. No delete policy.
drop policy if exists profile_answers_select_own on public.profile_answers;
create policy profile_answers_select_own on public.profile_answers
  for select to authenticated using (user_id = auth.uid());

drop policy if exists profile_answers_insert_own on public.profile_answers;
create policy profile_answers_insert_own on public.profile_answers
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists profile_answers_update_own on public.profile_answers;
create policy profile_answers_update_own on public.profile_answers
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Members can read their connection. No insert/update/delete policies: writes go through the functions below.
drop policy if exists connections_select_members on public.connections;
create policy connections_select_members on public.connections
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- ---------- grants on tables ----------

revoke all on public.profile_answers from anon, authenticated;
revoke all on public.connections     from anon, authenticated;
grant select, insert, update on public.profile_answers to authenticated;
grant select on public.connections to authenticated;

-- ---------- functions: drop first so signature or return-type changes apply cleanly ----------

drop function if exists public.create_connection();
drop function if exists public.connection_preview(text);
drop function if exists public.accept_connection(text);
drop function if exists public.list_connections();
drop function if exists public.set_connection_sharing(uuid, boolean);
drop function if exists public.connection_answers(uuid, text);

-- ---------- RPC: create a connection code (you are user_a) ----------

create or replace function public.create_connection()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code     text;
  v_id       uuid;
  v_attempts int := 0;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  loop
    v_code := public.gen_session_code();
    begin
      insert into public.connections (code, user_a)
      values (v_code, auth.uid())
      returning id into v_id;
      return jsonb_build_object('id', v_id, 'code', v_code);
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 3 then raise; end if;
    end;
  end loop;
end;
$$;

-- ---------- RPC: preview before accepting (names and genders only, no ids, no answers) ----------

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
    'is_member', coalesce(c.user_a = auth.uid() or c.user_b = auth.uid(), false)
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
  c public.connections%rowtype;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  select * into c from public.connections where code = p_code for update;
  if not found then raise exception 'not_found'; end if;
  if c.user_a = auth.uid() then raise exception 'own_connection'; end if;

  if c.user_b is not null then
    if c.user_b = auth.uid() then return c.id; end if;
    raise exception 'full';
  end if;

  update public.connections set user_b = auth.uid() where id = c.id;
  return c.id;
end;
$$;

-- ---------- RPC: your connections, plus invites you created that nobody has accepted yet ----------

create or replace function public.list_connections()
returns table (
  id            uuid,
  code          text,
  partner_name  text,
  partner_gender text,
  my_gender     text,
  my_share      boolean,
  partner_share boolean,
  accepted      boolean
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
    (c.user_b is not null)
  from public.connections c
  left join public.profiles pa on pa.user_id = c.user_a
  left join public.profiles pb on pb.user_id = c.user_b
  left join public.profiles me on me.user_id = auth.uid()
  where c.user_a = auth.uid() or c.user_b = auth.uid()
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
  c public.connections%rowtype;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;

  select * into c from public.connections where id = p_id for update;
  if not found then raise exception 'not_member'; end if;

  if c.user_a = auth.uid() then
    update public.connections set share_a = p_share where id = p_id;
  elsif c.user_b is not distinct from auth.uid() then
    update public.connections set share_b = p_share where id = p_id;
  else
    raise exception 'not_member';
  end if;
end;
$$;

-- ---------- RPC: read both sides' answers for one bank, only when both have shared ----------

create or replace function public.connection_answers(p_id uuid, p_bank text)
returns jsonb
language plpgsql
stable
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

-- ---------- grants on functions ----------

revoke execute on function public.create_connection()                  from public, anon;
revoke execute on function public.connection_preview(text)             from public, anon;
revoke execute on function public.accept_connection(text)              from public, anon;
revoke execute on function public.list_connections()                   from public, anon;
revoke execute on function public.set_connection_sharing(uuid, boolean) from public, anon;
revoke execute on function public.connection_answers(uuid, text)       from public, anon;

grant execute on function public.create_connection()                  to authenticated;
grant execute on function public.connection_preview(text)             to authenticated;
grant execute on function public.accept_connection(text)              to authenticated;
grant execute on function public.list_connections()                   to authenticated;
grant execute on function public.set_connection_sharing(uuid, boolean) to authenticated;
grant execute on function public.connection_answers(uuid, text)       to authenticated;
