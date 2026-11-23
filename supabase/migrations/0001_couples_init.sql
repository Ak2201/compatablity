-- Couples compatibility: sessions, answers, RLS and RPC functions.
-- Run with: supabase db push   (or paste into the SQL editor).

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables ----------

create table if not exists public.sessions (
  code          text primary key
                check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  status        text not null default 'waiting_for_partner'
                check (status in ('waiting_for_partner', 'both_joined', 'answering', 'locked', 'revealed')),
  member_a      uuid not null,
  member_a_name text not null check (char_length(member_a_name) between 1 and 30),
  member_b      uuid,
  member_b_name text check (member_b_name is null or char_length(member_b_name) between 1 and 30),
  created_at    timestamptz not null default now(),
  check ((member_b is null) = (member_b_name is null)),
  check (member_b is null or member_b <> member_a)
);

create table if not exists public.answers (
  session_code text not null references public.sessions(code) on delete cascade,
  user_id      uuid not null,
  answers      jsonb not null default '{}'::jsonb
               check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 20000),
  locked       boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (session_code, user_id)
);

-- ---------- helpers ----------

-- Random 8-char code from an alphabet without 0/O/1/I/L (31 symbols). Modulo bias is about 3%, which is
-- acceptable for a join code, so this is not a secret. Uses length(alphabet), never a hard-coded size.
create or replace function public.gen_session_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes    bytea := extensions.gen_random_bytes(8);
  out      text := '';
  i        int;
begin
  for i in 0..7 loop
    out := out || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return out;
end;
$$;

-- True when the signed-in user is one of the two members. Security definer so policies can use it
-- without recursing into the sessions policies.
create or replace function public.is_session_member(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions s
    where s.code = p_code
      and (s.member_a = auth.uid() or s.member_b = auth.uid())
  );
$$;

-- ---------- RPC: create a session ----------

create or replace function public.create_session(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code     text;
  v_attempts int := 0;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if char_length(trim(p_name)) not between 1 and 30 then raise exception 'bad_name'; end if;

  loop
    v_code := public.gen_session_code();
    begin
      insert into public.sessions (code, member_a, member_a_name)
      values (v_code, auth.uid(), trim(p_name));
      return v_code;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 3 then raise; end if;
    end;
  end loop;
end;
$$;

-- ---------- RPC: preview before joining (names only, no member ids) ----------

create or replace function public.session_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
begin
  select * into s from public.sessions where code = p_code;
  if not found then return null; end if;
  return jsonb_build_object(
    'host_name', s.member_a_name,
    'is_full', s.member_b is not null,
    'is_member', coalesce(s.member_a = auth.uid() or s.member_b = auth.uid(), false)
  );
end;
$$;

-- ---------- RPC: join (row lock, so two joins at once cannot both take the second seat) ----------

create or replace function public.join_session(p_code text, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if char_length(trim(p_name)) not between 1 and 30 then raise exception 'bad_name'; end if;

  select * into s from public.sessions where code = p_code for update;
  if not found then raise exception 'not_found'; end if;
  if s.member_a = auth.uid() or s.member_b = auth.uid() then return 'already'; end if;
  if s.member_b is not null then raise exception 'full'; end if;

  update public.sessions
     set member_b = auth.uid(),
         member_b_name = trim(p_name),
         status = 'both_joined'
   where code = p_code;
  return 'joined';
end;
$$;

-- ---------- row level security ----------

alter table public.sessions enable row level security;
alter table public.answers  enable row level security;

-- Members can read their session. No insert/update/delete policies: writes go through the RPCs above.
drop policy if exists sessions_select_members on public.sessions;
create policy sessions_select_members on public.sessions
  for select to authenticated
  using (member_a = auth.uid() or member_b = auth.uid());

-- Answers: own row always; partner's row only once the session is revealed. This is the reveal gate.
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers
  for select to authenticated
  using (
    public.is_session_member(session_code)
    and (
      user_id = auth.uid()
      or exists (select 1 from public.sessions s where s.code = session_code and s.status = 'revealed')
    )
  );

-- Members write only their own row, and only while it is not locked.
drop policy if exists answers_insert on public.answers;
create policy answers_insert on public.answers
  for insert to authenticated
  with check (user_id = auth.uid() and locked = false and public.is_session_member(session_code));

drop policy if exists answers_update on public.answers;
create policy answers_update on public.answers
  for update to authenticated
  using (user_id = auth.uid() and locked = false and public.is_session_member(session_code))
  with check (user_id = auth.uid() and locked = false and public.is_session_member(session_code));

-- ---------- grants ----------

revoke all on public.sessions from anon, authenticated;
revoke all on public.answers  from anon, authenticated;
grant select on public.sessions to authenticated;
grant select, insert, update on public.answers to authenticated;

revoke execute on function public.create_session(text)     from public, anon;
revoke execute on function public.join_session(text, text) from public, anon;
revoke execute on function public.session_preview(text)    from public, anon;
grant  execute on function public.create_session(text)     to authenticated;
grant  execute on function public.join_session(text, text) to authenticated;
grant  execute on function public.session_preview(text)    to authenticated;

-- ---------- realtime: members get live status changes (RLS applies) ----------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sessions;
  end if;
exception when duplicate_object then
  null;
end $$;
