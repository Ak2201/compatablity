-- Accounts: each person has a profile (display name + gender). Sessions remember each member's gender,
-- so the reveal can show who is who. Sign-in is by email (magic link), so data follows the person to any browser.
-- Run after 0004_solo_answers.sql.

-- ---------- profiles ----------

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  gender       text not null check (gender in ('male', 'female')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

-- ---------- sessions: gender per member (nullable for sessions created before accounts) ----------

alter table public.sessions add column if not exists member_a_gender text
  check (member_a_gender is null or member_a_gender in ('male', 'female'));
alter table public.sessions add column if not exists member_b_gender text
  check (member_b_gender is null or member_b_gender in ('male', 'female'));

-- ---------- RPCs now take the gender too ----------

drop function if exists public.create_session(text);
drop function if exists public.join_session(text, text);

create or replace function public.create_session(p_name text, p_gender text)
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
  if p_gender not in ('male', 'female') then raise exception 'bad_gender'; end if;

  loop
    v_code := public.gen_session_code();
    begin
      insert into public.sessions (code, member_a, member_a_name, member_a_gender)
      values (v_code, auth.uid(), trim(p_name), p_gender);
      return v_code;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 3 then raise; end if;
    end;
  end loop;
end;
$$;

create or replace function public.join_session(p_code text, p_name text, p_gender text)
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
  if p_gender not in ('male', 'female') then raise exception 'bad_gender'; end if;

  select * into s from public.sessions where code = p_code for update;
  if not found then raise exception 'not_found'; end if;
  if s.member_a = auth.uid() or s.member_b = auth.uid() then return 'already'; end if;
  if s.member_b is not null then raise exception 'full'; end if;

  update public.sessions
     set member_b = auth.uid(),
         member_b_name = trim(p_name),
         member_b_gender = p_gender,
         status = 'both_joined'
   where code = p_code;
  return 'joined';
end;
$$;

revoke execute on function public.create_session(text, text)     from public, anon;
revoke execute on function public.join_session(text, text, text) from public, anon;
grant  execute on function public.create_session(text, text)     to authenticated;
grant  execute on function public.join_session(text, text, text) to authenticated;
