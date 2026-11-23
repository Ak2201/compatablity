-- Session kind: a session is either a couple session or a friendship session.
-- The kind is chosen when the session is created and never changes. join_session is unchanged.
-- Run after 0005_accounts.sql. Idempotent.

-- ---------- sessions: kind ----------

alter table public.sessions add column if not exists kind text not null default 'couple'
  check (kind in ('couple', 'friendship'));

-- ---------- create_session now takes the kind (defaults to 'couple') ----------

drop function if exists public.create_session(text, text);
drop function if exists public.create_session(text, text, text);

create or replace function public.create_session(p_name text, p_gender text, p_kind text default 'couple')
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
  if p_kind not in ('couple', 'friendship') then raise exception 'bad_kind'; end if;

  loop
    v_code := public.gen_session_code();
    begin
      insert into public.sessions (code, member_a, member_a_name, member_a_gender, kind)
      values (v_code, auth.uid(), trim(p_name), p_gender, p_kind);
      return v_code;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 3 then raise; end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.create_session(text, text, text) from public, anon;
grant  execute on function public.create_session(text, text, text) to authenticated;
